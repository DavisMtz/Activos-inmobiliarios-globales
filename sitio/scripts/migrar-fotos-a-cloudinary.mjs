#!/usr/bin/env node
/**
 * Sube a Cloudinary las fotos que siguen en WordPress (PLAN §13.5, fase F1.5).
 *
 *   node scripts/migrar-fotos-a-cloudinary.mjs --remote [--limite 20] [--concurrencia 3] [--seco]
 *   node scripts/migrar-fotos-a-cloudinary.mjs --local        (toma lo ya subido del registro)
 *   node scripts/migrar-fotos-a-cloudinary.mjs --remote --verificar
 *
 * - Sube por URL: Cloudinary pide la foto a WordPress y el archivo no pasa por
 *   esta máquina. No pide transformaciones (ni `eager`): subir solo cuesta
 *   almacenamiento. Las transformaciones se cobran cuando alguien abre una ficha.
 * - `public_id` = `aig/propiedades/<clave>/<8 hex del SHA-256 de url_origen>`.
 *   Determinista a propósito: con `overwrite=false`, repetir una subida devuelve
 *   `existing: true` sin guardar otra copia, así que un corte a medias no deja
 *   huérfanos. Las fotos que suba el panel (F3) sí llevan sufijo aleatorio.
 * - Cada subida se anota en `seed/generado/fotos-cloudinary.jsonl` y la D1 se
 *   actualiza en lotes desde ahí. Una subida sirve a las dos bases: primero
 *   `--remote`; después `--local` ya no sube nada.
 * - `url_origen` se conserva: la siembra y `comparar` la usan.
 * - Si Cloudinary rechaza el original por dañado («Resource is invalid»; en F1.5
 *   fueron 2 JPEG cortados en el propio servidor de WordPress), se sube el tamaño
 *   intermedio más grande que WordPress generó al recibirlo (`analisis/crudo/medios`)
 *   con el mismo `public_id`, y el reporte lo lista.
 * - `--verificar` cruza la D1 con lo que hay en Cloudinary (faltantes, huérfanas
 *   y medidas distintas) usando la Admin API, que tiene tope de 500 llamadas por
 *   hora: por eso nunca se usa foto por foto.
 * - Las llaves se leen de `.dev.vars` y nunca se imprimen.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { RAIZ, consultar, ejecutarSql, texto as sql } from "./lib/d1.mjs";

const { values } = parseArgs({
  options: {
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    limite: { type: "string" },
    concurrencia: { type: "string", default: "3" },
    seco: { type: "boolean", default: false },
    verificar: { type: "boolean", default: false },
  },
});
if (values.local === values.remote) {
  console.error("Indica exactamente uno: --local o --remote.");
  process.exit(1);
}
const remoto = values.remote;
const destino = remoto ? "remota" : "local";
const limite = values.limite === undefined ? null : Number(values.limite);
const concurrencia = Number(values.concurrencia);
if ((limite !== null && !(Number.isInteger(limite) && limite > 0)) || !(Number.isInteger(concurrencia) && concurrencia >= 1 && concurrencia <= 6)) {
  console.error("--limite va con un entero positivo y --concurrencia con un entero de 1 a 6.");
  process.exit(1);
}

// ─── Configuración ──────────────────────────────────────────────

function leerDevVars() {
  const ruta = join(RAIZ, ".dev.vars");
  if (!existsSync(ruta)) return {};
  return Object.fromEntries(
    readFileSync(ruta, "utf8")
      .split(/\r?\n/)
      .map((renglon) => renglon.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, nombre, valor]) => [nombre, valor.replace(/^"(.*)"$/, "$1")]),
  );
}
const wranglerJsonc = readFileSync(join(RAIZ, "wrangler.jsonc"), "utf8");
const variable = (nombre) => wranglerJsonc.match(new RegExp(`"${nombre}"\\s*:\\s*"([^"]*)"`))?.[1] ?? "";
const NUBE = variable("CLOUDINARY_CLOUD_NAME");
const CARPETA = variable("CLOUDINARY_CARPETA") || "aig";
const { CLOUDINARY_API_KEY: API_KEY = "", CLOUDINARY_API_SECRET: API_SECRET = "" } = leerDevVars();
if (!NUBE || !API_KEY || !API_SECRET) {
  console.error("Falta CLOUDINARY_CLOUD_NAME en wrangler.jsonc, o CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET en .dev.vars.");
  process.exit(1);
}

const GENERADO = join(RAIZ, "seed", "generado");
const REGISTRO = join(GENERADO, "fotos-cloudinary.jsonl");
const MEDIOS = join(RAIZ, "..", "analisis", "crudo", "medios");
const LOTE = 100;
const MAX_INTENTOS = 3;
const FALLOS_SEGUIDOS_PARA_PARAR = 10;
/** Lo que responde Cloudinary cuando el archivo no es una imagen válida (p. ej., un JPEG cortado). */
const ARCHIVO_DANADO = /resource is invalid|invalid image file/i;

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const mb = (bytes) => (bytes / 1024 ** 2).toFixed(1);
const entero = (n) => (Number.isInteger(n) ? n : "NULL");
const carpetaDe = (clave) => `${CARPETA}/propiedades/${clave}`;
const sufijoDe = (url) => createHash("sha256").update(url).digest("hex").slice(0, 8);

// ─── Verificación contra Cloudinary ─────────────────────────────

if (values.verificar) {
  const autorizacion = "Basic " + Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64");
  const prefijo = `${CARPETA}/propiedades/`;
  const enNube = new Map();
  let cursor = null;
  let restantes = null;
  do {
    const url = new URL(`https://api.cloudinary.com/v1_1/${NUBE}/resources/image/upload`);
    url.searchParams.set("prefix", prefijo);
    url.searchParams.set("max_results", "500");
    if (cursor) url.searchParams.set("next_cursor", cursor);
    const respuesta = await fetch(url, { headers: { Authorization: autorizacion } });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      console.error(`Admin API de Cloudinary: HTTP ${respuesta.status} ${datos.error?.message ?? ""}`);
      process.exit(1);
    }
    for (const recurso of datos.resources) enNube.set(recurso.public_id, recurso);
    restantes = respuesta.headers.get("x-featureratelimit-remaining");
    cursor = datos.next_cursor ?? null;
  } while (cursor);

  const enD1 = consultar("SELECT public_id, ancho, alto FROM fotos WHERE public_id IS NOT NULL;", { remoto });
  const idsD1 = new Set(enD1.map((f) => f.public_id));
  const faltan = enD1.filter((f) => !enNube.has(f.public_id)).map((f) => f.public_id);
  const medidasDistintas = enD1
    .filter((f) => enNube.has(f.public_id) && (enNube.get(f.public_id).width !== f.ancho || enNube.get(f.public_id).height !== f.alto))
    .map((f) => `${f.public_id}: D1 ${f.ancho}×${f.alto}, Cloudinary ${enNube.get(f.public_id).width}×${enNube.get(f.public_id).height}`);
  const huerfanas = [...enNube.keys()].filter((id) => !idsD1.has(id));
  const sinSubir = consultar("SELECT COUNT(*) AS n FROM fotos WHERE public_id IS NULL;", { remoto })[0]?.n ?? 0;
  const bytes = [...enNube.values()].reduce((suma, r) => suma + r.bytes, 0);

  const renglones = [
    [`sin subir en la D1 ${destino}`, sinSubir],
    ["en la D1 pero no en Cloudinary", faltan.length],
    [`en Cloudinary (${prefijo}) sin usar en esta D1`, huerfanas.length],
    ["con medidas distintas", medidasDistintas.length],
  ];
  console.log(`Cloudinary ${NUBE}: ${enNube.size} fotos bajo ${prefijo}, ${mb(bytes)} MB. D1 ${destino}: ${enD1.length} con public_id.`);
  for (const [nombre, n] of renglones) console.log(`  ${n === 0 ? "✔" : "✖"} ${nombre}: ${n}`);
  for (const lista of [faltan, huerfanas, medidasDistintas]) if (lista.length) console.log(lista.slice(0, 20).map((x) => `    ${x}`).join("\n"));
  console.log(`(Admin API: quedan ${restantes} llamadas en esta hora)`);
  process.exit(renglones.some(([, n]) => n > 0) ? 1 : 0);
}

// ─── Registro de subidas ────────────────────────────────────────

/** Última subida buena de cada `url_origen` en ESTA nube. */
function leerRegistro() {
  const subidas = new Map();
  if (!existsSync(REGISTRO)) return subidas;
  for (const renglon of readFileSync(REGISTRO, "utf8").split("\n")) {
    if (!renglon.trim()) continue;
    try {
      const entrada = JSON.parse(renglon);
      if (entrada.nube === NUBE && entrada.public_id) subidas.set(entrada.url_origen, entrada);
    } catch {
      // Renglón cortado por un cierre a medias: esa foto se vuelve a pedir y Cloudinary responde `existing`.
    }
  }
  return subidas;
}

function anotar(entrada) {
  appendFileSync(REGISTRO, `${JSON.stringify({ ...entrada, nube: NUBE, fecha: new Date().toISOString() })}\n`, "utf8");
}

// ─── Subida ─────────────────────────────────────────────────────

class FalloDeSubida extends Error {
  constructor(estado, mensaje, { fatal = false } = {}) {
    super(mensaje);
    this.estado = estado;
    this.fatal = fatal;
  }
}

async function subir(foto) {
  const firmados = {
    // En esta nube (carpetas dinámicas) `folder` queda como carpeta del Media Library
    // Y como prefijo del public_id, igual que en la Biblioteca.
    folder: carpetaDe(foto.clave),
    overwrite: "false",
    public_id: sufijoDe(foto.url_origen),
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const cadena = Object.keys(firmados)
    .sort()
    .map((nombre) => `${nombre}=${firmados[nombre]}`)
    .join("&");
  const signature = createHash("sha1").update(cadena + API_SECRET).digest("hex");
  // `fuente` solo existe cuando el original está dañado; el public_id sigue saliendo de `url_origen`.
  const cuerpo = new URLSearchParams({ ...firmados, file: foto.fuente ?? foto.url_origen, api_key: API_KEY, signature });

  let respuesta;
  try {
    respuesta = await fetch(`https://api.cloudinary.com/v1_1/${NUBE}/image/upload`, {
      method: "POST",
      body: cuerpo,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new FalloDeSubida(0, `sin respuesta: ${error.message}`);
  }
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401 || respuesta.status === 403) {
    throw new FalloDeSubida(respuesta.status, `Cloudinary rechazó las llaves: ${datos.error?.message ?? respuesta.status}`, { fatal: true });
  }
  if (!respuesta.ok) throw new FalloDeSubida(respuesta.status, datos.error?.message ?? `HTTP ${respuesta.status}`);
  if (typeof datos.public_id !== "string" || !datos.public_id.startsWith(`${carpetaDe(foto.clave)}/`)) {
    throw new FalloDeSubida(0, `Cloudinary guardó la foto como «${datos.public_id}», fuera de ${carpetaDe(foto.clave)}/`, { fatal: true });
  }
  return {
    clave: foto.clave,
    url_origen: foto.url_origen,
    // Se guarda el public_id de la RESPUESTA, no el que se pidió.
    public_id: datos.public_id,
    ancho: datos.width ?? null,
    alto: datos.height ?? null,
    bytes: datos.bytes ?? 0,
    formato: datos.format ?? null,
    existente: Boolean(datos.existing),
  };
}

async function subirConReintentos(foto) {
  for (let intento = 1; ; intento++) {
    try {
      return await subir(foto);
    } catch (error) {
      if (error.fatal || ARCHIVO_DANADO.test(error.message) || intento >= MAX_INTENTOS) throw error;
      const frenado = error.estado === 420 || error.estado === 429;
      await esperar(frenado ? 60_000 : 3_000 * intento ** 2);
    }
  }
}

let medios = null;
/** Tamaños intermedios que WordPress generó al recibir la foto, del más grande al más chico. */
function respaldosDe(urlOrigen) {
  if (!medios) {
    medios = new Map();
    if (existsSync(MEDIOS)) {
      for (const archivo of readdirSync(MEDIOS)) {
        for (const medio of JSON.parse(readFileSync(join(MEDIOS, archivo), "utf8"))) medios.set(medio.source_url, medio);
      }
    }
  }
  const tamanos = Object.entries(medios.get(urlOrigen)?.media_details?.sizes ?? {})
    .filter(([nombre, t]) => nombre !== "full" && t.source_url && t.source_url !== urlOrigen)
    .sort(([, a], [, b]) => b.width * b.height - a.width * a.height);
  return [...new Set(tamanos.map(([, t]) => t.source_url))];
}

async function subirConRespaldo(foto) {
  try {
    return await subirConReintentos(foto);
  } catch (error) {
    if (error.fatal || !ARCHIVO_DANADO.test(error.message)) throw error;
    for (const fuente of respaldosDe(foto.url_origen)) {
      try {
        return { ...(await subirConReintentos({ ...foto, fuente })), fuente };
      } catch (otro) {
        if (otro.fatal || !ARCHIVO_DANADO.test(otro.message)) throw otro;
      }
    }
    throw error;
  }
}

/**
 * OJO con las filas LEÍDAS: el plan gratuito de D1 permite 5 millones al día
 * para TODA la cuenta (Cuponera, la Biblioteca…), y al pasarse falla cualquier
 * consulta que lea datos, en todas las bases, hasta las 00:00 UTC.
 *
 * La primera versión filtraba con `WHERE public_id IS NULL AND url_origen = …`:
 * SQLite eligió el índice único de `public_id` y cada UPDATE recorrió TODAS las
 * fotos pendientes (hasta 3,221). Con 3,241 fotos fueron 5.6 millones de filas y
 * el 17/09/2026 la cuenta se quedó sin lecturas. Ahora se busca la foto con el
 * índice de la casa (`idx_fotos_propiedad`, ~17 filas) y se actualiza por `id`.
 * Comprobar con EXPLAIN QUERY PLAN antes de cambiar esta consulta.
 */
function aplicarEnD1(subidas) {
  if (!subidas.length) return;
  ejecutarSql(
    subidas
      .map(
        (s) =>
          `UPDATE fotos SET public_id = ${sql(s.public_id)}, ancho = COALESCE(${entero(s.ancho)}, ancho), alto = COALESCE(${entero(s.alto)}, alto)` +
          ` WHERE id = (SELECT f.id FROM fotos f INDEXED BY idx_fotos_propiedad` +
          ` WHERE f.propiedad_id = (SELECT id FROM propiedades WHERE clave = ${sql(s.clave)})` +
          ` AND f.url_origen = ${sql(s.url_origen)} AND f.public_id IS NULL);`,
      )
      .join("\n"),
    { remoto },
  );
}

// ─── Migración ──────────────────────────────────────────────────

mkdirSync(GENERADO, { recursive: true });
const registro = leerRegistro();
const porMigrar = consultar(
  `SELECT p.clave, f.url_origen FROM fotos f JOIN propiedades p ON p.id = f.propiedad_id
    WHERE f.public_id IS NULL AND f.url_origen IS NOT NULL
    ORDER BY p.clave, f.orden${limite ? ` LIMIT ${limite}` : ""};`,
  { remoto },
);
const delRegistro = [];
const porSubir = [];
for (const foto of porMigrar) {
  const previa = registro.get(foto.url_origen);
  if (previa?.public_id.startsWith(`${carpetaDe(foto.clave)}/`)) delRegistro.push({ ...previa, clave: foto.clave });
  else porSubir.push(foto);
}

console.log(
  `D1 ${destino}: ${porMigrar.length} fotos siguen en WordPress${limite ? ` (tope --limite ${limite})` : ""}` +
    ` · ${delRegistro.length} ya subidas según el registro · ${porSubir.length} por subir a ${NUBE}.`,
);
if (values.seco) {
  for (const foto of porSubir.slice(0, 3)) console.log(`  ${foto.url_origen}\n    → ${carpetaDe(foto.clave)}/${sufijoDe(foto.url_origen)}`);
  console.log("En seco: no se subió nada ni se escribió en la D1.");
  process.exit(0);
}

for (let i = 0; i < delRegistro.length; i += LOTE) aplicarEnD1(delRegistro.slice(i, i + LOTE));

const cuenta = { nuevas: 0, existentes: 0, bytesNuevos: 0 };
const fallidas = [];
const desdeRespaldo = [];
const detalle = porSubir.length <= 30;
let motivoDeParo = null;
let fallosSeguidos = 0;

async function enParalelo(lista, tarea) {
  let siguiente = 0;
  const trabajador = async () => {
    while (!motivoDeParo && siguiente < lista.length) await tarea(lista[siguiente++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrencia, lista.length) }, trabajador));
}

const inicio = Date.now();
for (let i = 0; i < porSubir.length && !motivoDeParo; i += LOTE) {
  const buenas = [];
  await enParalelo(porSubir.slice(i, i + LOTE), async (foto) => {
    try {
      const subida = await subirConRespaldo(foto);
      anotar(subida);
      buenas.push(subida);
      fallosSeguidos = 0;
      if (subida.existente) cuenta.existentes++;
      else {
        cuenta.nuevas++;
        cuenta.bytesNuevos += subida.bytes;
      }
      if (subida.fuente) desdeRespaldo.push(`${foto.clave} · ${foto.url_origen}\n    → ${subida.fuente} (${subida.ancho}×${subida.alto})`);
      if (detalle) {
        const origen = subida.fuente ? " · original dañado: se subió su tamaño intermedio" : "";
        console.log(`  ✔ ${subida.public_id} · ${subida.ancho}×${subida.alto} · ${Math.round(subida.bytes / 1024)} KB · ${subida.existente ? "ya estaba" : "nueva"}${origen}`);
      }
    } catch (error) {
      anotar({ clave: foto.clave, url_origen: foto.url_origen, estado: error.estado, error: error.message });
      fallidas.push(`${foto.clave} · ${foto.url_origen}\n    → ${error.message}`);
      if (detalle) console.log(`  ✖ ${foto.clave} · ${foto.url_origen} → ${error.message}`);
      if (error.fatal) motivoDeParo ??= error.message;
      if (++fallosSeguidos >= FALLOS_SEGUIDOS_PARA_PARAR) motivoDeParo ??= `${FALLOS_SEGUIDOS_PARA_PARAR} fallos seguidos (el primero de la lista dice por qué)`;
    }
  });
  aplicarEnD1(buenas);
  const minutos = ((Date.now() - inicio) / 60_000).toFixed(1);
  console.log(
    `  ${Math.min(i + LOTE, porSubir.length)}/${porSubir.length} · nuevas ${cuenta.nuevas} · ya estaban ${cuenta.existentes}` +
      ` · fallidas ${fallidas.length} · ${mb(cuenta.bytesNuevos)} MB subidos · ${minutos} min`,
  );
}

const quedan = consultar("SELECT COUNT(*) AS n FROM fotos WHERE public_id IS NULL AND url_origen IS NOT NULL;", { remoto })[0]?.n;
const enRegistro = [...leerRegistro().values()];
const bytesEnRegistro = enRegistro.reduce((suma, e) => suma + (e.bytes ?? 0), 0);
console.log(
  `\nD1 ${destino}: ${cuenta.nuevas} fotos nuevas en Cloudinary (${mb(cuenta.bytesNuevos)} MB) · ${cuenta.existentes} ya estaban` +
    ` · ${delRegistro.length} tomadas del registro · ${fallidas.length} fallidas.`,
);
console.log(
  `Registro: ${enRegistro.length} fotos en ${NUBE}, ${mb(bytesEnRegistro)} MB` +
    ` (≈ ${(bytesEnRegistro / 1024 ** 3).toFixed(2)} créditos de almacenamiento al mes).`,
);
console.log(`Siguen en WordPress en la D1 ${destino}: ${quedan}.`);
if (desdeRespaldo.length) {
  console.log(`\nOriginal dañado en WordPress; se subió el tamaño intermedio más grande que estaba sano:\n${desdeRespaldo.join("\n")}`);
}
if (fallidas.length) console.log(`\nFallidas:\n${fallidas.join("\n")}`);
if (motivoDeParo) console.error(`\nSE DETUVO: ${motivoDeParo}`);
process.exit(motivoDeParo || fallidas.length ? 1 : 0);
