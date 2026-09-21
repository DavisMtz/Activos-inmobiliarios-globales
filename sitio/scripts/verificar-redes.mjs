#!/usr/bin/env node
/**
 * Las redes del pie, PULSANDO el botón (PLAN §17: «lo que la gente pulsa no es
 * la API»; dos veces un botón no hizo nada y el código se veía bien).
 *
 *   node scripts/verificar-redes.mjs --base http://localhost:5180 --local
 *
 * Qué hace, de verdad: crea una cuenta de director, entra al panel, elige una
 * red en el desplegable, pega su enlace, **pulsa «Guardar las redes»**, y
 * luego mira el PIE del sitio público para comprobar que salió. Al final
 * devuelve la fila a como estaba y borra la cuenta.
 *
 * También comprueba lo que un formulario sí puede romper y una prueba
 * unitaria no ve: que borrar el enlace quite la red del pie, y que el
 * desplegable ofrezca todas las del catálogo.
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { consultar, ejecutarSql, texto as sql } from "./lib/d1.mjs";
import { borrarUsuarioDePrueba, buscarUsuario, crearUsuarioConTemporal } from "./lib/usuarios.mjs";
import { CLAVES_DE_RED } from "../shared/redes.ts";

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
const ORIGEN = new URL(BASE).origin;
const opciones = { remoto };
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const CORREO = "redes-pie@ejemplo.invalid";

const resultados = [];
const comprobar = (nombre, ok, detalle = "") => {
  resultados.push({ nombre, ok: Boolean(ok) });
  console.log(`${ok ? "  ✔" : "  ✖"} ${nombre}${!ok && detalle ? `\n      → ${detalle}` : ""}`);
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Chrome por CDP ───────────────────────────────────────────────
async function abrirChrome() {
  const perfil = mkdtempSync(join(tmpdir(), "aig-redes-"));
  const puerto = 9800 + Math.floor(Math.random() * 150);
  const proceso = spawn(
    CHROME,
    ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "about:blank"],
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
  const cdp = (metodo, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      pendientes.set(n, r);
      ws.send(JSON.stringify({ id: n, method: metodo, params }));
    });
  return { cdp, cerrar: () => { ws.close(); proceso.kill(); } };
}


/**
 * Los enlaces de la SECCIÓN «Redes», no todos los externos del pie: desde el
 * rediseño del 20/09/2026 el pie también lleva el botón «Escríbenos por
 * WhatsApp», que es externo y no es una red. Este guion lo daba por una.
 */
const ENLACES_DE_REDES = `[...([...document.querySelectorAll('footer section')].find(s => s.querySelector('h2')?.textContent === 'Redes')?.querySelectorAll('a') ?? [])]`;

const evaluar = async (cdp, expresion) => {
  const r = await cdp("Runtime.evaluate", { expression: expresion, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

// ─── La fila de antes, para devolverla al final ──────────────────
const [antes] = consultar("SELECT valor FROM configuracion WHERE clave = 'redes';", opciones);
const valorPrevio = antes?.valor ?? null;

const previo = buscarUsuario(CORREO, opciones);
if (previo) {
  ejecutarSql(`UPDATE configuracion SET actualizado_por = NULL WHERE actualizado_por = ${sql(previo.id)};`, opciones);
  borrarUsuarioDePrueba(previo.id, CORREO, opciones);
}
const prueba = await crearUsuarioConTemporal({ correo: CORREO, nombre: "Director De Prueba", rol: "director" }, opciones);
const clave = `redes ${randomBytes(6).toString("base64url")}`;
let navegador = null;

try {
  console.log("\n1. Entrar al panel");
  const cabeceras = { "Content-Type": "application/json", Origin: ORIGEN };
  if (!remoto) cabeceras["cf-connecting-ip"] = "10.7.7.8";
  let entrada;
  for (let intento = 1; intento <= 3; intento++) {
    entrada = await fetch(`${BASE}/api/panel/sesion`, {
      method: "POST",
      headers: cabeceras,
      body: JSON.stringify({ correo: CORREO, clave: prueba.clave }),
    });
    if (entrada.status !== 429) break;
    console.log("  … el freno de intentos está lleno; esperando 65 s");
    await esperar(65_000);
  }
  const temporal = (entrada.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("__Host-aig_sesion="));
  const cambio = await fetch(`${BASE}/api/panel/mi-cuenta/clave`, {
    method: "POST",
    headers: { ...cabeceras, Cookie: temporal.split(";")[0] },
    body: JSON.stringify({ nueva: clave, confirmacion: clave }),
  });
  const galleta = (cambio.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("__Host-aig_sesion="));
  const valorCookie = galleta.split(";")[0].split("=").slice(1).join("=");
  comprobar("la cuenta de dirección entra y elige su contraseña", Boolean(valorCookie));

  navegador = await abrirChrome();
  const { cdp } = navegador;
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Network.setCookie", {
    name: "__Host-aig_sesion",
    value: valorCookie,
    domain: new URL(BASE).hostname,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  });

  console.log("\n2. El bloque «Redes» del panel");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `${BASE}/panel/configuracion` });
  await esperar(3500);

  const ofrecidas = await evaluar(
    cdp,
    `[...document.querySelectorAll('select[name="red_0"] option')].map(o => o.value).filter(Boolean).join(',')`,
  );
  comprobar(
    `el desplegable ofrece las ${CLAVES_DE_RED.length} redes del catálogo`,
    ofrecidas === CLAVES_DE_RED.join(","),
    `ofrece: ${ofrecidas}`,
  );

  const renglones = await evaluar(cdp, `document.querySelectorAll('select[name^="red_"]').length`);
  comprobar("hay un renglón por cada red que cabe en el pie", renglones === CLAVES_DE_RED.length, String(renglones));

  console.log("\n3. Poner TikTok y X, y pulsar «Guardar las redes»");
  // Como lo haría una persona: elegir en el desplegable y escribir el enlace.
  // Los eventos van con `bubbles` porque React escucha en la raíz.
  await evaluar(
    cdp,
    `(() => {
      const poner = (nombre, valor) => {
        const n = document.querySelector('[name="' + nombre + '"]');
        const proto = n.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(n, valor);
        n.dispatchEvent(new Event('input', { bubbles: true }));
        n.dispatchEvent(new Event('change', { bubbles: true }));
      };
      poner('red_0', 'tiktok'); poner('url_0', 'https://www.tiktok.com/@aig');
      poner('red_1', 'x'); poner('url_1', 'https://x.com/aig');
      for (let i = 2; i < ${CLAVES_DE_RED.length}; i++) { poner('red_' + i, ''); poner('url_' + i, ''); }
      return true;
    })()`,
  );
  const pulsado = await evaluar(
    cdp,
    `(() => {
      const boton = [...document.querySelectorAll('button[type="submit"]')].find(b => b.textContent.includes('Guardar las redes'));
      if (!boton) return 'no está el botón';
      boton.click();
      return 'pulsado';
    })()`,
  );
  comprobar("el botón «Guardar las redes» existe y se pulsa", pulsado === "pulsado", String(pulsado));
  await esperar(3500);

  const guardado = await evaluar(cdp, "location.search");
  comprobar("el panel confirma que guardó", guardado.includes("guardado=redes"), guardado);

  const [fila] = consultar("SELECT valor FROM configuracion WHERE clave = 'redes';", opciones);
  const enLaBase = JSON.parse(fila?.valor ?? "{}");
  comprobar(
    "en la base quedó la LISTA, en el orden en que se puso",
    JSON.stringify(enLaBase.lista) ===
      JSON.stringify([
        { red: "tiktok", url: "https://www.tiktok.com/@aig" },
        { red: "x", url: "https://x.com/aig" },
      ]),
    fila?.valor,
  );

  console.log("\n4. El pie del sitio público");
  await cdp("Page.navigate", { url: `${BASE}/` });
  await esperar(4000);
  const enElPie = await evaluar(
    cdp,
    `${ENLACES_DE_REDES}.map(a => a.textContent.trim() + ' → ' + a.getAttribute('href')).join(' | ')`,
  );
  comprobar(
    "TikTok y X salen en el pie, con su nombre y su enlace",
    enElPie === "TikTok → https://www.tiktok.com/@aig | X → https://x.com/aig",
    enElPie,
  );
  const conIcono = await evaluar(
    cdp,
    `${ENLACES_DE_REDES}.every(a => a.querySelector('svg path, svg rect, svg circle')) && ${ENLACES_DE_REDES}.length > 0`,
  );
  comprobar("cada una lleva su dibujo, no un hueco", conIcono === true);

  console.log("\n5. Borrar el enlace quita la red del pie");
  await cdp("Page.navigate", { url: `${BASE}/panel/configuracion` });
  await esperar(3500);
  await evaluar(
    cdp,
    `(() => {
      const n = document.querySelector('[name="url_1"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(n, '');
      n.dispatchEvent(new Event('input', { bubbles: true }));
      [...document.querySelectorAll('button[type="submit"]')].find(b => b.textContent.includes('Guardar las redes')).click();
      return true;
    })()`,
  );
  await esperar(3500);
  await cdp("Page.navigate", { url: `${BASE}/` });
  await esperar(4000);
  const quedan = await evaluar(
    cdp,
    `${ENLACES_DE_REDES}.map(a => a.textContent.trim()).join(',')`,
  );
  comprobar("sin enlace, X se fue y TikTok se quedó", quedan === "TikTok", quedan);

  const errores = await evaluar(cdp, "1");
  comprobar("la página siguió en pie", errores === 1);
} finally {
  navegador?.cerrar();
  // La fila, como estaba. Si no había, se deja vacía y no inventada.
  ejecutarSql(
    valorPrevio === null
      ? "DELETE FROM configuracion WHERE clave = 'redes';"
      : `UPDATE configuracion SET valor = ${sql(valorPrevio)}, actualizado_por = NULL WHERE clave = 'redes';`,
    opciones,
  );
  const usuario = buscarUsuario(CORREO, opciones);
  if (usuario) {
    ejecutarSql(`UPDATE configuracion SET actualizado_por = NULL WHERE actualizado_por = ${sql(usuario.id)};`, opciones);
    borrarUsuarioDePrueba(usuario.id, CORREO, opciones);
  }
  console.log("\n  · fila «redes» devuelta a como estaba y cuenta de prueba borrada");
}

const bien = resultados.filter((r) => r.ok).length;
console.log(`\n${bien} de ${resultados.length} comprobaciones pasaron.`);
process.exit(bien === resultados.length ? 0 : 1);
