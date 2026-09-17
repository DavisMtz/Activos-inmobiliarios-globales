/**
 * Cuentas del equipo (PLAN §11.2 y §9). Quién puede tocar a quién lo decide
 * `shared/permisos.ts`; aquí viven las reglas que necesitan la base:
 *
 * - **Siempre queda al menos un maestro activo.** No se comprueba con un SELECT
 *   y después un UPDATE (entre los dos cabe otra petición): la condición va
 *   DENTRO del `UPDATE … WHERE`, y si no cambió ninguna fila, se rechaza.
 * - **Desactivar, cambiar el rol o dar una clave temporal cierra sus sesiones**
 *   en el mismo batch (PLAN §8.3).
 * - La contraseña temporal la genera el servidor, se guarda solo su hash y se
 *   devuelve en claro UNA vez, para enseñarla en el diálogo (PLAN §8.2).
 */

import { ROLES, problemaAlGestionarUsuario, puede, type Actor, type Rol } from "../../../shared/permisos";
import { HORAS_CLAVE_TEMPORAL, correoValido, normalizarCorreo } from "../../../shared/validacion";
import { generarClaveTemporal, hashClave } from "../../auth/clave";
import { sentenciaBorrarSesionesDe } from "../../auth/sesion";
import { sentenciaBitacora } from "../../bitacora";
import { ahora, enHoras } from "../../fechas";
import { exito, fallo, type Resultado } from "../../resultado";

export type UsuarioPanel = {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  telefono: string | null;
  whatsapp: string | null;
  activo: boolean;
  debeCambiarClave: boolean;
  temporalExpira: string | null;
  ultimoAcceso: string | null;
  creadoEn: string;
  /** Cuántas casas tiene asignadas: desactivar a quien lleva casas se avisa. */
  casas: number;
};

type FilaUsuario = {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  telefono: string | null;
  whatsapp: string | null;
  activo: number;
  debe_cambiar_clave: number;
  clave_temporal_expira: string | null;
  ultimo_acceso: string | null;
  creado_en: string;
  casas: number;
};

const aUsuario = (fila: FilaUsuario): UsuarioPanel => ({
  id: fila.id,
  nombre: fila.nombre,
  correo: fila.correo,
  rol: fila.rol,
  telefono: fila.telefono,
  whatsapp: fila.whatsapp,
  activo: fila.activo === 1,
  debeCambiarClave: fila.debe_cambiar_clave === 1,
  temporalExpira: fila.clave_temporal_expira,
  ultimoAcceso: fila.ultimo_acceso,
  creadoEn: fila.creado_en,
  casas: Number(fila.casas ?? 0),
});

const CAMPOS = `u.id, u.nombre, u.correo, u.rol, u.telefono, u.whatsapp, u.activo,
       u.debe_cambiar_clave, u.clave_temporal_expira, u.ultimo_acceso, u.creado_en,
       (SELECT COUNT(*) FROM propiedades p WHERE p.asesor_id = u.id AND p.eliminada_en IS NULL) AS casas`;

/**
 * El director no ve las cuentas de maestro ni las de otros directores (§9),
 * salvo la suya. Filtrarlo aquí es lo que hace que la pantalla no enseñe lo que
 * la API le negaría.
 */
export async function listarUsuarios(db: D1Database, actor: Actor): Promise<UsuarioPanel[]> {
  const soloEquipo = actor.rol === "director";
  const { results } = await db
    .prepare(
      `SELECT ${CAMPOS} FROM usuarios u
        ${soloEquipo ? "WHERE u.rol IN ('asesor','contenido') OR u.id = ?" : ""}
        ORDER BY u.activo DESC, u.nombre`,
    )
    .bind(...(soloEquipo ? [actor.id] : []))
    .all<FilaUsuario>();
  return results.map(aUsuario);
}

export async function leerUsuario(db: D1Database, id: string): Promise<UsuarioPanel | null> {
  const fila = await db.prepare(`SELECT ${CAMPOS} FROM usuarios u WHERE u.id = ?`).bind(id).first<FilaUsuario>();
  return fila ? aUsuario(fila) : null;
}

// ─── Limpieza de lo que llega del formulario ──────────────────────

const texto = (valor: unknown, tope: number): string =>
  typeof valor === "string" ? valor.replace(/\s+/g, " ").trim().slice(0, tope) : "";

/** Un teléfono se escribe como cada quien quiera; solo se limita lo que cabe. */
const telefono = (valor: unknown): string | null => {
  const limpio = texto(valor, 30).replace(/[^\d+()\s-]/g, "");
  return limpio.replace(/\D/g, "").length >= 10 ? limpio : null;
};

export type DatosDeUsuario = {
  nombre?: unknown;
  correo?: unknown;
  rol?: unknown;
  telefono?: unknown;
  whatsapp?: unknown;
};

export type UsuarioConTemporal = { usuario: UsuarioPanel; clave: string; expira: string };

export async function crearUsuario(
  db: D1Database,
  actor: Actor,
  datos: DatosDeUsuario,
): Promise<Resultado<UsuarioConTemporal>> {
  const nombre = texto(datos.nombre, 80);
  const correo = normalizarCorreo(texto(datos.correo, 254));
  const rol = ROLES.find((r) => r === datos.rol);

  if (nombre.length < 3) return fallo(400, "datos_incompletos", "Escribe el nombre completo.");
  if (!correoValido(correo)) return fallo(400, "correo_invalido", "Revisa el correo.");
  if (!rol) return fallo(400, "rol_invalido", "Elige un rol.");
  if (!puede(actor, "usuarios.gestionar", { rol })) {
    return fallo(403, "sin_permiso", "No tienes permiso para crear cuentas de ese tipo.");
  }

  const yaExiste = await db.prepare("SELECT id FROM usuarios WHERE correo = ?").bind(correo).first();
  if (yaExiste) return fallo(409, "correo_ocupado", "Ya hay una cuenta con ese correo.");

  const id = crypto.randomUUID();
  const clave = generarClaveTemporal();
  const expira = enHoras(HORAS_CLAVE_TEMPORAL);
  const momento = ahora();

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO usuarios (id, correo, nombre, telefono, whatsapp, rol, clave_hash,
                   debe_cambiar_clave, clave_temporal_expira, activo, creado_por, creado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)`,
        )
        .bind(id, correo, nombre, telefono(datos.telefono), telefono(datos.whatsapp), rol, await hashClave(clave), expira, actor.id, momento),
      // Nunca la contraseña, ni siquiera su hash (PLAN §11.4).
      sentenciaBitacora(db, {
        usuarioId: actor.id,
        entidad: "usuario",
        entidadId: id,
        accion: "crear",
        cambios: { nombre, correo, rol },
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      return fallo(409, "correo_ocupado", "Ya hay una cuenta con ese correo.");
    }
    throw error;
  }

  const usuario = await leerUsuario(db, id);
  return usuario ? exito({ usuario, clave, expira }) : fallo(409, "no_creado", "No pudimos crear la cuenta.");
}

/** Comprobación común: existe, y este actor puede meterse con esa cuenta. */
async function objetivoGestionable(
  db: D1Database,
  actor: Actor,
  id: string,
  cambio: { rolNuevo?: Rol; desactivar?: boolean },
): Promise<Resultado<UsuarioPanel>> {
  const usuario = await leerUsuario(db, id);
  if (!usuario) return fallo(404, "no_encontrado", "Esa cuenta ya no existe.");
  const problema = problemaAlGestionarUsuario(actor, { id: usuario.id, rol: usuario.rol }, cambio);
  return problema ? fallo(403, "sin_permiso", problema) : exito(usuario);
}

export async function generarTemporal(
  db: D1Database,
  actor: Actor,
  id: string,
): Promise<Resultado<UsuarioConTemporal>> {
  const objetivo = await objetivoGestionable(db, actor, id, {});
  if (!objetivo.ok) return objetivo;

  const clave = generarClaveTemporal();
  const expira = enHoras(HORAS_CLAVE_TEMPORAL);

  await db.batch([
    db
      .prepare(
        `UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 1, clave_temporal_expira = ? WHERE id = ?`,
      )
      .bind(await hashClave(clave), expira, id),
    // Con una clave nueva, lo que había abierto con la anterior se cierra.
    sentenciaBorrarSesionesDe(db, id),
    sentenciaBitacora(db, {
      usuarioId: actor.id,
      entidad: "usuario",
      entidadId: id,
      accion: "clave_temporal",
      cambios: { vence: expira },
    }),
  ]);

  return exito({ usuario: objetivo.valor, clave, expira });
}

/** «Tiene que quedar un maestro» va dentro del WHERE, no antes (D1 §17). */
const QUEDA_OTRO_MAESTRO = "(rol <> 'maestro' OR EXISTS (SELECT 1 FROM usuarios WHERE rol = 'maestro' AND activo = 1 AND id <> ?))";
const ULTIMO_MAESTRO = "Tiene que quedar al menos un maestro activo.";

export async function cambiarRol(db: D1Database, actor: Actor, id: string, rolPedido: unknown): Promise<Resultado<null>> {
  const rol = ROLES.find((r) => r === rolPedido);
  if (!rol) return fallo(400, "rol_invalido", "Ese rol no existe.");

  const objetivo = await objetivoGestionable(db, actor, id, { rolNuevo: rol });
  if (!objetivo.ok) return objetivo;
  if (objetivo.valor.rol === rol) return exito(null);

  const [, actualizacion] = await db.batch([
    sentenciaBitacora(
      db,
      { usuarioId: actor.id, entidad: "usuario", entidadId: id, accion: "rol", cambios: { rol: [objetivo.valor.rol, rol] } },
      { sql: `SELECT 1 FROM usuarios WHERE id = ? AND rol = ? AND ${QUEDA_OTRO_MAESTRO}`, valores: [id, objetivo.valor.rol, id] },
    ),
    db
      .prepare(`UPDATE usuarios SET rol = ? WHERE id = ? AND rol = ? AND ${QUEDA_OTRO_MAESTRO}`)
      .bind(rol, id, objetivo.valor.rol, id),
    // Cambiar de rol cambia lo que puede hacer: sus sesiones se rehacen.
    sentenciaBorrarSesionesDe(db, id),
  ]);

  if (actualizacion.meta.changes !== 1) return fallo(409, "ultimo_maestro", ULTIMO_MAESTRO);
  return exito(null);
}

export async function cambiarActivo(
  db: D1Database,
  actor: Actor,
  id: string,
  activo: boolean,
): Promise<Resultado<null>> {
  const objetivo = await objetivoGestionable(db, actor, id, { desactivar: !activo });
  if (!objetivo.ok) return objetivo;
  if (objetivo.valor.activo === activo) return exito(null);

  const guarda = activo
    ? { sql: "SELECT 1 FROM usuarios WHERE id = ? AND activo = 0", valores: [id] }
    : { sql: `SELECT 1 FROM usuarios WHERE id = ? AND activo = 1 AND ${QUEDA_OTRO_MAESTRO}`, valores: [id, id] };

  const sentencias = [
    sentenciaBitacora(
      db,
      { usuarioId: actor.id, entidad: "usuario", entidadId: id, accion: activo ? "activar" : "desactivar" },
      guarda,
    ),
    activo
      ? db.prepare("UPDATE usuarios SET activo = 1 WHERE id = ? AND activo = 0").bind(id)
      : db
          .prepare(`UPDATE usuarios SET activo = 0 WHERE id = ? AND activo = 1 AND ${QUEDA_OTRO_MAESTRO}`)
          .bind(id, id),
  ];
  // Desactivar cierra sus sesiones. `leerSesion` ya exige `activo = 1`, así que
  // en la siguiente petición recibe 401 aunque conserve la cookie.
  if (!activo) sentencias.push(sentenciaBorrarSesionesDe(db, id));

  const [, actualizacion] = await db.batch(sentencias);
  if (actualizacion.meta.changes !== 1) {
    return fallo(409, activo ? "no_cambio" : "ultimo_maestro", activo ? "No pudimos activar la cuenta." : ULTIMO_MAESTRO);
  }
  return exito(null);
}

/** Nombre, teléfono y WhatsApp: los edita cada quien de su cuenta, y el director de su equipo. */
export async function editarDatos(
  db: D1Database,
  actor: Actor,
  id: string,
  datos: DatosDeUsuario,
): Promise<Resultado<UsuarioPanel>> {
  if (id !== actor.id) {
    const objetivo = await objetivoGestionable(db, actor, id, {});
    if (!objetivo.ok) return objetivo;
  }

  const nombre = texto(datos.nombre, 80);
  if (nombre.length < 3) return fallo(400, "datos_incompletos", "Escribe el nombre completo.");

  const nuevoTelefono = telefono(datos.telefono);
  const nuevoWhatsapp = telefono(datos.whatsapp);

  await db.batch([
    db
      .prepare("UPDATE usuarios SET nombre = ?, telefono = ?, whatsapp = ? WHERE id = ?")
      .bind(nombre, nuevoTelefono, nuevoWhatsapp, id),
    sentenciaBitacora(db, {
      usuarioId: actor.id,
      entidad: "usuario",
      entidadId: id,
      accion: "editar",
      cambios: { nombre, telefono: nuevoTelefono, whatsapp: nuevoWhatsapp },
    }),
  ]);

  const usuario = await leerUsuario(db, id);
  return usuario ? exito(usuario) : fallo(404, "no_encontrado", "Esa cuenta ya no existe.");
}
