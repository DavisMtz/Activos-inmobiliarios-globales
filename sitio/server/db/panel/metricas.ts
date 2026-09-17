/**
 * Métricas propias (PLAN §12, `GET /api/panel/metricas`): qué casas se ven y
 * cuáles mueven el teléfono. Salen de la tabla `eventos`, que no guarda ni IP
 * ni nada de quien mira (PLAN §7), y de `prospectos`.
 *
 * El ALCANCE del permiso `metricas.ver` (§9) decide qué se devuelve, y se
 * aplica en el SQL y no al pintar: si se hiciera al pintar, la API seguiría
 * entregando de más.
 * - `todo` (maestro y director): todo, incluida la tabla por asesor.
 * - `propias` (asesor): **sus casas**, y los prospectos que llegaron por ellas.
 * - `vistas` (contenido): las vistas por casa y nada más. Ni clics de contacto
 *   ni prospectos: esa columna es de quien vende, no de quien publica.
 *
 * Nunca se piden las filas de `eventos`: es la tabla que más crece (una por
 * ficha vista) y las filas leídas se pagan (PLAN §17). Todo son `SUM` sobre la
 * ventana de tiempo, con el índice `idx_eventos_fecha` de la migración 0003.
 *
 * Por eso la condición de fecha **se quita del SQL** cuando se piden todos los
 * tiempos, en vez de escribir `(? IS NULL OR creado_en >= ?)`: con ese `OR`,
 * SQLite no puede usar el índice y recorre la tabla aunque la ventana sea de
 * siete días.
 */

import { alcance, type Actor } from "../../../shared/permisos";
import { ESTADOS_ABIERTOS } from "../../../shared/prospecto";
import type { EstadoPropiedad } from "../../../shared/propiedad";
import { haceDias } from "../../fechas";

/** Las ventanas que ofrece la pantalla. `null` = desde el principio. */
export const DIAS_DE_METRICAS = [7, 30, 90] as const;
export const DIAS_POR_OMISION = 30;

/**
 * Cuántas casas se enseñan: más de eso ya no se lee, se busca.
 *
 * Y solo las que tuvieron movimiento en el periodo (`HAVING`): una tabla con
 * 188 renglones en cero no dice nada, y la pregunta que contesta esta pantalla
 * es cuáles se están viendo.
 *
 * **Trampa medida el 17/09/2026:** el `HAVING` filtraba con `COUNT(e.id)` y no
 * con los alias del `SELECT` por una razón. SQLite resuelve los nombres del
 * `HAVING` contra las COLUMNAS DE ORIGEN antes que contra los alias, y
 * `usuarios` —que entra por el `LEFT JOIN` del asesor— tiene columnas
 * `telefono` y `whatsapp`. Escrito `HAVING vistas + whatsapp + telefono + … > 0`,
 * dos de los cuatro sumandos eran el teléfono del asesor (casi siempre NULL),
 * la suma entera daba NULL y la tabla salía VACÍA, sin ningún error.
 */
const TOPE_CASAS = 25;

export type AlcanceMetricas = "todo" | "propias" | "vistas";

export function leerDiasDeMetricas(parametros: URLSearchParams): number | null {
  const crudo = parametros.get("dias");
  if (crudo === "todo") return null;
  const dias = Number(crudo);
  return (DIAS_DE_METRICAS as readonly number[]).includes(dias) ? dias : DIAS_POR_OMISION;
}

export type ResumenMetricas = {
  vistas: number;
  whatsapp: number;
  telefono: number;
  compartir: number;
  prospectos: number;
};

export type MetricasDeCasa = {
  id: number;
  clave: string;
  titulo: string;
  estado: EstadoPropiedad;
  asesor: string | null;
  vistas: number;
  whatsapp: number;
  telefono: number;
  compartir: number;
  prospectos: number;
};

export type MetricasDeAsesor = {
  id: string;
  nombre: string;
  casas: number;
  vistas: number;
  prospectos: number;
  abiertos: number;
};

export type Metricas = {
  dias: number | null;
  desde: string | null;
  alcance: AlcanceMetricas;
  resumen: ResumenMetricas;
  casas: MetricasDeCasa[];
  /** Solo para quien ve «todo»; null para los demás. */
  asesores: MetricasDeAsesor[] | null;
  /** Cuántas casas hay en el alcance, para poder decir «25 de 188». */
  casasEnTotal: number;
};

const CUENTAS_POR_TIPO = `
  COALESCE(SUM(CASE WHEN e.tipo = 'ficha_vista' THEN 1 ELSE 0 END), 0) AS vistas,
  COALESCE(SUM(CASE WHEN e.tipo = 'whatsapp_click' THEN 1 ELSE 0 END), 0) AS whatsapp,
  COALESCE(SUM(CASE WHEN e.tipo = 'telefono_click' THEN 1 ELSE 0 END), 0) AS telefono,
  COALESCE(SUM(CASE WHEN e.tipo = 'compartir' THEN 1 ELSE 0 END), 0) AS compartir`;

type FilaCasa = Omit<MetricasDeCasa, "prospectos">;

const primerN = (lote: { results: unknown[] }): number =>
  Number((lote.results[0] as { n: number } | undefined)?.n ?? 0);

export async function leerMetricas(db: D1Database, actor: Actor, dias: number | null): Promise<Metricas> {
  const suyo = alcance(actor, "metricas.ver") as AlcanceMetricas;
  const desde = dias === null ? null : haceDias(dias);

  // Sin ventana, la condición no existe (ver el comentario de arriba).
  const ventana = (columna: string) => (desde === null ? "" : `AND ${columna} >= ?`);
  const f = desde === null ? [] : [desde];

  const propias = suyo === "propias";
  const MIS_CASAS = "(SELECT id FROM propiedades WHERE asesor_id = ?)";
  const soloMisCasas = propias ? "AND p.asesor_id = ?" : "";
  const soloMisEventos = propias ? `AND e.propiedad_id IN ${MIS_CASAS}` : "";
  // Para un asesor, «sus prospectos» aquí son los que llegaron por sus casas:
  // esta pantalla habla de sus casas, no de su bandeja.
  const soloMisProspectos = propias ? `AND pr.propiedad_id IN ${MIS_CASAS}` : "";
  const mio = propias ? [actor.id] : [];

  const [resumen, casas, prospectosPorCasa, prospectosEnTotal, cuantasCasas] = await db.batch([
    db
      .prepare(`SELECT ${CUENTAS_POR_TIPO} FROM eventos e WHERE 1 = 1 ${ventana("e.creado_en")} ${soloMisEventos}`)
      .bind(...f, ...mio),
    db
      .prepare(
        `SELECT p.id, p.clave, p.titulo, p.estado, u.nombre AS asesor, ${CUENTAS_POR_TIPO}
           FROM propiedades p
           LEFT JOIN usuarios u ON u.id = p.asesor_id
           LEFT JOIN eventos e ON e.propiedad_id = p.id ${ventana("e.creado_en")}
          WHERE p.eliminada_en IS NULL ${soloMisCasas}
          GROUP BY p.id
         HAVING COUNT(e.id) > 0
          ORDER BY vistas DESC, p.id ASC
          LIMIT ?`,
      )
      .bind(...f, ...mio, TOPE_CASAS),
    db
      .prepare(
        `SELECT pr.propiedad_id AS id, COUNT(*) AS n FROM prospectos pr
          WHERE pr.propiedad_id IS NOT NULL ${ventana("pr.creado_en")} ${soloMisProspectos}
          GROUP BY pr.propiedad_id`,
      )
      .bind(...f, ...mio),
    db
      .prepare(`SELECT COUNT(*) AS n FROM prospectos pr WHERE 1 = 1 ${ventana("pr.creado_en")} ${soloMisProspectos}`)
      .bind(...f, ...mio),
    db
      .prepare(`SELECT COUNT(*) AS n FROM propiedades p WHERE p.eliminada_en IS NULL ${soloMisCasas}`)
      .bind(...mio),
  ]);

  const totales = (resumen.results[0] ?? {}) as Record<string, number>;
  const porCasa = new Map<number, number>(
    (prospectosPorCasa.results as { id: number; n: number }[]).map((fila) => [fila.id, Number(fila.n)]),
  );

  // La persona de contenido ve vistas y nada más (§9).
  const comercial = (valor: number): number => (suyo === "vistas" ? 0 : valor);

  return {
    dias,
    desde,
    alcance: suyo,
    resumen: {
      vistas: Number(totales.vistas ?? 0),
      whatsapp: comercial(Number(totales.whatsapp ?? 0)),
      telefono: comercial(Number(totales.telefono ?? 0)),
      compartir: comercial(Number(totales.compartir ?? 0)),
      prospectos: comercial(primerN(prospectosEnTotal)),
    },
    casas: (casas.results as FilaCasa[]).map((fila) => ({
      id: fila.id,
      clave: fila.clave,
      titulo: fila.titulo,
      estado: fila.estado,
      asesor: fila.asesor,
      vistas: Number(fila.vistas),
      whatsapp: comercial(Number(fila.whatsapp)),
      telefono: comercial(Number(fila.telefono)),
      compartir: comercial(Number(fila.compartir)),
      prospectos: comercial(porCasa.get(fila.id) ?? 0),
    })),
    asesores: suyo === "todo" ? await porAsesor(db, desde) : null,
    casasEnTotal: primerN(cuantasCasas),
  };
}

/**
 * La tabla por asesor (§15, F4). Son subconsultas por persona y no un `JOIN`
 * grande porque las cuentas activas son menos de diez: diez búsquedas por
 * índice pesan menos que recorrer `eventos` entera.
 */
async function porAsesor(db: D1Database, desde: string | null): Promise<MetricasDeAsesor[]> {
  const ventana = (columna: string) => (desde === null ? "" : `AND ${columna} >= ?`);
  const f = desde === null ? [] : [desde];
  const abiertos = ESTADOS_ABIERTOS.map(() => "?").join(", ");

  const { results } = await db
    .prepare(
      `SELECT u.id, u.nombre,
              (SELECT COUNT(*) FROM propiedades p
                WHERE p.asesor_id = u.id AND p.eliminada_en IS NULL) AS casas,
              (SELECT COUNT(*) FROM eventos e
                WHERE e.tipo = 'ficha_vista' ${ventana("e.creado_en")}
                  AND e.propiedad_id IN (SELECT id FROM propiedades WHERE asesor_id = u.id)) AS vistas,
              (SELECT COUNT(*) FROM prospectos pr
                WHERE pr.asesor_id = u.id ${ventana("pr.creado_en")}) AS prospectos,
              (SELECT COUNT(*) FROM prospectos pr
                WHERE pr.asesor_id = u.id AND pr.estado IN (${abiertos})) AS abiertos
         FROM usuarios u
        WHERE u.activo = 1 AND u.rol IN ('maestro','director','asesor')
        ORDER BY vistas DESC, u.nombre ASC`,
    )
    .bind(...f, ...f, ...ESTADOS_ABIERTOS)
    .all<MetricasDeAsesor>();

  return results.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    casas: Number(fila.casas),
    vistas: Number(fila.vistas),
    prospectos: Number(fila.prospectos),
    abiertos: Number(fila.abiertos),
  }));
}
