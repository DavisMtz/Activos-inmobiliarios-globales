import type { Rol } from "../../shared/permisos";
import { correoValido, normalizarCorreo, problemaClaveNueva } from "../../shared/validacion";
import { sentenciaBitacora } from "../bitacora";
import type { Servicios } from "../config";
import { ahora } from "../fechas";
import { exito, fallo, type Resultado } from "../resultado";
import { HASH_RELLENO, hashClave, verificarClave } from "./clave";
import {
  cookieSesion,
  huella,
  huellaDeTemporal,
  leerSesion,
  nuevoToken,
  sentenciaBorrarSesionesDe,
  sentenciaBorrarVencidasDe,
  sentenciaCrearSesion,
  type SesionActiva,
} from "./sesion";

/**
 * Entrar, cambiar la clave y salir (PLAN §8). Lo usan igual la API
 * (`/api/panel/*`) y las acciones de las pantallas del panel.
 *
 * Presupuesto de CPU: UN solo PBKDF2 por petición (ver `clave.ts`).
 */

export type ContextoPeticion = { ip: string; agente: string | null };

const INCORRECTOS = "Correo o contraseña incorrectos.";

type FilaAcceso = {
  id: string;
  correo: string;
  rol: Rol;
  clave_hash: string;
  debe_cambiar_clave: number;
  clave_temporal_expira: string | null;
  activo: number;
};

export type SesionIniciada = { token: string; cookie: string; soloCambioClave: boolean };

export async function iniciarSesion(
  s: Servicios,
  datos: { correo: unknown; clave: unknown },
  peticion: ContextoPeticion,
): Promise<Resultado<SesionIniciada>> {
  const correo = normalizarCorreo(typeof datos.correo === "string" ? datos.correo : "");
  const clave = typeof datos.clave === "string" ? datos.clave : "";
  if (!correo || !clave) return fallo(400, "datos_incompletos", "Escribe tu correo y tu contraseña.");
  if (!correoValido(correo) || clave.length > 200) return fallo(401, "acceso_incorrecto", INCORRECTOS);

  // Dos llaves por intento: por IP frena a quien prueba muchos correos; por
  // correo frena a quien reparte los intentos entre muchas IP. Se consultan
  // ANTES de derivar la clave, para que un ataque no gaste nuestro CPU.
  const [porIp, porCorreo] = await Promise.all([
    s.limites.acceso.limit({ key: `ip:${peticion.ip}` }),
    s.limites.acceso.limit({ key: `correo:${correo}` }),
  ]);
  if (!porIp.success || !porCorreo.success) {
    return fallo(429, "demasiados_intentos", "Demasiados intentos. Espera un minuto.");
  }

  const usuario = await s.db
    .prepare(
      `SELECT id, correo, rol, clave_hash, debe_cambiar_clave, clave_temporal_expira, activo
         FROM usuarios WHERE correo = ?`,
    )
    .bind(correo)
    .first<FilaAcceso>();

  const anotarFallo = (motivo: string) =>
    sentenciaBitacora(s.db, {
      usuarioId: null,
      entidad: "usuario",
      entidadId: usuario?.id ?? correo,
      accion: "acceso_fallido",
      cambios: { motivo, ip: peticion.ip },
    }).run();

  if (!usuario) {
    // Mismo trabajo que con un correo real: la respuesta no delata si existe.
    await verificarClave(clave, HASH_RELLENO);
    await anotarFallo("correo_desconocido");
    return fallo(401, "acceso_incorrecto", INCORRECTOS);
  }

  const claveCorrecta = await verificarClave(clave, usuario.clave_hash);
  if (!claveCorrecta || usuario.activo !== 1) {
    await anotarFallo(claveCorrecta ? "cuenta_inactiva" : "clave_incorrecta");
    return fallo(401, "acceso_incorrecto", INCORRECTOS);
  }

  const soloCambioClave = usuario.debe_cambiar_clave === 1;
  if (soloCambioClave && (!usuario.clave_temporal_expira || usuario.clave_temporal_expira <= ahora())) {
    await anotarFallo("temporal_vencida");
    return fallo(
      401,
      "temporal_vencida",
      "Tu contraseña temporal venció. Pide una nueva a quien te dio acceso.",
    );
  }

  const token = nuevoToken();
  await s.db.batch([
    sentenciaBorrarVencidasDe(s.db, usuario.id),
    sentenciaCrearSesion(s.db, {
      idHash: await huella(token),
      usuarioId: usuario.id,
      soloCambioClave,
      huellaTemporal: soloCambioClave ? await huellaDeTemporal(token, clave) : null,
      agente: peticion.agente,
    }),
    s.db.prepare("UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?").bind(ahora(), usuario.id),
    sentenciaBitacora(s.db, {
      usuarioId: usuario.id,
      entidad: "usuario",
      entidadId: usuario.id,
      accion: "acceso",
      cambios: soloCambioClave ? { clave_temporal: true } : undefined,
    }),
  ]);

  return exito({ token, cookie: cookieSesion(token, soloCambioClave), soloCambioClave });
}

export async function cambiarClave(
  s: Servicios,
  sesion: SesionActiva,
  token: string,
  datos: { actual?: unknown; nueva: unknown; confirmacion: unknown },
  peticion: ContextoPeticion,
): Promise<Resultado<SesionIniciada>> {
  const nueva = typeof datos.nueva === "string" ? datos.nueva : "";
  const confirmacion = typeof datos.confirmacion === "string" ? datos.confirmacion : "";
  const problema = problemaClaveNueva(nueva, confirmacion, sesion.usuario.correo);
  if (problema) return fallo(400, "clave_invalida", problema);

  if (sesion.soloCambioClave) {
    // Acaba de entrar con la temporal: no se le vuelve a pedir. Que la nueva
    // no la repita se comprueba con la huella, sin gastar un segundo PBKDF2.
    if (!sesion.huellaTemporal || (await huellaDeTemporal(token, nueva)) === sesion.huellaTemporal) {
      return fallo(400, "clave_repetida", "La contraseña nueva tiene que ser distinta de la temporal.");
    }
  } else {
    // Desde «Mi cuenta»: exige la actual. Con dos PBKDF2 en la misma petición
    // (verificar la actual y derivar la nueva) se rebasa el CPU del Worker,
    // así que la actual se comprueba primero y en su propia petición:
    // `/api/panel/mi-cuenta/clave/verificar` (llega con F3).
    return fallo(
      400,
      "requiere_verificacion",
      "Para cambiar tu contraseña desde Mi cuenta primero confirma la actual.",
    );
  }

  const limite = await s.limites.acceso.limit({ key: `clave:${sesion.usuario.id}` });
  if (!limite.success) return fallo(429, "demasiados_intentos", "Demasiados intentos. Espera un minuto.");

  const nuevoHash = await hashClave(nueva);
  const tokenNuevo = nuevoToken();
  await s.db.batch([
    s.db
      .prepare("UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0, clave_temporal_expira = NULL WHERE id = ?")
      .bind(nuevoHash, sesion.usuario.id),
    // Todas fuera, incluida esta: quien cambia su clave puede estar echando a
    // alguien que se le metió en la cuenta.
    sentenciaBorrarSesionesDe(s.db, sesion.usuario.id),
    sentenciaCrearSesion(s.db, {
      idHash: await huella(tokenNuevo),
      usuarioId: sesion.usuario.id,
      soloCambioClave: false,
      huellaTemporal: null,
      agente: peticion.agente,
    }),
    sentenciaBitacora(s.db, {
      usuarioId: sesion.usuario.id,
      entidad: "usuario",
      entidadId: sesion.usuario.id,
      accion: "clave",
      cambios: { origen: sesion.soloCambioClave ? "temporal" : "mi_cuenta" },
    }),
  ]);

  return exito({ token: tokenNuevo, cookie: cookieSesion(tokenNuevo, false), soloCambioClave: false });
}

export async function cerrarSesion(s: Servicios, token: string | null): Promise<void> {
  const sesion = await leerSesion(s.db, token);
  if (!sesion) return;
  await s.db.batch([
    s.db.prepare("DELETE FROM sesiones WHERE id_hash = ?").bind(sesion.idHash),
    sentenciaBitacora(s.db, {
      usuarioId: sesion.usuario.id,
      entidad: "usuario",
      entidadId: sesion.usuario.id,
      accion: "salida",
    }),
  ]);
}
