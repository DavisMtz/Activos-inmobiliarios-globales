#!/usr/bin/env node
/**
 * Captura de pantalla por CDP con viewport emulado (PLAN §16).
 *
 *   node scripts/capturar.mjs <url> <salida.png> [ancho=390] [alto=844] [movil=1]
 *
 * Por CDP y no con --screenshot: la ventana de Chrome no baja de ~491 px, y el
 * truco del iframe no sirve con el panel (manda X-Frame-Options: DENY).
 *
 * Para retratar una pantalla del panel hace falta **sesión**: sin cookie,
 * `/panel` redirige a `/panel/entrar` y lo que se guarda es la pantalla de
 * acceso. Se pasa por el entorno, no por la línea de comandos, para que el
 * token no quede en el historial:
 *
 *   AIG_COOKIE=<valor de __Host-aig_sesion> node scripts/capturar.mjs …
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [, , url, salida, ancho = "390", alto = "844", movil = "1"] = process.argv;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const perfil = mkdtempSync(join(tmpdir(), "aig-cp-"));
const puerto = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "about:blank"], { stdio: "ignore" });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let objetivos;
for (let i = 0; i < 50; i++) {
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

await cdp("Page.enable");
if (process.env.AIG_COOKIE) {
  await cdp("Network.enable");
  await cdp("Network.setCookie", {
    name: "__Host-aig_sesion",
    value: process.env.AIG_COOKIE,
    domain: new URL(url).hostname,
    path: "/",
    httpOnly: true,
    // `__Host-` exige Secure; Chrome trata a localhost como origen seguro.
    secure: true,
    sameSite: "Lax",
  });
}
await cdp("Emulation.setDeviceMetricsOverride", { width: Number(ancho), height: Number(alto), deviceScaleFactor: movil === "1" ? 2 : 1, mobile: movil === "1" });
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
await cdp("Page.navigate", { url });
await esperar(3500);
const medida = await cdp("Runtime.evaluate", {
  // El título dice si la sesión entró: con la cookie mala saldría «Entrar».
  expression: "JSON.stringify({titulo: document.title, ancho: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, fuentes: [...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family).join(',')})",
  returnByValue: true,
});
console.log(medida.result?.result?.value);
const foto = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(salida, Buffer.from(foto.result.data, "base64"));
ws.close();
chrome.kill();
console.log("guardada", salida);
process.exit(0);
