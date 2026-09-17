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
import {
  LETRAS_MATEMATICAS,
  asesorMencionado,
  decodificarEntidades,
  htmlATexto,
  normalizarDescripcion,
  resumenDe,
  sinAcentos,
  slugificar,
} from "../shared/texto.ts";
import { consultar, ejecutarArchivo, texto as sql } from "./lib/d1.mjs";

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
for (const t of ["type-of-housing", "property-type", "location", "purpose"]) {
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

/** «…/WhatsApp-Image-1-150x150.jpeg» y «…-scaled.jpeg» → «whatsapp-image-1.jpeg». */
function nombreBase(url) {
  const archivo = decodeURIComponent(String(url).split("?")[0].split("/").pop() ?? "");
  return archivo.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, "").replace(/-scaled(?=\.[a-z0-9]+$)/i, "").toLowerCase();
}

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

// ─── 3. Mapeos (PLAN §14) ───────────────────────────────────────

const OPERACIONES = { venta: "venta", renta: "renta", "venta / renta": "venta_renta", "venta y renta": "venta_renta" };
const TIPOS = {
  casa: "casa",
  departamento: "departamento",
  terreno: "terreno",
  bodega: "bodega",
  edificio: "edificio",
  oficinas: "oficina",
  oficina: "oficina",
  local: "local",
  villa: "casa",
  inmueble: "otro",
};
const CONDICIONES = { "casa nueva": "nueva", "casa semi nueva": "seminueva", "casa remodelada": "remodelada" };
const CIUDADES = {
  morelia: "Morelia",
  patzcuaro: "Pátzcuaro",
  tarimbaro: "Tarímbaro",
  "ciudad hidalgo": "Ciudad Hidalgo",
  guanajuato: "Guanajuato",
  ixtapa: "Ixtapa",
  "estado de mexico": "Estado de México",
};

const numero = (valor) => {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(String(valor).replace(/m²|m2/gi, "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};
const entero = (valor) => {
  const n = numero(valor);
  return n === null ? null : Math.round(n);
};
const fechaUtc = (gmt) => new Date(`${gmt}Z`).toISOString();
const nombres = (p, taxonomia) => (p[taxonomia] ?? []).map((id) => terminos[taxonomia].get(id)).filter(Boolean);

const mismaCiudad = (texto, ciudad) => sinAcentos(texto).replace(/^cd /, "ciudad ") === sinAcentos(ciudad);

/**
 * Colonia a partir del título (PLAN §14): «Casa en Fracc. Lomalta (M2 – 35)» →
 * «Lomalta». Los títulos los escribe el equipo a mano, así que el resultado va
 * siempre con aviso «colonia adivinada» para que alguien lo confirme.
 */
function coloniaDeTitulo(titulo, ciudad) {
  if (!/^(casas?|departamentos?|terrenos?|locales?|bodegas?|oficinas?|edificios?|inmuebles?|propiedad(es)?|residencias?)\b/i.test(titulo)) {
    return null;
  }
  const tras = titulo.match(/^.*?\ben\s+(.+)$/i)?.[1];
  if (!tras) return null;
  let colonia = tras.replace(/^(renta|venta)\s+en\s+/i, "").replace(/^la\s+/, "");
  const conCiudad = colonia.match(/^(.+?)\s+en\s+(.+)$/i);
  if (conCiudad && mismaCiudad(conCiudad[1], ciudad)) colonia = conCiudad[2];
  colonia = colonia
    .replace(/\([^)]*\)/g, " ")
    .replace(/\|.*$/, "")
    .replace(/[«»"“”]/g, "")
    .replace(/\b(fracc\.?|fraccionamiento|col\.|colonia)\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,;]+$/, "");
  // «Altozano, Modelo Fresno», «Altozano, CIRCUITO TEJONES 1», «Terranova 1, Tarímbaro»:
  // lo que va tras la coma es un modelo de casa, una calle o la ciudad, no la zona.
  let partes = colonia.split(/\s*,\s*/);
  if (partes.length > 1 && mismaCiudad(partes[partes.length - 1], ciudad)) partes = partes.slice(0, -1);
  if (partes.length > 1) partes = [partes[0], ...partes.slice(1).filter((x) => !/^(modelo|prototipo|circuito|calle|av\.?|avenida)\b/i.test(x))];
  colonia = partes.join(", ");
  if (!colonia || /^\d/.test(colonia) || /m²|\bm2\b/i.test(colonia)) return null;
  if (/^(calle|av|avenida|blvd|boulevard)(\.|\s|$)/i.test(colonia)) return null;
  // «coto privado», «coto con 133 casas», «Desarrollo»: descripciones, no lugares
  // (pero «Coto Mirlos» sí es un lugar).
  if (/^(coto|desarrollo|lujo)(\s+(con|privado|privada)\b.*)?$/i.test(colonia)) return null;
  if (mismaCiudad(colonia, ciudad)) return null;
  return colonia;
}

/** La galería en orden, del HTML de la ficha: del encabezado «Galería:» a «Propiedades Similares». */
function galeriaDeFicha(html) {
  const inicio = html.search(/>\s*Galer[ií]a:?\s*</);
  if (inicio < 0) return [];
  const fin = html.indexOf("Propiedades Similares", inicio);
  const bloque = html.slice(inicio, fin > 0 ? fin : undefined);
  const fotos = [];
  for (const [figura] of bloque.matchAll(/<figure class=['"]gallery-item['"][\s\S]*?<\/figure>/g)) {
    const href = figura.match(/href=['"]([^'"]+)['"]/)?.[1];
    // El visor de Elementor lleva en base64 el id del archivo de WordPress.
    let id = null;
    const ajustes = figura.match(/settings%3D([^"'&]+)/)?.[1];
    if (ajustes) {
      try {
        id = JSON.parse(Buffer.from(decodeURIComponent(ajustes), "base64").toString("utf8")).id ?? null;
      } catch {}
    }
    if (href || id) fotos.push({ id, href: href ? decodificarEntidades(href) : null });
  }
  return fotos;
}

function medioDe({ id, href }) {
  return (id && medios.get(id)) || (href && mediosPorArchivo.get(nombreBase(href))) || null;
}

// ─── 4. Armar cada casa ─────────────────────────────────────────

const casas = [];
const sinFicha = [];
for (const p of api) {
  const inv = inventario.get(p.id) ?? { specs: {} };
  const avisos = ["confirmar disponibilidad"];
  const titulo = decodificarEntidades(p.title.rendered).replace(/\s+/g, " ").trim();

  // Slug: se conserva el de WordPress. Si traía caracteres fuera de [a-z0-9-]
  // (hay uno con «m²» codificado) se limpia y la URL vieja queda en redirecciones.
  const slugWp = decodeURIComponent(p.slug);
  const slug = /^[a-z0-9-]+$/.test(slugWp) ? slugWp : slugificar(slugWp);
  if (slug !== slugWp) avisos.push(`dirección cambiada: «${slugWp}» → «${slug}»`);

  // Operación
  const proposito = nombres(p, "purpose")[0] ?? inv.para;
  let operacion = proposito ? OPERACIONES[proposito.toLowerCase()] : undefined;
  if (!operacion) {
    operacion = "venta";
    avisos.push("operación supuesta: venta (WordPress no la tenía)");
  }

  // Tipo: si trae varios («Inmueble» y «Terreno») manda el concreto.
  const tiposWp = nombres(p, "property-type");
  const tipoWp = tiposWp.find((t) => t.toLowerCase() !== "inmueble") ?? tiposWp[0] ?? "";
  let tipo = TIPOS[tipoWp.toLowerCase()];
  if (!tipo) {
    tipo = "otro";
    avisos.push(`tipo sin equivalente: «${tipoWp || "vacío"}»`);
  } else if (tipoWp.toLowerCase() === "inmueble") {
    avisos.push("tipo «Inmueble» de WordPress: elegir el tipo real");
  } else if (tipoWp.toLowerCase() === "villa") {
    avisos.push("tipo «villa» de WordPress tomado como casa");
  }

  // Descripción
  const descripcionOriginal = htmlATexto(p.content.rendered);
  const descripcion = normalizarDescripcion(descripcionOriginal);
  const resumen = resumenDe(descripcion);
  if (!resumen) avisos.push("sin resumen: escribir uno");
  // El nombre se quita de la descripción, pero sirve para asignar la casa en el panel.
  const asesor = asesorMencionado(descripcionOriginal);
  if (asesor) avisos.push(`asesor mencionado en el texto: «${asesor}»`);

  // Condición
  let condicion = CONDICIONES[(nombres(p, "type-of-housing")[0] ?? "").toLowerCase()] ?? null;
  if (/\bpreventa\b/i.test(descripcionOriginal.normalize("NFKC"))) {
    condicion = "preventa";
    avisos.push("preventa detectada en la descripción");
  }

  // Precio
  const precioWp = entero(inv.precio);
  let precio = null;
  let precioRenta = null;
  if (operacion === "renta") precioRenta = precioWp;
  else precio = precioWp;
  if (operacion === "venta_renta") avisos.push("falta precio de renta");

  // Zona
  const ciudadWp = nombres(p, "location")[0];
  let ciudad = ciudadWp ? (CIUDADES[sinAcentos(ciudadWp)] ?? ciudadWp) : null;
  if (!ciudad) {
    ciudad = "Morelia";
    avisos.push("ciudad supuesta: Morelia (WordPress no tenía ubicación)");
  }
  if (sinAcentos(ciudad) === "estado de mexico") avisos.push("ubicación: WordPress tiene un estado, no una ciudad");
  const colonia = coloniaDeTitulo(titulo, ciudad);
  avisos.push(colonia ? "colonia adivinada del título" : "colonia no detectada");

  // Especificaciones (leídas del HTML de cada ficha por inventario.cjs)
  const s = inv.specs ?? {};
  const anio = String(s["Año de construccion"] ?? "").match(/\b(19|20)\d{2}\b/)?.[0];

  // Fotos
  const archivoFicha = join(CRUDO, "fichas", `${p.slug}.html`);
  if (!existsSync(archivoFicha)) sinFicha.push(p.slug);
  const galeria = existsSync(archivoFicha) ? galeriaDeFicha(readFileSync(archivoFicha, "utf8")) : [];
  if (!galeria.length) avisos.push("sin galería en WordPress: solo la foto de portada");

  const vistas = new Set();
  const fotos = [];
  for (const item of galeria) {
    const medio = medioDe(item);
    const url = medio?.source_url ?? item.href;
    if (!url || vistas.has(url) || (medio && !String(medio.mime_type).startsWith("image/"))) continue;
    vistas.add(url);
    fotos.push({ url, ancho: medio?.media_details?.width ?? null, alto: medio?.media_details?.height ?? null, idWp: medio?.id ?? item.id });
  }
  const portada = medios.get(p.featured_media);
  let indicePortada = portada ? fotos.findIndex((f) => f.idWp === portada.id || f.url === portada.source_url) : -1;
  if (portada && indicePortada < 0 && String(portada.mime_type).startsWith("image/")) {
    fotos.unshift({ url: portada.source_url, ancho: portada.media_details?.width ?? null, alto: portada.media_details?.height ?? null, idWp: portada.id });
    indicePortada = 0;
  }
  if (indicePortada < 0 && fotos.length) {
    indicePortada = 0;
    avisos.push("sin foto de portada en WordPress: se usó la primera de la galería");
  }

  casas.push({
    wpId: p.id,
    slug,
    slugWp,
    titulo,
    operacion,
    tipo,
    condicion,
    precio,
    precioRenta,
    recamaras: entero(s["Habitaciones"]),
    banosCompletos: entero(s["Baños completos"]),
    mediosBanos: entero(s["Medios Baños"]),
    estacionamientos: entero(s["Estacionamientos"]),
    niveles: entero(s["Cantidad de Pisos"]),
    m2Terreno: numero(s["Tamaño de la propiedad"]),
    m2Construccion: numero(s["En construcción"]),
    anio: anio ? Number(anio) : null,
    ciudad,
    colonia,
    resumen,
    descripcion,
    descripcionOriginal,
    avisos,
    creada: fechaUtc(p.date_gmt),
    actualizada: fechaUtc(p.modified_gmt),
    fotos: fotos.map((f, i) => ({ ...f, orden: i, esPortada: i === indicePortada ? 1 : 0 })),
  });
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
  const slugZona = slugificar(`${casa.ciudad} ${casa.colonia ?? ""}`);
  casa.zona = slugZona;
  const zona = zonas.get(slugZona) ?? { slug: slugZona, ciudad: casa.ciudad, formas: new Map() };
  if (casa.colonia) zona.formas.set(casa.colonia, (zona.formas.get(casa.colonia) ?? 0) + 1);
  zonas.set(slugZona, zona);
}
const noAscii = (t) => [...t].filter((c) => c.charCodeAt(0) > 127).length;
for (const zona of zonas.values()) {
  zona.colonia = [...zona.formas.entries()].sort((a, b) => b[1] - a[1] || noAscii(b[0]) - noAscii(a[0]))[0]?.[0] ?? null;
}

// ─── 5. SQL ─────────────────────────────────────────────────────

const lineas = [
  "-- Generado por scripts/sembrar-desde-wordpress.mjs. No editar a mano: se rehace.",
  `-- ${new Date().toISOString()} · destino: ${remoto ? "remoto" : "local"}`,
  "",
  "-- Zonas",
];
for (const z of zonas.values()) {
  lineas.push(`INSERT OR IGNORE INTO zonas (ciudad, colonia, slug) VALUES (${sql(z.ciudad)}, ${sql(z.colonia)}, ${sql(z.slug)});`);
}

lineas.push("", "-- Propiedades (por wp_id; lo editado en el panel no se toca)");
for (const c of casas) {
  const columnas = {
    clave: sql(c.clave),
    slug: sql(c.slug),
    wp_id: c.wpId,
    titulo: sql(c.titulo),
    operacion: sql(c.operacion),
    tipo: sql(c.tipo),
    condicion: sql(c.condicion),
    estado: sql("publicada"),
    precio: c.precio ?? "NULL",
    precio_renta: c.precioRenta ?? "NULL",
    recamaras: c.recamaras ?? "NULL",
    banos_completos: c.banosCompletos ?? "NULL",
    medios_banos: c.mediosBanos ?? "NULL",
    estacionamientos: c.estacionamientos ?? "NULL",
    niveles: c.niveles ?? "NULL",
    m2_terreno: c.m2Terreno ?? "NULL",
    m2_construccion: c.m2Construccion ?? "NULL",
    anio_construccion: c.anio ?? "NULL",
    zona_id: `(SELECT id FROM zonas WHERE slug = ${sql(c.zona)})`,
    resumen: sql(c.resumen),
    descripcion: sql(c.descripcion),
    descripcion_original: sql(c.descripcionOriginal),
    revisar: sql(JSON.stringify(c.avisos)),
    creada_en: sql(c.creada),
    actualizada_en: sql(c.actualizada),
    publicada_en: sql(c.creada),
  };
  const nombresColumnas = Object.keys(columnas);
  // clave y estado no se actualizan: una vez dadas, son del negocio.
  const actualizables = nombresColumnas.filter((n) => !["clave", "wp_id", "estado", "creada_en", "publicada_en"].includes(n));
  lineas.push(
    `INSERT INTO propiedades (${nombresColumnas.join(", ")}) VALUES (${Object.values(columnas).join(", ")})` +
      ` ON CONFLICT(wp_id) DO UPDATE SET ${actualizables.map((n) => `${n} = excluded.${n}`).join(", ")}` +
      ` WHERE propiedades.actualizada_en <= excluded.actualizada_en;`,
  );
}

lineas.push("", "-- Fotos (solo las que siguen en WordPress se reemplazan)");
for (const c of casas) {
  const casaSinEditar = `wp_id = ${c.wpId} AND actualizada_en = ${sql(c.actualizada)}`;
  lineas.push(
    `DELETE FROM fotos WHERE public_id IS NULL AND propiedad_id = (SELECT id FROM propiedades WHERE ${casaSinEditar});`,
  );
  if (!c.fotos.length) continue;
  const filas = c.fotos
    .map((f) => `(${sql(f.url)}, ${f.ancho ?? "NULL"}, ${f.alto ?? "NULL"}, ${sql(`${c.titulo}, foto ${f.orden + 1} de ${c.fotos.length}`)}, ${f.orden}, ${f.esPortada})`)
    .join(", ");
  lineas.push(
    `INSERT INTO fotos (propiedad_id, url_origen, ancho, alto, alt, orden, es_portada)` +
      ` SELECT p.id, v.column1, v.column2, v.column3, v.column4, v.column5, v.column6` +
      ` FROM (VALUES ${filas}) AS v JOIN propiedades p ON p.${casaSinEditar.replace(" AND ", " AND p.")}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM fotos f WHERE f.propiedad_id = p.id AND f.url_origen = v.column1);`,
  );
}

lineas.push("", "-- Redirecciones de las direcciones que cambiaron");
for (const c of casas.filter((x) => x.slug !== x.slugWp)) {
  for (const origen of new Set([`/properties/${c.slugWp}`, `/properties/${encodeURIComponent(c.slugWp).toLowerCase()}`])) {
    lineas.push(`INSERT OR REPLACE INTO redirecciones (origen, destino, codigo) VALUES (${sql(origen)}, ${sql(`/propiedades/${c.slug}`)}, 301);`);
  }
}

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

// ─── 6. Aplicar y comprobar ─────────────────────────────────────

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

// ─── 7. Reporte ─────────────────────────────────────────────────

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
