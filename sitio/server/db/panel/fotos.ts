/**
 * Fotos desde el panel (PLAN §13.2). El archivo **no pasa por el Worker**: el
 * navegador sube directo a Cloudinary con una firma que hace el servidor, y
 * aquí solo se registra el resultado, comprobando la firma que Cloudinary
 * devuelve. Sin esa comprobación, cualquiera podría anotar en la base una foto
 * que no subió.
 *
 * Todo cambio de fotos toca `propiedades.actualizada_en`, y eso importa más de
 * lo que parece: la siembra solo reemplaza las fotos de las casas que **nadie**
 * ha editado en el panel (compara `actualizada_en`). Sin este empujón, una foto
 * borrada aquí volvería a aparecer la próxima vez que se re-sembrara.
 */

import { puede, type Actor } from "../../../shared/permisos";
import { sentenciaBitacora } from "../../bitacora";
import {
  borrarDeCloudinary,
  firmaDeRespuestaValida,
  firmaDeSubida,
  publicIdEnCarpeta,
  type FirmaDeSubida,
} from "../../cloudinary";
import type { Config } from "../../config";
import { ahora } from "../../fechas";
import { exito, fallo, type Resultado } from "../../resultado";

export { borrarDeCloudinary };

type Duena = { id: number; clave: string; asesor_id: string | null };

/** La casa y el permiso sobre ella, que es lo primero de cualquier operación. */
async function casaConPermiso(db: D1Database, actor: Actor, propiedadId: number): Promise<Resultado<Duena>> {
  const fila = await db
    .prepare("SELECT id, clave, asesor_id FROM propiedades WHERE id = ? AND eliminada_en IS NULL")
    .bind(propiedadId)
    .first<Duena>();
  if (!fila) return fallo(404, "no_encontrada", "Esa casa ya no está.");
  if (!puede(actor, "fotos.gestionar", { asesor_id: fila.asesor_id })) {
    return fallo(403, "sin_permiso", "Solo puedes cambiar las fotos de las casas que tienes asignadas.");
  }
  return exito(fila);
}

export async function datosParaSubir(
  db: D1Database,
  config: Config,
  actor: Actor,
  propiedadId: number,
): Promise<Resultado<FirmaDeSubida>> {
  const casa = await casaConPermiso(db, actor, propiedadId);
  if (!casa.ok) return casa;

  const firma = await firmaDeSubida(config.cloudinary, casa.valor.clave);
  if (!firma) {
    return fallo(400, "sin_cloudinary", "Configura Cloudinary para subir fotos.");
  }
  return exito(firma);
}

export type FotoNueva = {
  publicId: unknown;
  version: unknown;
  signature: unknown;
  ancho: unknown;
  alto: unknown;
  alt?: unknown;
};

const entero = (valor: unknown): number | null => {
  const n = typeof valor === "string" ? Number(valor) : valor;
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n < 100_000 ? n : null;
};

export async function registrarFoto(
  db: D1Database,
  config: Config,
  actor: Actor,
  propiedadId: number,
  datos: FotoNueva,
): Promise<Resultado<{ id: number; ancho: number | null; alto: number | null }>> {
  const casa = await casaConPermiso(db, actor, propiedadId);
  if (!casa.ok) return casa;

  const publicId = typeof datos.publicId === "string" ? datos.publicId.trim() : "";
  const version = String(datos.version ?? "").trim();
  const signature = typeof datos.signature === "string" ? datos.signature : "";

  if (!publicIdEnCarpeta(config.cloudinary, casa.valor.clave, publicId)) {
    return fallo(400, "foto_ajena", "Esa foto no está en la carpeta de esta casa.");
  }
  if (!/^\d{1,20}$/.test(version) || !(await firmaDeRespuestaValida(config.cloudinary, { publicId, version, signature }))) {
    return fallo(400, "firma_invalida", "No pudimos comprobar que esa foto venga de Cloudinary.");
  }

  const alt = typeof datos.alt === "string" ? datos.alt.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const momento = ahora();

  try {
    // El orden y la portada se calculan DENTRO de la sentencia: dos fotos que
    // llegan a la vez (se suben de tres en tres) no pueden pelearse el lugar.
    const [insercion] = await db.batch([
      db
        .prepare(
          `INSERT INTO fotos (propiedad_id, public_id, ancho, alto, alt, orden, es_portada)
           SELECT ?, ?, ?, ?, ?, COALESCE(MAX(orden), -1) + 1, CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
             FROM fotos INDEXED BY idx_fotos_propiedad WHERE propiedad_id = ?`,
        )
        .bind(propiedadId, publicId, entero(datos.ancho), entero(datos.alto), alt || null, propiedadId),
      db.prepare("UPDATE propiedades SET actualizada_en = ? WHERE id = ?").bind(momento, propiedadId),
      sentenciaBitacora(db, {
        usuarioId: actor.id,
        entidad: "foto",
        entidadId: String(propiedadId),
        accion: "subir",
        cambios: { public_id: publicId, clave: casa.valor.clave },
      }),
    ]);

    return exito({ id: Number(insercion.meta.last_row_id), ancho: entero(datos.ancho), alto: entero(datos.alto) });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      return fallo(409, "foto_repetida", "Esa foto ya estaba registrada.");
    }
    throw error;
  }
}

export type CambioDeFoto = { id: number; orden?: number; alt?: string };

/**
 * Orden, texto alternativo y portada, todo en un batch: si algo falla, la
 * galería no queda a medio reordenar.
 */
export async function acomodarFotos(
  db: D1Database,
  actor: Actor,
  propiedadId: number,
  cambios: { fotos?: CambioDeFoto[]; portadaId?: number },
): Promise<Resultado<null>> {
  const casa = await casaConPermiso(db, actor, propiedadId);
  if (!casa.ok) return casa;

  const momento = ahora();
  const sentencias: D1PreparedStatement[] = [];

  for (const cambio of cambios.fotos ?? []) {
    if (!Number.isInteger(cambio.id)) continue;
    if (Number.isInteger(cambio.orden)) {
      sentencias.push(
        db
          .prepare("UPDATE fotos SET orden = ? WHERE id = ? AND propiedad_id = ?")
          .bind(cambio.orden, cambio.id, propiedadId),
      );
    }
    if (typeof cambio.alt === "string") {
      sentencias.push(
        db
          .prepare("UPDATE fotos SET alt = ? WHERE id = ? AND propiedad_id = ?")
          .bind(cambio.alt.replace(/\s+/g, " ").trim().slice(0, 200) || null, cambio.id, propiedadId),
      );
    }
  }

  if (Number.isInteger(cambios.portadaId)) {
    sentencias.push(
      db.prepare("UPDATE fotos SET es_portada = 0 WHERE propiedad_id = ?").bind(propiedadId),
      db
        .prepare("UPDATE fotos SET es_portada = 1 WHERE id = ? AND propiedad_id = ?")
        .bind(cambios.portadaId, propiedadId),
    );
  }

  if (!sentencias.length) return exito(null);

  sentencias.push(
    db.prepare("UPDATE propiedades SET actualizada_en = ? WHERE id = ?").bind(momento, propiedadId),
    sentenciaBitacora(db, {
      usuarioId: actor.id,
      entidad: "foto",
      entidadId: String(propiedadId),
      accion: "acomodar",
      cambios: { fotos: (cambios.fotos ?? []).length, portada: cambios.portadaId ?? null },
    }),
  );

  await db.batch(sentencias);
  return exito(null);
}

/**
 * Borra la fila y devuelve el `public_id` para que quien llama lo quite de
 * Cloudinary DESPUÉS (con `waitUntil`). En ese orden: si Cloudinary falla queda
 * una huérfana, que `fotos:migrar --verificar` encuentra; al revés quedaría un
 * `<img>` roto en el sitio.
 */
export async function borrarFoto(
  db: D1Database,
  actor: Actor,
  propiedadId: number,
  fotoId: number,
): Promise<Resultado<{ publicId: string | null }>> {
  const casa = await casaConPermiso(db, actor, propiedadId);
  if (!casa.ok) return casa;

  const foto = await db
    .prepare("SELECT id, public_id, es_portada FROM fotos WHERE id = ? AND propiedad_id = ?")
    .bind(fotoId, propiedadId)
    .first<{ id: number; public_id: string | null; es_portada: number }>();
  if (!foto) return fallo(404, "no_encontrada", "Esa foto ya no está.");

  const momento = ahora();
  const sentencias: D1PreparedStatement[] = [
    sentenciaBitacora(db, {
      usuarioId: actor.id,
      entidad: "foto",
      entidadId: String(propiedadId),
      accion: "borrar",
      cambios: { public_id: foto.public_id, clave: casa.valor.clave },
    }),
    db.prepare("DELETE FROM fotos WHERE id = ? AND propiedad_id = ?").bind(fotoId, propiedadId),
  ];

  // Si era la portada, la primera que quede toma su lugar: una casa sin portada
  // sale sin foto en el listado.
  if (foto.es_portada === 1) {
    sentencias.push(
      db
        .prepare(
          `UPDATE fotos SET es_portada = 1 WHERE id = (
             SELECT id FROM fotos INDEXED BY idx_fotos_propiedad
              WHERE propiedad_id = ? ORDER BY orden ASC, id ASC LIMIT 1)`,
        )
        .bind(propiedadId),
    );
  }
  sentencias.push(db.prepare("UPDATE propiedades SET actualizada_en = ? WHERE id = ?").bind(momento, propiedadId));

  await db.batch(sentencias);
  return exito({ publicId: foto.public_id });
}

/** Para `/panel/sistema`: cuántas fotos siguen colgando del sitio viejo. */
export async function fotosPendientesDeMigrar(db: D1Database): Promise<number> {
  const fila = await db
    .prepare("SELECT COUNT(*) AS n FROM fotos WHERE public_id IS NULL AND url_origen IS NOT NULL")
    .first<{ n: number }>();
  return Number(fila?.n ?? 0);
}
