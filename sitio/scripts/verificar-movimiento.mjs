#!/usr/bin/env node
/**
 * Sonda de «¿quedó algo invisible?» (PLAN §10.4 y §16).
 *
 *   node scripts/verificar-movimiento.mjs [--base http://localhost:5180]
 *
 * El patrón de revelar contenido con una animación ya dejó media portada en
 * blanco tres veces en otros proyectos del usuario (memoria
 * `gsap-contenido-invisible`). Una captura no lo detecta: hay que recorrer los
 * elementos animados y leer su `opacity` REAL al final.
 *
 * Corre cada página dos veces:
 *   1. Normal: la animación corre entera y todo debe terminar visible.
 *   2. Con `--force-prefers-reduced-motion`: la animación NO debe correr y
 *      todo debe verse igual. Es a la vez la prueba de accesibilidad y la de
 *      que la página está completa sin movimiento.
 *
 * Trampas que ya costaron una corrida (memoria `verificacion-visual-chrome-headless`):
 * - Medir sin subir por los ancestros da decenas de falsos positivos: todo lo
 *   que cuelga de un `display:none` mide cero sin que le pase nada.
 * - `--virtual-time-budget` NO sirve para esperar a que una animación termine.
 *   Aquí se espera por reloj y se fuerza el final leyendo el estado real.
 * - `scroll-behavior: smooth` convierte `scrollTo` en una animación y parece
 *   que ScrollTrigger no dispara.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { base: { type: "string", default: "http://localhost:5180" } } });
const BASE = values.base.replace(/\/+$/, "");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const RUTAS = ["/", "/propiedades", "/propiedades/casa-en-el-prado-4"];
/**
 * `/entregas` solo existe con alguna publicada (si no, 404): se revisa cuando
 * responde. Para cubrirla, correr antes `verificar:entregas --local --dejar`.
 */
const RUTAS_OPCIONALES = ["/entregas"];

/** Lo que anima `app/components/publico/movimiento.ts`. */
const SELECTOR_ANIMADO =
  ".aig-estela, .aig-pierna, .aig-franja, .aig-canto, .aig-ventana, [data-animar], [data-animar-lista] > li";

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrirChrome(reducido) {
  const perfil = mkdtempSync(join(tmpdir(), "aig-mov-"));
  const puerto = 9400 + Math.floor(Math.random() * 400);
  const argumentos = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--remote-debugging-port=${puerto}`,
    `--user-data-dir=${perfil}`,
    "about:blank",
  ];
  // La herramienta para ver la maqueta sin movimiento y auditar esa ruta.
  if (reducido) argumentos.splice(3, 0, "--force-prefers-reduced-motion");

  const chrome = spawn(CHROME, argumentos, { stdio: "ignore" });
  let objetivos;
  for (let i = 0; i < 60; i++) {
    try {
      objetivos = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json();
      if (objetivos.some((o) => o.type === "page")) break;
    } catch {}
    await esperar(200);
  }
  const pagina = objetivos.find((o) => o.type === "page");
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
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

  return { cdp, cerrar: () => (ws.close(), chrome.kill()) };
}

/** Se inyecta en la página: recorre lo animado y devuelve lo que quedó mal. */
const SONDA = `(() => {
  const ocultoPorAncestro = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const e = getComputedStyle(n);
      if (e.display === 'none') return true;
    }
    return false;
  };
  const animados = [...document.querySelectorAll(${JSON.stringify(SELECTOR_ANIMADO)})];
  const invisibles = [];
  for (const el of animados) {
    if (ocultoPorAncestro(el)) continue;
    const estilo = getComputedStyle(el);
    const caja = el.getBoundingClientRect();
    const opacidad = Number(estilo.opacity);
    // Una pieza del isotipo escalada a cero mide cero de ancho o alto.
    const encogido = caja.width < 0.5 || caja.height < 0.5;
    if (opacidad < 0.99 || encogido) {
      invisibles.push({
        clase: (el.getAttribute('class') || el.tagName).slice(0, 48),
        opacidad: Number(opacidad.toFixed(3)),
        ancho: Math.round(caja.width),
        alto: Math.round(caja.height),
      });
    }
  }
  return JSON.stringify({ animados: animados.length, invisibles });
})()`;

async function revisar(cdp, ruta, reducido) {
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: BASE + ruta });
  await esperar(2500);

  // Sin esto, `scrollTo` se vuelve una animación y ScrollTrigger parece muerto.
  await cdp("Runtime.evaluate", { expression: "document.documentElement.style.scrollBehavior='auto'" });

  // Recorrer la página entera para que dispare todo lo que va por scroll.
  await cdp("Runtime.evaluate", {
    expression: `(async () => {
      const alto = document.body.scrollHeight;
      for (let y = 0; y < alto; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
    })()`,
    awaitPromise: true,
  });
  await esperar(2000);

  const r = await cdp("Runtime.evaluate", { expression: SONDA, returnByValue: true });
  return JSON.parse(r.result?.result?.value ?? '{"animados":0,"invisibles":[]}');
}

let fallas = 0;
for (const ruta of RUTAS_OPCIONALES) {
  const r = await fetch(BASE + ruta).catch(() => null);
  if (r?.status === 200) RUTAS.push(ruta);
  else console.log(`  · ${ruta} no responde 200 (${r?.status ?? "sin respuesta"}): se omite`);
}

for (const reducido of [false, true]) {
  console.log(`\n=== ${reducido ? "CON «menos movimiento» (la animación no debe correr)" : "Movimiento normal"} ===`);
  const { cdp, cerrar } = await abrirChrome(reducido);
  try {
    for (const ruta of RUTAS) {
      const { animados, invisibles } = await revisar(cdp, ruta, reducido);
      const ok = invisibles.length === 0;
      if (!ok) fallas++;
      console.log(`  ${ok ? "✔" : "✖"} ${ruta.padEnd(34)} ${animados} elementos animados, ${invisibles.length} invisibles`);
      for (const i of invisibles.slice(0, 6)) {
        console.log(`        → ${i.clase} (opacidad ${i.opacidad}, ${i.ancho}x${i.alto})`);
      }
      if (animados === 0) {
        console.log("        → OJO: no se encontró nada animado; ¿cambió el selector?");
        fallas++;
      }
    }
  } finally {
    cerrar();
  }
}

console.log(fallas === 0 ? "\nTodo terminó visible en las dos rutas de accesibilidad." : `\n${fallas} comprobaciones fallaron.`);
process.exit(fallas === 0 ? 0 : 1);
