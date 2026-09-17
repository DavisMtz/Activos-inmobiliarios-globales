/**
 * Las casas, vistas desde el panel (PLAN §11.2). El sitio público tiene su
 * propia capa (`server/db/propiedades.ts`) porque enseña otra cosa: aquí se ven
 * también los borradores, lo que está en revisión y lo que le falta a cada una.
 *
 * Dos reglas de D1 mandan sobre todo lo de abajo (PLAN §17):
 * - **No hay transacciones interactivas.** Cada cambio es un `UPDATE … WHERE`
 *   condicional que trae dentro la comprobación (quién es el dueño, que nadie
 *   la haya movido mientras tanto) y se mira `meta.changes` para saber si pasó.
 * - **Las filas leídas se pagan.** Ninguna consulta de aquí recorre más que las
 *   188 casas, y las fotos siempre se buscan por `idx_fotos_propiedad`.
 */

import { patronBusqueda } from "../../../shared/busqueda";
import { fotoVista, type FotoVista } from "../../../shared/fotos";
import { estadoInicialAlCrear, puede, type Actor } from "../../../shared/permisos";
import {
  ESTADOS_COMERCIALES,
  ESTADOS_PROPIEDAD,
  avisosDePropiedad,
  estadoTrasEditar,
  problemaAlPublicar,
  puedeCambiarElSlug,
  slugDeTitulo,
  type Aviso,
  type CamposPropiedad,
  type ContextoDeAvisos,
  type EstadoPropiedad,
  type OperacionPropiedad,
} from "../../../shared/propiedad";
import { slugificar } from "../../../shared/texto";
import type { Tipo } from "../../../shared/filtros";
import { diferencias, sentenciaBitacora } from "../../bitacora";
import { ahora } from "../../fechas";
import { exito, fallo, type Resultado } from "../../resultado";

export const POR_PAGINA_PANEL = 20;

// ─── Filtros de la lista ──────────────────────────────────────────

export type FiltroDeAvisos = "publicar" | "migracion";

export type FiltrosPanel = {
  /** Texto libre: clave, título o colonia. */
  q: string | null;
  estado: EstadoPropiedad | null;
  asesorId: string | null;
  avisos: FiltroDeAvisos | null;
  papelera: boolean;
  pagina: number;
};

export const FILTROS_PANEL_VACIOS: FiltrosPanel = {
  q: null,
  estado: null,
  asesorId: null,
  avisos: null,
  papelera: false,
  pagina: 1,
};

/** Los filtros viven en la URL, igual que en el sitio público: un listado se comparte y se recarga. */
export function leerFiltrosPanel(parametros: URLSearchParams): FiltrosPanel {
  const estado = parametros.get("estado");
  const avisos = parametros.get("avisos");
  const asesor = (parametros.get("asesor") ?? "").trim();
  const pagina = Number(parametros.get("pagina") ?? 1);
  const q = (parametros.get("q") ?? "").trim();

  return {
    q: q && patronBusqueda(q) ? q.replace(/\s+/g, " ").slice(0, 80) : null,
    estado: (ESTADOS_PROPIEDAD as readonly string[]).includes(estado ?? "") ? (estado as EstadoPropiedad) : null,
    asesorId: /^[0-9a-fA-F-]{10,40}$/.test(asesor) ? asesor : null,
    avisos: avisos === "publicar" || avisos === "migracion" ? avisos : null,
    papelera: parametros.get("papelera") === "1",
    pagina: Number.isInteger(pagina) && pagina > 0 && pagina < 10_000 ? pagina : 1,
  };
}

// ─── Lo que devuelve la lista ─────────────────────────────────────

export type FilaPanel = {
  id: number;
  clave: string;
  slug: string;
  titulo: string;
  estado: EstadoPropiedad;
  operacion: OperacionPropiedad;
  tipo: Tipo;
  precio: number | null;
  precioRenta: number | null;
  zona: string;
  asesor: string | null;
  asesorId: string | null;
  fotos: number;
  avisos: Aviso[];
  actualizadaEn: string;
  foto: FotoVista | null;
};

export type PaginaPanel = {
  items: FilaPanel[];
  total: number;
  pagina: number;
  paginas: number;
};

type FilaCruda = {
  id: number;
  clave: string;
  slug: string;
  titulo: string;
  estado: EstadoPropiedad;
  operacion: OperacionPropiedad;
  tipo: Tipo;
  precio: number | null;
  precio_renta: number | null;
  recamaras: number | null;
  banos_completos: number | null;
  m2_terreno: number | null;
  m2_construccion: number | null;
  resumen: string | null;
  descripcion: string | null;
  asesor_id: string | null;
  asesor: string | null;
  revisar: string | null;
  actualizada_en: string;
  colonia: string | null;
  ciudad: string | null;
  fotos: number;
  foto_public_id: string | null;
  foto_url_origen: string | null;
  foto_alt: string | null;
  foto_ancho: number | null;
  foto_alto: number | null;
};

/**
 * Lo que impide publicar una casa, escrito en SQL para poder filtrar por ello.
 * Es el espejo de los avisos con `impidePublicar` de `shared/propiedad.ts`: si
 * uno cambia, cambia el otro. `verificar-f3.mjs` compara este filtro contra un
 * `COUNT(*)` escrito a mano, que es lo que detectaría que se separaron.
 */
export const LE_FALTA_PARA_PUBLICAR = `(
     (p.operacion IN ('venta','venta_renta') AND p.precio IS NULL)
  OR (p.operacion IN ('renta','venta_renta') AND p.precio_renta IS NULL)
  OR z.colonia IS NULL OR z.colonia = ''
  OR NOT EXISTS (SELECT 1 FROM fotos fx WHERE fx.propiedad_id = p.id)
)`;

const TRAE_AVISOS_DE_MIGRACION = `(p.revisar IS NOT NULL AND p.revisar <> '[]')`;

const BUSCABLE = "p.clave || ' ' || p.titulo || ' ' || COALESCE(z.colonia, '') || ' ' || COALESCE(z.ciudad, '')";

const DESDE = `FROM propiedades p
       LEFT JOIN zonas z ON z.id = p.zona_id
       LEFT JOIN usuarios u ON u.id = p.asesor_id`;

/** La portada marcada; si no hay ninguna, la primera del orden (índice de la casa). */
const PORTADA = `LEFT JOIN fotos f ON f.id = (
        SELECT id FROM fotos INDEXED BY idx_fotos_propiedad
         WHERE propiedad_id = p.id ORDER BY es_portada DESC, orden ASC LIMIT 1)`;

function condiciones(filtros: FiltrosPanel): { sql: string; valores: unknown[] } {
  const partes = [filtros.papelera ? "p.eliminada_en IS NOT NULL" : "p.eliminada_en IS NULL"];
  const valores: unknown[] = [];

  if (filtros.estado) {
    partes.push("p.estado = ?");
    valores.push(filtros.estado);
  }
  if (filtros.asesorId) {
    partes.push("p.asesor_id = ?");
    valores.push(filtros.asesorId);
  }
  if (filtros.avisos === "publicar") partes.push(LE_FALTA_PARA_PUBLICAR);
  if (filtros.avisos === "migracion") partes.push(TRAE_AVISOS_DE_MIGRACION);
  if (filtros.q) {
    const patron = patronBusqueda(filtros.q);
    if (patron) {
      partes.push(`(${BUSCABLE}) LIKE ?`);
      valores.push(patron);
    }
  }
  return { sql: partes.join(" AND "), valores };
}

const zonaDe = (fila: { colonia: string | null; ciudad: string | null }): string =>
  [fila.colonia, fila.ciudad].filter(Boolean).join(", ");

const contextoDeAvisos = (fila: FilaCruda): ContextoDeAvisos => ({
  operacion: fila.operacion,
  tipo: fila.tipo,
  precio: fila.precio,
  precioRenta: fila.precio_renta,
  recamaras: fila.recamaras,
  banosCompletos: fila.banos_completos,
  m2Terreno: fila.m2_terreno,
  m2Construccion: fila.m2_construccion,
  resumen: fila.resumen,
  descripcion: fila.descripcion,
  colonia: fila.colonia,
  asesorId: fila.asesor_id,
  fotos: fila.fotos,
  revisar: fila.revisar,
});

export async function listarPanel(
  db: D1Database,
  filtros: FiltrosPanel,
  cloudName: string,
): Promise<PaginaPanel> {
  const { sql, valores } = condiciones(filtros);
  const desde = (filtros.pagina - 1) * POR_PAGINA_PANEL;

  const [cuenta, items] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n ${DESDE} WHERE ${sql}`).bind(...valores),
    db
      .prepare(
        `SELECT p.id, p.clave, p.slug, p.titulo, p.estado, p.operacion, p.tipo, p.precio, p.precio_renta,
                p.recamaras, p.banos_completos, p.m2_terreno, p.m2_construccion, p.resumen, p.descripcion,
                p.asesor_id, p.revisar, p.actualizada_en, z.colonia, z.ciudad, u.nombre AS asesor,
                (SELECT COUNT(*) FROM fotos INDEXED BY idx_fotos_propiedad WHERE propiedad_id = p.id) AS fotos,
                f.public_id AS foto_public_id, f.url_origen AS foto_url_origen, f.alt AS foto_alt,
                f.ancho AS foto_ancho, f.alto AS foto_alto
           ${DESDE}
           ${PORTADA}
          WHERE ${sql}
          ORDER BY p.actualizada_en DESC, p.id DESC
          LIMIT ? OFFSET ?`,
      )
      .bind(...valores, POR_PAGINA_PANEL, desde),
  ]);

  const total = Number((cuenta.results[0] as { n: number } | undefined)?.n ?? 0);

  return {
    items: (items.results as FilaCruda[]).map((fila) => ({
      id: fila.id,
      clave: fila.clave,
      slug: fila.slug,
      titulo: fila.titulo,
      estado: fila.estado,
      operacion: fila.operacion,
      tipo: fila.tipo,
      precio: fila.precio,
      precioRenta: fila.precio_renta,
      zona: zonaDe(fila),
      asesor: fila.asesor,
      asesorId: fila.asesor_id,
      fotos: Number(fila.fotos ?? 0),
      avisos: avisosDePropiedad(contextoDeAvisos(fila)),
      actualizadaEn: fila.actualizada_en,
      foto: fotoVista(
        {
          public_id: fila.foto_public_id,
          url_origen: fila.foto_url_origen,
          alt: fila.foto_alt,
          ancho: fila.foto_ancho,
          alto: fila.foto_alto,
        },
        "miniatura",
        cloudName,
        fila.titulo,
      ),
    })),
    total,
    pagina: filtros.pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA_PANEL)),
  };
}

// ─── Una casa, para el formulario ─────────────────────────────────

export type FotoDelPanel = {
  id: number;
  alt: string;
  orden: number;
  esPortada: boolean;
  ancho: number | null;
  alto: number | null;
  /** False = sigue en WordPress (el puente de la demo, PLAN §13.4). */
  enCloudinary: boolean;
  vista: FotoVista | null;
};

export type PropiedadDelPanel = CamposPropiedad & {
  id: number;
  clave: string;
  slug: string;
  estado: EstadoPropiedad;
  publicadaEn: string | null;
  creadaEn: string;
  actualizadaEn: string;
  vieneDeWordpress: boolean;
  enPapelera: boolean;
  asesorNombre: string | null;
  fotos: FotoDelPanel[];
  avisos: Aviso[];
};

type FilaFicha = FilaCruda & {
  condicion: string | null;
  medios_banos: number | null;
  estacionamientos: number | null;
  niveles: number | null;
  anio_construccion: number | null;
  direccion_privada: string | null;
  video_url: string | null;
  destacada: number;
  wp_id: number | null;
  publicada_en: string | null;
  creada_en: string;
  eliminada_en: string | null;
};

export async function leerDelPanel(
  db: D1Database,
  id: number,
  cloudName: string,
): Promise<PropiedadDelPanel | null> {
  const fila = await db
    .prepare(
      `SELECT p.*, z.colonia, z.ciudad, u.nombre AS asesor,
              (SELECT COUNT(*) FROM fotos INDEXED BY idx_fotos_propiedad WHERE propiedad_id = p.id) AS fotos
         FROM propiedades p
         LEFT JOIN zonas z ON z.id = p.zona_id
         LEFT JOIN usuarios u ON u.id = p.asesor_id
        WHERE p.id = ?`,
    )
    .bind(id)
    .first<FilaFicha>();
  if (!fila) return null;

  const { results: fotos } = await db
    .prepare(
      `SELECT id, public_id, url_origen, alt, ancho, alto, orden, es_portada
         FROM fotos INDEXED BY idx_fotos_propiedad
        WHERE propiedad_id = ? ORDER BY orden ASC, id ASC`,
    )
    .bind(id)
    .all<{
      id: number;
      public_id: string | null;
      url_origen: string | null;
      alt: string | null;
      ancho: number | null;
      alto: number | null;
      orden: number;
      es_portada: number;
    }>();

  return {
    id: fila.id,
    clave: fila.clave,
    slug: fila.slug,
    estado: fila.estado,
    publicadaEn: fila.publicada_en,
    creadaEn: fila.creada_en,
    actualizadaEn: fila.actualizada_en,
    vieneDeWordpress: fila.wp_id !== null,
    enPapelera: fila.eliminada_en !== null,
    asesorNombre: fila.asesor,
    titulo: fila.titulo,
    operacion: fila.operacion,
    tipo: fila.tipo,
    condicion: (fila.condicion as CamposPropiedad["condicion"]) ?? null,
    precio: fila.precio,
    precioRenta: fila.precio_renta,
    recamaras: fila.recamaras,
    banosCompletos: fila.banos_completos,
    mediosBanos: fila.medios_banos,
    estacionamientos: fila.estacionamientos,
    niveles: fila.niveles,
    m2Terreno: fila.m2_terreno,
    m2Construccion: fila.m2_construccion,
    anioConstruccion: fila.anio_construccion,
    ciudad: fila.ciudad ?? "",
    colonia: fila.colonia,
    direccionPrivada: fila.direccion_privada,
    resumen: fila.resumen,
    descripcion: fila.descripcion,
    videoUrl: fila.video_url,
    destacada: fila.destacada === 1,
    asesorId: fila.asesor_id,
    fotos: fotos.map((foto) => ({
      id: foto.id,
      alt: foto.alt ?? "",
      orden: foto.orden,
      esPortada: foto.es_portada === 1,
      ancho: foto.ancho,
      alto: foto.alto,
      enCloudinary: Boolean(foto.public_id),
      vista: fotoVista(foto, "tarjeta", cloudName, foto.alt ?? fila.titulo),
    })),
    avisos: avisosDePropiedad({ ...contextoDeAvisos(fila), fotos: fotos.length }),
  };
}

// ─── Altas ────────────────────────────────────────────────────────

/** Los slugs de `zonas` se construyen EXACTAMENTE como en la siembra: «morelia-altozano». */
export const slugDeZona = (ciudad: string, colonia: string | null): string =>
  slugificar(`${ciudad} ${colonia ?? ""}`);

/**
 * El id de la zona, creándola si hace falta. `INSERT OR IGNORE` y después
 * `SELECT`: sin transacciones interactivas, dos peticiones a la vez no pueden
 * duplicarla porque el slug es UNIQUE.
 */
async function idDeZona(db: D1Database, ciudad: string, colonia: string | null): Promise<number | null> {
  const slug = slugDeZona(ciudad, colonia);
  if (!slug) return null;
  await db
    .prepare("INSERT OR IGNORE INTO zonas (ciudad, colonia, slug) VALUES (?, ?, ?)")
    .bind(ciudad, colonia, slug)
    .run();
  const fila = await db.prepare("SELECT id FROM zonas WHERE slug = ?").bind(slug).first<{ id: number }>();
  return fila?.id ?? null;
}

/** AIG-0189, AIG-0190…: sigue la numeración que dejó la siembra (PLAN §14). */
async function siguienteClave(db: D1Database): Promise<string> {
  const fila = await db
    .prepare(
      "SELECT COALESCE(MAX(CAST(SUBSTR(clave, 5) AS INTEGER)), 0) AS maximo FROM propiedades WHERE clave LIKE 'AIG-%'",
    )
    .first<{ maximo: number }>();
  return `AIG-${String(Number(fila?.maximo ?? 0) + 1).padStart(4, "0")}`;
}

/** `casa-en-el-prado`, `casa-en-el-prado-2`…: el slug es una URL y es único. */
async function slugLibre(db: D1Database, base: string, exceptoId?: number): Promise<string> {
  const raiz = base || "propiedad";
  for (let intento = 0; intento < 50; intento++) {
    const candidato = intento === 0 ? raiz : `${raiz}-${intento + 1}`;
    const fila = await db
      .prepare("SELECT id FROM propiedades WHERE slug = ?")
      .bind(candidato)
      .first<{ id: number }>();
    if (!fila || fila.id === exceptoId) return candidato;
  }
  return `${raiz}-${Date.now().toString(36)}`;
}

const esConflictoUnico = (error: unknown): boolean =>
  error instanceof Error && /UNIQUE constraint failed/i.test(error.message);

const SIN_PERMISO = "No tienes permiso para hacer esto.";

/** Quién queda como asesor de una casa nueva (§9: la del asesor queda a su nombre). */
const asesorAlCrear = (actor: Actor, pedido: string | null): string | null => {
  if (actor.rol === "asesor") return actor.id;
  return puede(actor, "propiedades.asignar_asesor") ? pedido : null;
};

export type PropiedadCreada = { id: number; clave: string; slug: string; estado: EstadoPropiedad };

export async function crearPropiedad(
  db: D1Database,
  actor: Actor,
  campos: CamposPropiedad,
): Promise<Resultado<PropiedadCreada>> {
  if (!puede(actor, "propiedades.crear")) return fallo(403, "sin_permiso", SIN_PERMISO);

  const zonaId = await idDeZona(db, campos.ciudad, campos.colonia);
  const estado = estadoInicialAlCrear(actor);
  const asesorId = asesorAlCrear(actor, campos.asesorId);
  const momento = ahora();

  for (let intento = 1; intento <= 3; intento++) {
    const clave = await siguienteClave(db);
    const slug = await slugLibre(db, slugDeTitulo(campos.titulo));
    try {
      const [insercion] = await db.batch([
        db
          .prepare(
            `INSERT INTO propiedades (clave, slug, titulo, operacion, tipo, condicion, estado, precio, precio_renta,
                     recamaras, banos_completos, medios_banos, estacionamientos, niveles,
                     m2_terreno, m2_construccion, anio_construccion, zona_id, direccion_privada,
                     resumen, descripcion, video_url, destacada, asesor_id, creada_por, creada_en, actualizada_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            clave,
            slug,
            campos.titulo,
            campos.operacion,
            campos.tipo,
            campos.condicion,
            estado,
            campos.precio,
            campos.precioRenta,
            campos.recamaras,
            campos.banosCompletos,
            campos.mediosBanos,
            campos.estacionamientos,
            campos.niveles,
            campos.m2Terreno,
            campos.m2Construccion,
            campos.anioConstruccion,
            zonaId,
            campos.direccionPrivada,
            campos.resumen,
            campos.descripcion,
            campos.videoUrl,
            puede(actor, "propiedades.publicar") && campos.destacada ? 1 : 0,
            asesorId,
            actor.id,
            momento,
            momento,
          ),
        // El id todavía no existe cuando se arma el batch: sale de la clave,
        // que es única, dentro de la misma sentencia.
        sentenciaBitacora(db, {
          usuarioId: actor.id,
          entidad: "propiedad",
          entidadId: { sql: "SELECT CAST(id AS TEXT) FROM propiedades WHERE clave = ?", valores: [clave] },
          accion: "crear",
          cambios: { clave, titulo: campos.titulo, estado },
        }),
      ]);

      return exito({ id: Number(insercion.meta.last_row_id), clave, slug, estado });
    } catch (error) {
      // Dos altas a la vez pueden pelearse por la misma clave o el mismo slug.
      if (!esConflictoUnico(error) || intento === 3) throw error;
    }
  }
  return fallo(409, "clave_ocupada", "No pudimos asignarle una clave. Intenta de nuevo.");
}

// ─── Edición ──────────────────────────────────────────────────────

type FilaParaEditar = {
  id: number;
  clave: string;
  slug: string;
  titulo: string;
  estado: EstadoPropiedad;
  asesor_id: string | null;
  publicada_en: string | null;
  actualizada_en: string;
  wp_id: number | null;
  destacada: number;
  zona_id: number | null;
} & Record<string, unknown>;

/** Las columnas que el formulario escribe, con el nombre que tienen en la base. */
const COLUMNAS: [keyof CamposPropiedad, string][] = [
  ["titulo", "titulo"],
  ["operacion", "operacion"],
  ["tipo", "tipo"],
  ["condicion", "condicion"],
  ["precio", "precio"],
  ["precioRenta", "precio_renta"],
  ["recamaras", "recamaras"],
  ["banosCompletos", "banos_completos"],
  ["mediosBanos", "medios_banos"],
  ["estacionamientos", "estacionamientos"],
  ["niveles", "niveles"],
  ["m2Terreno", "m2_terreno"],
  ["m2Construccion", "m2_construccion"],
  ["anioConstruccion", "anio_construccion"],
  ["direccionPrivada", "direccion_privada"],
  ["resumen", "resumen"],
  ["descripcion", "descripcion"],
  ["videoUrl", "video_url"],
];

export type PropiedadEditada = { id: number; slug: string; estado: EstadoPropiedad; cambios: number };

export async function editarPropiedad(
  db: D1Database,
  actor: Actor,
  id: number,
  campos: CamposPropiedad,
): Promise<Resultado<PropiedadEditada>> {
  const actual = await db
    .prepare("SELECT * FROM propiedades WHERE id = ? AND eliminada_en IS NULL")
    .bind(id)
    .first<FilaParaEditar>();
  if (!actual) return fallo(404, "no_encontrada", "Esa casa ya no está.");
  if (!puede(actor, "propiedades.editar", { asesor_id: actual.asesor_id })) {
    return fallo(403, "sin_permiso", "Solo puedes editar las casas que tienes asignadas.");
  }

  const puedePublicar = puede(actor, "propiedades.publicar");
  const zonaId = await idDeZona(db, campos.ciudad, campos.colonia);
  const estado = estadoTrasEditar(actual.estado, {
    yaSePublico: actual.publicada_en !== null,
    puedePublicar,
  });

  // La dirección de una casa publicada no cambia aunque le corrijan el título.
  const cambiaSlug =
    campos.titulo !== actual.titulo &&
    puedeCambiarElSlug({ yaSePublico: actual.publicada_en !== null, vieneDeWordpress: actual.wp_id !== null });
  const slug = cambiaSlug ? await slugLibre(db, slugDeTitulo(campos.titulo), id) : actual.slug;

  const destacada = puedePublicar ? (campos.destacada ? 1 : 0) : actual.destacada;
  const asesorId = puede(actor, "propiedades.asignar_asesor") ? campos.asesorId : actual.asesor_id;

  const antes: Record<string, unknown> = { estado: actual.estado, slug: actual.slug, destacada: actual.destacada, asesor_id: actual.asesor_id, zona_id: actual.zona_id };
  const despues: Record<string, unknown> = { estado, slug, destacada, asesor_id: asesorId, zona_id: zonaId };
  for (const [campo, columna] of COLUMNAS) {
    antes[columna] = actual[columna] ?? null;
    despues[columna] = campos[campo] ?? null;
  }

  const cambios = diferencias(antes, despues);
  if (Object.keys(cambios).length === 0) {
    return exito({ id, slug: actual.slug, estado: actual.estado, cambios: 0 });
  }

  const momento = ahora();
  const columnas = [...COLUMNAS.map(([, columna]) => columna), "estado", "slug", "destacada", "asesor_id", "zona_id"];
  const valores = columnas.map((columna) => despues[columna]);

  // La misma precondición para el cambio y para su rastro: si alguien guardó
  // esta casa mientras tanto, no se escribe ninguno de los dos.
  const guarda = {
    sql: "SELECT 1 FROM propiedades WHERE id = ? AND actualizada_en = ? AND eliminada_en IS NULL",
    valores: [id, actual.actualizada_en],
  };

  const [, actualizacion] = await db.batch([
    sentenciaBitacora(
      db,
      { usuarioId: actor.id, entidad: "propiedad", entidadId: String(id), accion: "editar", cambios },
      guarda,
    ),
    db
      .prepare(
        `UPDATE propiedades SET ${columnas.map((c) => `${c} = ?`).join(", ")}, actualizada_en = ?
          WHERE id = ? AND actualizada_en = ? AND eliminada_en IS NULL`,
      )
      .bind(...valores, momento, id, actual.actualizada_en),
  ]);

  if (actualizacion.meta.changes !== 1) {
    return fallo(409, "cambio_en_conflicto", "Alguien más guardó esta casa mientras la editabas. Vuelve a abrirla.");
  }
  return exito({ id, slug, estado, cambios: Object.keys(cambios).length });
}

// ─── Estado y papelera ────────────────────────────────────────────

export async function cambiarEstado(
  db: D1Database,
  actor: Actor,
  id: number,
  nuevo: EstadoPropiedad,
): Promise<Resultado<{ estado: EstadoPropiedad }>> {
  const fila = await db
    .prepare(
      `SELECT p.id, p.estado, p.asesor_id, p.operacion, p.tipo, p.precio, p.precio_renta, p.recamaras,
              p.banos_completos, p.m2_terreno, p.m2_construccion, p.resumen, p.descripcion, p.revisar,
              p.publicada_en, p.actualizada_en, z.colonia,
              (SELECT COUNT(*) FROM fotos INDEXED BY idx_fotos_propiedad WHERE propiedad_id = p.id) AS fotos
         FROM propiedades p LEFT JOIN zonas z ON z.id = p.zona_id
        WHERE p.id = ? AND p.eliminada_en IS NULL`,
    )
    .bind(id)
    .first<FilaCruda & { publicada_en: string | null }>();
  if (!fila) return fallo(404, "no_encontrada", "Esa casa ya no está.");

  const comercial = (ESTADOS_COMERCIALES as readonly string[]).includes(nuevo);
  const permiso = comercial ? "propiedades.estado_comercial" : "propiedades.publicar";
  if (!puede(actor, permiso, { asesor_id: fila.asesor_id })) {
    return fallo(403, "sin_permiso", comercial ? SIN_PERMISO : "No puedes publicar ni despublicar casas.");
  }

  if (nuevo === "publicada") {
    const problema = problemaAlPublicar({ ...contextoDeAvisos(fila), fotos: Number(fila.fotos ?? 0) });
    if (problema) return fallo(400, "falta_informacion", problema);
  }
  if (fila.estado === nuevo) return exito({ estado: nuevo });

  const momento = ahora();
  const guarda = {
    sql: "SELECT 1 FROM propiedades WHERE id = ? AND estado = ? AND eliminada_en IS NULL",
    valores: [id, fila.estado],
  };

  const [, actualizacion] = await db.batch([
    sentenciaBitacora(
      db,
      {
        usuarioId: actor.id,
        entidad: "propiedad",
        entidadId: String(id),
        accion: "estado",
        cambios: { estado: [fila.estado, nuevo] },
      },
      guarda,
    ),
    db
      .prepare(
        `UPDATE propiedades SET estado = ?, actualizada_en = ?,
                publicada_en = CASE WHEN ? = 'publicada' THEN COALESCE(publicada_en, ?) ELSE publicada_en END
          WHERE id = ? AND estado = ? AND eliminada_en IS NULL`,
      )
      .bind(nuevo, momento, nuevo, momento, id, fila.estado),
  ]);

  if (actualizacion.meta.changes !== 1) {
    return fallo(409, "cambio_en_conflicto", "Alguien más cambió el estado de esta casa. Vuelve a abrirla.");
  }
  return exito({ estado: nuevo });
}

export async function moverAPapelera(
  db: D1Database,
  actor: Actor,
  id: number,
  { restaurar }: { restaurar: boolean },
): Promise<Resultado<null>> {
  if (!puede(actor, "propiedades.papelera")) return fallo(403, "sin_permiso", SIN_PERMISO);

  const momento = ahora();
  const condicion = restaurar ? "eliminada_en IS NOT NULL" : "eliminada_en IS NULL";
  const [, actualizacion] = await db.batch([
    sentenciaBitacora(
      db,
      {
        usuarioId: actor.id,
        entidad: "propiedad",
        entidadId: String(id),
        accion: restaurar ? "restaurar" : "papelera",
      },
      { sql: `SELECT 1 FROM propiedades WHERE id = ? AND ${condicion}`, valores: [id] },
    ),
    db
      .prepare(
        `UPDATE propiedades SET eliminada_en = ?, actualizada_en = ?,
                estado = CASE WHEN ? = 1 THEN estado ELSE 'pausada' END
          WHERE id = ? AND ${condicion}`,
      )
      .bind(restaurar ? null : momento, momento, restaurar ? 1 : 0, id),
  ]);

  if (actualizacion.meta.changes !== 1) {
    return fallo(404, "no_encontrada", restaurar ? "Esa casa no está en la papelera." : "Esa casa ya no está.");
  }
  return exito(null);
}

// ─── Apoyo para el formulario ─────────────────────────────────────

export type AsesorParaAsignar = { id: string; nombre: string; rol: string };

/** A quién se le puede asignar una casa: el equipo que atiende clientes. */
export async function asesoresAsignables(db: D1Database): Promise<AsesorParaAsignar[]> {
  const { results } = await db
    .prepare(
      `SELECT id, nombre, rol FROM usuarios
        WHERE activo = 1 AND rol IN ('asesor','director','maestro') ORDER BY nombre`,
    )
    .all<AsesorParaAsignar>();
  return results;
}

/** Ciudades y colonias que ya existen, para sugerirlas en vez de inventar zonas nuevas. */
export async function zonasConocidas(db: D1Database): Promise<{ ciudad: string; colonia: string | null }[]> {
  const { results } = await db
    .prepare("SELECT ciudad, colonia FROM zonas ORDER BY ciudad, colonia")
    .all<{ ciudad: string; colonia: string | null }>();
  return results;
}
