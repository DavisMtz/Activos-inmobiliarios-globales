#!/usr/bin/env node
/**
 * La página de Contacto, PULSANDO los botones (PLAN §17: «lo que la gente pulsa
 * no es la API»).
 *
 *   node scripts/verificar-contacto.mjs --base http://localhost:5180 --local [--capturas carpeta]
 *
 * Qué hace, de verdad, en un Chrome sin ventana:
 *   1. Abre /contacto en un teléfono: el mostrador, WhatsApp, el dibujo, los
 *      campos con sus nombres de siempre y ningún botón flotante encima.
 *   2. Pulsa «Enviar mensaje» con todo vacío y mira que cada error caiga en
 *      SU campo (con `aria-invalid`), no en un letrero; luego que la regla
 *      «teléfono o correo» avise, que un teléfono a medias se señale al salir
 *      del campo y que al corregirlo el error se vaya y salga la palomita.
 *   3. Manda el formulario SIN JavaScript (un POST normal) y comprueba que el
 *      servidor devuelve el error en el campo y lo que se había tecleado.
 *   4. Llena la TRAMPA y pulsa enviar: sale el gracias, con el nombre y el
 *      teléfono, el foco en su título, y en la base no queda nada.
 *   5. (solo --local) Un envío de verdad con «Vender»: queda como tipo
 *      `vender` y con su frase delante del mensaje. Se borra al final.
 *   6. Con «menos movimiento», el gracias se ve entero.
 *
 * `--remote` corre todo menos el 5: contra producción no se escribe nada.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { consultar, ejecutarSql, texto as sql } from "./lib/d1.mjs";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:5180" },
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    capturas: { type: "string" },
  },
});
if (values.local === values.remote) {
  console.error("Indica exactamente uno: --local o --remote.");
  process.exit(1);
}
const remoto = values.remote;
const BASE = values.base.replace(/\/+$/, "");
const opciones = { remoto };
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const CAPTURAS = values.capturas ? resolve(values.capturas) : null;
if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
const MARCA = `Prueba contacto ${Date.now()}`;

const resultados = [];
const comprobar = (nombre, ok, detalle = "") => {
  resultados.push({ nombre, ok: Boolean(ok) });
  console.log(`${ok ? "  ✔" : "  ✖"} ${nombre}${!ok && detalle ? `\n      → ${detalle}` : ""}`);
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Chrome por CDP ───────────────────────────────────────────────
async function abrirChrome() {
  const perfil = mkdtempSync(join(tmpdir(), "aig-contacto-"));
  const puerto = 9650 + Math.floor(Math.random() * 150);
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

const evaluar = async (cdp, expresion) => {
  const r = await cdp("Runtime.evaluate", { expression: expresion, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};

/** Espera a que algo sea cierto en la página, sin pasarse de `tope` ms. */
async function hasta(cdp, expresion, tope = 8000) {
  const fin = Date.now() + tope;
  while (Date.now() < fin) {
    if (await evaluar(cdp, `Boolean(${expresion})`)) return true;
    await esperar(120);
  }
  return false;
}

/** Un clic de ratón de verdad en el centro del elemento, no un `.click()`. */
async function pulsar(cdp, selector) {
  const punto = await evaluar(
    cdp,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  );
  if (!punto) throw new Error(`no está ${selector}`);
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: punto.x, y: punto.y });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: punto.x, y: punto.y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: punto.x, y: punto.y, button: "left", clickCount: 1 });
}

/** Pulsa el campo y teclea (Input.insertText dispara los mismos `input`). */
async function escribir(cdp, selector, texto) {
  await pulsar(cdp, selector);
  await cdp("Input.insertText", { text: texto });
}

async function capturar(cdp, nombre) {
  if (!CAPTURAS) return;
  const foto = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(CAPTURAS, `${nombre}.png`), Buffer.from(foto.result.data, "base64"));
}

/** Los errores que se ven, por campo: `{ telefono: "…" }`. */
const ERRORES = `Object.fromEntries([...document.querySelectorAll('.formulario-contacto [aria-invalid="true"]')]
  .map((el) => [el.name, document.getElementById((el.getAttribute('aria-describedby') || '').split(' ')[0])?.textContent?.trim() ?? '']))`;

async function abrirContacto(cdp, { ancho = 390, alto = 844, movil = true, reducido = false } = {}) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: movil ? 2 : 1, mobile: movil });
  await cdp("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: reducido ? "reduce" : "no-preference" },
    ],
  });
  await cdp("Page.navigate", { url: `${BASE}/contacto` });
  // Hidratado = el formulario ya avisa él (`noValidate` lo pone React).
  const listo = await hasta(cdp, `document.querySelector('.formulario-contacto')?.noValidate`, 15000);
  // Volver a abrir la MISMA dirección hace que Chrome restaure el desplazamiento
  // de la vez anterior, y las capturas salían con el titular bajo la cabecera.
  await evaluar(cdp, `window.scrollTo(0, 0)`);
  return listo;
}

let navegador = null;
try {
  navegador = await abrirChrome();
  const { cdp } = navegador;
  await cdp("Page.enable");
  await cdp("Runtime.enable");

  // ─── 1. La página ─────────────────────────────────────────────
  console.log("\n1. La página, en el teléfono (390 px)");
  const hidrato = await abrirContacto(cdp);
  comprobar("la página hidrata y el formulario avisa él", hidrato);
  const pagina = JSON.parse(
    await evaluar(
      cdp,
      `JSON.stringify({
        ancho: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
        titular: document.querySelector('h1')?.textContent,
        whatsapp: document.querySelector('.cta-mostrador')?.getAttribute('href') ?? '',
        numero: document.querySelector('.cta-mostrador')?.parentElement?.textContent ?? '',
        dibujo: Boolean(document.querySelector('.escena-contacto[data-dibujo="asesoria"]')),
        flotante: Boolean(document.querySelector('a[aria-label="Escríbenos por WhatsApp"]')),
        campos: [...document.querySelectorAll('.formulario-contacto [name]')].map((el) => el.name),
      })`,
    ),
  );
  comprobar("sin desplazamiento horizontal", pagina.scroll <= pagina.ancho + 1, `ancho ${pagina.ancho}, scroll ${pagina.scroll}`);
  comprobar("el titular es «Hablemos de tu propiedad»", pagina.titular === "Hablemos de tu propiedad", pagina.titular);
  comprobar("el botón de WhatsApp del mostrador lleva a wa.me", pagina.whatsapp.startsWith("https://wa.me/"), pagina.whatsapp);
  comprobar("junto al botón va el número, legible", /\d{3} \d{3} \d{4}/.test(pagina.numero), pagina.numero);
  comprobar("el dibujo de asesoría está en el mostrador", pagina.dibujo);
  comprobar("no hay botón flotante encima del formulario", !pagina.flotante);
  const nombres = new Set(pagina.campos);
  comprobar(
    "los campos de siempre, con sus nombres, más «motivo»",
    ["nombre", "telefono", "correo", "mensaje", "acepto", "empresa", "motivo"].every((n) => nombres.has(n)),
    [...nombres].join(", "),
  );
  if (CAPTURAS) {
    await esperar(3500);
    const altoTotal = await evaluar(cdp, `Math.ceil(document.querySelector('footer').getBoundingClientRect().top + scrollY + 40)`);
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: altoTotal, deviceScaleFactor: 2, mobile: true });
    await esperar(600);
    await capturar(cdp, "1-telefono-entera");
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  }

  // ─── 2. Avisa junto al campo ─────────────────────────────────────
  console.log("\n2. Pulsar «Enviar mensaje»: cada error en su campo");
  await pulsar(cdp, ".boton-enviar");
  await esperar(250);
  let errores = await evaluar(cdp, ERRORES);
  comprobar(
    "con todo vacío: nombre, el par teléfono/correo y el aviso, cada uno en su sitio",
    Object.keys(errores).sort().join(",") === "acepto,correo,nombre,telefono",
    JSON.stringify(errores),
  );
  comprobar("el foco va al primer campo con error", (await evaluar(cdp, `document.activeElement?.name`)) === "nombre");
  comprobar(
    "no se mandó nada (sigue el formulario, no hay gracias)",
    !(await evaluar(cdp, `document.getElementById('gracias-titulo')`)),
  );

  await escribir(cdp, "#contacto-nombre", MARCA);
  await pulsar(cdp, 'input[name="acepto"]');
  await pulsar(cdp, ".boton-enviar");
  await esperar(250);
  errores = await evaluar(cdp, ERRORES);
  comprobar(
    "sin teléfono ni correo, avisa «uno de los dos» debajo del par, y marca los dos",
    Object.keys(errores).sort().join(",") === "correo,telefono" &&
      errores.telefono.includes("un teléfono o un correo") &&
      errores.correo === errores.telefono,
    JSON.stringify(errores),
  );
  comprobar(
    "el aviso del par ocupa el lugar de la nota (no se repiten)",
    await evaluar(cdp, `!document.getElementById('contacto-uno-de-dos') && Boolean(document.getElementById('contacto-par-error'))`),
  );

  await escribir(cdp, "#contacto-telefono", "443 12");
  await pulsar(cdp, "#contacto-correo"); // salir del campo
  await esperar(200);
  errores = await evaluar(cdp, ERRORES);
  comprobar("un teléfono a medias se señala al salir del campo", errores.telefono === "Ese teléfono no parece completo.", JSON.stringify(errores));
  await capturar(cdp, "2-error-junto-al-campo");

  await pulsar(cdp, "#contacto-telefono");
  await cdp("Input.insertText", { text: "3 4567" });
  await esperar(200);
  errores = await evaluar(cdp, ERRORES);
  const palomita = await evaluar(cdp, `Boolean(document.querySelector('#contacto-telefono')?.parentElement?.querySelector('.campo-bien'))`);
  comprobar("al completarlo, el error se va mientras se escribe", !errores.telefono, JSON.stringify(errores));
  comprobar("y sale la palomita del campo bien", palomita);

  // ─── 3. Sin JavaScript ─────────────────────────────────────────
  console.log("\n3. Sin JavaScript: el servidor contesta en el campo");
  const cabeceras = { "Content-Type": "application/x-www-form-urlencoded" };
  if (!remoto) cabeceras["cf-connecting-ip"] = "10.7.7.21";
  const sinJs = await fetch(`${BASE}/contacto`, {
    method: "POST",
    headers: cabeceras,
    body: new URLSearchParams({ nombre: "Sin JavaScript", acepto: "on", mensaje: "Hola" }).toString(),
  });
  const html = await sinJs.text();
  comprobar("responde 400", sinJs.status === 400, `estado ${sinJs.status}`);
  comprobar(
    "el error sale bajo el par teléfono/correo, con aria-invalid",
    html.includes('id="contacto-par-error"') && /name="telefono"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*name="telefono"/.test(html),
  );
  comprobar("y devuelve lo tecleado", html.includes('value="Sin JavaScript"') && html.includes(">Hola</textarea>"));

  // ─── 4. El gracias (con la trampa: no se guarda nada) ────────────
  console.log("\n4. Pulsar enviar con la trampa llena: el gracias, sin escribir en la base");
  await pulsar(cdp, 'label.opcion:nth-child(3)'); // «Vender»
  await evaluar(cdp, `document.querySelector('[name="empresa"]').value = 'spam'`);
  await pulsar(cdp, ".boton-enviar");
  const llego = await hasta(cdp, `document.getElementById('gracias-titulo')`, 10000);
  comprobar("sale «Ya tenemos tu mensaje»", llego);
  await esperar(1100);
  // En el teléfono se manda desde abajo del formulario: la hoja tiene que
  // subir hasta asomar BAJO la cabecera flotante, no quedarse tapada por ella.
  const posicion = await evaluar(
    cdp,
    `(() => { const hoja = document.getElementById('gracias-titulo').closest('section').getBoundingClientRect();
      const cabecera = document.querySelector('header').getBoundingClientRect();
      return { hoja: Math.round(hoja.top), cabecera: Math.round(cabecera.bottom), alto: innerHeight }; })()`,
  );
  comprobar(
    "la hoja del gracias asoma bajo la cabecera",
    posicion.hoja >= posicion.cabecera - 2 && posicion.hoja < posicion.alto / 2,
    JSON.stringify(posicion),
  );
  const gracias = JSON.parse(
    await evaluar(
      cdp,
      `JSON.stringify({ foco: document.activeElement?.id, texto: document.querySelector('#gracias-titulo')?.parentElement?.textContent ?? '',
        listo: Boolean(document.querySelector('.contacto[data-listo]')), formulario: Boolean(document.querySelector('.formulario-contacto')) })`,
    ),
  );
  comprobar("el foco pasa al título del gracias", gracias.foco === "gracias-titulo", gracias.foco);
  comprobar("da las gracias por su nombre", gracias.texto.includes("Gracias, Prueba."), gracias.texto.slice(0, 120));
  comprobar("y dice a qué teléfono lo buscan", gracias.texto.includes("443 123 4567"), gracias.texto.slice(0, 160));
  comprobar("el mostrador se entera (data-listo) y el formulario se fue", gracias.listo && !gracias.formulario);
  await capturar(cdp, "4-gracias-telefono");
  const trampa = consultar(`SELECT COUNT(*) AS n FROM prospectos WHERE nombre = ${sql(MARCA)};`, opciones);
  comprobar("la trampa no guardó nada", Number(trampa[0]?.n) === 0, JSON.stringify(trampa));

  // ─── 5. Un envío de verdad (solo local) ──────────────────────────
  if (!remoto) {
    console.log("\n5. Un envío de verdad con «Vender» (solo en local)");
    const real = await fetch(`${BASE}/contacto`, {
      method: "POST",
      headers: { ...cabeceras, "cf-connecting-ip": "10.7.7.22" },
      body: new URLSearchParams({
        nombre: MARCA,
        telefono: "4431234567",
        motivo: "vender",
        mensaje: "Tengo una casa en Tres Marías.",
        acepto: "on",
      }).toString(),
    });
    comprobar("responde 200", real.status === 200, `estado ${real.status}`);
    const [fila] = consultar(`SELECT tipo, mensaje, origen FROM prospectos WHERE nombre = ${sql(MARCA)};`, opciones);
    comprobar("quedó como tipo «vender», desde contacto", fila?.tipo === "vender" && fila?.origen === "contacto", JSON.stringify(fila));
    comprobar("con su frase delante del mensaje", fila?.mensaje === "Quiere vender. Tengo una casa en Tres Marías.", fila?.mensaje);
    ejecutarSql(`DELETE FROM prospectos WHERE nombre = ${sql(MARCA)};`, opciones);
    const quedan = consultar(`SELECT COUNT(*) AS n FROM prospectos WHERE nombre = ${sql(MARCA)};`, opciones);
    comprobar("y se borró", Number(quedan[0]?.n) === 0);
  }

  // ─── 6. Con «menos movimiento» ─────────────────────────────────
  console.log("\n6. Con «menos movimiento», el gracias se ve entero");
  await abrirContacto(cdp, { reducido: true });
  await escribir(cdp, "#contacto-nombre", MARCA);
  await escribir(cdp, "#contacto-correo", "prueba@ejemplo.invalid");
  await pulsar(cdp, 'input[name="acepto"]');
  await evaluar(cdp, `document.querySelector('[name="empresa"]').value = 'spam'`);
  await pulsar(cdp, ".boton-enviar");
  await hasta(cdp, `document.getElementById('gracias-titulo')`, 10000);
  await esperar(300);
  const quieto = JSON.parse(
    await evaluar(
      cdp,
      `JSON.stringify({ globo: getComputedStyle(document.querySelector('.exito-globo')).opacity,
        titulo: getComputedStyle(document.getElementById('gracias-titulo')).opacity,
        texto: document.querySelector('#gracias-titulo')?.parentElement?.textContent ?? '' })`,
    ),
  );
  comprobar("el globo y el título, a la vista", quieto.globo === "1" && quieto.titulo === "1", JSON.stringify(quieto).slice(0, 160));
  comprobar("con correo, dice que le escriben a su correo", quieto.texto.includes("te escribe pronto a prueba@ejemplo.invalid"));

  if (CAPTURAS) {
    console.log("\n· Capturas de escritorio");
    await abrirContacto(cdp, { ancho: 1440, alto: 900, movil: false });
    await esperar(4500);
    await capturar(cdp, "5-escritorio-1440");
    await pulsar(cdp, ".boton-enviar");
    await esperar(600);
    await capturar(cdp, "6-escritorio-errores");
    for (const [ancho, alto] of [[1920, 1080], [2560, 1440]]) {
      await abrirContacto(cdp, { ancho, alto, movil: false });
      await esperar(4500);
      await capturar(cdp, `7-escritorio-${ancho}`);
    }
  }
} finally {
  navegador?.cerrar();
  // Por si el guion murió a medias: la marca no debe quedarse en la base.
  if (!remoto) ejecutarSql(`DELETE FROM prospectos WHERE nombre = ${sql(MARCA)};`, opciones);
}

const fallidas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallidas.length} de ${resultados.length} comprobaciones pasaron.`);
if (fallidas.length) {
  console.log("Fallaron:\n" + fallidas.map((f) => `  - ${f.nombre}`).join("\n"));
  process.exit(1);
}
