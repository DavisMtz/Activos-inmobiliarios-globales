#!/usr/bin/env node
/**
 * Hoja de contacto de los dibujos de Servicios: los pone EN GRANDE, juntos y en
 * su estado de reposo, para revisar el trazo de verdad (PLAN §16). En la página
 * miden 10rem y un solape de dos píxeles no se ve; aquí sí.
 *
 *   node scripts/hoja-dibujos.mjs salida.png [--base http://localhost:5180] [--columnas 4]
 *
 * Los clona sobre la página real, así que salen con las fuentes, los colores y
 * el CSS de verdad, no con los de una maqueta aparte.
 *
 * **Solo salen los dibujos que hay en la página.** El de reserva (`casa`) no le
 * toca a ninguno de los seis servicios: para verlo hay que dar de alta uno cuyo
 * título no diga nada conocido («Remodelaciones») en la base LOCAL, y borrarlo
 * después. Qué título da qué dibujo: `shared/servicios.ts`.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string", default: "http://localhost:5180" },
    columnas: { type: "string", default: "4" },
  },
});
const [salida] = positionals;
if (!salida) {
  console.error("Uso: node scripts/hoja-dibujos.mjs <salida.png> [--base …] [--columnas 4]");
  process.exit(1);
}
const BASE = values.base.replace(/\/+$/, "");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const perfil = mkdtempSync(join(tmpdir(), "aig-hoja-"));
const puerto = 9200 + Math.floor(Math.random() * 90);
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

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1600, height: 760, deviceScaleFactor: 2, mobile: false });
  await cdp("Page.navigate", { url: `${BASE}/servicios` });
  await esperar(2500);
  const r = await cdp("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      // En reposo: sin esto saldrían a media entrada o a medio gesto.
      const quieto = document.createElement('style');
      quieto.textContent = '*{animation:none!important;transition:none!important}';
      document.head.appendChild(quieto);
      const hoja = document.createElement('div');
      hoja.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f7f5f3;display:grid;grid-template-columns:repeat(${Number(values.columnas)},1fr);gap:28px 36px;padding:36px;align-content:start';
      const dibujos = [...document.querySelectorAll('.dibujo-servicio')];
      for (const d of dibujos) {
        const caja = document.createElement('div');
        const copia = d.cloneNode(true);
        copia.setAttribute('class', 'dibujo-servicio text-tinta');
        copia.style.cssText = 'width:100%;height:auto;display:block';
        const pie = document.createElement('p');
        pie.textContent = d.getAttribute('data-dibujo');
        pie.style.cssText = 'font:600 15px/1.2 system-ui;color:#545454;margin:6px 0 0';
        caja.append(copia, pie);
        hoja.appendChild(caja);
      }
      document.body.appendChild(hoja);
      return dibujos.map((d) => d.getAttribute('data-dibujo')).join(', ');
    })()`,
  });
  console.log("dibujos:", r.result?.result?.value || "(ninguno: ¿responde /servicios?)");
  await esperar(400);
  const foto = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(salida, Buffer.from(foto.result.data, "base64"));
  console.log("guardada", salida);
} finally {
  ws.close();
  chrome.kill();
}
process.exit(0);
