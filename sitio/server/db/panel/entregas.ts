/**
 * Entregas desde el panel (F5): el equipo crea la entrega, sube la foto que se
 * tomó ese día, le manda al cliente su enlace y, cuando contesta, revisa y
 * aprueba. Permiso: `contenido.editar` (maestro, director y contenido), el
 * mismo de los demás textos del sitio (PLAN §9).
 *
 * El enlace se entrega UNA sola vez, al crearlo: la base guarda su huella y no
 * puede volver a enseñarlo. Si se pierde, se genera otro y el anterior deja de
 * servir.
 */

import { DIAS_DEL_ENLACE, FOTOS_DEL_EQUIPO, type EstadoEntrega } from "../../../shared/entrega";
import { fotoVista } from "../../../shared/fotos";
import { puede, type Actor } from "../../../shared/permisos";
import { huella } from "../../auth/sesion";
import { sentenciaBitacora } from "../../bitacora";
import { carpetaDeEntrega, firmaParaCarpeta, nombreAlAzar, type FirmaDeSubida, type NubeDeFotos } from "../../cloudinary";
import { ahora, enDias } from "../../fechas";
import { exito, fallo, type Resultado } from "../../resultado";
import { registrarFotoDeEntrega, type FotoRecibida } from "../entregas";

const SIN_PERMISO = "No tienes permiso para manejar las entregas.";

export type FotoDeEntregaPanel = {
  id: number;
  src: string;
  subidaPor: "equipo" | "cliente";
  visible: boolean;
  ancho: number | null;
};

export type EntregaDelPanel = {
  id: number;
  nombre: string;
  nombrePublico: string | null;
  comentario: string;
  estado: EstadoEntrega;
  aceptaTexto: boolean;
  aceptaFotos: boolean;
  aceptadoEn: string | null;
  enviadoEn: string | null;
  enlaceExpira: string | null;
  /** Calculado en el servidor: comparar fechas al pintar daría otra cosa al hidratar. */
  enlaceVencido: boolean;
  creadaEn: string;
  /** Tiene algo que se pueda publicar con los permisos que dio el cliente. */
  publicable: boolean;
  fotos: FotoDeEntregaPanel[];
};

type Fila = {
  id: number;
  nombre: string;
  nombre_publico: string | null;
  texto: string;
  estado: EstadoEntrega;
  acepta_texto: number;
  acepta_fotos: number;
  aceptado_en: string | null;
  enviado_en: string | null;
  token_expira: string | null;
  creado_en: string;
};

type FilaFoto = {
  id: number;
  testimonio_id: number;
  public_id: string;
  ancho: number | null;
  subida_por: "equipo" | "cliente";
  visible: number;
};

/** Todas, la más nueva arriba, con sus fotos en UNA sola consulta. */
export async function leerEntregasDelPanel(db: D1Database, cloudName: string): Promise<EntregaDelPanel[]> {
  const [consultaFilas, consultaFotos] = await db.batch([
    db.prepare(
      `SELECT id, nombre, nombre_publico, texto, estado, acepta_texto, acepta_fotos, aceptado_en,
              enviado_en, token_expira, creado_en
         FROM testimonios ORDER BY id DESC LIMIT 200`,
    ),
    db.prepare(
      "SELECT id, testimonio_id, public_id, ancho, subida_por, visible FROM fotos_entrega ORDER BY testimonio_id, orden, id",
    ),
  ]);
  const filas = consultaFilas.results as Fila[];
  const fotos = consultaFotos.results as FilaFoto[];

  return filas.map((fila) => {
    const propias = fotos
      .filter((foto) => foto.testimonio_id === fila.id)
      .map((foto) => ({
        id: foto.id,
        src: fotoVista({ public_id: foto.public_id, url_origen: null }, "miniatura", cloudName, "")?.src ?? "",
        subidaPor: foto.subida_por,
        visible: foto.visible === 1,
        ancho: foto.ancho,
      }));
    const aceptaTexto = fila.acepta_texto === 1;
    const aceptaFotos = fila.acepta_fotos === 1;
    return {
      id: fila.id,
      nombre: fila.nombre,
      nombrePublico: fila.nombre_publico,
      comentario: fila.texto,
      estado: fila.estado,
      aceptaTexto,
      aceptaFotos,
      aceptadoEn: fila.aceptado_en,
      enviadoEn: fila.enviado_en,
      enlaceExpira: fila.token_expira,
      enlaceVencido: !fila.enviado_en && (!fila.token_expira || fila.token_expira < ahora()),
      creadaEn: fila.creado_en,
      publicable:
        Boolean(fila.enviado_en) &&
        ((aceptaTexto && fila.texto.trim().length > 0) || (aceptaFotos && propias.some((f) => f.visible))),
      fotos: propias,
    };
  });
}

/**
 * Un enlace nuevo: el token en claro para entregarlo y su huella para la base.
 * En hexadecimal y en minúsculas, no en base64: el sitio pasa a minúsculas las
 * rutas viejas de WordPress, y un enlace con mayúsculas se rompía con un 301
 * (medido el 19/09/2026). 32 bytes al azar = 64 caracteres.
 */
async function enlace(): Promise<{ token: string; hash: string; expira: string }> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  return { token, hash: await huella(token), expira: enDias(DIAS_DEL_ENLACE) };
}

export async function crearEntrega(
  db: D1Database,
  actor: Actor,
  nombre: string,
): Promise<Resultado<{ id: number; token: string }>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const limpio = nombre.replace(/\s+/g, " ").trim().slice(0, 80);
  if (limpio.length < 2) return fallo(400, "datos_incompletos", "Escribe a quién se le entregó la casa.");

  const nuevo = await enlace();
  const insercion = await db
    .prepare(
      `INSERT INTO testimonios (nombre, texto, visible, creado_en, token_hash, token_expira, estado, creado_por, carpeta)
       VALUES (?, '', 0, ?, ?, ?, 'invitado', ?, ?)`,
    )
    .bind(limpio, ahora(), nuevo.hash, nuevo.expira, actor.id, nombreAlAzar() + nombreAlAzar())
    .run();
  const id = Number(insercion.meta.last_row_id);
  await sentenciaBitacora(db, {
    usuarioId: actor.id,
    entidad: "entrega",
    entidadId: String(id),
    accion: "crear",
  }).run();
  return exito({ id, token: nuevo.token });
}

/** Otro enlace para la misma entrega; el anterior deja de servir. */
export async function enlaceNuevo(db: D1Database, actor: Actor, id: number): Promise<Resultado<{ token: string }>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const nuevo = await enlace();
  const [, cambio] = await db.batch([
    sentenciaBitacora(
      db,
      { usuarioId: actor.id, entidad: "entrega", entidadId: String(id), accion: "enlace_nuevo" },
      { sql: "SELECT 1 FROM testimonios WHERE id = ? AND enviado_en IS NULL", valores: [id] },
    ),
    db
      .prepare("UPDATE testimonios SET token_hash = ?, token_expira = ? WHERE id = ? AND enviado_en IS NULL")
      .bind(nuevo.hash, nuevo.expira, id),
  ]);
  if (cambio.meta.changes !== 1) return fallo(409, "ya_respondio", "El cliente ya contestó: su enlace ya no se usa.");
  return exito({ token: nuevo.token });
}

/**
 * Publicar. Solo lo que ya contestó el cliente y tiene algo que enseñar con los
 * permisos que dio: una entrega sin permiso registrado (como las capturadas
 * antes de esta función) no se puede publicar desde aquí.
 */
export async function aprobarEntrega(
  db: D1Database,
  actor: Actor,
  id: number,
  cloudName: string,
): Promise<Resultado<null>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const entrega = (await leerEntregasDelPanel(db, cloudName)).find((e) => e.id === id);
  if (!entrega) return fallo(404, "no_encontrado", "Esa entrega ya no existe.");
  if (!entrega.enviadoEn) return fallo(400, "sin_respuesta", "El cliente todavía no contesta su enlace.");
  if (!entrega.publicable) {
    return fallo(400, "sin_permiso_cliente", "No hay nada que publicar con los permisos que dio el cliente.");
  }
  await db.batch([
    sentenciaBitacora(db, { usuarioId: actor.id, entidad: "entrega", entidadId: String(id), accion: "publicar" }),
    db.prepare("UPDATE testimonios SET estado = 'aprobado', aprobado_en = ? WHERE id = ?").bind(ahora(), id),
  ]);
  return exito(null);
}

export async function ocultarEntrega(db: D1Database, actor: Actor, id: number): Promise<Resultado<null>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const [, cambio] = await db.batch([
    sentenciaBitacora(
      db,
      { usuarioId: actor.id, entidad: "entrega", entidadId: String(id), accion: "ocultar" },
      { sql: "SELECT 1 FROM testimonios WHERE id = ? AND enviado_en IS NOT NULL", valores: [id] },
    ),
    db.prepare("UPDATE testimonios SET estado = 'oculto' WHERE id = ? AND enviado_en IS NOT NULL").bind(id),
  ]);
  return cambio.meta.changes === 1 ? exito(null) : fallo(404, "no_encontrado", "Esa entrega ya no existe.");
}

/** Corregir cómo sale el nombre («Laura M.»). El comentario del cliente no se edita. */
export async function cambiarNombrePublico(
  db: D1Database,
  actor: Actor,
  id: number,
  nombre: string,
): Promise<Resultado<null>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const limpio = nombre.replace(/\s+/g, " ").trim().slice(0, 60);
  if (limpio.length < 2) return fallo(400, "datos_incompletos", "Escribe cómo debe salir el nombre.");
  const [, cambio] = await db.batch([
    sentenciaBitacora(
      db,
      { usuarioId: actor.id, entidad: "entrega", entidadId: String(id), accion: "editar", cambios: { nombre_publico: limpio } },
      { sql: "SELECT 1 FROM testimonios WHERE id = ?", valores: [id] },
    ),
    db.prepare("UPDATE testimonios SET nombre_publico = ? WHERE id = ?").bind(limpio, id),
  ]);
  return cambio.meta.changes === 1 ? exito(null) : fallo(404, "no_encontrado", "Esa entrega ya no existe.");
}

/** Dejar fuera (o volver a enseñar) una foto concreta sin borrarla. */
export async function cambiarFotoVisible(
  db: D1Database,
  actor: Actor,
  fotoId: number,
  visible: boolean,
): Promise<Resultado<null>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const cambio = await db.prepare("UPDATE fotos_entrega SET visible = ? WHERE id = ?").bind(visible ? 1 : 0, fotoId).run();
  return cambio.meta.changes === 1 ? exito(null) : fallo(404, "no_encontrado", "Esa foto ya no está.");
}

/** Borra la foto de la base y devuelve su `public_id` para quitarla de la nube. */
export async function borrarFotoDeEntrega(
  db: D1Database,
  actor: Actor,
  fotoId: number,
): Promise<Resultado<{ publicId: string }>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const foto = await db
    .prepare("DELETE FROM fotos_entrega WHERE id = ? RETURNING public_id")
    .bind(fotoId)
    .first<{ public_id: string }>();
  return foto ? exito({ publicId: foto.public_id }) : fallo(404, "no_encontrado", "Esa foto ya no está.");
}

/**
 * Borra la entrega entera. Primero las fotos (las hojas) y después la entrega:
 * al revés revienta con «FOREIGN KEY constraint failed» (PLAN §17). Devuelve
 * los `public_id` para quitarlos de la nube DESPUÉS de la base.
 */
export async function borrarEntrega(
  db: D1Database,
  actor: Actor,
  id: number,
): Promise<Resultado<{ publicIds: string[] }>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const [, fotos, borrado] = await db.batch([
    sentenciaBitacora(
      db,
      { usuarioId: actor.id, entidad: "entrega", entidadId: String(id), accion: "borrar" },
      { sql: "SELECT 1 FROM testimonios WHERE id = ?", valores: [id] },
    ),
    db.prepare("DELETE FROM fotos_entrega WHERE testimonio_id = ? RETURNING public_id").bind(id),
    db.prepare("DELETE FROM testimonios WHERE id = ?").bind(id),
  ]);
  if (borrado.meta.changes !== 1) return fallo(404, "no_encontrado", "Esa entrega ya no existe.");
  return exito({ publicIds: (fotos.results as { public_id: string }[]).map((f) => f.public_id) });
}

// ─── Fotos del equipo ─────────────────────────────────────────────

/**
 * El equipo sube la foto de la entrega ANTES de que el cliente conteste: el
 * cliente autoriza lo que ve. Una foto agregada después no la habría visto.
 */
async function abiertaParaElEquipo(
  db: D1Database,
  actor: Actor,
  id: number,
): Promise<Resultado<{ id: number; carpeta: string }>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const fila = await db
    .prepare(
      `SELECT enviado_en, carpeta,
              (SELECT COUNT(*) FROM fotos_entrega WHERE testimonio_id = t.id AND subida_por = 'equipo') AS n
         FROM testimonios t WHERE id = ?`,
    )
    .bind(id)
    .first<{ enviado_en: string | null; carpeta: string | null; n: number }>();
  if (!fila) return fallo(404, "no_encontrado", "Esa entrega ya no existe.");
  if (fila.enviado_en) {
    return fallo(409, "ya_respondio", "El cliente ya contestó: una foto nueva no tendría su permiso.");
  }
  if (fila.n >= FOTOS_DEL_EQUIPO) return fallo(400, "tope_de_fotos", `Hasta ${FOTOS_DEL_EQUIPO} fotos por entrega.`);
  if (!fila.carpeta) return fallo(409, "sin_carpeta", "Esta entrega no admite fotos: crea una nueva.");
  return exito({ id, carpeta: fila.carpeta });
}

export async function firmaParaElEquipo(
  db: D1Database,
  nube: NubeDeFotos,
  actor: Actor,
  id: number,
): Promise<Resultado<FirmaDeSubida>> {
  const abierta = await abiertaParaElEquipo(db, actor, id);
  if (!abierta.ok) return abierta;
  const firma = await firmaParaCarpeta(nube, carpetaDeEntrega(nube, abierta.valor.carpeta));
  return firma ? exito(firma) : fallo(400, "sin_cloudinary", "Configura Cloudinary para subir fotos.");
}

export async function registrarFotoDelEquipo(
  db: D1Database,
  nube: NubeDeFotos,
  actor: Actor,
  id: number,
  datos: FotoRecibida,
): Promise<Resultado<{ id: number }>> {
  const abierta = await abiertaParaElEquipo(db, actor, id);
  if (!abierta.ok) return abierta;
  return registrarFotoDeEntrega(db, nube, abierta.valor, "equipo", datos);
}
