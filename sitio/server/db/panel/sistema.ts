/**
 * Pantalla «Sistema» (PLAN §11.2), solo para el maestro: las redirecciones de
 * las URLs viejas y el estado de lo que el sitio tiene conectado.
 *
 * Las redirecciones importan más de lo que parece: son las que evitan que las
 * direcciones que hoy están en Google y en WhatsApp terminen en un 404 el día
 * de la mudanza (PLAN §10.3).
 */

import { puede, type Actor } from "../../../shared/permisos";
import { sentenciaBitacora } from "../../bitacora";
import type { Config } from "../../config";
import { normalizarRuta } from "../../redirecciones";
import { exito, fallo, type Resultado } from "../../resultado";

export type Redireccion = { origen: string; destino: string; codigo: number };

const SIN_PERMISO = "Solo el maestro puede cambiar esto.";

export async function listarRedirecciones(db: D1Database): Promise<Redireccion[]> {
  const { results } = await db
    .prepare("SELECT origen, destino, codigo FROM redirecciones ORDER BY origen LIMIT 500")
    .all<Redireccion>();
  return results;
}

type Revision = { ok: true; valor: Redireccion } | { ok: false; campo: string; mensaje: string };

/**
 * El origen se guarda normalizado (minúsculas y sin barra final), que es como
 * lo busca el Worker; si no, la regla nunca encontraría a su URL.
 */
export function revisarRedireccion(crudo: Record<string, unknown>): Revision {
  const origenCrudo = typeof crudo.origen === "string" ? crudo.origen.trim() : "";
  const destinoCrudo = typeof crudo.destino === "string" ? crudo.destino.trim() : "";
  const codigo = Number(crudo.codigo ?? 301);

  if (!origenCrudo.startsWith("/") || /\s/.test(origenCrudo) || origenCrudo.length > 200) {
    return { ok: false, campo: "origen", mensaje: "El origen es una ruta de este sitio, como /properties/casa-x." };
  }
  const esRutaPropia = destinoCrudo.startsWith("/");
  if ((!esRutaPropia && !destinoCrudo.startsWith("https://")) || /\s/.test(destinoCrudo) || destinoCrudo.length > 300) {
    return { ok: false, campo: "destino", mensaje: "El destino es una ruta de este sitio o una dirección https." };
  }
  if (codigo !== 301 && codigo !== 302) {
    return { ok: false, campo: "codigo", mensaje: "El código es 301 (definitiva) o 302 (temporal)." };
  }

  const origen = normalizarRuta(origenCrudo.split("?")[0]);
  const destino = esRutaPropia ? destinoCrudo : destinoCrudo;
  if (origen === destino) {
    return { ok: false, campo: "destino", mensaje: "El origen y el destino no pueden ser el mismo." };
  }
  return { ok: true, valor: { origen, destino, codigo } };
}

export async function guardarRedireccion(
  db: D1Database,
  actor: Actor,
  crudo: Record<string, unknown>,
): Promise<Resultado<Redireccion>> {
  if (!puede(actor, "sistema.gestionar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const revision = revisarRedireccion(crudo);
  if (!revision.ok) return fallo(400, "datos_invalidos", revision.mensaje);

  const { origen, destino, codigo } = revision.valor;
  await db.batch([
    db
      .prepare("INSERT OR REPLACE INTO redirecciones (origen, destino, codigo) VALUES (?, ?, ?)")
      .bind(origen, destino, codigo),
    sentenciaBitacora(db, {
      usuarioId: actor.id,
      entidad: "sistema",
      entidadId: `redireccion:${origen}`,
      accion: "editar",
      cambios: { destino, codigo },
    }),
  ]);
  return exito(revision.valor);
}

export async function borrarRedireccion(db: D1Database, actor: Actor, origen: string): Promise<Resultado<null>> {
  if (!puede(actor, "sistema.gestionar")) return fallo(403, "sin_permiso", SIN_PERMISO);

  const [, borrado] = await db.batch([
    sentenciaBitacora(
      db,
      { usuarioId: actor.id, entidad: "sistema", entidadId: `redireccion:${origen}`, accion: "borrar" },
      { sql: "SELECT 1 FROM redirecciones WHERE origen = ?", valores: [origen] },
    ),
    db.prepare("DELETE FROM redirecciones WHERE origen = ?").bind(origen),
  ]);

  if (borrado.meta.changes !== 1) return fallo(404, "no_encontrada", "Esa redirección ya no está.");
  return exito(null);
}

export type EstadoDelSistema = {
  modoDemo: boolean;
  sitioUrl: string;
  cloudinary: { configurado: boolean; nube: string; carpeta: string };
  integraciones: { analitica: boolean; correo: boolean; turnstile: boolean };
  fotosPendientes: number;
  redirecciones: number;
  casas: { estado: string; n: number }[];
};

/** Un vistazo a lo que está conectado y a lo que falta por migrar. */
export async function estadoDelSistema(db: D1Database, config: Config): Promise<EstadoDelSistema> {
  const [pendientes, redirecciones, casas] = await db.batch([
    db.prepare("SELECT COUNT(*) AS n FROM fotos WHERE public_id IS NULL AND url_origen IS NOT NULL"),
    db.prepare("SELECT COUNT(*) AS n FROM redirecciones"),
    db.prepare("SELECT estado, COUNT(*) AS n FROM propiedades WHERE eliminada_en IS NULL GROUP BY estado"),
  ]);

  const numero = (resultado: { results: unknown[] }): number =>
    Number((resultado.results[0] as { n?: number } | undefined)?.n ?? 0);

  return {
    modoDemo: config.modoDemo,
    sitioUrl: config.sitioUrl,
    cloudinary: {
      configurado: config.cloudinary.configurado,
      nube: config.cloudinary.cloudName,
      carpeta: config.cloudinary.carpeta,
    },
    integraciones: {
      analitica: Boolean(config.ga4Id),
      correo: config.correo.proveedor !== "nulo",
      turnstile: Boolean(config.turnstile.siteKey),
    },
    fotosPendientes: numero(pendientes),
    redirecciones: numero(redirecciones),
    casas: casas.results as { estado: string; n: number }[],
  };
}
