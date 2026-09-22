/**
 * Métricas propias (PLAN §12, `GET /api/panel/metricas`): qué casas se ven,
 * cuáles mueven el teléfono y cómo van los prospectos. Salen de la tabla
 * `eventos`, que no guarda ni IP ni nada de quien mira (PLAN §7), de
 * `prospectos` (sin nombre, teléfono, correo ni mensaje: aquí solo se cuentan),
 * del catálogo y de la bitácora.
 *
 * El ALCANCE del permiso `metricas.ver` (§9) decide qué se devuelve, y se
 * aplica en el SQL y no al pintar: si se hiciera al pintar, la API seguiría
 * entregando de más.
 * - `todo` (maestro y director): todo, incluida la tabla por asesor.
 * - `propias` (asesor): **sus casas**, y los prospectos que llegaron por ellas.
 * - `vistas` (contenido): las vistas y nada más. Ni clics de contacto ni
 *   prospectos: eso es de quien vende, no de quien publica.
 *
 * Nunca se piden las filas de `eventos`: es la tabla que más crece (una por
 * ficha vista) y las filas leídas se pagan (PLAN §17). Todo son `COUNT` sobre la
 * ventana, con el índice `idx_eventos_fecha` de la migración 0003, y van juntos
 * en un `db.batch`: una ida y vuelta a la base (dos para quien ve «todo», que
 * además pide la tabla por asesor).
 *
 * Por eso la condición de fecha **se quita del SQL** cuando se piden todos los
 * tiempos, en vez de escribir `(? IS NULL OR creado_en >= ?)`: con ese `OR`,
 * SQLite no puede usar el índice y recorre la tabla aunque la ventana sea de
 * siete días. Y con ventana va `INDEXED BY idx_eventos_fecha`: medido en local
 * el 21/09/2026, al agrupar por casa SQLite prefería recorrer ENTERO el índice
 * `idx_eventos` (todas las visitas de la historia) antes que la ventana.
 */

import { ESTADOS_EN_LISTADO, ETIQUETA_TIPO_PLURAL, TIPOS, type Tipo } from "../../../shared/filtros";
import { alcance, type Actor } from "../../../shared/permisos";
import {
  ESTADOS_ABIERTOS,
  ESTADOS_PROSPECTO,
  TIPOS_PROSPECTO,
  type EstadoProspecto,
  type TipoProspecto,
} from "../../../shared/prospecto";
import { ESTADOS_PROPIEDAD, type EstadoPropiedad } from "../../../shared/propiedad";
import { diaDeMorelia, diasEntre } from "../../fechas";
import {
  RANGOS_DE_PRECIO,
  armarSerie,
  cubetaPara,
  cuentasEnCero,
  mediana,
  rangoDePrecio,
  rejillaDeHoras,
  ventanaDeMetricas,
  type Cubeta,
  type Cuentas,
  type PuntoSerie,
} from "../../metricas";

/** Las ventanas que ofrece la pantalla. `null` = desde el principio. */
export const DIAS_DE_METRICAS = [7, 30, 90] as const;
export const DIAS_POR_OMISION = 30;

/**
 * Cuántas casas se enseñan: más de eso ya no se lee, se busca.
 *
 * Y solo las que tuvieron movimiento en el periodo: una tabla con 188
 * renglones en cero no dice nada, y la pregunta que contesta esta pantalla es
 * cuáles se están viendo.
 *
 * **Trampa medida el 17/09/2026**, que ya no aplica pero que se repetiría con
 * cualquier `HAVING` sobre un `JOIN`: SQLite resuelve los nombres del `HAVING`
 * contra las COLUMNAS DE ORIGEN antes que contra los alias, y `usuarios` tiene
 * columnas `telefono` y `whatsapp`. Escrito `HAVING vistas + whatsapp + … > 0`,
 * dos de los sumandos eran el teléfono del asesor, la suma daba NULL y la tabla
 * salía VACÍA sin ningún error. Hoy la cuenta por casa se arma en JavaScript.
 */
const TOPE_CASAS = 25;

/**
 * Cuántos tipos y colonias se nombran; el resto se junta en un último renglón
 * («Otras 38 colonias»). Con los 8 tipos del catálogo, cinco eran barras de un
 * pelo (edificios, oficinas: 1 % cada uno) y a 390 px la sección medía tres
 * pantallas.
 */
const TOPE_TIPOS = 4;
const TOPE_COLONIAS = 6;

/** Deja las primeras `tope` filas y junta las demás en una; si solo sobra una, se queda como está. */
function plegar(filas: FilaDeDemanda[], tope: number, nombre: (cuantas: number) => string): FilaDeDemanda[] {
  if (filas.length <= tope + 1) return filas;
  const resto = filas.slice(tope);
  return [
    ...filas.slice(0, tope),
    {
      clave: "otras",
      etiqueta: nombre(resto.length),
      catalogo: resto.reduce((suma, fila) => suma + fila.catalogo, 0),
      vistas: resto.reduce((suma, fila) => suma + fila.vistas, 0),
    },
  ];
}

export type AlcanceMetricas = "todo" | "propias" | "vistas";

export function leerDiasDeMetricas(parametros: URLSearchParams): number | null {
  const crudo = parametros.get("dias");
  if (crudo === "todo") return null;
  const dias = Number(crudo);
  return (DIAS_DE_METRICAS as readonly number[]).includes(dias) ? dias : DIAS_POR_OMISION;
}

export type ResumenMetricas = Cuentas;

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
  whatsapp: number;
  prospectos: number;
  abiertos: number;
  cerrados: number;
};

/** Un renglón de «qué busca la gente»: lo que hay en el sitio contra lo que se ve. */
export type FilaDeDemanda = {
  clave: string;
  etiqueta: string;
  /** Casas en el sitio (publicadas o apartadas) de ese grupo, hoy. */
  catalogo: number;
  /** Fichas vistas de casas de ese grupo en el periodo. */
  vistas: number;
};

export type PanoramaDeProspectos = {
  total: number;
  porEstado: Record<EstadoProspecto, number>;
  porTipo: Record<TipoProspecto, number>;
  /** Siguen abiertos y nadie los tiene asignados. */
  sinAsignar: number;
  /** Cuánto se tardó el equipo en atenderlos: el primer cambio de estado o la primera nota. */
  atencion: { atendidos: number; medianaHoras: number | null };
};

export type MovimientosDeInventario = Record<"publicada" | "apartada" | "vendida" | "rentada", number>;

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

  /** Hoy en Morelia y el primer día que se enseña. */
  hoy: string;
  primerDia: string;
  /** Lo mismo del periodo anterior, del mismo largo; null en «Todo». */
  anterior: ResumenMetricas | null;
  serie: { cubeta: Cubeta; puntos: PuntoSerie[] };
  /** Casas en el sitio hoy y cuántas de ellas tuvieron al menos una vista. */
  cobertura: { enElSitio: number; conVistas: number };
  demanda: { porTipo: FilaDeDemanda[]; porPrecio: FilaDeDemanda[]; porColonia: FilaDeDemanda[] };
  /** Vistas por día de la semana y hora: [lunes … domingo][0 … 23]. */
  horas: number[][];
  /** Null para quien ve solo vistas. */
  prospectos: PanoramaDeProspectos | null;
  inventario: { porEstado: Record<EstadoPropiedad, number>; movimientos: MovimientosDeInventario };
};

type FilaDeCatalogo = {
  id: number;
  clave: string;
  titulo: string;
  estado: EstadoPropiedad;
  tipo: Tipo;
  operacion: string;
  precio: number | null;
  asesor: string | null;
  colonia: string | null;
  ciudad: string | null;
};

type FilaDeProspecto = {
  estado: EstadoProspecto;
  tipo: TipoProspecto;
  propiedad_id: number | null;
  asesor_id: string | null;
  creado_en: string;
  atendido_en: string | null;
};

const TIPO_A_CUENTA: Record<string, keyof Cuentas> = {
  ficha_vista: "vistas",
  whatsapp_click: "whatsapp",
  telefono_click: "telefono",
  compartir: "compartir",
};

const primerN = (lote: { results: unknown[] }): number =>
  Number((lote.results[0] as { n: number } | undefined)?.n ?? 0);

const contar = <K extends string>(claves: readonly K[]): Record<K, number> =>
  Object.fromEntries(claves.map((clave) => [clave, 0])) as Record<K, number>;

export async function leerMetricas(db: D1Database, actor: Actor, dias: number | null): Promise<Metricas> {
  const suyo = alcance(actor, "metricas.ver") as AlcanceMetricas;
  const ventana = ventanaDeMetricas(dias);
  const { desde, anterior } = ventana;

  // Sin ventana, la condición no existe (ver el comentario de arriba).
  const cuando = (columna: string) => (desde === null ? "" : `AND ${columna} >= ?`);
  const f = desde === null ? [] : [desde];
  const eventosDeLaVentana = desde === null ? "eventos e" : "eventos e INDEXED BY idx_eventos_fecha";

  const propias = suyo === "propias";
  const MIS_CASAS = "(SELECT id FROM propiedades WHERE asesor_id = ?)";
  const soloMisCasas = propias ? "AND p.asesor_id = ?" : "";
  const soloMisEventos = propias ? `AND e.propiedad_id IN ${MIS_CASAS}` : "";
  // Para un asesor, «sus prospectos» aquí son los que llegaron por sus casas:
  // esta pantalla habla de sus casas, no de su bandeja.
  const soloMisProspectos = propias ? `AND pr.propiedad_id IN ${MIS_CASAS}` : "";
  const soloMiBitacora = propias
    ? "AND b.entidad_id IN (SELECT CAST(id AS TEXT) FROM propiedades WHERE asesor_id = ?)"
    : "";
  const mio = propias ? [actor.id] : [];

  const [porDia, porCasa, previos, horas, catalogo, prospectos, prospectosPrevios, movimientos] = await db.batch([
    db
      .prepare(
        `SELECT date(e.creado_en, '-6 hours') AS dia, e.tipo, COUNT(*) AS n
           FROM ${eventosDeLaVentana}
          WHERE 1 = 1 ${cuando("e.creado_en")} ${soloMisEventos}
          GROUP BY dia, e.tipo`,
      )
      .bind(...f, ...mio),
    // Una cuenta por casa y tipo, también de las que no tienen casa (el
    // WhatsApp general): el resumen es la suma de TODO esto.
    db
      .prepare(
        `SELECT e.propiedad_id AS id, e.tipo, COUNT(*) AS n
           FROM ${eventosDeLaVentana}
          WHERE 1 = 1 ${cuando("e.creado_en")} ${soloMisEventos}
          GROUP BY e.propiedad_id, e.tipo`,
      )
      .bind(...f, ...mio),
    anterior
      ? db
          .prepare(
            `SELECT e.tipo, COUNT(*) AS n
               FROM eventos e INDEXED BY idx_eventos_fecha
              WHERE e.creado_en >= ? AND e.creado_en < ? ${soloMisEventos}
              GROUP BY e.tipo`,
          )
          .bind(anterior.desde, anterior.hasta, ...mio)
      : db.prepare("SELECT NULL AS tipo, 0 AS n WHERE 0"),
    db
      .prepare(
        `SELECT CAST(strftime('%w', e.creado_en, '-6 hours') AS INTEGER) AS dow,
                CAST(strftime('%H', e.creado_en, '-6 hours') AS INTEGER) AS hora,
                COUNT(*) AS n
           FROM ${eventosDeLaVentana}
          WHERE e.tipo = 'ficha_vista' ${cuando("e.creado_en")} ${soloMisEventos}
          GROUP BY dow, hora`,
      )
      .bind(...f, ...mio),
    db
      .prepare(
        `SELECT p.id, p.clave, p.titulo, p.estado, p.tipo, p.operacion, p.precio,
                u.nombre AS asesor, z.colonia, z.ciudad
           FROM propiedades p
           LEFT JOIN usuarios u ON u.id = p.asesor_id
           LEFT JOIN zonas z ON z.id = p.zona_id
          WHERE p.eliminada_en IS NULL ${soloMisCasas}`,
      )
      .bind(...mio),
    // Solo lo que se cuenta: ni nombre, ni teléfono, ni correo, ni mensaje.
    // La primera vez que alguien del equipo lo movió o le escribió una nota es
    // cuando se atendió (la bitácora lo anota en el mismo lote, §11.4).
    db
      .prepare(
        `SELECT pr.estado, pr.tipo, pr.propiedad_id, pr.asesor_id, pr.creado_en,
                (SELECT MIN(b.creado_en) FROM bitacora b
                  WHERE b.entidad = 'prospecto' AND b.entidad_id = CAST(pr.id AS TEXT)
                    AND b.accion IN ('estado', 'nota')) AS atendido_en
           FROM prospectos pr
          WHERE 1 = 1 ${cuando("pr.creado_en")} ${soloMisProspectos}`,
      )
      .bind(...f, ...mio),
    anterior
      ? db
          .prepare(
            `SELECT COUNT(*) AS n FROM prospectos pr
              WHERE pr.creado_en >= ? AND pr.creado_en < ? ${soloMisProspectos}`,
          )
          .bind(anterior.desde, anterior.hasta, ...mio)
      : db.prepare("SELECT 0 AS n"),
    // Lo que el equipo movió en el periodo: casas que se publicaron, se
    // apartaron, se vendieron o se rentaron. Sale de la bitácora porque la casa
    // solo guarda su estado de HOY.
    db
      .prepare(
        `SELECT CASE WHEN b.accion = 'estado' THEN json_extract(b.cambios, '$.estado[1]')
                     ELSE json_extract(b.cambios, '$.estado') END AS estado,
                COUNT(*) AS n
           FROM bitacora b
          WHERE b.entidad = 'propiedad' AND b.accion IN ('estado', 'crear') ${cuando("b.creado_en")} ${soloMiBitacora}
          GROUP BY 1`,
      )
      .bind(...f, ...mio),
  ]);

  // La persona de contenido ve vistas y nada más (§9).
  const comercial = (valor: number): number => (suyo === "vistas" ? 0 : valor);
  const recortar = (cuentas: Cuentas): Cuentas => ({
    vistas: cuentas.vistas,
    whatsapp: comercial(cuentas.whatsapp),
    telefono: comercial(cuentas.telefono),
    compartir: comercial(cuentas.compartir),
    prospectos: comercial(cuentas.prospectos),
  });

  // ─── Eventos: el resumen, la cuenta por casa y la serie ─────────
  const resumen = cuentasEnCero();
  const delaCasa = new Map<number, Cuentas>();
  for (const fila of porCasa.results as { id: number | null; tipo: string; n: number }[]) {
    const cuenta = TIPO_A_CUENTA[fila.tipo];
    if (!cuenta) continue;
    resumen[cuenta] += Number(fila.n);
    if (fila.id === null) continue;
    const casa = delaCasa.get(fila.id) ?? cuentasEnCero();
    casa[cuenta] += Number(fila.n);
    delaCasa.set(fila.id, casa);
  }

  const porDiaLocal = new Map<string, Cuentas>();
  const delDia = (dia: string): Cuentas => {
    const cuentas = porDiaLocal.get(dia) ?? cuentasEnCero();
    porDiaLocal.set(dia, cuentas);
    return cuentas;
  };
  for (const fila of porDia.results as { dia: string; tipo: string; n: number }[]) {
    const cuenta = TIPO_A_CUENTA[fila.tipo];
    if (cuenta && fila.dia) delDia(fila.dia)[cuenta] += Number(fila.n);
  }

  // ─── Prospectos ────────────────────────────────────────────────
  const filasDeProspectos = prospectos.results as FilaDeProspecto[];
  const porCasaProspectos = new Map<number, number>();
  const porEstado = contar(ESTADOS_PROSPECTO);
  const porTipo = contar(TIPOS_PROSPECTO);
  const esperas: number[] = [];
  let sinAsignar = 0;
  for (const fila of filasDeProspectos) {
    resumen.prospectos += 1;
    delDia(diaDeMorelia(new Date(fila.creado_en))).prospectos += 1;
    if (fila.propiedad_id !== null) {
      porCasaProspectos.set(fila.propiedad_id, (porCasaProspectos.get(fila.propiedad_id) ?? 0) + 1);
    }
    if (fila.estado in porEstado) porEstado[fila.estado] += 1;
    if (fila.tipo in porTipo) porTipo[fila.tipo] += 1;
    if (!fila.asesor_id && ESTADOS_ABIERTOS.includes(fila.estado)) sinAsignar += 1;
    if (fila.atendido_en) {
      const horasDeEspera = (Date.parse(fila.atendido_en) - Date.parse(fila.creado_en)) / 3_600_000;
      if (Number.isFinite(horasDeEspera) && horasDeEspera >= 0) esperas.push(horasDeEspera);
    }
  }

  // ─── El periodo anterior ───────────────────────────────────────
  let resumenAnterior: Cuentas | null = null;
  if (anterior) {
    resumenAnterior = cuentasEnCero();
    for (const fila of previos.results as { tipo: string; n: number }[]) {
      const cuenta = TIPO_A_CUENTA[fila.tipo];
      if (cuenta) resumenAnterior[cuenta] += Number(fila.n);
    }
    resumenAnterior.prospectos = primerN(prospectosPrevios);
  }

  // ─── La serie: del primer día a hoy, sin huecos ────────────────
  // En «Todo» empieza el primer día que tuvo algo.
  const diasConDatos = [...porDiaLocal.keys()].sort();
  const primerDia = ventana.primerDia ?? diasConDatos[0] ?? ventana.hoy;
  const cubeta = cubetaPara(diasEntre(primerDia, ventana.hoy) + 1);
  const puntos = armarSerie(porDiaLocal, primerDia, ventana.hoy, cubeta).map((punto) => ({
    ...recortar(punto),
    desde: punto.desde,
    hasta: punto.hasta,
  }));

  // ─── El catálogo: casas, demanda, cobertura e inventario ───────
  const filasDeCatalogo = catalogo.results as FilaDeCatalogo[];
  const enElSitio = (fila: FilaDeCatalogo) => (ESTADOS_EN_LISTADO as readonly string[]).includes(fila.estado);
  const vistasDe = (id: number) => delaCasa.get(id)?.vistas ?? 0;

  const casas: MetricasDeCasa[] = filasDeCatalogo
    .filter((fila) => delaCasa.has(fila.id))
    .map((fila) => {
      const cuentas = delaCasa.get(fila.id) ?? cuentasEnCero();
      return {
        id: fila.id,
        clave: fila.clave,
        titulo: fila.titulo,
        estado: fila.estado,
        asesor: fila.asesor,
        vistas: cuentas.vistas,
        whatsapp: comercial(cuentas.whatsapp),
        telefono: comercial(cuentas.telefono),
        compartir: comercial(cuentas.compartir),
        prospectos: comercial(porCasaProspectos.get(fila.id) ?? 0),
      };
    })
    .sort((a, b) => b.vistas - a.vistas || a.id - b.id)
    .slice(0, TOPE_CASAS);

  const porEstadoDeCasa = contar(ESTADOS_PROPIEDAD);
  for (const fila of filasDeCatalogo) {
    if (fila.estado in porEstadoDeCasa) porEstadoDeCasa[fila.estado] += 1;
  }

  const agrupar = (clave: (fila: FilaDeCatalogo) => string | null): Map<string, { catalogo: number; vistas: number }> => {
    const grupos = new Map<string, { catalogo: number; vistas: number }>();
    for (const fila of filasDeCatalogo) {
      const llave = clave(fila);
      if (llave === null) continue;
      const grupo = grupos.get(llave) ?? { catalogo: 0, vistas: 0 };
      if (enElSitio(fila)) grupo.catalogo += 1;
      grupo.vistas += vistasDe(fila.id);
      grupos.set(llave, grupo);
    }
    return grupos;
  };

  const tipos = agrupar((fila) => fila.tipo);
  const porTipoDeCasa = plegar(
    TIPOS.filter((tipo) => {
      const grupo = tipos.get(tipo);
      return grupo && (grupo.catalogo > 0 || grupo.vistas > 0);
    })
      .map((tipo) => ({ clave: tipo, etiqueta: ETIQUETA_TIPO_PLURAL[tipo], ...tipos.get(tipo)! }))
      .sort((a, b) => b.vistas - a.vistas || b.catalogo - a.catalogo),
    TOPE_TIPOS,
    (cuantos) => `Otros ${cuantos} tipos`,
  );

  // El precio de venta: el de renta es mensual y no se puede poner en la misma escala.
  const precios = agrupar((fila) => (fila.operacion === "renta" ? null : rangoDePrecio(fila.precio)));
  const porPrecio: FilaDeDemanda[] = RANGOS_DE_PRECIO.filter((rango) => precios.has(rango.clave)).map((rango) => ({
    clave: rango.clave,
    etiqueta: rango.etiqueta,
    ...precios.get(rango.clave)!,
  }));

  // Una casa sin colonia capturada va con su ciudad, pero dicho así: «Morelia» a
  // secas se leería como una colonia que se llama Morelia.
  const colonias = agrupar((fila) => fila.colonia?.trim() || (fila.ciudad?.trim() ? `${fila.ciudad.trim()}, sin colonia` : null));
  const porColonia = plegar(
    [...colonias.entries()]
      .map(([nombre, grupo]) => ({ clave: nombre, etiqueta: nombre, ...grupo }))
      .sort((a, b) => b.vistas - a.vistas || b.catalogo - a.catalogo || a.etiqueta.localeCompare(b.etiqueta, "es")),
    TOPE_COLONIAS,
    (cuantas) => `Otras ${cuantas} colonias`,
  );

  const cobertura = {
    enElSitio: filasDeCatalogo.filter(enElSitio).length,
    conVistas: filasDeCatalogo.filter((fila) => enElSitio(fila) && vistasDe(fila.id) > 0).length,
  };

  const movido: MovimientosDeInventario = { publicada: 0, apartada: 0, vendida: 0, rentada: 0 };
  for (const fila of movimientos.results as { estado: string | null; n: number }[]) {
    if (fila.estado && fila.estado in movido) movido[fila.estado as keyof MovimientosDeInventario] += Number(fila.n);
  }

  return {
    dias,
    desde,
    alcance: suyo,
    resumen: recortar(resumen),
    casas,
    asesores: suyo === "todo" ? await porAsesor(db, desde) : null,
    casasEnTotal: filasDeCatalogo.length,

    hoy: ventana.hoy,
    primerDia,
    anterior: resumenAnterior ? recortar(resumenAnterior) : null,
    serie: { cubeta, puntos },
    cobertura,
    demanda: { porTipo: porTipoDeCasa, porPrecio, porColonia },
    horas: rejillaDeHoras(horas.results as { dow: number; hora: number; n: number }[]),
    prospectos:
      suyo === "vistas"
        ? null
        : {
            total: filasDeProspectos.length,
            porEstado,
            porTipo,
            sinAsignar,
            atencion: { atendidos: esperas.length, medianaHoras: mediana(esperas) },
          },
    inventario: { porEstado: porEstadoDeCasa, movimientos: movido },
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
              (SELECT COUNT(*) FROM eventos e
                WHERE e.tipo = 'whatsapp_click' ${ventana("e.creado_en")}
                  AND e.propiedad_id IN (SELECT id FROM propiedades WHERE asesor_id = u.id)) AS whatsapp,
              (SELECT COUNT(*) FROM prospectos pr
                WHERE pr.asesor_id = u.id ${ventana("pr.creado_en")}) AS prospectos,
              (SELECT COUNT(*) FROM prospectos pr
                WHERE pr.asesor_id = u.id AND pr.estado IN (${abiertos})) AS abiertos,
              (SELECT COUNT(*) FROM prospectos pr
                WHERE pr.asesor_id = u.id AND pr.estado = 'cerrado' ${ventana("pr.creado_en")}) AS cerrados
         FROM usuarios u
        WHERE u.activo = 1 AND u.rol IN ('maestro','director','asesor')
        ORDER BY vistas DESC, u.nombre ASC`,
    )
    .bind(...f, ...f, ...f, ...ESTADOS_ABIERTOS, ...f)
    .all<MetricasDeAsesor>();

  return results.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    casas: Number(fila.casas),
    vistas: Number(fila.vistas),
    whatsapp: Number(fila.whatsapp),
    prospectos: Number(fila.prospectos),
    abiertos: Number(fila.abiertos),
    cerrados: Number(fila.cerrados),
  }));
}
