#!/usr/bin/env node
/**
 * Recorrido de la vitrina de la portada (`app/components/publico/vitrina.tsx`):
 * la tarjeta de arriba que cambia de casa sola.
 *
 *   node scripts/verificar-vitrina.mjs [--base http://localhost:4180]
 *
 * Con Chrome sin interfaz y eventos de verdad (ratón, teclado y dedo por CDP),
 * no llamando funciones de la página: lo que se prueba es lo que la gente hace.
 * Tarda ~1.5 min porque espera ciclos reales de 7 s. `verificar:movimiento`
 * cubre aparte que nada quede invisible con y sin «menos movimiento».
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

const resultados = [];
function comprobar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok });
  console.log(`  ${ok ? "✔" : "✖"} ${nombre}${!ok && detalle ? ` — ${detalle}` : ""}`);
}

async function abrirChrome() {
  const perfil = mkdtempSync(join(tmpdir(), "aig-vit-"));
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
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  // El paso 8 abre una ficha: en producción eso contaría como una visita de
  // verdad en las métricas del panel. Aquí no se registra ningún evento.
  await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["*/api/eventos*"] });
  // Sin la bienvenida (sale una vez por pestaña): no es lo que se prueba.
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: "try{sessionStorage.setItem('aig:bienvenida','1')}catch(e){}" });
  return { cdp, ev, errores, cerrar: () => (ws.close(), chrome.kill()) };
}

// ─── Lo que se lee de la página ───────────────────────────────────
const ESTADO = `JSON.stringify((() => {
  const casas = [...document.querySelectorAll('[data-diapositiva]')];
  const activa = casas.find((c) => !c.inert);
  const relleno = activa ? document.querySelectorAll('[data-relleno]')[Number(activa.dataset.diapositiva)] : null;
  const m = relleno ? getComputedStyle(relleno).transform.match(/matrix\\(([^,]+)/) : null;
  const fila = document.querySelector('[aria-label="Elegir una casa"]')?.parentElement;
  return {
    indice: activa ? Number(activa.dataset.diapositiva) : -1,
    montadas: casas.length,
    vistas: casas.filter((c) => getComputedStyle(c).visibility === 'visible').length,
    enCambio: casas.some((c) => c.style.clipPath),
    llenado: m ? Number(m[1]) : 0,
    pausa: document.querySelector('[data-rotacion]')?.getAttribute('aria-label') ?? null,
    controles: fila ? getComputedStyle(fila).visibility : null,
    url: location.pathname,
  };
})())`;
const leer = async (ev) => JSON.parse(await ev(ESTADO));
const centro = (selector) =>
  `JSON.stringify((() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })())`;
async function enReposo(ev) {
  for (let i = 0; i < 40; i++) {
    const e = await leer(ev);
    if (!e.enCambio) return e;
    await esperar(150);
  }
  return leer(ev);
}
async function clic(cdp, ev, selector) {
  const { x, y } = JSON.parse(await ev(centro(selector)));
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
const alejarRaton = (cdp) => cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 400 });
const tab = async (cdp) => {
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
};
/** ¿Avanza la barra? Dos lecturas separadas por `ms`. */
async function avanza(ev, ms = 1500) {
  const a = (await leer(ev)).llenado;
  await esperar(ms);
  const b = (await leer(ev)).llenado;
  return { a, b, si: b > a + 0.02 };
}

let fallas = 0;
const navegador = await abrirChrome();
const { cdp, ev, errores } = navegador;

/**
 * La vitrina se DETIENE fuera de la pantalla, a proposito (WCAG y bateria).
 * Desde el 20/09/2026 la portada abre con el escenario, asi que la vitrina
 * nace casi dos pantallas abajo: sin esto el guion la mira quieta y cree que
 * esta rota. Se llama despues de cada carga de la portada.
 */
const alaVista = async (ev) => {
  await ev("document.querySelector('[aria-live]')?.scrollIntoView({ block: 'center' })");
  await esperar(1200);
};
try {
  // ─── 1. Sin JavaScript: la primera casa, como siempre ───────────
  console.log("\n1. Sin JavaScript (1366×768)");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await cdp("Emulation.setScriptExecutionDisabled", { value: true });
  await cdp("Page.navigate", { url: `${BASE}/` });
  await esperar(2500);
  let e = await leer(ev).catch(() => null);
  // Con los guiones apagados, `Runtime.evaluate` sí corre: lee el HTML del servidor.
  comprobar("el servidor pinta una sola casa, a la vista", e?.montadas === 1 && e?.vistas === 1, JSON.stringify(e));
  comprobar("los controles están reservados pero invisibles", e?.controles === "hidden", String(e?.controles));
  await cdp("Emulation.setScriptExecutionDisabled", { value: false });

  // ─── 2. Arranca sola, precargando de una en una ────────────────
  console.log("\n2. Con JavaScript");
  await cdp("Page.navigate", { url: "about:blank" });
  await cdp("Page.navigate", { url: `${BASE}/` });
  await esperar(3500);
  await alaVista(ev);
  e = await leer(ev);
  comprobar("salen los controles, con el botón de pausa", e.controles === "visible" && e.pausa?.startsWith("Pausar"), JSON.stringify(e));
  comprobar("solo hay dos casas montadas: la actual y la siguiente", e.montadas === 2, `${e.montadas} montadas`);
  const corre = await avanza(ev);
  comprobar("la barra de la casa se va llenando", corre.si, `${corre.a} → ${corre.b}`);
  for (let i = 0; i < 40 && (await leer(ev)).indice === 0; i++) await esperar(250);
  e = await enReposo(ev);
  comprobar("pasa sola a la segunda casa y queda entera", e.indice === 1 && e.vistas === 1, JSON.stringify(e));

  // ─── 3. El puntero encima la detiene ───────────────────────────
  console.log("\n3. Puntero encima");
  const tarjeta = JSON.parse(await ev(centro("[aria-live]")));
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: tarjeta.x, y: tarjeta.y });
  await esperar(2200); // si iba a media cortina, la termina antes de detenerse
  const quieta = await avanza(ev, 2000);
  comprobar("con el puntero encima la barra no avanza", !quieta.si, `${quieta.a} → ${quieta.b}`);
  await alejarRaton(cdp);
  const sigue = await avanza(ev);
  comprobar("al quitar el puntero sigue donde iba", sigue.si && sigue.a >= quieta.b - 0.01, `${sigue.a} → ${sigue.b}`);

  // ─── 4. El botón de pausa ───────────────────────────────────────
  console.log("\n4. Botón de pausa");
  await clic(cdp, ev, "[data-rotacion]");
  await alejarRaton(cdp);
  await esperar(2500);
  e = await leer(ev);
  const pausada = await avanza(ev, 2500);
  comprobar("la pausa la detiene y el botón dice «Reanudar»", e.pausa?.startsWith("Reanudar") && !pausada.si, `${e.pausa}; ${pausada.a} → ${pausada.b}`);
  await clic(cdp, ev, "[data-rotacion]");
  await alejarRaton(cdp);
  // El foco se queda en el botón tras el clic: aun así tiene que reanudar.
  const reanudada = await avanza(ev);
  comprobar("«Reanudar» la vuelve a mover", (await leer(ev)).pausa?.startsWith("Pausar") && reanudada.si, `${reanudada.a} → ${reanudada.b}`);

  // ─── 5. Elegir una casa ────────────────────────────────────────
  console.log("\n5. Elegir una casa");
  // Siempre una distinta de la que se ve (dos más adelante).
  const elegida = ((await enReposo(ev)).indice + 2) % 5;
  await clic(cdp, ev, `[aria-label="Elegir una casa"] button:nth-child(${elegida + 1})`);
  await alejarRaton(cdp);
  await esperar(2500);
  e = await enReposo(ev);
  comprobar(`la barra ${elegida + 1} lleva a la casa ${elegida + 1}, entera`, e.indice === elegida && e.vistas === 1, JSON.stringify(e));
  comprobar("elegir una casa detiene el paso solo", e.pausa?.startsWith("Reanudar"), String(e.pausa));
  await esperar(8000);
  e = await leer(ev);
  comprobar("8 s después sigue en la casa elegida, con su barra llena", e.indice === elegida && e.llenado > 0.99, JSON.stringify(e));

  // ─── 6. Teclado ─────────────────────────────────────────────────
  console.log("\n6. Teclado");
  await clic(cdp, ev, "[data-rotacion]"); // reanuda
  await alejarRaton(cdp);
  await ev(`document.querySelector('form[action="/propiedades"] button[type="submit"]').focus()`);
  await tab(cdp); // al enlace de la casa
  const foco = await ev("document.activeElement?.closest('[data-diapositiva]') ? 'casa' : document.activeElement?.tagName");
  await esperar(2200);
  const conFoco = await avanza(ev, 2000);
  comprobar("con el foco del teclado en la casa, se detiene", foco === "casa" && !conFoco.si, `foco en ${foco}; ${conFoco.a} → ${conFoco.b}`);
  await tab(cdp); // al botón de pausa: ahí no se detiene
  const enBoton = await ev("document.activeElement?.hasAttribute('data-rotacion')");
  const conBoton = await avanza(ev);
  comprobar("con el foco en el botón de pausa sigue moviéndose", enBoton === true && conBoton.si, `${conBoton.a} → ${conBoton.b}`);

  // ─── 7. Pestaña oculta a media cortina ─────────────────────────
  console.log("\n7. Pestaña oculta");
  await ev("document.activeElement?.blur()");
  for (let i = 0; i < 60 && !(await leer(ev)).enCambio; i++) await esperar(200);
  const aMedias = (await leer(ev)).enCambio;
  await ev(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))`);
  e = await leer(ev);
  comprobar("al ocultarse a media cortina, la termina al instante", aMedias && !e.enCambio && e.vistas === 1, `a medias: ${aMedias}; ${JSON.stringify(e)}`);
  const oculta = await avanza(ev, 2000);
  comprobar("oculta no avanza", !oculta.si, `${oculta.a} → ${oculta.b}`);
  await ev(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))`);
  const vuelve = await avanza(ev);
  comprobar("al volver a la pestaña sigue", vuelve.si, `${vuelve.a} → ${vuelve.b}`);

  // ─── 8. Celular: deslizar y tocar ──────────────────────────────
  console.log("\n8. Celular (390×844, con el dedo)");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await cdp("Page.navigate", { url: "about:blank" });
  await cdp("Page.navigate", { url: `${BASE}/` });
  await esperar(1500);
  await ev("document.querySelector('[aria-live]').scrollIntoView({ block: 'center' })");
  await esperar(2500);
  // A media cortina nada se sale del ancho (la sonda de verificar:f2 mide cajas).
  for (let i = 0; i < 60 && !(await leer(ev)).enCambio; i++) await esperar(200);
  const desborde = JSON.parse(
    await ev(`JSON.stringify((() => { const w = document.documentElement.clientWidth; const fuera = [...document.querySelectorAll('[aria-roledescription="carrusel"] *')].filter((el) => { const c = el.getBoundingClientRect(); return c.width && c.right > w + 1; }).length; return { scroll: document.documentElement.scrollWidth - w, fuera, enCambio: [...document.querySelectorAll('[data-diapositiva]')].some((c) => c.style.clipPath) }; })())`),
  );
  comprobar("a media cortina nada se sale del ancho", desborde.enCambio && desborde.scroll === 0 && desborde.fuera === 0, JSON.stringify(desborde));
  e = await enReposo(ev);
  const antes = e.indice;
  const t = JSON.parse(await ev(centro("[aria-live]")));
  await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: t.x + 110, y: t.y }] });
  for (let paso = 1; paso <= 6; paso++) {
    await cdp("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: t.x + 110 - paso * 35, y: t.y + paso }] });
    await esperar(16);
  }
  await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await esperar(2500);
  e = await enReposo(ev);
  comprobar(
    "deslizar a la izquierda pasa a la siguiente sin abrir la casa",
    e.indice === (antes + 1) % 5 && e.url === "/" && e.pausa?.startsWith("Reanudar"),
    `${antes} → ${e.indice}, en ${e.url}, ${e.pausa}`,
  );
  await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: t.x, y: t.y }] });
  await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await esperar(2500);
  const destino = await ev("location.pathname");
  comprobar("tocar (sin deslizar) sí abre la casa", destino.startsWith("/propiedades/"), destino);

  comprobar("sin errores en la consola", errores.length === 0, errores.slice(0, 3).join(" | "));
} finally {
  navegador.cerrar();
}

fallas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallas} de ${resultados.length} comprobaciones pasaron.`);
process.exit(fallas === 0 ? 0 : 1);
