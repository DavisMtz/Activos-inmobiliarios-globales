#!/usr/bin/env node
/**
 * Verificación de F2 contra la app CORRIENDO (PLAN §15, «listo cuando»).
 *
 *   node scripts/verificar-f2.mjs --base http://localhost:5180 --local
 *   node scripts/verificar-f2.mjs --base https://activos-inmobiliarios.logidma.workers.dev --remote
 *
 * Cubre los criterios 1, 2, 3, 4, 6, 7, 8 y 9. El 5 (Lighthouse) se mide
 * aparte, y el movimiento con `verificar-movimiento.mjs`.
 *
 * La regla de la comprobación 2: el número que dice la API se compara con un
 * `COUNT(*)` **escrito a mano aquí**, no derivado del mismo código que lo
 * calcula. Si los dos salieran del mismo sitio, la prueba solo diría que el
 * código es igual a sí mismo.
 */
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consultar, ejecutarSql, texto } from "./lib/d1.mjs";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:5180" },
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
  },
});
if (values.local === values.remote) {
  console.error("Indica exactamente uno: --local o --remote.");
  process.exit(1);
}
const remoto = values.remote;
const BASE = values.base.replace(/\/+$/, "");
const opciones = { remoto };

const resultados = [];
function comprobar(nombre, condicion, detalle = "") {
  resultados.push({ nombre, ok: Boolean(condicion) });
  console.log(`${condicion ? "  ✔" : "  ✖"} ${nombre}${!condicion && detalle ? `\n      → ${detalle}` : ""}`);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** React separa textos contiguos con <!-- --> en el HTML del servidor. */
const limpiar = (html) => html.replaceAll("<!-- -->", "");

async function pedirHtml(ruta) {
  const r = await fetch(BASE + ruta, { redirect: "manual" });
  return { estado: r.status, cabeceras: r.headers, html: limpiar(await r.text()) };
}

async function pedirJson(ruta) {
  const r = await fetch(BASE + ruta);
  return { estado: r.status, datos: r.status === 200 ? await r.json() : null };
}

/** Las casas que el sitio ofrece: las mismas que usa `ESTADOS_EN_LISTADO`. */
const VISIBLES = "p.eliminada_en IS NULL AND p.estado IN ('publicada','apartada')";

console.log(`\nVerificando F2 contra ${BASE} (${remoto ? "D1 remota" : "D1 local"})\n`);

// ─── 1. La ficha llega completa sin JavaScript ────────────────────
console.log("1. La ficha, sin JavaScript");
const [casa] = consultar(
  `SELECT p.slug, p.clave, p.titulo, p.precio FROM propiedades p WHERE ${VISIBLES} AND p.precio IS NOT NULL ORDER BY p.id LIMIT 1;`,
  opciones,
);
const ficha = await pedirHtml(`/propiedades/${casa.slug}`);
comprobar("responde 200", ficha.estado === 200, `estado ${ficha.estado}`);
comprobar("trae el título de la casa", ficha.html.includes(casa.titulo));
comprobar("trae la clave", ficha.html.includes(casa.clave));
const precioTexto = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(casa.precio);
comprobar(`trae el precio (${precioTexto})`, ficha.html.includes(precioTexto));
const og = ficha.html.match(/property="og:image" content="([^"]+)"/)?.[1] ?? "";
comprobar("trae og:image en JPG 1200x630", og.includes("w_1200,h_630,f_jpg"), og || "sin og:image");
const noExiste = await pedirHtml("/propiedades/esta-casa-no-existe");
comprobar("una ficha inexistente da 404", noExiste.estado === 404, `estado ${noExiste.estado}`);

// ─── 2. Cinco combinaciones de filtros contra SQL escrito a mano ──
console.log("\n2. Los filtros cuentan lo mismo que la base");
const COMBINACIONES = [
  {
    nombre: "casas en venta",
    consulta: "tipo=casa&operacion=venta",
    sql: `SELECT COUNT(*) n FROM propiedades p WHERE ${VISIBLES} AND p.tipo = 'casa' AND p.operacion IN ('venta','venta_renta');`,
  },
  {
    nombre: "en renta (incluye venta_renta)",
    consulta: "operacion=renta",
    sql: `SELECT COUNT(*) n FROM propiedades p WHERE ${VISIBLES} AND p.operacion IN ('renta','venta_renta');`,
  },
  {
    nombre: "4 recámaras o más",
    consulta: "recamaras=4",
    sql: `SELECT COUNT(*) n FROM propiedades p WHERE ${VISIBLES} AND p.recamaras >= 4;`,
  },
  {
    nombre: "entre 3 y 5 millones",
    consulta: "precio_min=3000000&precio_max=5000000",
    sql: `SELECT COUNT(*) n FROM propiedades p WHERE ${VISIBLES} AND p.precio >= 3000000 AND p.precio <= 5000000;`,
  },
  {
    nombre: "colonia Altozano",
    consulta: "zona=morelia-altozano",
    sql: `SELECT COUNT(*) n FROM propiedades p JOIN zonas z ON z.id = p.zona_id WHERE ${VISIBLES} AND z.slug = 'morelia-altozano';`,
  },
];

for (const combinacion of COMBINACIONES) {
  const api = await pedirJson(`/api/propiedades?${combinacion.consulta}`);
  const [fila] = consultar(combinacion.sql, opciones);
  const enBase = Number(fila.n);
  comprobar(
    `${combinacion.nombre}: la API dice ${api.datos?.total} y la base ${enBase}`,
    api.estado === 200 && api.datos?.total === enBase,
    `?${combinacion.consulta}`,
  );
}

// ─── 3. El filtro de precio llega al máximo real ──────────────────
console.log("\n3. El precio llega hasta arriba (el filtro viejo topaba en un millón)");
const [tope] = consultar(
  `SELECT MAX(p.precio) maximo FROM propiedades p WHERE ${VISIBLES} AND p.operacion IN ('venta','venta_renta');`,
  opciones,
);
const maximo = Number(tope.maximo);
const rangos = await pedirJson("/api/propiedades");
comprobar(
  `el rango que publica la API es el real (${maximo.toLocaleString("es-MX")})`,
  rangos.datos?.rangos?.venta?.max === maximo,
  `API: ${rangos.datos?.rangos?.venta?.max}`,
);
const conTope = await pedirJson(`/api/propiedades?operacion=venta&precio_max=${maximo}&orden=precio_desc`);
comprobar(
  "filtrar «hasta el máximo» incluye la casa más cara",
  conTope.datos?.items?.[0]?.precio === maximo,
  `la primera trae ${conTope.datos?.items?.[0]?.precio}`,
);
const [todasEnVenta] = consultar(
  `SELECT COUNT(*) n FROM propiedades p WHERE ${VISIBLES} AND p.operacion IN ('venta','venta_renta') AND p.precio IS NOT NULL;`,
  opciones,
);
comprobar(
  "y no deja fuera ninguna",
  conTope.datos?.total === Number(todasEnVenta.n),
  `API ${conTope.datos?.total} vs base ${todasEnVenta.n}`,
);

// ─── 6. El WhatsApp de la ficha trae ESA casa ─────────────────────
console.log("\n6. El enlace de WhatsApp lleva la casa correcta");
const enlace = ficha.html.match(/href="(https:\/\/wa\.me\/[^"]+)"/)?.[1] ?? "";
const textoWa = enlace ? decodeURIComponent(new URL(enlace.replaceAll("&amp;", "&")).searchParams.get("text") ?? "") : "";
comprobar("hay enlace de WhatsApp", Boolean(enlace), "no se encontró wa.me");
comprobar("el texto trae el título", textoWa.includes(casa.titulo), textoWa);
comprobar("el texto trae la clave", textoWa.includes(casa.clave), textoWa);
comprobar("el texto trae la URL de la ficha", textoWa.includes(`/propiedades/${casa.slug}`), textoWa);

// ─── 7. «Me interesa» crea el prospecto con su casa ───────────────
console.log("\n7. «Me interesa» guarda el prospecto con su propiedad");
const marca = `Prueba F2 ${Date.now()}`;
const formulario = new URLSearchParams({
  nombre: marca,
  telefono: "4431234567",
  mensaje: "Verificación automatizada de F2",
  acepto: "on",
});
const envio = await fetch(`${BASE}/propiedades/${casa.slug}`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: formulario.toString(),
});
comprobar("el formulario responde 200 sin JavaScript", envio.status === 200, `estado ${envio.status}`);
const guardados = consultar(
  `SELECT pr.id, p.clave FROM prospectos pr LEFT JOIN propiedades p ON p.id = pr.propiedad_id WHERE pr.nombre = ${texto(marca)};`,
  opciones,
);
comprobar("quedó guardado con la clave de esa casa", guardados.length === 1 && guardados[0].clave === casa.clave, JSON.stringify(guardados));

// El campo trampa: se contesta que sí, pero no se guarda nada.
const marcaRobot = `Robot F2 ${Date.now()}`;
await fetch(`${BASE}/propiedades/${casa.slug}`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ nombre: marcaRobot, telefono: "4431234567", acepto: "on", empresa: "spam" }).toString(),
});
const robots = consultar(`SELECT COUNT(*) n FROM prospectos WHERE nombre = ${texto(marcaRobot)};`, opciones);
comprobar("el campo trampa no guarda nada", Number(robots[0].n) === 0);
ejecutarSql(`DELETE FROM prospectos WHERE nombre IN (${texto(marca)}, ${texto(marcaRobot)});`, opciones);

// ─── 8. Las URLs viejas ───────────────────────────────────────────
console.log("\n8. Las URLs viejas van a donde deben");
const REDIRECCIONES = [
  [`/properties/${casa.slug}/`, `/propiedades/${casa.slug}`],
  ["/properties/", "/propiedades"],
  ["/purpose/venta", "/propiedades?operacion=venta"],
  ["/property-type/casa", "/propiedades?tipo=casa"],
  ["/location/morelia", "/propiedades?ciudad=morelia"],
  ["/acerca/", "/nosotros"],
  ["/contact-us/", "/contacto"],
];
for (const [vieja, esperada] of REDIRECCIONES) {
  const r = await pedirHtml(vieja);
  const destino = (r.cabeceras.get("location") ?? "").replace(BASE, "");
  comprobar(`${vieja} → ${esperada}`, r.estado === 301 && destino === esperada, `${r.estado} → ${destino}`);
}
const PLANTILLA = ["/home", "/faq", "/agents", "/single-agent", "/inicio-sesion", "/registration", "/account", "/map-listing"];
let plantillaOk = 0;
for (const ruta of PLANTILLA) {
  const r = await pedirHtml(ruta);
  if (r.estado === 301 && (r.cabeceras.get("location") ?? "").replace(BASE, "") === "/") plantillaOk++;
}
comprobar(`las ${PLANTILLA.length} páginas de la plantilla Findero dan 301 a /`, plantillaOk === PLANTILLA.length, `${plantillaOk} de ${PLANTILLA.length}`);

// ─── 9. Ni plantilla, ni Lorem ipsum, ni inglés ───────────────────
console.log("\n9. Nada de plantilla ni de inglés");
const RUTAS = ["/", "/propiedades", `/propiedades/${casa.slug}`, "/servicios", "/nosotros", "/contacto", "/aviso-de-privacidad"];
const PROHIBIDO = ["lorem ipsum", "james oliver", "findero", "property id", "filter results", "bedrooms", "connect with us", "marc consultores", "caulquiera", "$root.options"];
const sucias = [];
for (const ruta of RUTAS) {
  const { html, estado } = await pedirHtml(ruta);
  if (estado !== 200) sucias.push(`${ruta} respondió ${estado}`);
  for (const palabra of PROHIBIDO) if (html.toLowerCase().includes(palabra)) sucias.push(`${ruta}: «${palabra}»`);
}
comprobar(`las ${RUTAS.length} rutas públicas están limpias`, sucias.length === 0, sucias.join("; "));

// ─── 4. A 390 px: sin desbordes y el botón no tapa el precio ──────
console.log("\n4. En el celular (390 px)");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const perfil = mkdtempSync(join(tmpdir(), "aig-f2-"));
const puerto = 9500 + Math.floor(Math.random() * 400);
const chrome = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "about:blank"],
  { stdio: "ignore" },
);
try {
  let objetivos;
  for (let i = 0; i < 60; i++) {
    try {
      objetivos = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json();
      if (objetivos.some((o) => o.type === "page")) break;
    } catch {}
    await esperar(200);
  }
  const ws = new WebSocket(objetivos.find((o) => o.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pendientes = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendientes.has(m.id)) {
      pendientes.get(m.id)(m);
      pendientes.delete(m.id);
    }
  });
  const cdp = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      pendientes.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await cdp("Page.enable");
  // Abrir la ficha en producción contaría como visita real en las métricas.
  await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["*/api/eventos*"] });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  for (const ruta of ["/", "/propiedades", `/propiedades/${casa.slug}`]) {
    await cdp("Page.navigate", { url: BASE + ruta });
    await esperar(3000);
    const sonda = `(() => {
      const raiz = document.documentElement;
      const ancho = raiz.clientWidth;
      // Se saltan dos familias de falsos positivos: lo que cuelga de un
      // position fixed (un cajon cerrado vive fuera de la pantalla) y lo que
      // cuelga de un contenedor con desplazamiento propio (la tira de
      // miniaturas SE TIENE que salir: para eso es una tira).
      // Sin comillas invertidas: esto vive dentro de un literal de plantilla.
      const exento = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const e = getComputedStyle(n);
          if (e.position === 'fixed') return true;
          if (n !== el && (e.overflowX === 'auto' || e.overflowX === 'scroll')) return true;
        }
        return false;
      };
      const fuera = [...document.querySelectorAll('body *')].filter((el) => {
        const c = el.getBoundingClientRect();
        if (c.width === 0 || c.height === 0) return false;
        if (exento(el)) return false;
        return c.right > ancho + 1;
      });
      const desborda = fuera.length;
      const culpables = fuera.slice(0, 5).map((el) => (el.getAttribute('class') || el.tagName).slice(0, 60));
      // El botón flotante de WhatsApp contra TODO lo que enseña un precio.
      const boton = document.querySelector('a[aria-label*="WhatsApp"]');
      const caja = boton ? boton.getBoundingClientRect() : null;
      const precios = [...document.querySelectorAll('.tabular-nums')].filter((el) => /\\$/.test(el.textContent || ''));
      const tapados = caja ? precios.filter((el) => {
        const p = el.getBoundingClientRect();
        return p.width > 0 && p.height > 0 && !(p.right < caja.left || p.left > caja.right || p.bottom < caja.top || p.top > caja.bottom);
      }).length : 0;
      return JSON.stringify({ ancho, scroll: raiz.scrollWidth, desborda, culpables, precios: precios.length, tapados, hayBoton: Boolean(boton) });
    })()`;
    const r = await cdp("Runtime.evaluate", { expression: sonda, returnByValue: true });
    const m = JSON.parse(r.result?.result?.value ?? "{}");
    comprobar(`${ruta}: sin desplazamiento horizontal`, m.scroll <= m.ancho + 1, `ancho ${m.ancho}, scroll ${m.scroll}`);
    comprobar(`${ruta}: nada se sale del ancho`, m.desborda === 0, `${m.desborda} elementos: ${(m.culpables ?? []).join(" | ")}`);
    comprobar(
      `${ruta}: el botón de WhatsApp no tapa ningún precio (${m.precios} precios)`,
      m.tapados === 0,
      `${m.tapados} tapados`,
    );
  }
  ws.close();
} finally {
  chrome.kill();
}

// ─── Resumen ──────────────────────────────────────────────────────
const fallidas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallidas.length} de ${resultados.length} comprobaciones pasaron.`);
if (fallidas.length) {
  console.log("Fallaron:\n" + fallidas.map((f) => `  - ${f.nombre}`).join("\n"));
  process.exit(1);
}
