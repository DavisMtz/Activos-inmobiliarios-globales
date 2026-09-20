#!/usr/bin/env node
/**
 * El buscador que entiende frases (PLAN §10.5), de punta a punta contra el
 * sitio corriendo:
 *
 *   npm run verificar:busqueda -- --base http://localhost:5180 --local
 *   npm run verificar:busqueda -- --base http://localhost:5180 --local --ia
 *   npm run verificar:busqueda -- --base https://… --remote --ia
 *
 * 1. **Sin modelo.** Todo lo que se resuelve con vocabulario y catálogo. Se pide
 *    con un agente de robot, que el sitio nunca manda al modelo: así esta parte
 *    es determinista y no gasta un solo Neuron.
 * 2. **El interruptor del panel**, pulsado con un navegador de verdad (lo que la
 *    gente pulsa no es la API: PLAN §17) y con una cuenta de director de prueba,
 *    que se borra al final. Deja el ajuste como lo encontró.
 * 3. **Con el modelo** (`--ia`): frases con precios contra Workers AI real. Gasta
 *    unas cuantas consultas del tope diario.
 *
 * Se cierra mirando la base: cero cuentas `@ejemplo.invalid` y el ajuste
 * `busqueda_ia` idéntico al del arranque.
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { consultar, ejecutarSql, texto as sql } from "./lib/d1.mjs";
import { borrarUsuarioDePrueba, buscarUsuario, crearUsuarioConTemporal } from "./lib/usuarios.mjs";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:5180" },
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    ia: { type: "boolean", default: false },
  },
});
if (values.local === values.remote) {
  console.error("Indica exactamente uno: --local o --remote.");
  process.exit(1);
}
const remoto = values.remote;
const opciones = { remoto };
const BASE = values.base.replace(/\/+$/, "");
const ORIGEN = new URL(BASE).origin;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const CORREO = "busqueda-director@ejemplo.invalid";

/** Un robot declarado: el sitio no le paga inferencia a ninguno. */
const ROBOT = "verificador-aig/1.0 (bot; +https://github.com/DavisMtz/Activos-inmobiliarios-globales)";
const NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const resultados = [];
function comprobar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok: Boolean(ok) });
  console.log(`${ok ? "  ✔" : "  ✖"} ${nombre}${!ok && detalle ? `\n      → ${detalle}` : ""}`);
}
const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

// ─── Pedir una búsqueda ───────────────────────────────────────────

let ipDePrueba = 20;
/** Busca `q` (más lo que se pida) SIN seguir la redirección: es lo que se comprueba. */
async function buscar(parametros, { agente = ROBOT } = {}) {
  const url = new URL(`${BASE}/propiedades`);
  for (const [nombre, valor] of Object.entries(parametros)) url.searchParams.set(nombre, valor);
  const cabeceras = { "user-agent": agente };
  // En local cada petición trae su IP, para no chocar con el freno por persona.
  if (!remoto) cabeceras["cf-connecting-ip"] = `10.8.8.${ipDePrueba++ % 250}`;
  const inicio = Date.now();
  const respuesta = await fetch(url, { redirect: "manual", headers: cabeceras });
  const destino = respuesta.headers.get("location");
  return {
    estado: respuesta.status,
    ms: Date.now() - inicio,
    destino,
    // Los parámetros del destino, ya leídos: comparar textos con acentos codificados es una trampa.
    a: destino ? Object.fromEntries(new URL(destino, BASE).searchParams) : null,
    html: respuesta.status === 200 ? await respuesta.text() : "",
  };
}

const totalDe = async (parametros) => {
  const url = new URL(`${BASE}/api/propiedades`);
  for (const [nombre, valor] of Object.entries(parametros)) url.searchParams.set(nombre, valor);
  return (await (await fetch(url, { headers: { "user-agent": ROBOT } })).json()).total;
};

const sinAcentos = (texto) => texto.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const mismos = (a, esperado) => a !== null && Object.entries(esperado).every(([k, v]) => a[k] === v) && Object.keys(a).every((k) => k in esperado || k === "frase");

console.log(`\nVerificando el buscador contra ${BASE}\n`);

const ajusteInicial = consultar("SELECT valor FROM configuracion WHERE clave = 'busqueda_ia';", opciones)[0]?.valor ?? null;
comprobar("la migración 0005 está aplicada (existe el ajuste `busqueda_ia`)", ajusteInicial !== null);

// ─── 1. Sin modelo ────────────────────────────────────────────────
console.log("\n1. Lo que se entiende sin gastar (vocabulario y catálogo)");

{
  const r = await buscar({ q: "altozano" });
  comprobar("una colonia bien escrita no se toca: responde 200, sin redirigir", r.estado === 200 && !r.destino, `${r.estado} ${r.destino}`);
}
{
  const r = await buscar({ q: "altosano" });
  comprobar("«altosano» redirige a «Altozano»", r.estado === 302 && mismos(r.a, { q: "Altozano" }) && r.a.frase === "altosano", r.destino);
  const [bien, mal] = [await totalDe({ q: "Altozano" }), await totalDe({ q: "altosano" })];
  comprobar("…y eso encuentra casas donde el texto tal cual no encontraba ninguna", bien > 0 && mal === 0, `«Altozano» ${bien}, «altosano» ${mal}`);
}
{
  const r = await buscar({ q: "kasa en benta 3 rrecamaras" });
  comprobar("«kasa en benta 3 rrecamaras» → casas, en venta, 3 o más recámaras", mismos(r.a, { operacion: "venta", tipo: "casa", recamaras: "3" }), r.destino);
}
{
  const r = await buscar({ q: "depa en renta en tres marias" });
  comprobar("«depa en renta en tres marias» → departamentos, en renta, «Tres Marías»", mismos(r.a, { operacion: "renta", tipo: "departamento", q: "Tres Marías" }), r.destino);
}
{
  const r = await buscar({ q: "la casa mas grande que tengan" });
  comprobar("«la casa más grande que tengan» → casas, de mayor a menor", mismos(r.a, { tipo: "casa", orden: "m2_desc" }), r.destino);
}
{
  const r = await buscar({ q: "aig 42" });
  comprobar("«aig 42» → la clave como es: AIG-0042", mismos(r.a, { q: "AIG-0042" }), r.destino);
}
{
  const r = await buscar({ q: "casa con alberca" });
  comprobar("«casa con alberca» → casas con el rasgo «alberca»", mismos(r.a, { tipo: "casa", con: "alberca" }), r.destino);

  const url = new URL(`${BASE}/api/propiedades?tipo=casa&con=alberca`);
  const lista = await (await fetch(url, { headers: { "user-agent": ROBOT } })).json();
  const fichas = await Promise.all(lista.items.map(async (casa) => (await fetch(`${BASE}/api/propiedades/${casa.slug}`)).json()));
  const todas = fichas.every((f) => /alberca|piscina/.test(sinAcentos(`${f.titulo} ${f.resumen ?? ""} ${f.descripcion ?? ""}`)));
  comprobar(`…y las ${lista.total} que salen dicen «alberca» en su ficha`, lista.total > 0 && todas, `${lista.total} casas`);

  const [conUno, conDos] = [await totalDe({ con: "jardin" }), await totalDe({ con: "jardin,alberca" })];
  comprobar("dos rasgos exigen los dos: «jardín y alberca» son menos que «jardín»", conDos > 0 && conDos < conUno, `${conDos} contra ${conUno}`);
  comprobar("un rasgo mal escrito se corrige: «alverca» da lo mismo que «alberca»", (await totalDe({ con: "alverca" })) === (await totalDe({ con: "alberca" })));
}
{
  const r = await buscar({ q: "casa con alberca", tipo: "departamento" });
  comprobar("lo elegido a mano en el formulario manda sobre la frase", r.a?.tipo === "departamento", r.destino);
}

console.log("\n   Lo que NO se reinterpreta");
{
  const literal = await buscar({ q: "casa con alberca", literal: "1" });
  comprobar("con `literal=1` se busca el texto tal cual", literal.estado === 200 && !literal.destino, `${literal.estado} ${literal.destino}`);
  const yaEntendida = await buscar({ tipo: "casa", con: "alberca", frase: "casa con alberca" });
  comprobar("lo ya entendido (`frase=`) no se vuelve a entender: no hay vueltas", yaEntendida.estado === 200 && !yaEntendida.destino);
  comprobar("…y enseña «Así lo entendimos» con la frase y el enlace al texto tal cual", /As(í|&#xED;)\s*lo entendimos/.test(yaEntendida.html) && yaEntendida.html.includes("literal=1"));
  const pagina2 = await buscar({ q: "casa con alberca", pagina: "2" });
  comprobar("una página 2 jamás se reinterpreta", pagina2.estado === 200 && !pagina2.destino);
  const api = await fetch(`${BASE}/api/propiedades?q=${encodeURIComponent("casa con alberca")}`, { redirect: "manual" });
  comprobar("la API busca el texto tal cual y nunca redirige", api.status === 200);
  const saludo = await buscar({ q: "hola buenas tardes" });
  comprobar("lo que no es una búsqueda no redirige a ningún lado", saludo.estado === 200 && !saludo.destino);
  const larga = await buscar({ q: "casa ".repeat(60) });
  comprobar("un texto larguísimo no se interpreta ni rompe nada", larga.estado === 200);
  const inyeccion = await buscar({ tipo: "casa", frase: '<script>alert(1)</script>"' });
  comprobar("la frase se enseña como texto, nunca como HTML", inyeccion.estado === 200 && !inyeccion.html.includes("<script>alert(1)"));
}

// ─── 2. El interruptor, desde el panel ────────────────────────────
console.log("\n2. El interruptor de Panel › Configuración, con navegador");

function soltarReferencias(id) {
  ejecutarSql(`UPDATE configuracion SET actualizado_por = NULL WHERE actualizado_por = ${sql(id)};`, opciones);
}
function limpiarCuenta() {
  const cuenta = buscarUsuario(CORREO, opciones);
  if (!cuenta) return;
  soltarReferencias(cuenta.id);
  borrarUsuarioDePrueba(cuenta.id, CORREO, opciones);
}
const ajusteActual = () => JSON.parse(consultar("SELECT valor FROM configuracion WHERE clave = 'busqueda_ia';", opciones)[0]?.valor ?? "{}");

let navegador = null;
try {
  limpiarCuenta();
  const prueba = await crearUsuarioConTemporal({ correo: CORREO, nombre: "Director De Prueba", rol: "director" }, opciones);
  const clave = `buscador ${randomBytes(6).toString("base64url")}`;
  const cabeceras = { "Content-Type": "application/json", Origin: ORIGEN };
  if (!remoto) cabeceras["cf-connecting-ip"] = "10.8.7.7";

  let entrada;
  for (let intento = 1; intento <= 3; intento++) {
    entrada = await fetch(`${BASE}/api/panel/sesion`, { method: "POST", headers: cabeceras, body: JSON.stringify({ correo: CORREO, clave: prueba.clave }) });
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
  comprobar("la cuenta de director de prueba entra", Boolean(valorCookie));

  navegador = await abrirChrome();
  const { cdp } = navegador;
  await cdp("Page.enable");
  await cdp("Network.enable");
  await cdp("Runtime.enable");
  await cdp("Network.setCookie", {
    name: "__Host-aig_sesion",
    value: valorCookie,
    domain: new URL(BASE).hostname,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // Lo que la gente pulsa no es la API (PLAN §17): la frase, tecleada en la
  // portada y enviada con Intro. Con JavaScript, React Router navega SIN
  // recargar y la redirección le llega por `/propiedades.data`, no como un 302.
  await cdp("Page.navigate", { url: `${BASE}/` });
  // Hasta que React hidrata el campo (le cuelga sus `__reactProps$…`), Intro
  // enviaría el formulario a la antigua, recargando; y teclear antes de tiempo
  // se pierde. Esperar «un rato» falló una de cada tres corridas.
  const CAMPO = `document.querySelector('form[action="/propiedades"] input[name="q"]')`;
  await esperarA(cdp, `!!${CAMPO} && Object.keys(${CAMPO}).some((k) => k.startsWith("__reactProps"))`, { intentos: 80 });
  await esperar(400);
  const FRASE = "kasa en benta en altosano con alberca";
  for (let intento = 0; intento < 3; intento++) {
    await evaluar(cdp, `window.__sinRecarga = true; ${CAMPO}.value = ""; ${CAMPO}.focus()`);
    await cdp("Input.insertText", { text: FRASE });
    if ((await evaluar(cdp, `${CAMPO}.value`)) === FRASE) break;
    await esperar(500);
  }
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r" });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  const llego = await esperarA(cdp, `location.pathname === "/propiedades" && location.search.includes("frase=")`);
  const donde = await evaluar(cdp, "location.search");
  const parametros = Object.fromEntries(new URLSearchParams(donde));
  comprobar(
    "tecleada en la portada y enviada con Intro, la frase llega convertida en filtros",
    llego && parametros.operacion === "venta" && parametros.tipo === "casa" && parametros.q === "Altozano" && parametros.con === "alberca",
    donde,
  );
  comprobar("…navegando sin recargar la página", (await evaluar(cdp, "window.__sinRecarga === true")) === true);
  comprobar(
    "…y la página lo enseña: «Así lo entendimos», el buscador con «Altozano» y el rasgo para quitar",
    await evaluar(
      cdp,
      `document.body.textContent.includes("Así lo entendimos") && document.querySelector('#filtros input[name="q"]').value === "Altozano" && !!document.querySelector('#filtros input[name="con"][value="alberca"]')`,
    ),
  );
  await evaluar(cdp, `[...document.querySelectorAll('#filtros a')].find((a) => a.textContent.includes("alberca"))?.click()`);
  const sinRasgo = await esperarA(cdp, `!location.search.includes("con=")`);
  comprobar("quitar el rasgo con su botón lo saca de la búsqueda y deja lo demás", sinRasgo && (await evaluar(cdp, `location.search.includes("tipo=casa")`)), await evaluar(cdp, "location.search"));

  /** Pone la casilla como se pide y pulsa «Guardar el buscador», como lo haría una persona. */
  async function ponerInterruptor(encendido) {
    await cdp("Page.navigate", { url: `${BASE}/panel/configuracion` });
    await esperarA(cdp, `!!document.querySelector('input[name="que"][value="busqueda_ia"]')`);
    await esperar(800);
    return evaluar(
      cdp,
      `(() => {
        const formulario = document.querySelector('input[name="que"][value="busqueda_ia"]')?.form;
        if (!formulario) return "sin formulario";
        const casilla = formulario.querySelector('input[name="activa"]');
        if (casilla.checked !== ${encendido}) casilla.click();
        [...formulario.querySelectorAll("button")].find((b) => b.textContent.includes("Guardar")).click();
        return "pulsado";
      })()`,
    );
  }

  comprobar("el director ve el bloque «Buscador inteligente»", (await ponerInterruptor(false)) === "pulsado");
  await esperarA(cdp, `location.search.includes("guardado=busqueda_ia")`);
  comprobar("desmarcar «Encendido» y guardar lo APAGA en la base", ajusteActual().activa === false, JSON.stringify(ajusteActual()));
  comprobar("…sin tocar ni el modelo ni el tope", ajusteActual().tope_diario === JSON.parse(ajusteInicial ?? "{}").tope_diario);

  const portadaApagada = await (await fetch(`${BASE}/`, { headers: { "user-agent": NAVEGADOR } })).text();
  comprobar("apagado, la portada pide la colonia, como siempre", portadaApagada.includes("colonia te interesa") && !portadaApagada.includes("estás buscando"));
  const sinIA = await buscar({ q: "casa en altosano hasta 8 millones" }, { agente: NAVEGADOR });
  comprobar("apagado, sigue entendiendo lo básico (casas, «Altozano») y NO pregunta al modelo", mismos(sinIA.a, { tipo: "casa", q: "Altozano" }), sinIA.destino);

  await ponerInterruptor(true);
  await esperarA(cdp, `location.search.includes("guardado=busqueda_ia")`);
  comprobar("marcarlo otra vez lo ENCIENDE", ajusteActual().activa === true, JSON.stringify(ajusteActual()));
  const portadaEncendida = await (await fetch(`${BASE}/`, { headers: { "user-agent": NAVEGADOR } })).text();
  comprobar("encendido, la portada invita a escribir lo que se busca", portadaEncendida.includes("estás buscando"));

  const desborde = await evaluar(cdp, "document.documentElement.scrollWidth - innerWidth");
  comprobar("el bloque cabe a 390 px, sin desplazamiento horizontal", desborde <= 0, `sobran ${desborde} px`);

  // Quien no tiene el permiso no lo cambia, ni por la API.
  const bitacora = consultar(`SELECT COUNT(*) AS n FROM bitacora WHERE entidad = 'configuracion' AND entidad_id = 'busqueda_ia' AND usuario_id = ${sql(prueba.id)};`, opciones)[0]?.n;
  comprobar("cada cambio quedó en la bitácora", bitacora === 2, `${bitacora} registros`);
  const sinSesion = await fetch(`${BASE}/api/panel/configuracion/busqueda_ia`, { method: "PATCH", headers: cabeceras, body: JSON.stringify({ activa: false }) });
  comprobar("sin sesión, la API no deja tocarlo", sinSesion.status === 401, String(sinSesion.status));
  const soloTope = await fetch(`${BASE}/api/panel/configuracion/busqueda_ia`, {
    method: "PATCH",
    headers: { ...cabeceras, Cookie: `__Host-aig_sesion=${valorCookie}` },
    body: JSON.stringify({ tope_diario: 123 }),
  });
  comprobar("un PATCH con solo el tope NO lo apaga de paso", soloTope.ok && ajusteActual().activa === true && ajusteActual().tope_diario === 123, JSON.stringify(ajusteActual()));
  const modeloFalso = await fetch(`${BASE}/api/panel/configuracion/busqueda_ia`, {
    method: "PATCH",
    headers: { ...cabeceras, Cookie: `__Host-aig_sesion=${valorCookie}` },
    body: JSON.stringify({ modelo: "@cf/inventado/modelo" }),
  });
  comprobar("un modelo que no se midió se rechaza", modeloFalso.status === 400, String(modeloFalso.status));
} finally {
  navegador?.cerrar();
  // El ajuste, tal como estaba; y la cuenta de prueba, fuera.
  if (ajusteInicial !== null) ejecutarSql(`UPDATE configuracion SET valor = ${sql(ajusteInicial)}, actualizado_por = NULL WHERE clave = 'busqueda_ia';`, opciones);
  limpiarCuenta();
}

// ─── 3. Con el modelo ─────────────────────────────────────────────
if (values.ia) {
  console.log("\n3. Con el modelo de Workers AI (gasta consultas de verdad)");
  const usoAntes = consultar("SELECT COALESCE(SUM(consultas),0) AS c, COALESCE(SUM(de_cache),0) AS m FROM ia_uso;", opciones)[0];
  // Una cifra al azar (5,600 posibles): así la frase no está en la memoria y el
  // modelo tiene que contestar. Con solo siete frases distintas, a la cuarta
  // corrida ya salían todas de la memoria y «subieron las consultas» fallaba.
  const millones = 2 + Math.floor(Math.random() * 7);
  const miles = 100 + Math.floor(Math.random() * 800);
  const tope = millones * 1_000_000 + miles * 1_000;
  const frase = `casas en altosano de menos de ${millones} millones ${miles} mil con ${["estudio", "terraza", "jardin"][millones % 3]}`;

  let primera = await buscar({ q: frase }, { agente: NAVEGADOR });
  if (!primera.a?.precio_max) {
    // Una cola ocasional de más de 3 s se corta y cae a lo básico: se intenta una vez más.
    await esperar(1500);
    primera = await buscar({ q: frase }, { agente: NAVEGADOR });
  }
  comprobar(
    `«${frase}» → hasta $${tope.toLocaleString("es-MX")}, en «Altozano»`,
    primera.a?.precio_max === String(tope) && primera.a?.q === "Altozano" && primera.a?.tipo === "casa",
    `${primera.destino} (${primera.ms} ms)`,
  );
  comprobar("contesta dentro del reloj (3 s de modelo más la página)", primera.ms < 6000, `${primera.ms} ms`);

  const segunda = await buscar({ q: frase.toUpperCase() }, { agente: NAVEGADOR });
  comprobar("la misma frase, otra vez (y en mayúsculas), sale de la memoria: mismo destino", segunda.a?.precio_max === primera.a?.precio_max && segunda.a?.con === primera.a?.con, segunda.destino);
  await esperar(1500);
  const usoDespues = consultar("SELECT COALESCE(SUM(consultas),0) AS c, COALESCE(SUM(de_cache),0) AS m FROM ia_uso;", opciones)[0];
  comprobar("la cuenta del día subió en consultas Y en «de memoria»", usoDespues.c > usoAntes.c && usoDespues.m > usoAntes.m, `${JSON.stringify(usoAntes)} → ${JSON.stringify(usoDespues)}`);

  let rango = await buscar({ q: `depa en renta de ${millones + 5} mil a ${millones + 15} mil al mes` }, { agente: NAVEGADOR });
  if (!rango.a?.precio_max) {
    await esperar(1500);
    rango = await buscar({ q: `depa en renta de ${millones + 5} mil a ${millones + 15} mil al mes` }, { agente: NAVEGADOR });
  }
  comprobar(
    "un rango de renta llena precio mínimo y máximo",
    rango.a?.operacion === "renta" && rango.a?.tipo === "departamento" && rango.a?.precio_min === String((millones + 5) * 1000) && rango.a?.precio_max === String((millones + 15) * 1000),
    rango.destino,
  );

  const robot = await buscar({ q: `casas de menos de ${millones + 1} millones y medio` });
  comprobar("a un robot no se le paga inferencia: se queda con lo básico", robot.a?.tipo === "casa" && !robot.a?.precio_max, robot.destino);

  const guardadas = consultar("SELECT clave, valor FROM ia_cache ORDER BY expira DESC LIMIT 5;", opciones);
  comprobar(
    "en la memoria no queda escrito lo que la gente buscó (solo huellas)",
    guardadas.length > 0 && guardadas.every((g) => /^[0-9a-f]{64}$/.test(g.clave) && !sinAcentos(g.valor).includes("menos de")),
    JSON.stringify(guardadas[0] ?? {}).slice(0, 160),
  );
} else {
  console.log("\n3. Con el modelo: omitido (agrega --ia para probar contra Workers AI de verdad)");
}

// ─── Cierre: mirando la base ──────────────────────────────────────
console.log("\nCierre");
const cuentas = consultar("SELECT COUNT(*) AS n FROM usuarios WHERE correo LIKE '%@ejemplo.invalid';", opciones)[0]?.n;
comprobar("no queda ninguna cuenta de prueba", cuentas === 0 || (remoto && cuentas <= 2), `${cuentas} cuentas @ejemplo.invalid`);
const ajusteFinal = consultar("SELECT valor FROM configuracion WHERE clave = 'busqueda_ia';", opciones)[0]?.valor ?? null;
comprobar("el ajuste del buscador quedó como estaba", ajusteFinal === ajusteInicial, `${ajusteInicial} → ${ajusteFinal}`);

const fallidas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallidas.length}/${resultados.length} comprobaciones`);
if (fallidas.length) {
  for (const f of fallidas) console.log(`  ✖ ${f.nombre}`);
  process.exit(1);
}

// ─── Chrome por CDP ───────────────────────────────────────────────

async function abrirChrome() {
  const perfil = mkdtempSync(join(tmpdir(), "aig-bus-"));
  const puerto = 9300 + Math.floor(Math.random() * 150);
  const chrome = spawn(
    CHROME,
    ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "about:blank"],
    { stdio: "ignore" },
  );
  let objetivos;
  for (let i = 0; i < 80; i++) {
    try {
      objetivos = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json();
      if (objetivos.some((o) => o.type === "page")) break;
    } catch {}
    await esperar(200);
  }
  const ws = new WebSocket(objetivos.find((o) => o.type === "page").webSocketDebuggerUrl);
  await new Promise((listo) => ws.addEventListener("open", listo, { once: true }));
  let id = 0;
  const pendientes = new Map();
  ws.addEventListener("message", (evento) => {
    const mensaje = JSON.parse(evento.data);
    if (mensaje.id && pendientes.has(mensaje.id)) {
      pendientes.get(mensaje.id)(mensaje);
      pendientes.delete(mensaje.id);
    }
  });
  const cdp = (method, params = {}) =>
    new Promise((listo) => {
      const n = ++id;
      pendientes.set(n, listo);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  return { cdp, cerrar: () => { ws.close(); chrome.kill(); } };
}

async function evaluar(cdp, expresion) {
  const r = await cdp("Runtime.evaluate", { expression: expresion, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
}

async function esperarA(cdp, expresion, { intentos = 40, pausa = 250 } = {}) {
  for (let i = 0; i < intentos; i++) {
    if (await evaluar(cdp, expresion)) return true;
    await esperar(pausa);
  }
  return false;
}
