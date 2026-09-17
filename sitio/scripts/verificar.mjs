#!/usr/bin/env node
/**
 * Verificación de F0 contra la app CORRIENDO (PLAN §15, «listo cuando» 2–6).
 *
 *   node scripts/verificar.mjs --base http://localhost:5180 --local
 *   node scripts/verificar.mjs --base https://activos-inmobiliarios.logidma.workers.dev --remote
 *
 * Crea un maestro DESECHABLE (`maestro-prueba@ejemplo.invalid`), recorre con él
 * el acceso con temporal → cambio obligatorio → salir → volver a entrar, prueba
 * los rechazos y el freno de intentos, y al final lo borra con todo su rastro.
 * Nunca toca la cuenta real del maestro.
 *
 * En local, cada caso manda su propia `cf-connecting-ip` para no gastar la
 * cubeta del freno de los demás. En remoto NO se manda: Cloudflare rechaza con
 * «403 error code: 1000» toda petición de fuera que la traiga (medido el
 * 16/09/2026). Ahí todo sale de la misma IP, así que el freno se prueba al
 * final, tras esperar a que se vacíe la ventana de un minuto.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { consultar, ejecutarSql, texto } from "./lib/d1.mjs";
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
const remoto = values.remote;
const BASE = values.base.replace(/\/+$/, "");
const ORIGEN = new URL(BASE).origin;
const CORREO_PRUEBA = "maestro-prueba@ejemplo.invalid";

// ─── Pequeño arnés ───────────────────────────────────────────────

const resultados = [];
function comprobar(nombre, condicion, detalle = "") {
  resultados.push({ nombre, ok: Boolean(condicion) });
  console.log(`${condicion ? "  ✔" : "  ✖"} ${nombre}${!condicion && detalle ? `\n      → ${detalle}` : ""}`);
}

// IP simuladas distintas en cada corrida: si no, repetir la verificación antes
// de un minuto encuentra la cubeta del freno todavía llena de la corrida anterior.
const lote = randomBytes(2);
let ipSecuencia = 0;
const ipNueva = () => `10.${lote[0]}.${lote[1]}.${++ipSecuencia}`;

async function pedir(ruta, { metodo = "GET", cookie, json, formulario, origen = true, ip = ipNueva() } = {}) {
  const cabeceras = { "user-agent": "verificar-f0" };
  if (!remoto) cabeceras["cf-connecting-ip"] = ip;
  if (cookie) cabeceras.Cookie = cookie;
  if (origen && metodo !== "GET") cabeceras.Origin = ORIGEN;
  let cuerpo;
  if (json) {
    cabeceras["Content-Type"] = "application/json";
    cuerpo = JSON.stringify(json);
  } else if (formulario) {
    cabeceras["Content-Type"] = "application/x-www-form-urlencoded";
    cuerpo = new URLSearchParams(formulario).toString();
  }
  const r = await fetch(BASE + ruta, { method: metodo, headers: cabeceras, body: cuerpo, redirect: "manual" });
  // React separa textos contiguos con <!-- --> en el HTML del servidor.
  const textoRespuesta = (await r.text()).replaceAll("<!-- -->", "");
  let datos = null;
  try {
    datos = JSON.parse(textoRespuesta);
  } catch {}
  const setCookie = r.headers.getSetCookie?.() ?? [];
  const cookieSesion = setCookie.find((c) => c.startsWith("__Host-aig_sesion="));
  return {
    estado: r.status,
    cabeceras: r.headers,
    texto: textoRespuesta,
    datos,
    setCookie: cookieSesion ?? null,
    cookie: cookieSesion ? cookieSesion.split(";")[0] : null,
  };
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const claveAlAzar = () => `prueba ${randomBytes(9).toString("base64url")}`;

// ─── Preparación ─────────────────────────────────────────────────

console.log(`\nVerificando F0 contra ${BASE} (${remoto ? "D1 remota" : "D1 local"})\n`);

const previo = buscarUsuario(CORREO_PRUEBA, { remoto });
if (previo) borrarUsuarioDePrueba(previo.id, CORREO_PRUEBA, { remoto });
const prueba = await crearUsuarioConTemporal({ correo: CORREO_PRUEBA, nombre: "Maestro De Prueba", rol: "maestro" }, { remoto });
const claveNueva = claveAlAzar();
const correosDelFreno = [];

try {
  // ─── 2. Todo con noindex; robots y sitemap de la propuesta ──────
  console.log("Sitio y cabeceras");
  const inicio = await pedir("/");
  comprobar("GET / responde 200", inicio.estado === 200, `estado ${inicio.estado}`);
  comprobar("GET / trae X-Robots-Tag: noindex, nofollow", inicio.cabeceras.get("x-robots-tag") === "noindex, nofollow");
  comprobar("GET / trae <meta name=robots noindex>", inicio.texto.includes('name="robots" content="noindex,nofollow"'));
  const robots = await pedir("/robots.txt");
  comprobar("robots.txt dice Disallow: /", robots.estado === 200 && /Disallow: \/\s*$/m.test(robots.texto), robots.texto);
  comprobar("robots.txt trae noindex", robots.cabeceras.get("x-robots-tag") === "noindex, nofollow");
  const sitemap = await pedir("/sitemap.xml");
  comprobar("sitemap.xml responde 404 en modo propuesta", sitemap.estado === 404, `estado ${sitemap.estado}`);
  const noExiste = await pedir("/propiedades/esta-casa-no-existe");
  comprobar("una ficha inexistente responde 404 con noindex", noExiste.estado === 404 && noExiste.cabeceras.get("x-robots-tag") === "noindex, nofollow", `estado ${noExiste.estado}`);
  if (remoto) {
    // `public/_headers` solo lo aplica Cloudflare: el servidor de Vite no lo lee.
    const estatico = await pedir("/marca/logo-1@2x.png");
    comprobar("un archivo estático también trae noindex", estatico.cabeceras.get("x-robots-tag")?.includes("noindex"), `x-robots-tag: ${estatico.cabeceras.get("x-robots-tag")}`);
  }

  // ─── 6. Panel sin sesión ────────────────────────────────────────
  console.log("\nPanel sin sesión");
  const panelSin = await pedir("/panel");
  comprobar("/panel sin sesión → 302 a /panel/entrar", panelSin.estado === 302 && panelSin.cabeceras.get("location")?.endsWith("/panel/entrar"), `estado ${panelSin.estado} → ${panelSin.cabeceras.get("location")}`);
  comprobar("/panel trae Cache-Control: no-store", panelSin.cabeceras.get("cache-control") === "no-store");
  const apiSin = await pedir("/api/panel/propiedades");
  comprobar("/api/panel/propiedades sin sesión → 401", apiSin.estado === 401, `estado ${apiSin.estado}`);
  comprobar("/api/panel/* trae noindex y no-store", apiSin.cabeceras.get("x-robots-tag") === "noindex, nofollow" && apiSin.cabeceras.get("cache-control") === "no-store");
  const entrarPagina = await pedir("/panel/entrar");
  comprobar("/panel/entrar se pinta (200) sin JavaScript", entrarPagina.estado === 200 && entrarPagina.texto.includes("Entrar al panel"), `estado ${entrarPagina.estado}`);

  // ─── CSRF y errores de acceso ───────────────────────────────────
  console.log("\nAcceso");
  const sinOrigen = await pedir("/api/panel/sesion", { metodo: "POST", json: { correo: CORREO_PRUEBA, clave: prueba.clave }, origen: false });
  comprobar("POST sin cabecera Origin → 403", sinOrigen.estado === 403, `estado ${sinOrigen.estado}`);
  const claveMala = await pedir("/api/panel/sesion", { metodo: "POST", json: { correo: CORREO_PRUEBA, clave: "no es la clave" } });
  comprobar("clave incorrecta → 401 con mensaje único", claveMala.estado === 401 && claveMala.datos?.mensaje === "Correo o contraseña incorrectos.", JSON.stringify(claveMala.datos));
  const correoMalo = await pedir("/api/panel/sesion", { metodo: "POST", json: { correo: "nadie-aqui@ejemplo.invalid", clave: "lo que sea 123" } });
  correosDelFreno.push("nadie-aqui@ejemplo.invalid");
  comprobar("correo inexistente → mismo 401 y mismo mensaje", correoMalo.estado === 401 && correoMalo.datos?.mensaje === claveMala.datos?.mensaje, JSON.stringify(correoMalo.datos));

  // ─── 3 y 4. Temporal → cambio obligatorio ──────────────────────
  console.log("\nContraseña temporal");
  const conTemporal = await pedir("/api/panel/sesion", { metodo: "POST", json: { correo: CORREO_PRUEBA, clave: prueba.clave } });
  comprobar("entra con la temporal → 200 y debe_cambiar_clave", conTemporal.estado === 200 && conTemporal.datos?.debe_cambiar_clave === true, `estado ${conTemporal.estado} ${conTemporal.texto.slice(0, 120)}`);
  const c1 = conTemporal.cookie;
  comprobar("cookie __Host- con HttpOnly, Secure y SameSite=Lax", Boolean(conTemporal.setCookie && /HttpOnly/i.test(conTemporal.setCookie) && /Secure/i.test(conTemporal.setCookie) && /SameSite=Lax/i.test(conTemporal.setCookie) && /Path=\//.test(conTemporal.setCookie)), conTemporal.setCookie ?? "sin cookie");

  const bloqueada = await pedir("/api/panel/propiedades", { cookie: c1 });
  comprobar("con sesión «solo cambio de clave», GET /api/panel/propiedades → 403", bloqueada.estado === 403 && bloqueada.datos?.error === "debe_cambiar_clave", `estado ${bloqueada.estado} ${bloqueada.texto.slice(0, 100)}`);
  const panelTemporal = await pedir("/panel", { cookie: c1 });
  comprobar("/panel con temporal → 302 a /panel/cambiar-clave", panelTemporal.estado === 302 && panelTemporal.cabeceras.get("location")?.endsWith("/panel/cambiar-clave"), `estado ${panelTemporal.estado} → ${panelTemporal.cabeceras.get("location")}`);
  const paginaCambio = await pedir("/panel/cambiar-clave", { cookie: c1 });
  comprobar("/panel/cambiar-clave se pinta con la temporal", paginaCambio.estado === 200 && paginaCambio.texto.includes("Elige tu contraseña"), `estado ${paginaCambio.estado}`);

  const corta = await pedir("/api/panel/mi-cuenta/clave", { metodo: "POST", cookie: c1, json: { nueva: "corta", confirmacion: "corta" } });
  comprobar("clave nueva de menos de 10 caracteres → 400", corta.estado === 400 && corta.datos?.error === "clave_invalida", corta.texto);
  const repetida = await pedir("/api/panel/mi-cuenta/clave", { metodo: "POST", cookie: c1, json: { nueva: prueba.clave, confirmacion: prueba.clave } });
  comprobar("clave nueva igual a la temporal → 400", repetida.estado === 400 && repetida.datos?.error === "clave_repetida", repetida.texto);
  const distinta = await pedir("/api/panel/mi-cuenta/clave", { metodo: "POST", cookie: c1, json: { nueva: claveNueva, confirmacion: `${claveNueva}x` } });
  comprobar("las dos claves no coinciden → 400", distinta.estado === 400, distinta.texto);
  const conCorreo = await pedir("/api/panel/mi-cuenta/clave", { metodo: "POST", cookie: c1, json: { nueva: "maestro-prueba 2026", confirmacion: "maestro-prueba 2026" } });
  comprobar("clave que contiene el correo → 400", conCorreo.estado === 400, conCorreo.texto);

  const cambio = await pedir("/api/panel/mi-cuenta/clave", { metodo: "POST", cookie: c1, json: { nueva: claveNueva, confirmacion: claveNueva } });
  comprobar("cambia la temporal por una propia → 200 con cookie nueva", cambio.estado === 200 && Boolean(cambio.cookie), `estado ${cambio.estado} ${cambio.texto.slice(0, 160)}`);
  const c2 = cambio.cookie;
  const viejaMuerta = await pedir("/api/panel/mi-cuenta", { cookie: c1 });
  comprobar("la sesión anterior quedó cerrada (401)", viejaMuerta.estado === 401, `estado ${viejaMuerta.estado}`);
  const conNueva = await pedir("/api/panel/propiedades", { cookie: c2 });
  comprobar("con la sesión nueva, GET /api/panel/propiedades → 200", conNueva.estado === 200 && Array.isArray(conNueva.datos?.items), `estado ${conNueva.estado}`);
  const panelNuevo = await pedir("/panel", { cookie: c2 });
  comprobar("/panel con sesión normal → 200", panelNuevo.estado === 200 && panelNuevo.texto.includes("Hola, Maestro"), `estado ${panelNuevo.estado}`);

  // ─── Sale y vuelve a entrar con la nueva ────────────────────────
  console.log("\nSalir y volver a entrar");
  const salida = await pedir("/api/panel/sesion", { metodo: "DELETE", cookie: c2 });
  comprobar("DELETE /api/panel/sesion → 200", salida.estado === 200, `estado ${salida.estado}`);
  const trasSalir = await pedir("/api/panel/mi-cuenta", { cookie: c2 });
  comprobar("tras salir, la cookie ya no sirve (401)", trasSalir.estado === 401, `estado ${trasSalir.estado}`);
  const temporalVieja = await pedir("/api/panel/sesion", { metodo: "POST", json: { correo: CORREO_PRUEBA, clave: prueba.clave } });
  comprobar("la temporal ya no entra (401)", temporalVieja.estado === 401, `estado ${temporalVieja.estado}`);

  // Por el formulario de verdad, como lo haría el navegador sin JavaScript.
  const formulario = await pedir("/panel/entrar", { metodo: "POST", formulario: { correo: CORREO_PRUEBA, clave: claveNueva } });
  comprobar("entra con la nueva por el formulario → 302 a /panel", formulario.estado === 302 && formulario.cabeceras.get("location")?.endsWith("/panel") && Boolean(formulario.cookie), `estado ${formulario.estado} → ${formulario.cabeceras.get("location")}`);
  const c3 = formulario.cookie;
  const panelFormulario = await pedir("/panel", { cookie: c3 });
  comprobar("/panel con esa sesión → 200", panelFormulario.estado === 200, `estado ${panelFormulario.estado}`);
  const salirFormulario = await pedir("/panel/salir", { metodo: "POST", cookie: c3, formulario: {} });
  comprobar("POST /panel/salir → 302 a /panel/entrar", salirFormulario.estado === 302 && salirFormulario.cabeceras.get("location")?.endsWith("/panel/entrar"), `estado ${salirFormulario.estado}`);
  const trasFormulario = await pedir("/api/panel/mi-cuenta", { cookie: c3 });
  comprobar("tras salir por el formulario, la cookie ya no sirve (401)", trasFormulario.estado === 401, `estado ${trasFormulario.estado}`);

  // ─── Bitácora: hay rastro y no hay claves ───────────────────────
  console.log("\nBitácora");
  const filas = consultar(
    `SELECT accion, cambios FROM bitacora WHERE usuario_id = ${texto(prueba.id)} OR entidad_id = ${texto(prueba.id)} ORDER BY id;`,
    { remoto },
  );
  const acciones = filas.map((f) => f.accion);
  comprobar("registra crear, acceso, clave, salida y acceso fallido", ["crear", "acceso", "clave", "salida", "acceso_fallido"].every((a) => acciones.includes(a)), acciones.join(", "));
  const volcado = JSON.stringify(filas);
  comprobar("ninguna fila de la bitácora contiene una contraseña", !volcado.includes(prueba.clave) && !volcado.includes(claveNueva) && !volcado.includes("pbkdf2$"));

  // ─── 5. Freno de fuerza bruta ───────────────────────────────────
  console.log("\nFreno de intentos");
  if (remoto) {
    console.log("  … esperando 65 s a que se vacíe la ventana del limitador (todas las pruebas salen de la misma IP)");
    await esperar(65_000);
  }
  // En local el limitador es exacto: el noveno intento da 429. En Cloudflare
  // es «permisivo y eventualmente consistente» (así lo documentan): cada
  // máquina guarda su contador y lo sincroniza en segundo plano, y en una
  // ráfaga deja pasar más. Medido el 16/09/2026: el 429 llegó en el intento 19
  // y desde ahí no dejó pasar ninguno. En remoto se exige que llegue dentro de
  // 40 intentos y que se mantenga.
  const ipFreno = ipNueva();
  const tope = remoto ? 40 : 12;
  let intentoDel429 = null;
  let pasaronTrasBloqueo = 0;
  for (let intento = 1; intento <= tope; intento++) {
    const correo = `freno-${intento}-${randomBytes(3).toString("hex")}@ejemplo.invalid`;
    correosDelFreno.push(correo);
    const r = await pedir("/api/panel/sesion", { metodo: "POST", json: { correo, clave: "intento fallido" }, ip: ipFreno });
    if (r.estado === 429) {
      if (intentoDel429 === null) {
        intentoDel429 = intento;
        comprobar("el 429 trae el mensaje para la persona", r.datos?.mensaje === "Demasiados intentos. Espera un minuto.", r.texto);
      }
      if (!remoto || intento >= intentoDel429 + 5) break;
    } else if (r.estado === 401) {
      if (intentoDel429 !== null) pasaronTrasBloqueo++;
    } else {
      comprobar(`intento ${intento} debía dar 401 o 429`, false, `estado ${r.estado}`);
      break;
    }
  }
  if (remoto) {
    console.log(`  · el limitador de Cloudflare bloqueó a partir del intento ${intentoDel429 ?? "—"}`);
    comprobar(`intentos fallidos seguidos → 429 antes de ${tope} y se mantiene`, intentoDel429 !== null && pasaronTrasBloqueo === 0, `429 en el intento ${intentoDel429 ?? "ninguno"}; pasaron ${pasaronTrasBloqueo} tras el bloqueo`);
  } else {
    comprobar("nueve intentos fallidos en un minuto → 429 en el noveno", intentoDel429 === 9, `el 429 llegó en el intento ${intentoDel429 ?? "ninguno (12 probados)"}`);
  }
} finally {
  // ─── Limpieza: el desechable y su rastro ───────────────────────
  borrarUsuarioDePrueba(prueba.id, CORREO_PRUEBA, { remoto });
  if (correosDelFreno.length) {
    ejecutarSql(`DELETE FROM bitacora WHERE entidad_id IN (${correosDelFreno.map(texto).join(", ")});`, { remoto });
  }
  const queda = buscarUsuario(CORREO_PRUEBA, { remoto });
  comprobar("limpieza: el maestro desechable ya no existe", !queda);
}

const fallidas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallidas.length} de ${resultados.length} comprobaciones pasaron.`);
if (fallidas.length) {
  console.log("Fallaron:\n" + fallidas.map((f) => `  - ${f.nombre}`).join("\n"));
  process.exit(1);
}
