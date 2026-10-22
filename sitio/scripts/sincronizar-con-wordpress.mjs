#!/usr/bin/env node
/**
 * Pone la D1 al día con el sitio actual de WordPress (PLAN §14): las casas que
 * el equipo subió después de la última importación, los cambios a las que ya
 * estaban y las que WordPress ya no publica.
 *
 *   node scripts/sincronizar-con-wordpress.mjs --local|--remote [--seco] [--sin-bajas]
 *
 * - Lee el sitio VIVO, no lo descargado en `analisis/crudo/` (la foto del
 *   16/09/2026, de solo lectura): la lista por la API y el HTML de cada ficha
 *   nueva o cambiada, una por una y con pausa. Lo que baja queda en
 *   `seed/generado/wordpress/<fecha>/` para revisarlo.
 * - Altas: con las mismas reglas de la siembra (`lib/wordpress.mjs`), la clave
 *   AIG siguiente por fecha de alta y `estado='publicada'`. Sus fotos quedan con
 *   la URL de WordPress (el sitio las sirve de ahí mientras tanto); después
 *   `npm run fotos:migrar -- --remote` las sube a Cloudinary.
 * - Cambios: las que WordPress modificó después que la D1 (`actualizada_en`).
 *   Lo que el equipo editó en el panel después NO se toca (la regla de la
 *   siembra). Sus fotos no se tocan: si la galería ya no es la misma, se avisa.
 * - Bajas: lo que WordPress ya no publica pasa a `pausada` (sale del listado y
 *   su ficha da 404) si estaba publicada o apartada. WordPress no tiene
 *   «vendida»: que falte no dice si se vendió, se rentó o se retiró.
 * - Cada movimiento deja su renglón en la bitácora (usuario NULL: fue un script).
 * - `--seco` solo escribe `seed/generado/sincronizacion.sql` y su reporte.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { LETRAS_MATEMATICAS, decodificarEntidades } from "../shared/texto.ts";
import { RAIZ, consultar, ejecutarArchivo, texto as sql } from "./lib/d1.mjs";
import {
  TAXONOMIAS,
  armarCasa,
  fechaUtc,
  galeriaDeFicha,
  inventarioDeFicha,
  nombreBase,
  slugDeZona,
  sqlFotos,
  sqlPropiedad,
  sqlRedirecciones,
  sqlZona,
} from "./lib/wordpress.mjs";

const { values } = parseArgs({
  options: {
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    seco: { type: "boolean", default: false },
    "sin-bajas": { type: "boolean", default: false },
  },
});
if (values.local === values.remote) {
  console.error("Indica exactamente uno: --local o --remote.");
  process.exit(1);
}
const remoto = values.remote;
const destino = remoto ? "remota" : "local";

const SITIO = "https://activosinmobiliariosglobales.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 Safari/537.36";
const PAUSA_MS = 700; // es el sitio vivo del negocio
const AHORA = new Date().toISOString();
const GENERADO = join(RAIZ, "seed", "generado");
const DESCARGA = join(GENERADO, "wordpress", AHORA.slice(0, 10));
mkdirSync(join(DESCARGA, "fichas"), { recursive: true });

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const guardar = (nombre, datos) =>
  writeFileSync(join(DESCARGA, nombre), typeof datos === "string" ? datos : JSON.stringify(datos, null, 1), "utf8");
const uno = (consulta) => consultar(consulta, { remoto })[0] ?? {};

async function pedir(url) {
  for (let intento = 1; ; intento++) {
    try {
      const respuesta = await fetch(url, { headers: { "User-Agent": UA } });
      if (!respuesta.ok) throw new Error(`estado ${respuesta.status}`);
      return respuesta;
    } catch (error) {
      if (intento >= 3) throw new Error(`${url}: ${error.message}`);
      await esperar(3_000 * intento);
    }
  }
}

/** Todas las páginas de una colección de la API de WordPress. */
async function todo(ruta) {
  const lista = [];
  for (let pagina = 1, paginas = 1; pagina <= paginas; pagina++) {
    const respuesta = await pedir(`${SITIO}/wp-json/wp/v2/${ruta}${ruta.includes("?") ? "&" : "?"}per_page=100&page=${pagina}`);
    paginas = Number(respuesta.headers.get("x-wp-totalpages")) || 1;
    lista.push(...(await respuesta.json()));
    await esperar(PAUSA_MS);
  }
  return lista;
}

// ─── 1. Lo que publica hoy WordPress ────────────────────────────

console.log(`Leyendo ${SITIO}…`);
const api = await todo("properties");
guardar("api_properties.json", api);
const terminos = {};
/** `taxonomía:id` → nombre tal como lo da la API (así lo necesita `inventarioDeFicha`). */
const nombresCrudos = new Map();
for (const t of TAXONOMIAS) {
  const lista = await todo(t);
  guardar(`api_${t}.json`, lista);
  terminos[t] = new Map(lista.map((x) => [x.id, decodificarEntidades(x.name).trim()]));
  for (const x of lista) nombresCrudos.set(`${t}:${x.id}`, x.name);
}

// ─── 2. Lo que hay en la D1 ─────────────────────────────────────

/** Columna de la D1 → campo de la casa armada: lo que se compara en un cambio. */
const COMPARABLES = {
  titulo: "titulo",
  slug: "slug",
  operacion: "operacion",
  tipo: "tipo",
  condicion: "condicion",
  precio: "precio",
  precio_renta: "precioRenta",
  recamaras: "recamaras",
  banos_completos: "banosCompletos",
  medios_banos: "mediosBanos",
  estacionamientos: "estacionamientos",
  niveles: "niveles",
  m2_terreno: "m2Terreno",
  m2_construccion: "m2Construccion",
  anio_construccion: "anio",
  zona: "zona",
  resumen: "resumen",
  descripcion: "descripcion",
};
const filas = consultar(
  `SELECT p.id, p.wp_id, p.clave, p.estado, p.actualizada_en, p.eliminada_en, z.slug AS zona,
          ${Object.keys(COMPARABLES)
            .filter((c) => c !== "zona")
            .map((c) => `p.${c}`)
            .join(", ")}
     FROM propiedades p LEFT JOIN zonas z ON z.id = p.zona_id
    WHERE p.wp_id IS NOT NULL;`,
  { remoto },
);
const enD1 = new Map(filas.map((f) => [f.wp_id, f]));
const { maximo = 0 } = uno("SELECT COALESCE(MAX(CAST(SUBSTR(clave, 5) AS INTEGER)), 0) AS maximo FROM propiedades WHERE clave LIKE 'AIG-%';");

// ─── 3. Qué cambió ──────────────────────────────────────────────

const publicadas = new Set(api.map((p) => p.id));
const altas = api.filter((p) => !enD1.has(p.id));
const cambiadas = api.filter((p) => enD1.has(p.id) && fechaUtc(p.modified_gmt) > enD1.get(p.id).actualizada_en);
const bajas = values["sin-bajas"]
  ? []
  : filas.filter((f) => !publicadas.has(f.wp_id) && ["publicada", "apartada"].includes(f.estado) && !f.eliminada_en);
// Pausadas que WordPress vuelve a publicar: no se reactivan solas (quizá las pausó el equipo).
const regresaron = api.filter((p) => enD1.get(p.id)?.estado === "pausada");
// Más nuevas en la D1 que en WordPress: editadas en el panel (o importadas después de su
// último cambio). No se tocan, y si WordPress cambió algo antes de esa edición, no se trae.
const respetadas = api.filter((p) => enD1.has(p.id) && fechaUtc(p.modified_gmt) < enD1.get(p.id).actualizada_en);

console.log(`WordPress publica ${api.length} · la D1 ${destino} tiene ${filas.length} de WordPress.`);
console.log(
  `Altas: ${altas.length} · cambios: ${cambiadas.length} · bajas: ${bajas.length}${values["sin-bajas"] ? " (--sin-bajas)" : ""}` +
    ` · más nuevas en la D1: ${respetadas.length}`,
);

// ─── 4. Las fichas y los medios de lo nuevo y lo cambiado ───────

const porLeer = [...altas, ...cambiadas];
const fichas = new Map();
for (const p of porLeer) {
  const html = await (await pedir(p.link)).text();
  // Una ficha válida pesa ~380 KB; las hay SIN galería (solo la foto de portada).
  if (html.length < 50_000 || !html.includes("Especificaciones")) throw new Error(`${p.slug}: no parece una ficha (${html.length} bytes)`);
  fichas.set(p.id, html);
  guardar(join("fichas", `${p.slug}.html`), html);
  await esperar(PAUSA_MS);
}

// Solo los medios de estas casas: la galería trae el id de cada foto.
const idsDeMedios = new Set();
for (const p of porLeer) {
  if (p.featured_media) idsDeMedios.add(p.featured_media);
  for (const { id } of galeriaDeFicha(fichas.get(p.id))) if (id) idsDeMedios.add(id);
}
const ids = [...idsDeMedios];
const listaMedios = [];
for (let i = 0; i < ids.length; i += 100) {
  listaMedios.push(...(await todo(`media?include=${ids.slice(i, i + 100).join(",")}&_fields=id,post,source_url,mime_type,media_details`)));
}
guardar("medios.json", listaMedios);
const medios = new Map(listaMedios.map((m) => [m.id, m]));
const mediosPorArchivo = new Map(listaMedios.map((m) => [nombreBase(m.source_url), m]));

const categoriasDe = (p) => TAXONOMIAS.flatMap((t) => (p[t] ?? []).map((id) => nombresCrudos.get(`${t}:${id}`)).filter(Boolean));
const inventario = new Map(porLeer.map((p) => [p.id, inventarioDeFicha(fichas.get(p.id), categoriasDe(p))]));
guardar("inventario.json", Object.fromEntries(inventario));

const casas = new Map(
  porLeer.map((p) => [p.id, armarCasa(p, { inventario, terminos, medios, mediosPorArchivo, htmlFicha: fichas.get(p.id) })]),
);

// Claves: las que ya existen se respetan; las nuevas siguen por fecha de alta.
let siguiente = Number(maximo) || 0;
for (const p of [...altas].sort((a, b) => casas.get(a.id).creada.localeCompare(casas.get(b.id).creada) || a.id - b.id)) {
  casas.get(p.id).clave = `AIG-${String(++siguiente).padStart(4, "0")}`;
}
for (const p of cambiadas) casas.get(p.id).clave = enD1.get(p.id).clave;

const zonas = new Map();
for (const casa of casas.values()) {
  casa.zona = slugDeZona(casa);
  if (!zonas.has(casa.zona)) zonas.set(casa.zona, { slug: casa.zona, ciudad: casa.ciudad, colonia: casa.colonia });
}

// ─── 5. Qué cambia en cada casa cambiada ────────────────────────

const LARGO_EN_BITACORA = 120; // el de server/bitacora.ts
const recortar = (valor) =>
  typeof valor === "string" && valor.length > LARGO_EN_BITACORA ? `${valor.slice(0, LARGO_EN_BITACORA)}… (${valor.length} caracteres)` : valor;

function diferencias(fila, casa) {
  const cambios = {};
  for (const [columna, campo] of Object.entries(COMPARABLES)) {
    const antes = fila[columna] ?? null;
    const despues = casa[campo] ?? null;
    if (antes !== despues) cambios[columna] = [antes, despues];
  }
  return cambios;
}

const fotosEnD1 = new Map();
const idsCambiadas = cambiadas.map((p) => enD1.get(p.id).id);
if (idsCambiadas.length) {
  const lista = consultar(
    `SELECT propiedad_id, url_origen FROM fotos INDEXED BY idx_fotos_propiedad
      WHERE propiedad_id IN (${idsCambiadas.join(", ")}) ORDER BY propiedad_id, orden;`,
    { remoto },
  );
  for (const f of lista) fotosEnD1.set(f.propiedad_id, [...(fotosEnD1.get(f.propiedad_id) ?? []), nombreBase(f.url_origen ?? "")]);
}
const cambios = cambiadas.map((p) => {
  const fila = enD1.get(p.id);
  const casa = casas.get(p.id);
  const antes = fotosEnD1.get(fila.id) ?? [];
  const despues = casa.fotos.map((f) => nombreBase(f.url));
  return { p, fila, casa, diferencias: diferencias(fila, casa), mismaGaleria: JSON.stringify(antes) === JSON.stringify(despues), fotosAntes: antes.length };
});

// ─── 6. SQL ─────────────────────────────────────────────────────

/** El renglón de bitácora sale de la misma condición que el cambio: si la casa cambió debajo, ni se toca ni se anota. */
const bitacora = (donde, accion, datos) =>
  `INSERT INTO bitacora (usuario_id, entidad, entidad_id, accion, cambios, creado_en)` +
  ` SELECT NULL, 'propiedad', CAST(id AS TEXT), ${sql(accion)}, ${sql(JSON.stringify(datos))}, ${sql(AHORA)} FROM propiedades WHERE ${donde};`;

const lineas = [`-- Generado por scripts/sincronizar-con-wordpress.mjs · ${AHORA} · destino: ${destino}`, "", "-- Zonas"];
for (const z of zonas.values()) lineas.push(sqlZona(z));

lineas.push("", "-- Altas");
for (const p of altas) {
  const c = casas.get(p.id);
  lineas.push(
    sqlPropiedad(c),
    bitacora(`wp_id = ${c.wpId}`, "crear", { clave: c.clave, titulo: c.titulo, origen: "WordPress" }),
    ...sqlFotos(c),
    ...sqlRedirecciones(c),
  );
}

lineas.push("", "-- Cambios (la bitácora primero: las dos sentencias miran el mismo estado)");
for (const { casa: c, fila, diferencias: d } of cambios) {
  const datos = Object.fromEntries(Object.entries(d).map(([k, [a, b]]) => [k, [recortar(a), recortar(b)]]));
  lineas.push(
    bitacora(`wp_id = ${c.wpId} AND actualizada_en <= ${sql(c.actualizada)}`, "editar", { ...datos, origen: "WordPress" }),
    sqlPropiedad(c),
    ...sqlRedirecciones(c),
  );
  if (fila.slug !== c.slug) {
    lineas.push(`INSERT OR REPLACE INTO redirecciones (origen, destino, codigo) VALUES (${sql(`/propiedades/${fila.slug}`)}, ${sql(`/propiedades/${c.slug}`)}, 301);`);
  }
}

lineas.push("", "-- Bajas: ya no están publicadas en WordPress");
for (const f of bajas) {
  const donde = `id = ${f.id} AND estado = ${sql(f.estado)} AND eliminada_en IS NULL`;
  lineas.push(
    bitacora(donde, "estado", { estado: [f.estado, "pausada"], motivo: "ya no está publicada en WordPress" }),
    `UPDATE propiedades SET estado = 'pausada', actualizada_en = ${sql(AHORA)} WHERE ${donde};`,
  );
}

mkdirSync(GENERADO, { recursive: true });
const archivoSql = join(GENERADO, "sincronizacion.sql");
writeFileSync(archivoSql, `${lineas.join("\n")}\n`, "utf8");

// ─── 7. Reporte ─────────────────────────────────────────────────

const dinero = (n) => (n === null || n === undefined ? "—" : `$${Number(n).toLocaleString("en-US")}`);
const precioDe = (c) => (c.operacion === "renta" ? `${dinero(c.precioRenta)} al mes` : dinero(c.precio));
const sinMedidas = (c) => c.fotos.filter((f) => f.ancho === null).length;
const reporte = [
  "# Sincronización con WordPress",
  "",
  `- ${AHORA} · D1 ${destino}${values.seco ? " · **en seco (no se aplicó)**" : ""}`,
  `- WordPress publica **${api.length}**; la D1 tenía **${filas.length}** casas de WordPress (la última clave, AIG-${String(maximo).padStart(4, "0")})`,
  `- Lo bajado: \`seed/generado/wordpress/${AHORA.slice(0, 10)}/\``,
  "",
  `## Altas (${altas.length})`,
  "",
  ...altas.map((p) => {
    const c = casas.get(p.id);
    return `- **${c.clave}** · ${c.titulo} · ${c.operacion} · ${precioDe(c)} · ${c.fotos.length} fotos${sinMedidas(c) ? ` (${sinMedidas(c)} sin medidas)` : ""} · zona «${c.zona}» · alta en WordPress ${c.creada.slice(0, 10)}`;
  }),
  "",
  `## Cambios (${cambios.length})`,
  "",
  ...cambios.flatMap(({ casa: c, diferencias: d, mismaGaleria, fotosAntes }) => [
    `- **${c.clave}** · ${c.titulo} · modificada en WordPress ${c.actualizada.slice(0, 16).replace("T", " ")} UTC`,
    ...Object.entries(d).map(([k, [a, b]]) => `  - ${k}: ${JSON.stringify(recortar(a))} → ${JSON.stringify(recortar(b))}`),
    ...(Object.keys(d).length ? [] : ["  - (los campos comparados son iguales; cambia la descripción original o los avisos)"]),
    mismaGaleria ? `  - fotos: la misma galería (${fotosAntes})` : `  - ⚠ fotos: la galería cambió (${fotosAntes} en la D1 → ${c.fotos.length} en WordPress) y NO se toca: revisarla a mano`,
  ]),
  "",
  `## Bajas → pausada (${bajas.length})`,
  "",
  ...bajas.map((f) => `- **${f.clave}** · ${f.titulo} · estaba ${f.estado}`),
  "",
  ...(regresaron.length
    ? [`## Pausadas que WordPress vuelve a publicar (${regresaron.length}): siguen pausadas`, "", ...regresaron.map((p) => `- ${enD1.get(p.id).clave} · ${enD1.get(p.id).titulo}`), ""]
    : []),
  ...(respetadas.length
    ? [
        `## Más nuevas en la D1 que en WordPress (${respetadas.length}): no se tocan`,
        "",
        "Editadas en el panel, o importadas después de su último cambio en WordPress. Si WordPress cambió algo antes de esa edición, no se trae: revisarlas a mano.",
        "",
        ...respetadas.map((p) => {
          const f = enD1.get(p.id);
          return `- ${f.clave} · ${f.titulo} · D1 ${f.actualizada_en.slice(0, 16).replace("T", " ")} · WordPress ${fechaUtc(p.modified_gmt).slice(0, 16).replace("T", " ")} (UTC)`;
        }),
        "",
      ]
    : []),
  "## Avisos de las altas",
  "",
  ...altas.map((p) => `- ${casas.get(p.id).clave}: ${casas.get(p.id).avisos.join(" · ")}`),
  "",
];
const archivoReporte = join(GENERADO, "sincronizacion.md");
writeFileSync(archivoReporte, reporte.join("\n"), "utf8");
console.log(`\n${reporte.slice(6).join("\n")}`);
console.log(`SQL: ${archivoSql}\nReporte: ${archivoReporte}`);

// ─── 8. Aplicar y comprobar ─────────────────────────────────────

if (values.seco || !(altas.length || cambios.length || bajas.length)) {
  console.log(values.seco ? "\nEn seco: no se aplicó nada." : "\nTodo al día: no hay nada que aplicar.");
  process.exit(0);
}

console.log(`\nAplicando en la D1 ${destino.toUpperCase()}…`);
ejecutarArchivo(archivoSql, { remoto });

const enLista = (lista) => lista.join(", ") || "NULL";
const comprobaciones = [];
const total = uno("SELECT COUNT(*) AS n FROM propiedades WHERE wp_id IS NOT NULL;").n;
comprobaciones.push([`${filas.length + altas.length} casas de WordPress`, total === filas.length + altas.length, `hay ${total}`]);

const nuevas = consultar(
  `SELECT p.wp_id, p.clave, p.estado, p.descripcion,
          (SELECT COUNT(*) FROM fotos f WHERE f.propiedad_id = p.id) AS fotos,
          (SELECT COUNT(*) FROM fotos f WHERE f.propiedad_id = p.id AND f.es_portada = 1) AS portadas
     FROM propiedades p WHERE p.wp_id IN (${enLista(altas.map((p) => p.id))});`,
  { remoto },
);
for (const p of altas) {
  const c = casas.get(p.id);
  const f = nuevas.find((x) => x.wp_id === p.id);
  const bien = f && f.clave === c.clave && f.estado === "publicada" && f.fotos === c.fotos.length && f.fotos > 0 && f.portadas === 1;
  comprobaciones.push([`alta ${c.clave}: publicada, ${c.fotos.length} fotos y una portada`, bien, JSON.stringify(f ?? "no está")]);
}

const tocadas = consultar(
  `SELECT wp_id, precio, precio_renta, actualizada_en FROM propiedades WHERE wp_id IN (${enLista(cambios.map(({ p }) => p.id))});`,
  { remoto },
);
for (const { p, casa: c } of cambios) {
  const f = tocadas.find((x) => x.wp_id === p.id);
  const bien = f && f.actualizada_en === c.actualizada && f.precio === c.precio && f.precio_renta === c.precioRenta;
  comprobaciones.push([`cambio ${c.clave}: al día con WordPress`, bien, JSON.stringify(f ?? "no está")]);
}

const pausadas = consultar(`SELECT clave, estado FROM propiedades WHERE id IN (${enLista(bajas.map((f) => f.id))});`, { remoto });
const sinPausar = pausadas.filter((f) => f.estado !== "pausada").map((f) => `${f.clave} (${f.estado})`);
comprobaciones.push([`${bajas.length} bajas en pausa`, pausadas.length === bajas.length && !sinPausar.length, sinPausar.join(", ")]);

const conMatematicas = nuevas.filter((f) => LETRAS_MATEMATICAS.test(f.descripcion ?? "")).map((f) => f.clave);
comprobaciones.push(["ninguna descripción nueva con letras U+1D400–U+1D7FF", !conMatematicas.length, conMatematicas.join(", ")]);

const enWordpress = uno("SELECT COUNT(*) AS n FROM fotos WHERE public_id IS NULL AND url_origen IS NOT NULL;").n;

console.log(`\nComprobaciones (D1 ${destino}):`);
for (const [nombre, ok, detalle] of comprobaciones) console.log(`${ok ? "  ✔" : "  ✖"} ${nombre}${ok ? "" : ` → ${detalle}`}`);
console.log(`\nFotos servidas todavía desde WordPress: ${enWordpress}.`);
if (enWordpress) console.log(`Siguiente: npm run fotos:migrar -- --${remoto ? "remote" : "local"}   (y después con --verificar)`);
if (comprobaciones.some(([, ok]) => !ok)) {
  console.error("\n✖ La sincronización no cumple sus comprobaciones.");
  process.exit(1);
}
