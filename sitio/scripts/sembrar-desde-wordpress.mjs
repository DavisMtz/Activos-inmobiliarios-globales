#!/usr/bin/env node
/**
 * Siembra la D1 con las 188 casas del sitio actual (PLAN §14).
 *
 *   node scripts/sembrar-desde-wordpress.mjs --local|--remote [--seco]
 *
 * Lee los datos ya descargados en `analisis/crudo/` (API, inventario, medios y
 * el HTML de cada ficha, que es la única fuente de la galería en orden), escribe
 * `seed/generado/0001_semilla.sql` y `seed/generado/reporte.md`, lo aplica y
 * comprueba el resultado. Con --seco solo genera los archivos.
 *
 * Idempotente y respetuoso con el panel:
 * - Las casas se identifican por `wp_id`. Una casa que el equipo ya editó en el
 *   panel (su `actualizada_en` es posterior a la de WordPress) NO se toca.
 * - La clave AIG-0001 de una casa que ya existe nunca cambia; las nuevas siguen
 *   la numeración por fecha de alta.
 * - Solo se reemplazan las fotos que siguen en WordPress (`public_id` vacío):
 *   las que ya se migraron a Cloudinary se conservan.
 * - Servicios y configuración solo se insertan si no existen.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { LETRAS_MATEMATICAS, decodificarEntidades } from "../shared/texto.ts";
import { consultar, ejecutarArchivo, texto as sql } from "./lib/d1.mjs";
import { TAXONOMIAS, armarCasa, nombreBase, slugDeZona, sqlFotos, sqlPropiedad, sqlRedirecciones, sqlZona } from "./lib/wordpress.mjs";

const { values } = parseArgs({
  options: {
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    seco: { type: "boolean", default: false },
  },
});
if (values.local === values.remote) {
  console.error("Indica exactamente uno: --local o --remote.");
  process.exit(1);
}
const remoto = values.remote;

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const CRUDO = join(RAIZ, "..", "analisis", "crudo");
const GENERADO = join(RAIZ, "seed", "generado");
const leerJson = (ruta) => JSON.parse(readFileSync(ruta, "utf8"));

// Lo que PLAN §14 exige al terminar. Si no se cumple, el script falla.
const ESPERADO = { propiedades: 188, operaciones: { venta: 180, venta_renta: 5, renta: 3 }, servicios: 6 };
const CLAVES_CONFIGURACION = ["contacto", "whatsapp", "redes", "portada", "nosotros", "aviso_privacidad"];

// ─── 1. Entradas ────────────────────────────────────────────────

const api = [...leerJson(join(CRUDO, "api_properties.json")), ...leerJson(join(CRUDO, "api_properties_p2.json"))];
const inventario = new Map(leerJson(join(CRUDO, "inventario_propiedades.json")).map((r) => [r.id, r]));
const terminos = {};
for (const t of TAXONOMIAS) {
  terminos[t] = new Map(leerJson(join(CRUDO, `api_${t}.json`)).map((x) => [x.id, decodificarEntidades(x.name).trim()]));
}
const medios = new Map();
const mediosPorArchivo = new Map();
for (const archivo of readdirSync(join(CRUDO, "medios"))) {
  for (const m of leerJson(join(CRUDO, "medios", archivo))) {
    medios.set(m.id, m);
    mediosPorArchivo.set(nombreBase(m.source_url), m);
  }
}
const semilla = leerJson(join(RAIZ, "seed", "configuracion.json"));

// ─── 2. Lo que ya hay en la base de destino ─────────────────────

const existentes = new Map(
  consultar("SELECT wp_id, clave, actualizada_en FROM propiedades WHERE wp_id IS NOT NULL;", { remoto }).map((f) => [
    f.wp_id,
    f,
  ]),
);
const [{ maximo = 0 } = {}] = consultar(
  "SELECT COALESCE(MAX(CAST(SUBSTR(clave, 5) AS INTEGER)), 0) AS maximo FROM propiedades WHERE clave LIKE 'AIG-%';",
  { remoto },
);

// ─── 3. Armar cada casa (las reglas de PLAN §14: lib/wordpress.mjs) ──────

const casas = [];
const sinFicha = [];
for (const p of api) {
  const archivoFicha = join(CRUDO, "fichas", `${p.slug}.html`);
  const htmlFicha = existsSync(archivoFicha) ? readFileSync(archivoFicha, "utf8") : null;
  if (htmlFicha === null) sinFicha.push(p.slug);
  casas.push(armarCasa(p, { inventario, terminos, medios, mediosPorArchivo, htmlFicha }));
}

if (sinFicha.length) {
  console.error(`Faltan fichas descargadas (${sinFicha.length}). Corre antes: node scripts/descargar-fichas.mjs`);
  process.exit(1);
}

// Claves: las que ya existen se respetan; las nuevas siguen por fecha de alta.
let siguiente = Number(maximo) || 0;
for (const casa of [...casas].sort((a, b) => a.creada.localeCompare(b.creada) || a.wpId - b.wpId)) {
  casa.clave = existentes.get(casa.wpId)?.clave ?? `AIG-${String(++siguiente).padStart(4, "0")}`;
}

// Zonas: una por ciudad y colonia. «Tres Marias» y «Tres Marías» son la misma
// (mismo slug); se nombra con la forma más usada y, a igualdad, la acentuada.
const zonas = new Map();
for (const casa of casas) {
  const slugZona = slugDeZona(casa);
  casa.zona = slugZona;
  const zona = zonas.get(slugZona) ?? { slug: slugZona, ciudad: casa.ciudad, formas: new Map() };
  if (casa.colonia) zona.formas.set(casa.colonia, (zona.formas.get(casa.colonia) ?? 0) + 1);
  zonas.set(slugZona, zona);
}
const noAscii = (t) => [...t].filter((c) => c.charCodeAt(0) > 127).length;
for (const zona of zonas.values()) {
  zona.colonia = [...zona.formas.entries()].sort((a, b) => b[1] - a[1] || noAscii(b[0]) - noAscii(a[0]))[0]?.[0] ?? null;
}

// ─── 4. SQL ─────────────────────────────────────────────────────

const lineas = [
  "-- Generado por scripts/sembrar-desde-wordpress.mjs. No editar a mano: se rehace.",
  `-- ${new Date().toISOString()} · destino: ${remoto ? "remoto" : "local"}`,
  "",
  "-- Zonas",
];
for (const z of zonas.values()) lineas.push(sqlZona(z));

lineas.push("", "-- Propiedades (por wp_id; lo editado en el panel no se toca)");
for (const c of casas) lineas.push(sqlPropiedad(c));

lineas.push("", "-- Fotos (solo las que siguen en WordPress se reemplazan)");
for (const c of casas) lineas.push(...sqlFotos(c));

lineas.push("", "-- Redirecciones de las direcciones que cambiaron");
for (const c of casas) lineas.push(...sqlRedirecciones(c));

lineas.push("", "-- Servicios (solo si la tabla está vacía)");
const valoresServicios = semilla.servicios
  .map((s, i) => `(${sql(s.titulo)}, ${sql(s.descripcion)}, NULL, ${i + 1}, 1)`)
  .join(", ");
lineas.push(
  `INSERT INTO servicios (titulo, descripcion, icono, orden, visible) SELECT * FROM (VALUES ${valoresServicios}) WHERE NOT EXISTS (SELECT 1 FROM servicios);`,
);

lineas.push("", "-- Configuración (solo las claves que no existan)");
const ahora = new Date().toISOString();
for (const clave of CLAVES_CONFIGURACION) {
  const valor = semilla.configuracion[clave];
  if (!valor) throw new Error(`seed/configuracion.json no trae «${clave}»`);
  lineas.push(`INSERT OR IGNORE INTO configuracion (clave, valor, actualizado_en) VALUES (${sql(clave)}, ${sql(JSON.stringify(valor))}, ${sql(ahora)});`);
}

mkdirSync(GENERADO, { recursive: true });
const archivoSql = join(GENERADO, "0001_semilla.sql");
writeFileSync(archivoSql, `${lineas.join("\n")}\n`, "utf8");
const pesoKb = Math.round(readFileSync(archivoSql).length / 1024);
console.log(`SQL: ${archivoSql} (${pesoKb} KB, ${lineas.filter((l) => l && !l.startsWith("--")).length} sentencias)`);

// ─── 5. Aplicar y comprobar ─────────────────────────────────────

const editadasEnPanel = casas.filter((c) => {
  const e = existentes.get(c.wpId);
  return e && e.actualizada_en > c.actualizada;
});

let comprobaciones = [];
if (!values.seco) {
  console.log(`Aplicando en la D1 ${remoto ? "REMOTA" : "local"}…`);
  ejecutarArchivo(archivoSql, { remoto });

  const uno = (consulta) => consultar(consulta, { remoto })[0] ?? {};
  const total = uno("SELECT COUNT(*) AS n FROM propiedades WHERE wp_id IS NOT NULL;").n;
  const sinFoto = uno(
    "SELECT COUNT(*) AS n FROM propiedades p WHERE p.wp_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fotos f WHERE f.propiedad_id = p.id);",
  ).n;
  const operaciones = Object.fromEntries(
    consultar("SELECT operacion, COUNT(*) AS n FROM propiedades WHERE wp_id IS NOT NULL GROUP BY operacion;", { remoto }).map((f) => [f.operacion, f.n]),
  );
  const servicios = uno("SELECT COUNT(*) AS n FROM servicios;").n;
  const claves = consultar("SELECT clave FROM configuracion;", { remoto }).map((f) => f.clave);
  const descripciones = consultar("SELECT clave, descripcion FROM propiedades WHERE wp_id IS NOT NULL;", { remoto });
  const conMatematicas = descripciones.filter((d) => LETRAS_MATEMATICAS.test(d.descripcion ?? "")).map((d) => d.clave);
  const portadas = uno(
    "SELECT COUNT(*) AS n FROM propiedades p WHERE p.wp_id IS NOT NULL AND (SELECT COUNT(*) FROM fotos f WHERE f.propiedad_id = p.id AND f.es_portada = 1) <> 1;",
  ).n;
  const fotosTotales = uno("SELECT COUNT(*) AS n FROM fotos;").n;

  comprobaciones = [
    [`${ESPERADO.propiedades} propiedades`, total === ESPERADO.propiedades, `hay ${total}`],
    ["ninguna sin foto", sinFoto === 0, `${sinFoto} sin foto`],
    ["cada una con exactamente una portada", portadas === 0, `${portadas} con cero o varias portadas`],
    ["ninguna descripción con letras U+1D400–U+1D7FF", conMatematicas.length === 0, conMatematicas.join(", ")],
    [
      "operaciones 180 venta · 5 venta y renta · 3 renta",
      Object.entries(ESPERADO.operaciones).every(([k, v]) => operaciones[k] === v),
      JSON.stringify(operaciones),
    ],
    [`${ESPERADO.servicios} servicios`, servicios === ESPERADO.servicios, `hay ${servicios}`],
    ["configuración completa", CLAVES_CONFIGURACION.every((k) => claves.includes(k)), `hay: ${claves.join(", ")}`],
  ];
  console.log(`\nComprobaciones (${remoto ? "remoto" : "local"}, ${fotosTotales} fotos en la base):`);
  for (const [nombre, ok, detalle] of comprobaciones) console.log(`${ok ? "  ✔" : "  ✖"} ${nombre}${ok ? "" : ` → ${detalle}`}`);
}

// ─── 6. Reporte ─────────────────────────────────────────────────

const fotosPorCasa = casas.map((c) => c.fotos.length).sort((a, b) => a - b);
const mediana = fotosPorCasa[Math.floor(fotosPorCasa.length / 2)];
const conteoAvisos = new Map();
for (const c of casas) {
  for (const aviso of c.avisos) {
    const tipoAviso = aviso.replace(/«[^»]*»/g, "«…»");
    const lista = conteoAvisos.get(tipoAviso) ?? [];
    lista.push(c);
    conteoAvisos.set(tipoAviso, lista);
  }
}
const faltan = (campo) => casas.filter((c) => c[campo] === null).length;
const porCiudad = new Map();
for (const z of zonas.values()) {
  const lista = porCiudad.get(z.ciudad) ?? [];
  lista.push(z);
  porCiudad.set(z.ciudad, lista);
}
const casasPorZona = (slugZona) => casas.filter((c) => c.zona === slugZona).length;

const reporte = [
  "# Reporte de la siembra desde WordPress",
  "",
  `- Generado: ${new Date().toISOString()} · destino: ${remoto ? "D1 remota" : "D1 local"}${values.seco ? " · **en seco (no se aplicó)**" : ""}`,
  `- Propiedades: **${casas.length}** · fotos: **${fotosPorCasa.reduce((a, b) => a + b, 0)}** (mínimo ${fotosPorCasa[0]}, mediana ${mediana}, máximo ${fotosPorCasa[fotosPorCasa.length - 1]} por casa) · zonas: **${zonas.size}**`,
  `- Claves: de ${casas.map((c) => c.clave).sort()[0]} a ${casas.map((c) => c.clave).sort().at(-1)} (por fecha de alta)`,
  `- Editadas en el panel y respetadas (no se tocaron): ${editadasEnPanel.length}`,
  "",
  "## Comprobaciones",
  "",
  ...(comprobaciones.length ? comprobaciones.map(([n, ok, d]) => `- ${ok ? "✔" : "✖"} ${n}${ok ? "" : ` → ${d}`}`) : ["- (en seco: no se comprobó contra la base)"]),
  "",
  "## Datos que faltan (el panel los marcará)",
  "",
  "| Campo | Casas sin dato |",
  "|---|---|",
  `| Recámaras | ${faltan("recamaras")} |`,
  `| Baños completos | ${faltan("banosCompletos")} |`,
  `| m² de construcción | ${faltan("m2Construccion")} |`,
  `| m² de terreno | ${faltan("m2Terreno")} |`,
  `| Niveles | ${faltan("niveles")} |`,
  `| Resumen | ${faltan("resumen")} |`,
  "",
  "## Avisos para revisar con el equipo",
  "",
  "| Aviso | Casas |",
  "|---|---|",
  ...[...conteoAvisos.entries()].sort((a, b) => b[1].length - a[1].length).map(([aviso, lista]) => `| ${aviso} | ${lista.length} |`),
  "",
  ...[...conteoAvisos.entries()]
    .filter(([aviso, lista]) => lista.length < casas.length && !/^colonia adivinada/.test(aviso))
    .flatMap(([aviso, lista]) => [`### ${aviso} (${lista.length})`, "", ...lista.map((c) => `- ${c.clave} · ${c.titulo}${c.avisos.find((a) => a.replace(/«[^»]*»/g, "«…»") === aviso)?.includes("«") ? ` — ${c.avisos.find((a) => a.replace(/«[^»]*»/g, "«…»") === aviso)}` : ""}`), ""]),
  "## Zonas detectadas",
  "",
  "Colonias adivinadas de los títulos: confirmar con el equipo. Entre paréntesis, cuántas casas.",
  "",
  ...[...porCiudad.entries()].flatMap(([ciudad, lista]) => [
    `- **${ciudad}**: ${lista
      .sort((a, b) => (a.colonia ?? "").localeCompare(b.colonia ?? "", "es"))
      .map((z) => `${z.colonia ?? "(sin colonia)"} (${casasPorZona(z.slug)})`)
      .join(" · ")}`,
  ]),
  "",
];
writeFileSync(join(GENERADO, "reporte.md"), reporte.join("\n"), "utf8");
console.log(`Reporte: ${join(GENERADO, "reporte.md")}`);

if (comprobaciones.some(([, ok]) => !ok)) {
  console.error("\n✖ La siembra NO cumple las comprobaciones de PLAN §14.");
  process.exit(1);
}
