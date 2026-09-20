#!/usr/bin/env node
/**
 * Recorrido del listado con «scroll infinito» (`app/components/publico/lista-infinita.tsx`).
 *
 *   node scripts/verificar-listado.mjs [--base http://localhost:4180]
 *
 * Con Chrome sin interfaz y eventos de verdad (ratón, teclado, scroll) por
 * CDP. Nunca registra visitas: `/api/eventos` va bloqueado, porque abrir una
 * ficha en producción contaría en las métricas del panel.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { base: { type: "string", default: "http://localhost:4180" } } });
const BASE = values.base.replace(/\/+$/, "");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const SIN_EVENTOS = ["*/api/eventos*"];

const resultados = [];
function comprobar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok });
  console.log(`  ${ok ? "✔" : "✖"} ${nombre}${!ok && detalle ? ` — ${detalle}` : ""}`);
}

// ─── 1. Sin JavaScript: el HTML del servidor ──────────────────────
/** Las fichas que enlaza la lista del listado (y no las de otras partes de la página). */
function fichasDeLaLista(html) {
  const inicio = html.indexOf("data-animar-lista");
  const fin = html.indexOf("</ul>", inicio);
  if (inicio < 0 || fin < 0) return [];
  return [...html.slice(inicio, fin).matchAll(/href="(\/propiedades\/[^"?#]+)"/g)].map((m) => m[1]);
}

console.log("\n1. Sin JavaScript");
const html1 = await (await fetch(`${BASE}/propiedades`)).text();
const html2 = await (await fetch(`${BASE}/propiedades?pagina=2`)).text();
const pagina1 = fichasDeLaLista(html1);
const pagina2 = fichasDeLaLista(html2);
comprobar("la página 1 trae el enlace «Siguiente» de verdad (rel=next, ?pagina=2)", /href="\/propiedades\?pagina=2"[^>]*rel="next"|rel="next"[^>]*href="\/propiedades\?pagina=2"/.test(html1));
comprobar(
  "?pagina=2 trae 12 casas distintas, ninguna de la página 1",
  pagina2.length === 12 && new Set(pagina2).size === 12 && !pagina2.some((f) => pagina1.includes(f)),
  `${pagina2.length} en la 2, ${pagina1.length} en la 1`,
);

// ─── Chrome ───────────────────────────────────────────────────────
const perfil = mkdtempSync(join(tmpdir(), "aig-lis-"));
const puerto = 9900 + Math.floor(Math.random() * 90);
const chrome = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "about:blank"],
  { stdio: "ignore" },
);
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
const errores = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendientes.has(m.id)) {
    pendientes.get(m.id)(m);
    pendientes.delete(m.id);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errores.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
});
const cdp = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id;
    pendientes.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const ev = async (expresion) =>
  (await cdp("Runtime.evaluate", { expression: expresion, returnByValue: true, awaitPromise: true })).result?.result?.value;

const ESTADO = `JSON.stringify((() => {
  const tarjetas = [...document.querySelectorAll('[data-animar-lista] > li a[href^="/propiedades/"]')].map((a) => a.getAttribute('href'));
  const mas = document.querySelector('nav[aria-label="Más propiedades"]');
  return {
    tarjetas: tarjetas.length,
    distintas: new Set(tarjetas).size,
    url: location.pathname + location.search,
    mostrando: mas?.querySelector('[aria-live]')?.textContent?.trim() ?? null,
    boton: mas?.querySelector('a[rel="next"]')?.textContent?.trim() ?? null,
    final: mas?.querySelector('p.font-display')?.textContent?.trim() ?? null,
    paginacion: Boolean(document.querySelector('nav[aria-label="Páginas de resultados"]')),
    y: Math.round(scrollY),
    pedidas: performance.getEntriesByType('resource').filter((r) => r.name.includes('/api/propiedades')).length,
  };
})())`;
const leer = async () => JSON.parse(await ev(ESTADO));
async function esperarTarjetas(minimo, ms = 6000) {
  const hasta = Date.now() + ms;
  let e = await leer();
  while (e.tarjetas < minimo && Date.now() < hasta) {
    await esperar(150);
    e = await leer();
  }
  return e;
}
const alFondo = () => ev("scrollTo(0, document.documentElement.scrollHeight)");
async function abrir(ruta) {
  await cdp("Page.navigate", { url: "about:blank" });
  await cdp("Page.navigate", { url: BASE + ruta });
  await esperar(2500);
}
/** El migajón de la ficha: «← Todas las propiedades» o «← Volver a los resultados». */
const MIGAJON = `[...document.querySelectorAll('a')].find((a) => a.textContent.startsWith('←'))`;
async function clicEn(expresionDeCaja) {
  const { x, y } = JSON.parse(await ev(`JSON.stringify((() => { const r = (${expresionDeCaja}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40) }; })())`));
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: SIN_EVENTOS });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });

  // ─── 2. Carga al bajar ──────────────────────────────────────────
  console.log("\n2. Carga al bajar (1366×768)");
  await abrir("/propiedades");
  let e = await leer();
  const total = Number(e.mostrando?.match(/de (\d+)/)?.[1] ?? 0);
  comprobar(
    "con JavaScript: 12 casas, «Mostrando 12 de N» y el botón en lugar de la paginación",
    e.tarjetas === 12 && /^Mostrando 12 de \d+$/.test(e.mostrando ?? "") && e.boton === "Ver más propiedades" && !e.paginacion,
    JSON.stringify(e),
  );
  await alFondo();
  e = await esperarTarjetas(24);
  comprobar("al bajar llegan 12 más, sin repetir ninguna", e.tarjetas === 24 && e.distintas === 24, `${e.tarjetas} tarjetas, ${e.distintas} distintas`);
  comprobar("la URL no cambia al cargar", e.url === "/propiedades", e.url);
  comprobar("una sola petición a la API por tanda", e.pedidas === 1, `${e.pedidas} peticiones`);
  comprobar("el contador dice «Mostrando 24 de N»", e.mostrando === `Mostrando 24 de ${total}`, String(e.mostrando));

  // ─── 3. Volver atrás desde una ficha ────────────────────────────
  console.log("\n3. Volver atrás desde una ficha");
  await ev(`document.querySelectorAll('[data-animar-lista] > li')[19].scrollIntoView({ block: 'center' })`);
  await esperar(800);
  const antes = JSON.parse(
    await ev(`JSON.stringify({ y: Math.round(scrollY), top: Math.round(document.querySelectorAll('[data-animar-lista] > li')[19].getBoundingClientRect().top), href: document.querySelectorAll('[data-animar-lista] > li a')[19].getAttribute('href') })`),
  );
  await clicEn(`document.querySelectorAll('[data-animar-lista] > li a')[19]`);
  for (let i = 0; i < 40 && (await ev("location.pathname")) === "/propiedades"; i++) await esperar(150);
  const enFicha = await ev("location.pathname");
  await esperar(1200);
  await ev("history.back()");
  await esperar(2000);
  e = await leer();
  const despues = JSON.parse(
    await ev(`JSON.stringify({ top: Math.round(document.querySelectorAll('[data-animar-lista] > li')[19]?.getBoundingClientRect().top ?? -1), href: document.querySelectorAll('[data-animar-lista] > li a')[19]?.getAttribute('href') })`),
  );
  comprobar("se abrió la ficha de la casa 20", enFicha === antes.href, `${enFicha} vs ${antes.href}`);
  comprobar("al volver siguen las 24 casas", e.tarjetas >= 24 && e.distintas === e.tarjetas, `${e.tarjetas} tarjetas`);
  comprobar(
    "y la casa 20 queda donde estaba",
    despues.href === antes.href && Math.abs(e.y - antes.y) <= 60 && Math.abs(despues.top - antes.top) <= 60,
    `scroll ${antes.y} → ${e.y}; casa 20 a ${antes.top} → ${despues.top}`,
  );

  // El botón «atrás» del navegador SIEMPRE funcionó; el que se perdía era el
  // migajón de la ficha, que era un enlace nuevo a `/propiedades` (medido el
  // 19/09/2026: 36 casas en `y=3539` → 12 casas en `y=0`, y sin los filtros).
  console.log("   …y con el migajón de la ficha, no con el botón del navegador");
  await abrir("/propiedades?tipo=casa");
  await alFondo();
  await esperarTarjetas(24);
  await ev(`document.querySelectorAll('[data-animar-lista] > li')[19].scrollIntoView({ block: 'center' })`);
  await esperar(800);
  const antesDelMigajon = await leer();
  await clicEn(`document.querySelectorAll('[data-animar-lista] > li a')[19]`);
  for (let i = 0; i < 40 && !(await ev("location.pathname")).startsWith("/propiedades/"); i++) await esperar(150);
  await esperar(1200);
  const migajon = JSON.parse(
    await ev(`JSON.stringify((() => { const a = ${MIGAJON}; return a ? { href: a.getAttribute('href'), texto: a.textContent.trim() } : null; })())`),
  );
  comprobar(
    "el migajón guarda la búsqueda en su `href` (otra pestaña, sin JavaScript)",
    migajon?.href === "/propiedades?tipo=casa" && migajon?.texto === "← Volver a los resultados",
    JSON.stringify(migajon),
  );
  await clicEn(MIGAJON);
  await esperar(2000);
  e = await leer();
  comprobar(
    "al pulsarlo: el catálogo filtrado, con sus casas y en su lugar",
    e.url === "/propiedades?tipo=casa" &&
      e.tarjetas >= antesDelMigajon.tarjetas &&
      Math.abs(e.y - antesDelMigajon.y) <= 60,
    `${e.url}; ${antesDelMigajon.tarjetas} → ${e.tarjetas} casas; scroll ${antesDelMigajon.y} → ${e.y}`,
  );

  // Dejar los datos en «Me interesa» REEMPLAZA la entrada del historial, y una
  // entrada nueva nace sin `state`: sin pasárselo al `<Form>`, justo el que más
  // interés mostraba era el que perdía el camino de vuelta. El campo trampa
  // («empresa») hace que la acción conteste que sí SIN escribir en la base ni
  // gastar el limitador, así que esta prueba no deja un prospecto inventado.
  const antesDelFormulario = e;
  await clicEn(`document.querySelectorAll('[data-animar-lista] > li a')[19]`);
  for (let i = 0; i < 40 && !(await ev("location.pathname")).startsWith("/propiedades/"); i++) await esperar(150);
  await esperar(1200);
  await ev(`(() => {
    const f = document.querySelector('form[method="post"]');
    const poner = (n, v) => { const c = f.elements[n]; Object.getOwnPropertyDescriptor(c.constructor.prototype, 'value').set.call(c, v); c.dispatchEvent(new Event('input', { bubbles: true })); };
    poner('nombre', 'Prueba de regreso');
    poner('telefono', '4431112233');
    poner('empresa', 'campo trampa: no se guarda');
    f.elements['acepto'].click();
    f.scrollIntoView({ block: 'center' });
  })()`);
  await esperar(500);
  await clicEn(`document.querySelector('form[method="post"] button[type="submit"]')`);
  await esperar(2500);
  const seEnvio = await ev(`document.body.textContent.includes('ya tenemos tu mensaje')`);
  await ev("scrollTo(0, 0)");
  await esperar(400);
  await clicEn(MIGAJON);
  await esperar(2000);
  e = await leer();
  comprobar(
    "tras dejar los datos en «Me interesa», el migajón sigue sabiendo volver",
    seEnvio && e.url === "/propiedades?tipo=casa" && Math.abs(e.y - antesDelFormulario.y) <= 60,
    `enviado: ${seEnvio}; ${e.url}; scroll ${antesDelFormulario.y} → ${e.y}`,
  );

  // ─── 4. Recargar ────────────────────────────────────────────────
  console.log("\n4. Recargar con la lista larga");
  // Desde el catálogo entero otra vez: lo de arriba dejó puesto un filtro.
  await abrir("/propiedades");
  await alFondo();
  await esperarTarjetas(24);
  await alFondo();
  e = await esperarTarjetas(36);
  await ev(`document.querySelectorAll('[data-animar-lista] > li')[30].scrollIntoView({ block: 'center' })`);
  await esperar(800);
  const antesDeRecargar = JSON.parse(await ev(`JSON.stringify({ y: Math.round(scrollY), n: document.querySelectorAll('[data-animar-lista] > li').length })`));
  await cdp("Page.reload");
  await esperar(3000);
  e = await leer();
  comprobar(
    "al recargar vuelven las casas cargadas y el mismo lugar",
    e.tarjetas >= antesDeRecargar.n && Math.abs(e.y - antesDeRecargar.y) <= 80,
    `${antesDeRecargar.n} → ${e.tarjetas} tarjetas; scroll ${antesDeRecargar.y} → ${e.y}`,
  );

  // ─── 5. Otro orden: la lista empieza de nuevo ──────────────────
  console.log("\n5. Cambiar el orden");
  await ev(`(() => { const s = document.querySelector('select[name="orden"]'); s.value = 'precio_asc'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  for (let i = 0; i < 40 && !(await ev("location.search")).includes("orden=precio_asc"); i++) await esperar(150);
  await esperar(1200);
  e = await leer();
  comprobar("con otro orden vuelve a 12 casas", e.url.includes("orden=precio_asc") && e.tarjetas === 12, JSON.stringify(e));

  // ─── 6. Hasta el final ──────────────────────────────────────────
  console.log("\n6. Hasta el final");
  await abrir("/propiedades?tipo=departamento");
  const deptos = await leer();
  const cuantos = Number(deptos.mostrando?.match(/de (\d+)/)?.[1] ?? 0);
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    await alFondo();
    await esperar(1200);
  }
  e = await leer();
  const pedidasAlFinal = e.pedidas;
  await alFondo();
  await esperar(2000);
  const luego = await leer();
  comprobar(
    `con ${cuantos} departamentos: todas a la vista y el mensaje final`,
    cuantos > 12 && e.tarjetas === cuantos && e.final === `Ya viste las ${cuantos} propiedades` && e.boton === null,
    JSON.stringify(e),
  );
  comprobar("al final ya no se pide nada más", luego.pedidas === pedidasAlFinal, `${pedidasAlFinal} → ${luego.pedidas}`);

  // ─── 7. Si falla la red ─────────────────────────────────────────
  console.log("\n7. Si falla la red");
  await cdp("Network.setBlockedURLs", { urls: [...SIN_EVENTOS, "*/api/propiedades*"] });
  await abrir("/propiedades");
  await alFondo();
  await esperar(1500);
  e = await leer();
  comprobar("sin red, el botón dice «Reintentar» y la lista sigue entera", e.boton === "No se pudieron cargar. Reintentar" && e.tarjetas === 12, JSON.stringify(e));
  await cdp("Network.setBlockedURLs", { urls: SIN_EVENTOS });
  await clicEn(`document.querySelector('nav[aria-label="Más propiedades"] a[rel="next"]')`);
  e = await esperarTarjetas(24);
  // «Al menos»: con la vista en la primera casa nueva, la siguiente tanda
  // puede quedar a menos de una pantalla y cargarse sola.
  comprobar("«Reintentar» las trae", e.tarjetas >= 24 && e.distintas === e.tarjetas && e.url === "/propiedades", JSON.stringify(e));

  // ─── 8. Teclado ─────────────────────────────────────────────────
  console.log("\n8. Teclado");
  await abrir("/propiedades");
  // Sin desplazar la página: si el botón se acercara, se cargaría solo.
  await ev(`document.querySelector('nav[aria-label="Más propiedades"] a[rel="next"]').focus({ preventScroll: true })`);
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  e = await esperarTarjetas(24);
  await esperar(300);
  const foco = await ev(`(() => { const li = document.activeElement?.closest('[data-animar-lista] > li'); return li ? [...li.parentElement.children].indexOf(li) : -1; })()`);
  comprobar("Enter en «Ver más» trae 12 y el foco pasa a la primera nueva", e.tarjetas >= 24 && foco === 12, `${e.tarjetas} tarjetas, foco en la ${foco}`);

  // ─── 9. Celular ─────────────────────────────────────────────────
  console.log("\n9. Celular (390×844)");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await abrir("/propiedades");
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    await alFondo();
    await esperar(1500);
  }
  e = await leer();
  const desborde = JSON.parse(
    await ev(`JSON.stringify((() => { const w = document.documentElement.clientWidth; const fijo = (el) => { for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true; return false; }; const fuera = [...document.querySelectorAll('main *')].filter((el) => { const c = el.getBoundingClientRect(); return c.width && c.right > w + 1 && !fijo(el); }).length; return { scroll: document.documentElement.scrollWidth - w, fuera }; })())`),
  );
  comprobar("carga al bajar con el dedo en la pantalla chica", e.tarjetas >= 36 && e.distintas === e.tarjetas, `${e.tarjetas} tarjetas`);
  comprobar("nada se sale del ancho con la lista larga", desborde.scroll === 0 && desborde.fuera === 0, JSON.stringify(desborde));

  // ─── 10. «Menos movimiento» ─────────────────────────────────────
  console.log("\n10. Con «menos movimiento»");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await abrir("/propiedades");
  await alFondo();
  e = await esperarTarjetas(24);
  comprobar("cargar no es movimiento: también carga", e.tarjetas === 24, `${e.tarjetas} tarjetas`);

  comprobar("sin errores en la consola", errores.length === 0, errores.slice(0, 3).join(" | "));
} finally {
  ws.close();
  chrome.kill();
}

const fallas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallas} de ${resultados.length} comprobaciones pasaron.`);
process.exit(fallas === 0 ? 0 : 1);
