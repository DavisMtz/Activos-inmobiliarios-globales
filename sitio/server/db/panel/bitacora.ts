/**
 * Lectura de la bitácora (PLAN §11.2). La escritura vive en `server/bitacora.ts`
 * y va siempre en el mismo `db.batch()` que el cambio que registra.
 *
 * Se ordena por `id` y no por `creado_en`: el id es la llave primaria (o sea,
 * el rowid), así que recorrerlo hacia atrás son 50 filas leídas y no la tabla
 * entera. Las filas leídas se pagan (PLAN §17).
 */

import { ENTIDADES_DE_BITACORA } from "./etiquetas";

export const POR_PAGINA_BITACORA = 50;

export type FiltrosBitacora = {
  usuarioId: string | null;
  entidad: string | null;
  pagina: number;
};

export function leerFiltrosBitacora(parametros: URLSearchParams): FiltrosBitacora {
  const usuario = (parametros.get("usuario") ?? "").trim();
  const entidad = parametros.get("entidad") ?? "";
  const pagina = Number(parametros.get("pagina") ?? 1);
  return {
    usuarioId: /^[0-9a-fA-F-]{10,40}$/.test(usuario) ? usuario : null,
    entidad: ENTIDADES_DE_BITACORA.includes(entidad) ? entidad : null,
    pagina: Number.isInteger(pagina) && pagina > 0 && pagina < 10_000 ? pagina : 1,
  };
}

export type EntradaDeBitacora = {
  id: number;
  cuando: string;
  quien: string;
  quienId: string | null;
  entidad: string;
  entidadId: string;
  accion: string;
  cambios: Record<string, unknown> | null;
  /** Cuando la entrada es de una casa: su clave y su título, ya resueltos. */
  casa: { clave: string; titulo: string } | null;
};

type FilaBitacora = {
  id: number;
  creado_en: string;
  usuario_id: string | null;
  quien: string | null;
  entidad: string;
  entidad_id: string;
  accion: string;
  cambios: string | null;
  clave: string | null;
  titulo: string | null;
};

const DESDE = `FROM bitacora b
       LEFT JOIN usuarios u ON u.id = b.usuario_id
       LEFT JOIN propiedades p ON b.entidad IN ('propiedad','foto') AND p.id = CAST(b.entidad_id AS INTEGER)`;

function condiciones(filtros: FiltrosBitacora): { sql: string; valores: unknown[] } {
  const partes: string[] = ["1 = 1"];
  const valores: unknown[] = [];
  if (filtros.usuarioId) {
    partes.push("b.usuario_id = ?");
    valores.push(filtros.usuarioId);
  }
  if (filtros.entidad) {
    partes.push("b.entidad = ?");
    valores.push(filtros.entidad);
  }
  return { sql: partes.join(" AND "), valores };
}

export async function leerBitacora(
  db: D1Database,
  filtros: FiltrosBitacora,
): Promise<{ items: EntradaDeBitacora[]; total: number; pagina: number; paginas: number }> {
  const { sql, valores } = condiciones(filtros);
  const desde = (filtros.pagina - 1) * POR_PAGINA_BITACORA;

  const [cuenta, filas] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM bitacora b WHERE ${sql}`).bind(...valores),
    db
      .prepare(
        `SELECT b.id, b.creado_en, b.usuario_id, u.nombre AS quien, b.entidad, b.entidad_id, b.accion, b.cambios,
                p.clave, p.titulo
           ${DESDE}
          WHERE ${sql}
          ORDER BY b.id DESC
          LIMIT ? OFFSET ?`,
      )
      .bind(...valores, POR_PAGINA_BITACORA, desde),
  ]);

  const total = Number((cuenta.results[0] as { n: number } | undefined)?.n ?? 0);

  return {
    items: (filas.results as FilaBitacora[]).map((fila) => ({
      id: fila.id,
      cuando: fila.creado_en,
      // Sin nombre son los accesos fallidos y lo que hacen los scripts.
      quien: fila.quien ?? "—",
      quienId: fila.usuario_id,
      entidad: fila.entidad,
      entidadId: fila.entidad_id,
      accion: fila.accion,
      cambios: leerCambios(fila.cambios),
      casa: fila.clave && fila.titulo ? { clave: fila.clave, titulo: fila.titulo } : null,
    })),
    total,
    pagina: filtros.pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA_BITACORA)),
  };
}

function leerCambios(crudo: string | null): Record<string, unknown> | null {
  if (!crudo) return null;
  try {
    const valor = JSON.parse(crudo);
    return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Quiénes aparecen en la bitácora, para el desplegable del filtro. */
export async function personasConRastro(db: D1Database): Promise<{ id: string; nombre: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id, u.nombre FROM usuarios u
        WHERE EXISTS (SELECT 1 FROM bitacora b WHERE b.usuario_id = u.id)
        ORDER BY u.nombre`,
    )
    .all<{ id: string; nombre: string }>();
  return results;
}
