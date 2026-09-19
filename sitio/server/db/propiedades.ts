/**
 * Consultas del catálogo público (PLAN §10.1). Todo lo que el sitio enseña de
 * las casas sale de aquí, y cada función devuelve **solo lo que se pinta**:
 * la ficha de F0 mandaba a la hidratación columnas que nadie usaba y F2 lo
 * corrige (PLAN §15, F2).
 *
 * Las URLs de las fotos se resuelven en el servidor con `fotoVista`, así que
 * ningún componente ve `public_id` ni sabe que existe Cloudinary.
 */

import { patronBusqueda } from "../../shared/busqueda";
import {
  columnaPrecio,
  ESTADOS_CON_FICHA,
  ESTADOS_EN_LISTADO,
  POR_PAGINA,
  type Filtros,
  type Operacion,
  type Orden,
  type Tipo,
} from "../../shared/filtros";
import { fotoVista, type FotoVista } from "../../shared/fotos";
import { repartirPortada } from "../../shared/portada";
import { slugificar } from "../../shared/texto";

// ─── Lo que ve la interfaz ────────────────────────────────────────

export type Tarjeta = {
  clave: string;
  slug: string;
  titulo: string;
  operacion: "venta" | "renta" | "venta_renta";
  estado: string;
  precio: number | null;
  precioRenta: number | null;
  recamaras: number | null;
  banos: number | null;
  m2Construccion: number | null;
  m2Terreno: number | null;
  /** «El Prado, Morelia»; vacío si la casa no tiene zona. */
  zona: string;
  resumen: string | null;
  foto: FotoVista | null;
  /**
   * Solo las casas de la vitrina de la portada: la variante `galeria` (1600
   * px, la misma que ya pide la ficha, así que no es un derivado nuevo). Desde
   * 1920 px la vitrina mide más de 1000 px y la de 960 se veía borrosa.
   */
  fotoGrande?: FotoVista | null;
};

export type Ficha = Tarjeta & {
  id: number;
  tipo: Tipo;
  condicion: string | null;
  mediosBanos: number | null;
  estacionamientos: number | null;
  niveles: number | null;
  anioConstruccion: number | null;
  descripcion: string | null;
  videoUrl: string | null;
  colonia: string | null;
  ciudad: string | null;
  /** WhatsApp del asesor de esa casa, si tiene (PLAN §10.2). */
  whatsappAsesor: string | null;
  fotos: FotoVista[];
  miniaturas: FotoVista[];
  /** JPG 1200×630 para WhatsApp y Facebook. */
  imagenOg: string | null;
};

export type ConteoTipo = { tipo: Tipo; n: number };
export type OpcionCiudad = { ciudad: string; slug: string; n: number };
export type OpcionZona = { slug: string; colonia: string; ciudad: string; n: number };

export type Catalogo = {
  total: number;
  tipos: ConteoTipo[];
  operaciones: { venta: number; renta: number };
  /** Calculados con los datos, nunca fijos: el filtro viejo topaba en un millón. */
  rangos: {
    venta: { min: number | null; max: number | null };
    renta: { min: number | null; max: number | null };
  };
  ciudades: OpcionCiudad[];
  /** Solo las colonias con 2 o más casas: 93 de las 123 zonas tienen una sola. */
  zonas: OpcionZona[];
};

export type Pagina = {
  items: Tarjeta[];
  total: number;
  pagina: number;
  paginas: number;
};

// ─── Trozos de SQL reutilizados ───────────────────────────────────

const VISIBLES = `p.eliminada_en IS NULL AND p.estado IN (${ESTADOS_EN_LISTADO.map((e) => `'${e}'`).join(",")})`;

/** El texto sobre el que busca el buscador: título, colonia, ciudad y clave. */
const BUSCABLE = "p.titulo || ' ' || COALESCE(z.colonia, '') || ' ' || COALESCE(z.ciudad, '') || ' ' || p.clave";

/** La portada es la marcada; si no hay ninguna, la primera del orden. */
const PORTADA = `f.id = (SELECT id FROM fotos WHERE propiedad_id = p.id ORDER BY es_portada DESC, orden ASC LIMIT 1)`;

const CAMPOS_TARJETA = `p.clave, p.slug, p.titulo, p.operacion, p.estado, p.precio, p.precio_renta,
       p.recamaras, p.banos_completos, p.m2_construccion, p.m2_terreno, p.resumen,
       z.colonia, z.ciudad,
       f.public_id AS foto_public_id, f.url_origen AS foto_url_origen, f.alt AS foto_alt,
       f.ancho AS foto_ancho, f.alto AS foto_alto`;

const DESDE_TARJETA = `FROM propiedades p
       LEFT JOIN zonas z ON z.id = p.zona_id
       LEFT JOIN fotos f ON ${PORTADA}`;

type FilaTarjeta = {
  clave: string;
  slug: string;
  titulo: string;
  operacion: Tarjeta["operacion"];
  estado: string;
  precio: number | null;
  precio_renta: number | null;
  recamaras: number | null;
  banos_completos: number | null;
  m2_construccion: number | null;
  m2_terreno: number | null;
  resumen: string | null;
  colonia: string | null;
  ciudad: string | null;
  foto_public_id: string | null;
  foto_url_origen: string | null;
  foto_alt: string | null;
  foto_ancho: number | null;
  foto_alto: number | null;
};

/** «El Prado, Morelia». Sin colonia queda solo la ciudad; sin ninguna, vacío. */
export const nombreDeZona = (colonia: string | null, ciudad: string | null): string =>
  [colonia, ciudad].filter(Boolean).join(", ");

function aTarjeta(fila: FilaTarjeta, cloudName: string): Tarjeta {
  const zona = nombreDeZona(fila.colonia, fila.ciudad);
  return {
    clave: fila.clave,
    slug: fila.slug,
    titulo: fila.titulo,
    operacion: fila.operacion,
    estado: fila.estado,
    precio: fila.precio,
    precioRenta: fila.precio_renta,
    recamaras: fila.recamaras,
    banos: fila.banos_completos,
    m2Construccion: fila.m2_construccion,
    m2Terreno: fila.m2_terreno,
    zona,
    resumen: fila.resumen,
    foto: fotoVista(
      {
        public_id: fila.foto_public_id,
        url_origen: fila.foto_url_origen,
        alt: fila.foto_alt,
        ancho: fila.foto_ancho,
        alto: fila.foto_alto,
      },
      "tarjeta",
      cloudName,
      zona ? `${fila.titulo}, ${zona}` : fila.titulo,
    ),
  };
}

// ─── Condiciones del listado ──────────────────────────────────────

const OPERACION_INCLUYE: Record<Operacion, string> = {
  // Una casa en «venta_renta» sale en las dos búsquedas.
  venta: "p.operacion IN ('venta','venta_renta')",
  renta: "p.operacion IN ('renta','venta_renta')",
};

const ORDEN_SQL: Record<Orden, (columna: string) => string> = {
  recientes: () => "COALESCE(p.publicada_en, p.creada_en) DESC, p.id DESC",
  // Sin el `IS NULL` primero, las casas sin precio encabezarían la lista.
  precio_asc: (columna) => `p.${columna} IS NULL, p.${columna} ASC, p.id DESC`,
  precio_desc: (columna) => `p.${columna} DESC, p.id DESC`,
  m2_desc: () => "p.m2_construccion DESC, p.m2_terreno DESC, p.id DESC",
};

function condicionesDe(filtros: Filtros, catalogo: Catalogo): { sql: string; valores: unknown[] } {
  const partes = [VISIBLES];
  const valores: unknown[] = [];

  if (filtros.operacion) partes.push(OPERACION_INCLUYE[filtros.operacion]);

  if (filtros.tipo) {
    partes.push("p.tipo = ?");
    valores.push(filtros.tipo);
  }

  if (filtros.ciudad) {
    const encontrada = catalogo.ciudades.find((c) => c.slug === filtros.ciudad);
    if (encontrada) {
      partes.push("z.ciudad = ?");
      valores.push(encontrada.ciudad);
    } else {
      // Ciudad inventada en la URL: cero resultados y el mensaje de «sin
      // resultados», mejor que ignorar el filtro y enseñar todo el catálogo.
      partes.push("1 = 0");
    }
  }

  if (filtros.zona) {
    partes.push("z.slug = ?");
    valores.push(filtros.zona);
  }

  if (filtros.q) {
    const patron = patronBusqueda(filtros.q);
    if (patron) {
      // `LIKE` y no `GLOB`: ignora mayúsculas en ASCII y el patrón cabe en el
      // tope de ~50 caracteres de D1 (ver shared/busqueda.ts).
      partes.push(`(${BUSCABLE}) LIKE ?`);
      valores.push(patron);
    }
  }

  const columna = columnaPrecio(filtros.operacion);
  if (filtros.precioMin !== null) {
    partes.push(`p.${columna} >= ?`);
    valores.push(filtros.precioMin);
  }
  if (filtros.precioMax !== null) {
    partes.push(`p.${columna} <= ?`);
    valores.push(filtros.precioMax);
  }

  if (filtros.recamaras !== null) {
    partes.push("p.recamaras >= ?");
    valores.push(filtros.recamaras);
  }
  if (filtros.banos !== null) {
    partes.push("p.banos_completos >= ?");
    valores.push(filtros.banos);
  }

  return { sql: partes.join(" AND "), valores };
}

// ─── Catálogo: opciones y rangos de los filtros ───────────────────

type FilaResumen = Record<string, number | null>;

const TIPOS_CONTADOS = [
  "casa",
  "departamento",
  "terreno",
  "local",
  "oficina",
  "bodega",
  "edificio",
  "otro",
] as const;

/**
 * Una sola pasada por las casas visibles para los conteos y los rangos, más
 * dos consultas de zonas. Tres recorridos de 188 filas: menos de los que
 * costaría una consulta por dimensión (PLAN §17, las filas leídas se pagan).
 */
export async function leerCatalogo(db: D1Database): Promise<Catalogo> {
  const conteos = TIPOS_CONTADOS.map((t) => `SUM(p.tipo = '${t}') AS tipo_${t}`).join(",\n       ");

  const [resumen, ciudades, zonas] = await db.batch<FilaResumen | OpcionCiudad | OpcionZona>([
    db.prepare(`SELECT COUNT(*) AS total,
       ${conteos},
       SUM(${OPERACION_INCLUYE.venta}) AS op_venta,
       SUM(${OPERACION_INCLUYE.renta}) AS op_renta,
       MIN(CASE WHEN ${OPERACION_INCLUYE.venta} THEN p.precio END) AS venta_min,
       MAX(CASE WHEN ${OPERACION_INCLUYE.venta} THEN p.precio END) AS venta_max,
       MIN(CASE WHEN ${OPERACION_INCLUYE.renta} THEN p.precio_renta END) AS renta_min,
       MAX(CASE WHEN ${OPERACION_INCLUYE.renta} THEN p.precio_renta END) AS renta_max
     FROM propiedades p WHERE ${VISIBLES}`),
    db.prepare(`SELECT z.ciudad, COUNT(*) AS n
       FROM propiedades p JOIN zonas z ON z.id = p.zona_id
      WHERE ${VISIBLES} AND z.ciudad IS NOT NULL
      GROUP BY z.ciudad ORDER BY n DESC, z.ciudad`),
    db.prepare(`SELECT z.slug, z.colonia, z.ciudad, COUNT(*) AS n
       FROM propiedades p JOIN zonas z ON z.id = p.zona_id
      WHERE ${VISIBLES} AND z.colonia IS NOT NULL
      GROUP BY z.id HAVING n >= 2 ORDER BY n DESC, z.colonia`),
  ]);

  const r = (resumen.results[0] ?? {}) as FilaResumen;
  const numero = (campo: string): number => Number(r[campo] ?? 0);
  const opcional = (campo: string): number | null => (r[campo] === null || r[campo] === undefined ? null : Number(r[campo]));

  return {
    total: numero("total"),
    tipos: TIPOS_CONTADOS.map((tipo) => ({ tipo, n: numero(`tipo_${tipo}`) })).filter((t) => t.n > 0),
    operaciones: { venta: numero("op_venta"), renta: numero("op_renta") },
    rangos: {
      venta: { min: opcional("venta_min"), max: opcional("venta_max") },
      renta: { min: opcional("renta_min"), max: opcional("renta_max") },
    },
    ciudades: (ciudades.results as OpcionCiudad[]).map((c) => ({ ...c, slug: slugificar(c.ciudad) })),
    zonas: zonas.results as OpcionZona[],
  };
}

// ─── Listado ──────────────────────────────────────────────────────

export async function listar(
  db: D1Database,
  filtros: Filtros,
  catalogo: Catalogo,
  cloudName: string,
): Promise<Pagina> {
  const { sql, valores } = condicionesDe(filtros, catalogo);
  const orden = ORDEN_SQL[filtros.orden](columnaPrecio(filtros.operacion));
  const desde = (filtros.pagina - 1) * POR_PAGINA;

  const [cuenta, items] = await db.batch([
    db
      .prepare(`SELECT COUNT(*) AS n FROM propiedades p LEFT JOIN zonas z ON z.id = p.zona_id WHERE ${sql}`)
      .bind(...valores),
    db
      .prepare(`SELECT ${CAMPOS_TARJETA} ${DESDE_TARJETA} WHERE ${sql} ORDER BY ${orden} LIMIT ? OFFSET ?`)
      .bind(...valores, POR_PAGINA, desde),
  ]);

  const total = Number((cuenta.results[0] as { n: number } | undefined)?.n ?? 0);
  return {
    items: (items.results as FilaTarjeta[]).map((fila) => aTarjeta(fila, cloudName)),
    total,
    pagina: filtros.pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
  };
}

/**
 * Cuántas se piden para repartir. Sobran a propósito: para llenar la vitrina
 * con una casa por colonia hay que poder saltarse las repetidas. Pedir 40 y no
 * 11 no lee más filas: según `EXPLAIN QUERY PLAN`, SQLite une TODAS las
 * visibles con su zona y su foto y las ordena en un árbol temporal antes de
 * cortar. Al navegador solo viajan las que se pintan.
 */
const CANDIDATAS_PORTADA = 40;

type FilaPortada = FilaTarjeta & { destacada: number };

/**
 * Las de la portada: las de la vitrina, que van pasando de una en una, y las de
 * «Lo más reciente», sin repetir ninguna. Abre la vitrina la «Casa de la foto
 * principal» si el equipo la eligió en Panel › Contenido; después las marcadas
 * a mano y, si no hay (hoy son cero), las más recientes; el reparto está en
 * `shared/portada.ts`. Las de la vitrina llevan también la foto de la galería.
 */
export async function casasDePortada(
  db: D1Database,
  cloudName: string,
  cuantas: { vitrina: number; recientes: number },
): Promise<{ vitrina: Tarjeta[]; recientes: Tarjeta[] }> {
  const [consulta, portada] = await db.batch([
    db
      .prepare(
        `SELECT ${CAMPOS_TARJETA}, p.destacada ${DESDE_TARJETA}
          WHERE ${VISIBLES}
          ORDER BY p.destacada DESC, COALESCE(p.publicada_en, p.creada_en) DESC, p.id DESC
          LIMIT ?`,
      )
      .bind(CANDIDATAS_PORTADA),
    // La casa elegida, en la MISMA ida a la base (el loader no espera a leer
    // la configuración para pedir las casas). Con el JSON dañado, ninguna.
    db.prepare(
      `SELECT CASE WHEN json_valid(valor) THEN TRIM(json_extract(valor, '$.imagen_propiedad_clave')) END AS clave
         FROM configuracion WHERE clave = 'portada'`,
    ),
  ]);
  const filas = [...(consulta.results as FilaPortada[])];
  const preferida = String((portada.results[0] as { clave?: unknown } | undefined)?.clave ?? "").toUpperCase() || null;

  // Si la elegida no está entre las candidatas (es vieja), se pide sola: la
  // clave es única. Si no está publicada, no sale; sin foto tampoco, que
  // antepuesta acabaría encabezando «Lo más reciente».
  if (preferida && !filas.some((fila) => fila.clave === preferida)) {
    const sola = await db
      .prepare(`SELECT ${CAMPOS_TARJETA}, p.destacada ${DESDE_TARJETA} WHERE ${VISIBLES} AND p.clave = ?`)
      .bind(preferida)
      .first<FilaPortada>();
    if (sola && (sola.foto_public_id || sola.foto_url_origen)) filas.unshift(sola);
  }

  const candidatas = filas.map((fila) => ({ fila, tarjeta: aTarjeta(fila, cloudName) }));
  const reparto = repartirPortada(candidatas, {
    enVitrina: cuantas.vitrina,
    recientes: cuantas.recientes,
    preferida: preferida ? ({ fila }) => fila.clave === preferida : undefined,
    destacada: ({ fila }) => fila.destacada === 1,
    zona: ({ tarjeta }) => tarjeta.zona,
    conFoto: ({ tarjeta }) => tarjeta.foto !== null,
  });

  return {
    vitrina: reparto.vitrina.map(({ fila, tarjeta }) => ({
      ...tarjeta,
      fotoGrande: fotoVista(
        { public_id: fila.foto_public_id, url_origen: fila.foto_url_origen, alt: fila.foto_alt },
        "galeria",
        cloudName,
        tarjeta.foto?.alt ?? fila.titulo,
      ),
    })),
    recientes: reparto.recientes.map(({ tarjeta }) => tarjeta),
  };
}

// ─── Ficha ────────────────────────────────────────────────────────

type FilaFicha = FilaTarjeta & {
  id: number;
  tipo: Tipo;
  condicion: string | null;
  medios_banos: number | null;
  estacionamientos: number | null;
  niveles: number | null;
  anio_construccion: number | null;
  descripcion: string | null;
  video_url: string | null;
  zona_id: number | null;
  whatsapp_asesor: string | null;
};

type FilaFoto = {
  public_id: string | null;
  url_origen: string | null;
  alt: string | null;
  ancho: number | null;
  alto: number | null;
};

/** Null si no existe, está en la papelera o todavía no se publica (404). */
export async function leerFicha(db: D1Database, slug: string, cloudName: string): Promise<Ficha | null> {
  const marcas = ESTADOS_CON_FICHA.map(() => "?").join(",");
  const fila = await db
    .prepare(
      `SELECT p.id, p.tipo, p.condicion, p.medios_banos, p.estacionamientos, p.niveles,
              p.anio_construccion, p.descripcion, p.video_url, p.zona_id,
              u.whatsapp AS whatsapp_asesor,
              ${CAMPOS_TARJETA}
         ${DESDE_TARJETA}
         LEFT JOIN usuarios u ON u.id = p.asesor_id
        WHERE p.slug = ? AND p.eliminada_en IS NULL AND p.estado IN (${marcas})`,
    )
    .bind(slug, ...ESTADOS_CON_FICHA)
    .first<FilaFicha>();

  if (!fila) return null;

  const { results: fotos } = await db
    .prepare(
      `SELECT public_id, url_origen, alt, ancho, alto FROM fotos
        WHERE propiedad_id = ? ORDER BY es_portada DESC, orden ASC`,
    )
    .bind(fila.id)
    .all<FilaFoto>();

  const tarjeta = aTarjeta(fila, cloudName);
  const alternativo = tarjeta.zona ? `${fila.titulo}, ${tarjeta.zona}` : fila.titulo;
  const vista = (foto: FilaFoto, variante: "galeria" | "miniatura", n: number) =>
    fotoVista(foto, variante, cloudName, foto.alt?.trim() || `${alternativo} (foto ${n})`);

  return {
    ...tarjeta,
    id: fila.id,
    tipo: fila.tipo,
    condicion: fila.condicion,
    mediosBanos: fila.medios_banos,
    estacionamientos: fila.estacionamientos,
    niveles: fila.niveles,
    anioConstruccion: fila.anio_construccion,
    descripcion: fila.descripcion,
    videoUrl: fila.video_url,
    colonia: fila.colonia,
    ciudad: fila.ciudad,
    whatsappAsesor: fila.whatsapp_asesor,
    fotos: fotos.map((f, i) => vista(f, "galeria", i + 1)).filter((f): f is FotoVista => f !== null),
    miniaturas: fotos.map((f, i) => vista(f, "miniatura", i + 1)).filter((f): f is FotoVista => f !== null),
    imagenOg: fotos[0] ? fotoVista(fotos[0], "og", cloudName, alternativo)?.src ?? null : null,
  };
}

/**
 * Similares: misma zona o mismo tipo, con precio dentro del ±25 % (PLAN §10.1).
 * Las de la misma zona van primero y, dentro de cada grupo, las de precio más
 * parecido: es lo que pregunta quien está viendo una casa concreta.
 */
export async function similares(db: D1Database, ficha: Ficha, cloudName: string, limite = 3): Promise<Tarjeta[]> {
  const referencia = ficha.operacion === "renta" ? ficha.precioRenta : ficha.precio;
  const columna = ficha.operacion === "renta" ? "precio_renta" : "precio";
  const zonaId = await db
    .prepare("SELECT zona_id FROM propiedades WHERE id = ?")
    .bind(ficha.id)
    .first<{ zona_id: number | null }>();

  const partes = [VISIBLES, "p.id <> ?", "(p.zona_id IS NOT NULL AND p.zona_id = ? OR p.tipo = ?)"];
  const valores: unknown[] = [ficha.id, zonaId?.zona_id ?? -1, ficha.tipo];

  if (referencia) {
    partes.push(`p.${columna} BETWEEN ? AND ?`);
    valores.push(Math.round(referencia * 0.75), Math.round(referencia * 1.25));
  }

  const { results } = await db
    .prepare(
      `SELECT ${CAMPOS_TARJETA} ${DESDE_TARJETA}
        WHERE ${partes.join(" AND ")}
        ORDER BY (p.zona_id = ?) DESC, ABS(COALESCE(p.${columna}, 0) - ?) ASC, p.id DESC
        LIMIT ?`,
    )
    .bind(...valores, zonaId?.zona_id ?? -1, referencia ?? 0, limite)
    .all<FilaTarjeta>();

  return results.map((fila) => aTarjeta(fila, cloudName));
}

/** Slugs para el sitemap: las vendidas y rentadas no entran (PLAN §10.1). */
export async function slugsPublicados(db: D1Database): Promise<{ slug: string; actualizada_en: string }[]> {
  const { results } = await db
    .prepare(`SELECT p.slug, p.actualizada_en FROM propiedades p WHERE ${VISIBLES} ORDER BY p.actualizada_en DESC`)
    .all<{ slug: string; actualizada_en: string }>();
  return results;
}
