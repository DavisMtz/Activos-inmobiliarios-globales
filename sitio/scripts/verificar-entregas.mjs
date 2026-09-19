/**
 * Verificación de las ENTREGAS (F5): el comentario y las fotos del cliente.
 *
 *   node scripts/verificar-entregas.mjs --base http://localhost:5180 --local
 *   node scripts/verificar-entregas.mjs --base https://… --remote
 *
 * Lo que se comprueba es lo que protege al cliente, y se comprueba por la
 * puerta que usa la gente: el formulario del cliente se envía DE VERDAD contra
 * la acción de la página y las fotos se suben DE VERDAD a Cloudinary.
 *
 * - Nada se ve en el sitio antes de que el equipo lo publique.
 * - Los dos permisos van por separado: sin el de fotos no sale ninguna foto
 *   (y las que subió el cliente se borran); sin el del comentario, no sale.
 * - Del nombre solo sale «Laura M.»: ni el apellido ni el nombre que capturó
 *   el equipo aparecen en el HTML público.
 * - El enlace es de un solo uso, caduca, y uno falso o caducado da 404.
 * - El enlace no sirve para registrar fotos ajenas ni de otra carpeta.
 * - El asesor no entra a esta pantalla.
 *
 * Cierra mirando la base y la nube, no la salida del guion (lección de F4).
 */

import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { RAIZ, consultar, ejecutarSql, texto as sql } from "./lib/d1.mjs";
import { borrarUsuarioDePrueba, buscarUsuario, crearUsuarioConTemporal } from "./lib/usuarios.mjs";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:5180" },
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    // Deja la entrega publicada y no limpia: para retratar las pantallas.
    // Después hay que correrlo otra vez sin la bandera (limpia al empezar).
    dejar: { type: "boolean", default: false },
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

// ─── Arnés ────────────────────────────────────────────────────────

const resultados = [];
function comprobar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok: Boolean(ok) });
  console.log(`${ok ? "  ✔" : "  ✖"} ${nombre}${!ok && detalle ? `\n      → ${detalle}` : ""}`);
}

const lote = randomBytes(2);
let ipSecuencia = 0;
const ipNueva = () => `10.${lote[0]}.${lote[1]}.${++ipSecuencia}`;
const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

function cabecerasDe({ cookie, metodo }) {
  const cabeceras = { "user-agent": "verificar-entregas" };
  // Cloudflare rechaza con «403 error code: 1000» toda petición de fuera que
  // traiga esta cabecera, así que solo se manda contra localhost (PLAN §17).
  if (!remoto) cabeceras["cf-connecting-ip"] = ipNueva();
  if (cookie) cabeceras.Cookie = cookie;
  if (metodo && metodo !== "GET") cabeceras.Origin = ORIGEN;
  return cabeceras;
}

async function pedir(ruta, { metodo = "GET", cookie, json, formulario } = {}) {
  const cabeceras = cabecerasDe({ cookie, metodo });
  let cuerpo;
  if (json) {
    cabeceras["Content-Type"] = "application/json";
    cuerpo = JSON.stringify(json);
  } else if (formulario) {
    cabeceras["Content-Type"] = "application/x-www-form-urlencoded";
    cuerpo = new URLSearchParams(formulario).toString();
  }
  const r = await fetch(BASE + ruta, { method: metodo, headers: cabeceras, body: cuerpo, redirect: "manual" });
  const crudo = (await r.text()).replaceAll("<!-- -->", "");
  let datos = null;
  try {
    datos = JSON.parse(crudo);
  } catch {}
  const galleta = (r.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("__Host-aig_sesion="));
  return { estado: r.status, cabeceras: r.headers, texto: crudo, datos, cookie: galleta ? galleta.split(";")[0] : null };
}

// ─── Cloudinary (para la foto de prueba y para mirar la nube al final) ──

function leerDevVars() {
  const ruta = join(RAIZ, ".dev.vars");
  if (!existsSync(ruta)) return {};
  return Object.fromEntries(
    readFileSync(ruta, "utf8")
      .split(/\r?\n/)
      .map((renglon) => renglon.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, nombre, valor]) => [nombre, valor.replace(/^"(.*)"$/, "$1")]),
  );
}
const wranglerJsonc = readFileSync(join(RAIZ, "wrangler.jsonc"), "utf8");
const NUBE = wranglerJsonc.match(/"CLOUDINARY_CLOUD_NAME"\s*:\s*"([^"]*)"/)?.[1] ?? "";
const CARPETA = wranglerJsonc.match(/"CLOUDINARY_CARPETA"\s*:\s*"([^"]*)"/)?.[1] || "aig";
const { CLOUDINARY_API_KEY = "", CLOUDINARY_API_SECRET = "" } = leerDevVars();

/** Una captura cualquiera del repositorio sirve de foto: es una imagen real. */
const carpetaCapturas = join(RAIZ, "verificacion", "capturas", "f2");
const archivoDePrueba = join(carpetaCapturas, readdirSync(carpetaCapturas).find((n) => n.endsWith(".png")));
const bytesDePrueba = readFileSync(archivoDePrueba);

/** Sube la foto de prueba con la firma que dio el servidor, como el navegador. */
async function subirConFirma(firma) {
  const cuerpo = new FormData();
  cuerpo.append("file", new Blob([bytesDePrueba], { type: "image/png" }), "prueba.png");
  for (const [campo, valor] of [
    ["api_key", firma.apiKey],
    ["timestamp", firma.timestamp],
    ["folder", firma.folder],
    ["public_id", firma.publicId],
    ["signature", firma.signature],
  ]) {
    cuerpo.append(campo, valor);
  }
  const r = await fetch(firma.url, { method: "POST", body: cuerpo });
  return r.json();
}

/** Lo que queda en la nube bajo `aig/entregas/<carpeta>/`. */
async function enLaNube(carpeta) {
  const url = new URL(`https://api.cloudinary.com/v1_1/${NUBE}/resources/image/upload`);
  url.searchParams.set("prefix", `${CARPETA}/entregas/${carpeta}/`);
  url.searchParams.set("max_results", "100");
  const r = await fetch(url, {
    headers: { Authorization: "Basic " + Buffer.from(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`).toString("base64") },
  });
  const datos = await r.json();
  return datos.resources?.length ?? -1;
}

// ─── Cuentas de prueba ────────────────────────────────────────────

const ROLES = ["contenido", "asesor"];
const correoDe = (rol) => `entregas-${rol}@ejemplo.invalid`;
const gente = {};
const MARCA = "Prueba Entregas";

function soltarReferencias(id) {
  ejecutarSql(
    `UPDATE configuracion SET actualizado_por = NULL WHERE actualizado_por = ${sql(id)};
     UPDATE usuarios SET creado_por = NULL WHERE creado_por = ${sql(id)};
     UPDATE testimonios SET creado_por = NULL WHERE creado_por = ${sql(id)};`,
    opciones,
  );
}

async function entrar(correo, clave) {
  for (let intento = 1; intento <= 3; intento++) {
    const r = await pedir("/api/panel/sesion", { metodo: "POST", json: { correo, clave } });
    if (r.estado !== 429) return r;
    console.log("  … el freno de intentos está lleno; esperando 65 s");
    await esperar(65_000);
  }
  return { estado: 429, cookie: null };
}

async function prepararCuenta(rol) {
  const correo = correoDe(rol);
  const previo = buscarUsuario(correo, opciones);
  if (previo) {
    soltarReferencias(previo.id);
    borrarUsuarioDePrueba(previo.id, correo, opciones);
  }
  const creada = await crearUsuarioConTemporal({ correo, nombre: `${MARCA} ${rol}`, rol }, opciones);
  const entrada = await entrar(correo, creada.clave);
  const clave = `prueba entregas ${randomBytes(6).toString("base64url")}`;
  const cambio = await pedir("/api/panel/mi-cuenta/clave", {
    metodo: "POST",
    cookie: entrada.cookie,
    json: { nueva: clave, confirmacion: clave },
  });
  gente[rol] = { id: creada.id, correo, cookie: cambio.cookie };
  return Boolean(cambio.cookie);
}

/** Las entregas de prueba se reconocen por el nombre que les pone el guion. */
const idsDePrueba = () =>
  consultar(`SELECT id FROM testimonios WHERE nombre LIKE '${MARCA}%';`, opciones).map((f) => Number(f.id));
const carpetasDePrueba = () =>
  consultar(`SELECT carpeta FROM testimonios WHERE nombre LIKE '${MARCA}%' AND carpeta IS NOT NULL;`, opciones).map((f) => f.carpeta);

/**
 * Por la puerta de la app, para que también se borren de la nube: por eso va
 * DESPUÉS de tener sesión. Borrando directo en la base, las fotos quedaban
 * huérfanas en Cloudinary (pasó el 19/09/2026 tras una corrida con --dejar).
 */
async function limpiarEntregas() {
  const cookie = gente.contenido?.cookie;
  for (const id of idsDePrueba()) {
    if (cookie) await pedir("/panel/entregas", { metodo: "POST", cookie, formulario: { que: "borrar", id: String(id) } });
  }
  // Lo que no se pudo por la app (p. ej. sin sesión), directo a la base.
  ejecutarSql(
    `DELETE FROM fotos_entrega WHERE testimonio_id IN (SELECT id FROM testimonios WHERE nombre LIKE '${MARCA}%');
     DELETE FROM testimonios WHERE nombre LIKE '${MARCA}%';
     DELETE FROM bitacora WHERE entidad = 'entrega' AND usuario_id IN (SELECT id FROM usuarios WHERE correo LIKE 'entregas-%@ejemplo.invalid');`,
    opciones,
  );
}

function limpiarCuentas() {
  for (const correo of ROLES.map(correoDe)) {
    const previo = buscarUsuario(correo, opciones);
    if (previo) {
      soltarReferencias(previo.id);
      borrarUsuarioDePrueba(previo.id, correo, opciones);
    }
  }
}

// ─── Ayudas del recorrido ─────────────────────────────────────────

/** Crea una entrega por el formulario del panel y saca el enlace del HTML. */
async function crearEntrega(nombre) {
  const r = await pedir("/panel/entregas", {
    metodo: "POST",
    cookie: gente.contenido.cookie,
    formulario: { que: "crear", nombre, telefono: "443 111 2233" },
  });
  const enlace = r.texto.match(/value="(https?:\/\/[^"]+\/entrega\/[A-Za-z0-9_-]+)"/)?.[1] ?? null;
  const whatsapp = r.texto.match(/href="(https:\/\/wa\.me\/[^"]+)"/)?.[1]?.replaceAll("&amp;", "&") ?? null;
  const id = Number(consultar(`SELECT MAX(id) AS id FROM testimonios WHERE nombre = ${sql(nombre)};`, opciones)[0]?.id);
  return { estado: r.estado, enlace, token: enlace?.split("/").at(-1) ?? null, whatsapp, id };
}

async function subirFotoDelEquipo(id) {
  const firma = await pedir(`/api/panel/entregas/${id}/firma`, { metodo: "POST", cookie: gente.contenido.cookie, json: {} });
  if (firma.estado !== 200) return { estado: firma.estado };
  const subida = await subirConFirma(firma.datos);
  return pedir(`/api/panel/entregas/${id}/fotos`, {
    metodo: "POST",
    cookie: gente.contenido.cookie,
    json: { public_id: subida.public_id, version: subida.version, signature: subida.signature, width: subida.width, height: subida.height },
  });
}

async function subirFotoDelCliente(token) {
  const firma = await pedir(`/api/entregas/${token}/firma`, { metodo: "POST", json: {} });
  if (firma.estado !== 200) return { estado: firma.estado, datos: firma.datos };
  const subida = await subirConFirma(firma.datos);
  const registro = await pedir(`/api/entregas/${token}/fotos`, {
    metodo: "POST",
    json: { public_id: subida.public_id, version: subida.version, signature: subida.signature, width: subida.width, height: subida.height },
  });
  return { ...registro, subida };
}

const responder = (token, campos) => pedir(`/entrega/${token}`, { metodo: "POST", formulario: campos });

// ─── Recorrido ────────────────────────────────────────────────────

console.log(`\nVerificando las entregas contra ${BASE} (${remoto ? "D1 remota" : "D1 local"})\n`);
if (!NUBE || !CLOUDINARY_API_KEY) {
  console.error("Faltan las credenciales de Cloudinary (wrangler.jsonc y .dev.vars).");
  process.exit(1);
}
for (const rol of ROLES) comprobar(`sesión lista para ${rol}`, await prepararCuenta(rol));
// Restos de una corrida anterior (p. ej. con --dejar), ya con sesión.
const carpetasPrevias = carpetasDePrueba();
await limpiarEntregas();

let fallo = null;
try {
  // ─── Permisos del panel ─────────────────────────────────────
  const asesorPantalla = await pedir("/panel/entregas", { cookie: gente.asesor.cookie });
  const asesorFirma = await pedir("/api/panel/entregas/1/firma", { metodo: "POST", cookie: gente.asesor.cookie, json: {} });
  comprobar("el asesor no entra a Entregas (pantalla 403, firma 403)", asesorPantalla.estado === 403 && asesorFirma.estado === 403,
    `${asesorPantalla.estado} / ${asesorFirma.estado}`);

  // ─── Antes de nada: el sitio no enseña entregas ─────────────
  const antesPortada = await pedir("/");
  const antesPagina = await pedir("/entregas");
  comprobar("sin ninguna publicada: /entregas da 404, y ni la portada ni el menú la ofrecen",
    antesPagina.estado === 404 && !antesPortada.texto.includes("Lo que dicen de nosotros") && !antesPortada.texto.includes('href="/entregas"'),
    `/entregas ${antesPagina.estado}`);

  // ─── Crear y enlace ─────────────────────────────────────────
  const a = await crearEntrega(`${MARCA} Laura Martínez`);
  comprobar("crear la entrega por el formulario del panel entrega el enlace una vez", a.estado === 200 && Boolean(a.token), `HTTP ${a.estado}`);
  const hash = consultar(`SELECT token_hash FROM testimonios WHERE id = ${a.id};`, opciones)[0]?.token_hash ?? "";
  comprobar("la base guarda la huella del enlace, no el enlace", hash.length === 64 && !hash.includes(a.token ?? "¿"));
  comprobar("el WhatsApp lleva clave de país y el enlace dentro",
    Boolean(a.whatsapp?.startsWith("https://wa.me/524431112233?text=")) && decodeURIComponent(a.whatsapp.split("text=")[1].replaceAll("+", " ")).includes(a.enlace),
    a.whatsapp ?? "sin enlace");

  const eq = await subirFotoDelEquipo(a.id);
  comprobar("el equipo sube la foto de la entrega (Cloudinary, firma comprobada)", eq.estado === 200, `${eq.estado} ${eq.texto?.slice(0, 120)}`);

  // ─── La página del cliente ──────────────────────────────────
  const pagina = await pedir(`/entrega/${a.token}`);
  comprobar("la página del cliente abre y saluda por su nombre", pagina.estado === 200 && pagina.texto.includes("Hola, Prueba"), `HTTP ${pagina.estado}`);
  comprobar("sin caché, sin Referer y sin indexar",
    pagina.cabeceras.get("cache-control") === "no-store" &&
      pagina.cabeceras.get("referrer-policy") === "no-referrer" &&
      (pagina.cabeceras.get("x-robots-tag") ?? "").includes("noindex"),
    `${pagina.cabeceras.get("cache-control")} · ${pagina.cabeceras.get("referrer-policy")}`);
  const carpetaDe = (id) => consultar(`SELECT carpeta FROM testimonios WHERE id = ${id};`, opciones)[0]?.carpeta;
  comprobar("cada entrega tiene su carpeta al azar, no su id", /^[0-9a-f]{16}$/.test(carpetaDe(a.id) ?? ""));
  comprobar("enseña la foto que subió el equipo", pagina.texto.includes(`${CARPETA}/entregas/${carpetaDe(a.id)}/`));

  const falso = await pedir(`/entrega/${randomBytes(32).toString("hex")}`);
  const basura = await pedir("/entrega/no-es-un-enlace");
  comprobar("un enlace falso da 404 (y uno mal formado también)", falso.estado === 404 && basura.estado === 404, `${falso.estado} / ${basura.estado}`);

  // ─── Fotos del cliente ──────────────────────────────────────
  const c1 = await subirFotoDelCliente(a.token);
  comprobar("el cliente agrega una foto suya", c1.estado === 200, `${c1.estado} ${JSON.stringify(c1.datos)}`);

  const firmaAjena = await pedir(`/api/entregas/${a.token}/fotos`, {
    metodo: "POST",
    json: { public_id: c1.subida.public_id, version: c1.subida.version, signature: "0".repeat(40), width: 10, height: 10 },
  });
  comprobar("una firma de Cloudinary inventada se rechaza", firmaAjena.estado === 400, `HTTP ${firmaAjena.estado}`);
  const otraCarpeta = await pedir(`/api/entregas/${a.token}/fotos`, {
    metodo: "POST",
    json: { public_id: `${CARPETA}/propiedades/AIG-0001/x`, version: "1", signature: "x", width: 10, height: 10 },
  });
  comprobar("no registra una foto de otra carpeta (las casas)", otraCarpeta.estado === 400, `HTTP ${otraCarpeta.estado}`);

  // El tope: se rellena con filas falsas para no subir seis fotos de verdad.
  ejecutarSql(
    Array.from({ length: 5 }, (_, i) =>
      `INSERT INTO fotos_entrega (testimonio_id, public_id, subida_por, orden, creada_en) VALUES (${a.id}, 'relleno-${a.id}-${i}', 'cliente', 90, '${new Date().toISOString()}');`,
    ).join("\n"),
    opciones,
  );
  const topada = await pedir(`/api/entregas/${a.token}/firma`, { metodo: "POST", json: {} });
  comprobar("con 6 fotos suyas ya no se firma otra (el tope lo pone el servidor)", topada.estado === 400, `HTTP ${topada.estado}`);
  ejecutarSql(`DELETE FROM fotos_entrega WHERE public_id LIKE 'relleno-${a.id}-%';`, opciones);

  // ─── La respuesta ───────────────────────────────────────────
  const sinPermiso = await responder(a.token, { nombre: "Laura", apellido: "Martínez Prueba", comentario: "Muy bien todo." });
  comprobar("sin marcar ningún permiso no se guarda nada", sinPermiso.estado === 400 &&
    consultar(`SELECT enviado_en FROM testimonios WHERE id = ${a.id};`, opciones)[0]?.enviado_en === null, `HTTP ${sinPermiso.estado}`);

  const COMENTARIO = "Nos atendieron de maravilla y la casa quedó lista el día que prometieron.";
  const envio = await responder(a.token, {
    nombre: "laura",
    apellido: "Martínez Prueba",
    comentario: COMENTARIO,
    acepta_texto: "1",
    acepta_fotos: "1",
  });
  comprobar("el cliente envía su respuesta por el formulario de verdad", envio.estado === 200 && envio.texto.includes("Ya recibimos tu respuesta"), `HTTP ${envio.estado}`);
  const fila = consultar(
    `SELECT nombre_publico, texto, acepta_texto, acepta_fotos, consentimiento_version, estado, aceptado_en FROM testimonios WHERE id = ${a.id};`,
    opciones,
  )[0];
  comprobar("queda «Laura M.», los dos permisos con su fecha y versión, y por revisar",
    fila?.nombre_publico === "Laura M." && fila.acepta_texto === 1 && fila.acepta_fotos === 1 &&
      fila.consentimiento_version && fila.aceptado_en && fila.estado === "respondido",
    JSON.stringify(fila));

  const otraVez = await responder(a.token, { nombre: "Otro", comentario: "Cambié de opinión totalmente", acepta_texto: "1" });
  const firmaTarde = await pedir(`/api/entregas/${a.token}/firma`, { metodo: "POST", json: {} });
  comprobar("el enlace es de un solo uso: el segundo envío no cambia nada y ya no firma fotos",
    otraVez.estado === 200 && consultar(`SELECT texto FROM testimonios WHERE id = ${a.id};`, opciones)[0]?.texto === COMENTARIO && firmaTarde.estado === 409,
    `firma ${firmaTarde.estado}`);

  const noPublicada = await pedir("/entregas");
  comprobar("respondida pero sin publicar, sigue sin verse en el sitio", noPublicada.estado === 404, `HTTP ${noPublicada.estado}`);

  // ─── Segunda entrega: solo el comentario ────────────────────
  const b = await crearEntrega(`${MARCA} Pedro de la Torre`);
  await subirFotoDelEquipo(b.id);
  const cb = await subirFotoDelCliente(b.token);
  await responder(b.token, { nombre: "Pedro", apellido: "de la Torre", comentario: "Excelente trato de principio a fin.", acepta_texto: "1" });
  const fotosB = consultar(`SELECT subida_por FROM fotos_entrega WHERE testimonio_id = ${b.id};`, opciones);
  comprobar("sin el permiso de fotos, las que subió el cliente se borran (la del equipo se queda, sin publicarse)",
    cb.estado === 200 && fotosB.length === 1 && fotosB[0].subida_por === "equipo", JSON.stringify(fotosB));

  // ─── Enlace caducado ────────────────────────────────────────
  const c = await crearEntrega(`${MARCA} Caducada`);
  ejecutarSql(`UPDATE testimonios SET token_expira = '2020-01-01T00:00:00.000Z' WHERE id = ${c.id};`, opciones);
  const caducada = await pedir(`/entrega/${c.token}`);
  const caducadaFirma = await pedir(`/api/entregas/${c.token}/firma`, { metodo: "POST", json: {} });
  comprobar("un enlace caducado da 404, igual que uno falso", caducada.estado === 404 && caducadaFirma.estado === 404,
    `${caducada.estado} / ${caducadaFirma.estado}`);

  // ─── Lo capturado antes no se publica ───────────────────────
  ejecutarSql(
    `INSERT INTO testimonios (nombre, texto, visible, creado_en, enviado_en, nombre_publico, estado)
     VALUES ('${MARCA} Antigua', 'Texto viejo sin permiso', 1, '${new Date().toISOString()}', '${new Date().toISOString()}', 'Antigua', 'oculto');`,
    opciones,
  );
  const antigua = Number(consultar(`SELECT id FROM testimonios WHERE nombre = '${MARCA} Antigua';`, opciones)[0].id);
  const publicarAntigua = await pedir("/panel/entregas", { metodo: "POST", cookie: gente.contenido.cookie, formulario: { que: "publicar", id: String(antigua) } });
  comprobar("un testimonio sin permiso registrado no se puede publicar", publicarAntigua.estado === 400 &&
    consultar(`SELECT estado FROM testimonios WHERE id = ${antigua};`, opciones)[0]?.estado === "oculto", `HTTP ${publicarAntigua.estado}`);

  // ─── Publicar ───────────────────────────────────────────────
  for (const id of [a.id, b.id]) {
    await pedir("/panel/entregas", { metodo: "POST", cookie: gente.contenido.cookie, formulario: { que: "publicar", id: String(id) } });
  }
  const publica = await pedir("/entregas");
  const portada = await pedir("/");
  comprobar("publicada: sale en /entregas, en la portada y en el menú",
    publica.estado === 200 &&
      publica.texto.includes("Laura M.") &&
      // La sección de la portada es la de «Lo que dicen de nosotros», que desde
      // el 19/09/2026 se alimenta de las entregas.
      portada.texto.includes("Lo que dicen de nosotros") &&
      portada.texto.includes("Laura M.") &&
      portada.texto.includes('href="/entregas"'),
    `/entregas ${publica.estado}`);
  comprobar("del nombre solo sale la inicial: ni «Martínez» ni el nombre que capturó el equipo",
    !publica.texto.includes("Martínez") && !publica.texto.includes(MARCA) && !portada.texto.includes(MARCA));
  comprobar("el comentario autorizado sale", publica.texto.includes(COMENTARIO.slice(0, 30)));
  comprobar("sin permiso de fotos no sale ninguna foto de esa entrega (ni la del equipo)",
    publica.texto.includes("Pedro T.") && !publica.texto.includes(`${CARPETA}/entregas/${carpetaDe(b.id)}/`));
  comprobar("con permiso de fotos salen las fotos de esa entrega", publica.texto.includes(`${CARPETA}/entregas/${carpetaDe(a.id)}/`));

  // ─── Ocultar ────────────────────────────────────────────────
  if (!values.dejar) {
    await pedir("/panel/entregas", { metodo: "POST", cookie: gente.contenido.cookie, formulario: { que: "ocultar", id: String(b.id) } });
    const trasOcultar = await pedir("/entregas");
    comprobar("«Quitar del sitio» la quita al momento", trasOcultar.estado === 200 && !trasOcultar.texto.includes("Pedro T."));
  }
} catch (error) {
  fallo = error;
  console.error(error);
}

// ─── Limpieza, comprobada contra la base y la nube ────────────────

if (values.dejar && !fallo) {
  // Una invitación abierta, con su foto, para retratar la página del cliente.
  // El enlace y la sesión van a un archivo temporal FUERA del repo (es público).
  const abierta = await crearEntrega(`${MARCA} Ana López`);
  await subirFotoDelEquipo(abierta.id);
  const archivo = join(tmpdir(), "aig-entregas-capturas.json");
  writeFileSync(archivo, JSON.stringify({ enlace: `/entrega/${abierta.token}`, cookie: gente.contenido.cookie }));
  console.log(`\n--dejar: las entregas de prueba se quedan. Enlace y sesión para capturas en ${archivo}.`);
  console.log("Corre el guion otra vez sin la bandera para limpiar.");
} else {
  const carpetas = [...carpetasPrevias, ...carpetasDePrueba()];
  await limpiarEntregas();
  limpiarCuentas();
  await esperar(4000);
  const quedanFilas = consultar(
    `SELECT (SELECT COUNT(*) FROM testimonios WHERE nombre LIKE '${MARCA}%') AS t,
            (SELECT COUNT(*) FROM fotos_entrega WHERE testimonio_id NOT IN (SELECT id FROM testimonios)) AS f,
            (SELECT COUNT(*) FROM usuarios WHERE correo LIKE 'entregas-%@ejemplo.invalid') AS u;`,
    opciones,
  )[0];
  comprobar("no queda rastro en la base (entregas, fotos sueltas ni cuentas)", quedanFilas.t === 0 && quedanFilas.f === 0 && quedanFilas.u === 0, JSON.stringify(quedanFilas));
  let enNube = 0;
  for (const carpeta of carpetas) enNube += Math.max(0, await enLaNube(carpeta));
  comprobar(`no queda ninguna foto de prueba en Cloudinary (${carpetas.length} carpetas revisadas)`, carpetas.length > 0 && enNube === 0, `${enNube} en la nube`);
}

const malas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - malas.length} de ${resultados.length} comprobaciones pasaron.`);
process.exit(malas.length || fallo ? 1 : 0);
