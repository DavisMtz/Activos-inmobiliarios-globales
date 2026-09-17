#!/usr/bin/env node
/**
 * El acceso tal como lo usa una persona: en Chrome, CON JavaScript, donde React
 * Router manda los formularios por fetch a `/panel/entrar.data` en vez de un POST
 * de documento (ese camino lo cubre scripts/verificar.mjs).
 *
 *   node scripts/verificar-navegador.mjs --base https://activos-inmobiliarios.logidma.workers.dev --remote
 *   node scripts/verificar-navegador.mjs --base http://localhost:5180 --local
 *
 * Crea un asesor DESECHABLE, entra con su temporal, la cambia, sale y lo borra.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { borrarUsuarioDePrueba, buscarUsuario, crearUsuarioConTemporal } from "./lib/usuarios.mjs";

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

const BASE = values.base.replace(/\/+$/, "");
const CORREO = "hidratado-prueba@ejemplo.invalid";
const remoto = values.remote;

const previo = buscarUsuario(CORREO, { remoto });
if (previo) borrarUsuarioDePrueba(previo.id, CORREO, { remoto });
const usuario = await crearUsuarioConTemporal({ correo: CORREO, nombre: "Prueba Hidratada", rol: "asesor" }, { remoto });
const claveNueva = `frase nueva ${Math.random().toString(36).slice(2, 10)}`;

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const perfil = mkdtempSync(join(tmpdir(), "aig-cp-"));
const puerto = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "about:blank"], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const resultados = [];
const comprobar = (nombre, ok, detalle = "") => {
  resultados.push(ok);
  console.log(`${ok ? "  ✔" : "  ✖"} ${nombre}${!ok && detalle ? ` → ${detalle}` : ""}`);
};

let ws;
try {
  let objetivos = [];
  for (let i = 0; i < 50; i++) {
    try {
      objetivos = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json();
      if (objetivos.some((o) => o.type === "page")) break;
    } catch {}
    await esperar(200);
  }
  ws = new WebSocket(objetivos.find((o) => o.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pendientes = new Map();
  const peticiones = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendientes.has(m.id)) {
      pendientes.get(m.id)(m);
      pendientes.delete(m.id);
    }
    if (m.method === "Network.requestWillBeSent") {
      const r = m.params.request;
      if (r.method !== "GET" || r.url.includes(".data")) peticiones.push(`${r.method} ${new URL(r.url).pathname}${new URL(r.url).search} [${m.params.type}]`);
    }
  });
  const cdp = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      pendientes.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluar = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const esperarRuta = async (ruta, ms = 15000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if ((await evaluar("location.pathname")) === ruta) return true;
      await esperar(250);
    }
    return false;
  };
  // Espera a que React Router haya hidratado (sin eso el clic sería un POST de documento, que ya está probado).
  const esperarHidratacion = async () => {
    const fin = Date.now() + 15000;
    while (Date.now() < fin) {
      if (await evaluar("Boolean(window.__reactRouterDataRouter) && document.readyState === 'complete'")) return true;
      await esperar(250);
    }
    return false;
  };
  const rellenar = (nombre, valor) =>
    evaluar(`(() => { const el = document.querySelector('input[name="${nombre}"]'); el.focus(); el.value = ${JSON.stringify(valor)}; el.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);

  await cdp("Page.enable");
  await cdp("Network.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  await cdp("Page.navigate", { url: `${BASE}/panel/entrar` });
  comprobar("la pantalla de entrar hidrata", await esperarHidratacion());

  await rellenar("correo", CORREO);
  await rellenar("clave", usuario.clave);
  peticiones.length = 0;
  await evaluar("document.querySelector('button[type=submit]').click(), true");
  comprobar("con la temporal, el formulario hidratado lleva a /panel/cambiar-clave", await esperarRuta("/panel/cambiar-clave"), await evaluar("location.pathname"));
  comprobar("el envío fue por fetch de React Router (.data), no un POST de documento", peticiones.some((p) => p.startsWith("POST /panel/entrar.data")), peticiones.join(" | "));
  comprobar("la cookie de sesión no es legible desde JavaScript (HttpOnly)", !(await evaluar("document.cookie")).includes("aig_sesion"));

  await esperarHidratacion();
  await rellenar("nueva", claveNueva);
  await rellenar("confirmacion", claveNueva);
  peticiones.length = 0;
  await evaluar("document.querySelector('form[method=post]:not([action]) button[type=submit], form:not([action=\"/panel/salir\"]) button[type=submit]').click(), true");
  comprobar("al guardar la nueva, llega a /panel", await esperarRuta("/panel"), await evaluar("location.pathname"));
  await esperar(800);
  comprobar("el panel saluda por nombre", ((await evaluar("document.body.innerText")) ?? "").includes("Hola, Prueba"));

  peticiones.length = 0;
  await evaluar("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salir').click(), true");
  comprobar("«Salir» lleva a /panel/entrar", await esperarRuta("/panel/entrar"), await evaluar("location.pathname"));
  comprobar("salir fue por fetch de React Router", peticiones.some((p) => p.startsWith("POST /panel/salir.data")), peticiones.join(" | "));

  await cdp("Page.navigate", { url: `${BASE}/panel` });
  comprobar("tras salir, /panel vuelve a pedir entrar", await esperarRuta("/panel/entrar"), await evaluar("location.pathname"));

} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  borrarUsuarioDePrueba(usuario.id, CORREO, { remoto });
  comprobar("limpieza: el usuario desechable ya no existe", !buscarUsuario(CORREO, { remoto }));
}
console.log(`\n${resultados.filter(Boolean).length} de ${resultados.length} comprobaciones pasaron.`);
process.exit(resultados.every(Boolean) ? 0 : 1);
