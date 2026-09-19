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
 * En la portada revisa además la vitrina, que cambia de casa sola: en reposo
 * una sola casa entera a la vista; con movimiento tiene que cambiar, y con
 * «menos movimiento» no debe cambiar ni tener botón de pausa (~15 s más).
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

/**
 * La vitrina de la portada (`components/publico/vitrina.tsx`) cambia de casa
 * sola, y lo que la sonda de arriba busca no la cubre. Aquí, EN REPOSO (no a
 * media cortina): una sola casa a la vista, entera (sin recorte, opaca) y con
 * sus renglones en su sitio; las demás, escondidas.
 */
const SONDA_VITRINA = `(() => {
  const casas = [...document.querySelectorAll('[data-diapositiva]')];
  if (!casas.length) return JSON.stringify({ hay: false });
  const enCambio = casas.some((c) => c.style.clipPath || c.style.visibility);
  const vistas = casas.filter((c) => getComputedStyle(c).visibility === 'visible');
  const activa = vistas[0];
  const estilo = activa ? getComputedStyle(activa) : null;
  const movidos = activa ? [...activa.querySelectorAll('[data-linea]')].filter((l) => {
    const t = getComputedStyle(l).transform;
    return t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)';
  }).length : 0;
  return JSON.stringify({
    hay: true,
    enCambio,
    vistas: vistas.length,
    indice: activa ? Number(activa.dataset.diapositiva) : -1,
    opacidad: estilo ? Number(estilo.opacity) : 0,
    recorte: estilo ? estilo.clipPath : '',
    movidos,
    pausa: Boolean(document.querySelector('[data-rotacion]')),
  });
})()`;

async function vitrinaEnReposo(cdp) {
  for (let i = 0; i < 30; i++) {
    const r = await cdp("Runtime.evaluate", { expression: SONDA_VITRINA, returnByValue: true });
    const v = JSON.parse(r.result?.result?.value ?? '{"hay":false}');
    if (!v.hay || !v.enCambio) return v;
    await esperar(150);
  }
  return { hay: true, enCambio: true };
}

/** Devuelve las fallas (textos) de la vitrina en esta pasada. */
async function revisarVitrina(cdp, reducido) {
  const fallas = [];
  const entera = (v, momento) => {
    if (v.enCambio) fallas.push(`${momento}: seguía a media cortina después de 4.5 s`);
    else if (v.vistas !== 1) fallas.push(`${momento}: ${v.vistas} casas a la vista (debe ser 1)`);
    else if (v.opacidad < 0.99 || (v.recorte && v.recorte !== "none") || v.movidos > 0) {
      fallas.push(`${momento}: la casa a la vista no está entera (opacidad ${v.opacidad}, recorte ${v.recorte}, ${v.movidos} renglones movidos)`);
    }
  };
  const antes = await vitrinaEnReposo(cdp);
  if (!antes.hay) return ["no se encontró la vitrina"];
  entera(antes, "al revisar");
  // Casi dos ciclos de 7 s: con movimiento tiene que haber cambiado de casa.
  let despues = antes;
  for (let i = 0; i < 28; i++) {
    await esperar(500);
    despues = await vitrinaEnReposo(cdp);
    if (!reducido && despues.indice !== antes.indice) break;
  }
  entera(despues, "después de esperar");
  if (reducido) {
    if (despues.indice !== antes.indice) fallas.push(`con «menos movimiento» cambió sola (${antes.indice} → ${despues.indice})`);
    if (despues.pausa) fallas.push("con «menos movimiento» no debe haber botón de pausa: nada se mueve solo");
  } else {
    if (despues.indice === antes.indice) fallas.push(`no cambió de casa en 14 s (siguió en la ${antes.indice})`);
    if (!despues.pausa) fallas.push("falta el botón de pausa (WCAG 2.2.2)");
  }
  return fallas;
}

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
      if (ruta === "/") {
        const deLaVitrina = await revisarVitrina(cdp, reducido);
        if (deLaVitrina.length) fallas++;
        console.log(
          `  ${deLaVitrina.length ? "✖" : "✔"} ${"/ (vitrina)".padEnd(34)} ${
            deLaVitrina.length ? deLaVitrina.join("; ") : reducido ? "quieta y entera, sin pausa" : "cambia sola y queda entera en reposo"
          }`,
        );
      }
    }
  } finally {
    cerrar();
  }
}

console.log(fallas === 0 ? "\nTodo terminó visible en las dos rutas de accesibilidad." : `\n${fallas} comprobaciones fallaron.`);
process.exit(fallas === 0 ? 0 : 1);
