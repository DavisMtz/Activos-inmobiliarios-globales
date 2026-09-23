#!/usr/bin/env node
/**
 * Los dos «listo cuando» de F3 que necesitan un navegador de verdad
 * (PLAN §15): el criterio 2, el recorrido completo a 390 px, y el 8, que el
 * sitio público no descargue ni un byte del panel.
 *
 *   node scripts/verificar-f3-navegador.mjs --base http://localhost:5180 --local
 *   node scripts/verificar-f3-navegador.mjs --base https://… --remote
 *
 * El criterio 8 solo tiene sentido contra el sitio CONSTRUIDO (en desarrollo
 * Vite sirve cada módulo suelto y no hay trozos), así que se mide contra el
 * sitio desplegado, identificando los trozos del panel **por su contenido** y
 * no por su nombre: `routes/publico/marco.tsx` y `routes/panel/marco.tsx` dan
 * archivos que se llaman igual.
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
const CORREO = "f3-recorrido@ejemplo.invalid";

const resultados = [];
function comprobar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok: Boolean(ok) });
  console.log(`${ok ? "  ✔" : "  ✖"} ${nombre}${!ok && detalle ? `\n      → ${detalle}` : ""}`);
}
const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

/** Un JPEG de 1x1: lo que se prueba es el camino, no la foto. */
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

// ─── Chrome por CDP ───────────────────────────────────────────────

async function abrirChrome() {
  const perfil = mkdtempSync(join(tmpdir(), "aig-f3-"));
  const puerto = 9500 + Math.floor(Math.random() * 400);
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
  const pagina = objetivos.find((o) => o.type === "page");
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((listo) => ws.addEventListener("open", listo, { once: true }));

  let id = 0;
  const pendientes = new Map();
  const oyentes = [];
  ws.addEventListener("message", (evento) => {
    const mensaje = JSON.parse(evento.data);
    if (mensaje.id && pendientes.has(mensaje.id)) {
      pendientes.get(mensaje.id)(mensaje);
      pendientes.delete(mensaje.id);
    } else if (mensaje.method) {
      for (const oyente of oyentes) oyente(mensaje);
    }
  });

  const cdp = (method, params = {}) =>
    new Promise((listo) => {
      const n = ++id;
      pendientes.set(n, listo);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  return { cdp, alEvento: (oyente) => oyentes.push(oyente), cerrar: () => { ws.close(); chrome.kill(); } };
}

const evaluar = async (cdp, expresion) => {
  const r = await cdp("Runtime.evaluate", { expression: expresion, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

/** Espera a que una expresión sea cierta, o se rinde. */
async function esperarA(cdp, expresion, { intentos = 40, pausa = 250 } = {}) {
  for (let i = 0; i < intentos; i++) {
    if (await evaluar(cdp, expresion)) return true;
    await esperar(pausa);
  }
  return false;
}

// ─── Preparación ──────────────────────────────────────────────────

console.log(`\nVerificando F3 con navegador contra ${BASE}\n`);

/** Soltar lo que apunte a la cuenta antes de borrarla (clave foránea en D1). */
function soltarReferencias(id) {
  ejecutarSql(
    `UPDATE configuracion SET actualizado_por = NULL WHERE actualizado_por = ${sql(id)};
     UPDATE usuarios SET creado_por = NULL WHERE creado_por = ${sql(id)};
     UPDATE propiedades SET creada_por = NULL WHERE creada_por = ${sql(id)};
     UPDATE propiedades SET asesor_id = NULL WHERE asesor_id = ${sql(id)};
     UPDATE prospectos SET asesor_id = NULL WHERE asesor_id = ${sql(id)};
     DELETE FROM notas_prospecto WHERE usuario_id = ${sql(id)};`,
    opciones,
  );
}

const previo = buscarUsuario(CORREO, opciones);
if (previo) {
  soltarReferencias(previo.id);
  borrarUsuarioDePrueba(previo.id, CORREO, opciones);
}
const prueba = await crearUsuarioConTemporal(
  { correo: CORREO, nombre: "Hermana De Prueba", rol: "contenido" },
  opciones,
);
const clave = `recorrido ${randomBytes(6).toString("base64url")}`;
let navegador = null;
let casaId = null;

try {
  const cabeceras = { "Content-Type": "application/json", Origin: ORIGEN };
  if (!remoto) cabeceras["cf-connecting-ip"] = "10.7.7.7";

  /**
   * En producción todo sale de la MISMA IP y el freno son 8 intentos por
   * minuto (PLAN §8.4): si se cruza con la otra verificación, toca esperar.
   */
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
  comprobar("la cuenta de contenido entra y elige su contraseña", Boolean(valorCookie));

  navegador = await abrirChrome();
  const { cdp } = navegador;
  await cdp("Page.enable");
  await cdp("Network.enable");
  await cdp("DOM.enable");
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

  // ─── 2. El recorrido de la hermana, a 390 px ──────────────────
  console.log("\n2. Recorrido de quien sube casas (rol contenido), a 390 px");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  await cdp("Page.navigate", { url: `${BASE}/panel/propiedades/nueva` });
  await esperar(3000);
  comprobar(
    "llega al formulario sin que la manden a entrar",
    (await evaluar(cdp, "location.pathname")) === "/panel/propiedades/nueva",
    await evaluar(cdp, "location.pathname"),
  );

  // Un texto REAL del sitio actual, elegido a propósito y no al azar: el de
  // El Prado 4 trae precio y alfiler, y es uno de los que la medición del
  // extractor da por buenos. Con uno al azar, la prueba fallaría unas veces sí
  // y otras no, según le tocara una de las 28 casas sin precio escrito.
  const [casaReal] = consultar(
    `SELECT descripcion_original FROM propiedades WHERE slug = 'casa-en-el-prado-4'
      UNION ALL SELECT descripcion_original FROM propiedades WHERE wp_id IS NOT NULL AND descripcion_original LIKE '%PRECIO%' LIMIT 1;`,
    opciones,
  );
  const textoReal = (casaReal?.descripcion_original ?? "CASA EN VENTA\n$1,750,000\n3 recámaras\nMorelia").slice(0, 3000);

  // Primero, lo que saca el servidor de ese mismo texto: así, si la pantalla no
  // llena los campos, se sabe si el culpable es el extractor o la interfaz.
  const analisis = await fetch(`${BASE}/api/panel/texto-facebook`, {
    method: "POST",
    headers: { ...cabeceras, Cookie: `__Host-aig_sesion=${valorCookie}` },
    body: JSON.stringify({ texto: textoReal }),
  });
  const sugerencias = await analisis.json().catch(() => ({}));
  comprobar(
    "el servidor saca el precio de ese texto real",
    analisis.ok && typeof sugerencias.datos?.precio === "number",
    JSON.stringify(sugerencias.datos ?? {}).slice(0, 200),
  );

  // Lo que pasa por debajo mientras se pulsa: si no sale ningún POST, el envío
  // no llegó a salir; si sale y vuelve 200, el problema está en lo que la
  // pantalla hace con la respuesta. Y una excepción explicaría las dos cosas.
  const incidentes = [];
  navegador.alEvento((mensaje) => {
    const p = mensaje.params ?? {};
    if (mensaje.method === "Runtime.exceptionThrown") {
      incidentes.push(`excepción: ${(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? "").slice(0, 220)}`);
    }
    if (mensaje.method === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "warning")) {
      incidentes.push(`consola ${p.type}: ${(p.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 220)}`);
    }
    if (mensaje.method === "Network.requestWillBeSent" && p.request?.method === "POST") {
      incidentes.push(`POST ${p.request.url}`);
    }
    if (mensaje.method === "Network.responseReceived" && p.response?.url?.includes("/panel/propiedades/nueva")) {
      incidentes.push(`respuesta ${p.response.status} de ${p.response.url}`);
    }
  });

  // Se pega el texto como lo haría ella (evento de entrada incluido)…
  await evaluar(
    cdp,
    `(() => {
      const area = document.querySelector('textarea[name="texto_facebook"]');
      const poner = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      poner.call(area, ${JSON.stringify(textoReal)});
      area.dispatchEvent(new Event("input", { bubbles: true }));
      return area.value.length;
    })()`,
  );

  // …y se mira cómo está el botón antes de pulsarlo.
  console.log(
    `  · botón: ${await evaluar(
      cdp,
      `(() => {
        const boton = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Leer el texto"));
        const area = document.querySelector('textarea[name="texto_facebook"]');
        return JSON.stringify({
          hay: !!boton,
          tipo: boton?.type,
          nombre: boton?.name,
          valor: boton?.value,
          desactivado: boton?.disabled,
          mismoFormulario: boton?.form === area?.form,
        });
      })()`,
    )}`,
  );

  // `requestSubmit(boton)` es la vía estándar para enviar CON remitente: si por
  // aquí sí funciona, lo que falla es el clic programático de la prueba y no la
  // pantalla.
  await evaluar(
    cdp,
    `(() => {
      const boton = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Leer el texto"));
      if (!boton?.form) return "sin formulario";
      boton.form.requestSubmit(boton);
      return "enviado";
    })()`,
  );
  const llenado = await esperarA(cdp, `!!document.querySelector('input[name="precio"]')?.value`);

  console.log(`  · lo que pasó por debajo: ${incidentes.length ? incidentes.slice(0, 8).join(" | ") : "nada"}`);

  // Dos sondas para saber QUÉ pasó, si es que no llenó: si la pantalla enseña
  // el error de validación, es que el envío llegó sin el botón y el servidor
  // intentó guardar la casa en vez de leer el texto.
  console.log(
    `  · sondas: ${await evaluar(
      cdp,
      `JSON.stringify({
        errorDeTitulo: document.body.textContent.includes("Escribe un título"),
        avisoDeLlenado: document.body.textContent.includes("Se llenaron"),
        ruta: location.pathname,
      })`,
    )}`,
  );
  comprobar(
    "«Leer el texto» llena los campos vacíos de la pantalla",
    llenado,
    `en pantalla: ${await evaluar(
      cdp,
      `JSON.stringify({precio: document.querySelector('input[name="precio"]')?.value, colonia: document.querySelector('input[name="colonia"]')?.value, descripcion: (document.querySelector('textarea[name="descripcion"]')?.value ?? "").slice(0, 40)})`,
    )} · el servidor sacó: ${JSON.stringify(sugerencias.datos ?? {}).slice(0, 160)}`,
  );

  // El guardado automático que pide §11.2 vive en el navegador: si el
  // formulario no encontrara su propio nodo, no guardaría nada y no se notaría.
  const copiaLocal = await esperarA(
    cdp,
    `Object.keys(localStorage).some((clave) => clave.startsWith("aig:panel:v1:casa:"))`,
    { intentos: 12, pausa: 400 },
  );
  comprobar("lo escrito queda guardado en el navegador mientras tanto", copiaLocal);

  await evaluar(
    cdp,
    `(() => {
      const poner = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      const titulo = document.querySelector('input[name="titulo"]');
      poner.call(titulo, "Casa de recorrido F3");
      titulo.dispatchEvent(new Event("input", { bubbles: true }));
      const colonia = document.querySelector('input[name="colonia"]');
      if (!colonia.value) { poner.call(colonia, "Recorrido"); colonia.dispatchEvent(new Event("input", { bubbles: true })); }
      const precio = document.querySelector('input[name="precio"]');
      if (!precio.value) { poner.call(precio, "1750000"); precio.dispatchEvent(new Event("input", { bubbles: true })); }
      [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Guardar")).click();
      return true;
    })()`,
  );
  const guardada = await esperarA(cdp, `/^\\/panel\\/propiedades\\/\\d+/.test(location.pathname)`, { intentos: 60 });
  comprobar("guarda y llega a la ficha de la casa nueva", guardada, await evaluar(cdp, "location.pathname"));

  casaId = Number((await evaluar(cdp, "location.pathname")).split("/").pop());

  // Cinco fotos por el mismo camino que usaría ella: el selector de archivos.
  // En una carpeta temporal del sistema, nunca dentro del proyecto:
  // `analisis/crudo/` son los datos de origen y son de solo lectura.
  const carpeta = mkdtempSync(join(tmpdir(), "aig-recorrido-"));
  const archivos = [1, 2, 3, 4, 5].map((n) => {
    const ruta = join(carpeta, `foto-${n}.jpg`);
    writeFileSync(ruta, JPEG);
    return ruta;
  });

  const hayEntrada = await esperarA(cdp, `!!document.querySelector('input[type="file"]')`);
  if (hayEntrada) {
    const documento = await cdp("DOM.getDocument", { depth: -1 });
    const nodo = await cdp("DOM.querySelector", { nodeId: documento.result.root.nodeId, selector: 'input[type="file"]' });
    await cdp("DOM.setFileInputFiles", { nodeId: nodo.result.nodeId, files: archivos });
    const subidas = await esperarA(cdp, `document.querySelectorAll('main img').length >= 5`, { intentos: 80, pausa: 500 });
    comprobar("sube cinco fotos desde el teléfono", subidas, `imágenes en pantalla: ${await evaluar(cdp, "document.querySelectorAll('main img').length")}`);
  } else {
    comprobar("sin Cloudinary, la pantalla lo dice en vez de fallar", await evaluar(cdp, `document.body.textContent.includes("Configura Cloudinary")`));
  }

  // Publicar: quien sube contenido sí publica (D14).
  await evaluar(
    cdp,
    `(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Publicar"); if (b) b.click(); return !!b; })()`,
  );
  const publicada = await esperarA(cdp, `document.body.textContent.includes("Se ve en el sitio")`, { intentos: 60 });
  comprobar("la publica ella misma", publicada, await evaluar(cdp, `document.body.textContent.match(/Estado[\\s\\S]{0,80}/)?.[0] ?? ""`));

  const enElSitio = await fetch(`${BASE}/api/propiedades?q=recorrido`);
  const catalogo = await enElSitio.json().catch(() => ({}));
  comprobar(
    "y aparece en el sitio público",
    (catalogo.items ?? []).some((casa) => casa.titulo.includes("Casa de recorrido F3")),
    `${(catalogo.items ?? []).length} resultados`,
  );

  const desborde = await evaluar(cdp, "document.documentElement.scrollWidth - document.documentElement.clientWidth");
  comprobar("todo el recorrido, sin desplazamiento horizontal a 390 px", desborde <= 0, `sobran ${desborde} px`);

  // Las fotos se quitan por el MISMO camino que usaría ella, y no borrando
  // filas: así se ejercita el borrado de verdad y, sobre todo, las fotos
  // desaparecen también de Cloudinary. Borrando solo la fila quedarían
  // huérfanas en la nube y `fotos:migrar --verificar` las reportaría después.
  const fotosDeLaCasa = consultar(`SELECT id FROM fotos WHERE propiedad_id = ${casaId};`, opciones);
  let quitadas = 0;
  for (const foto of fotosDeLaCasa) {
    const r = await fetch(`${BASE}/api/panel/fotos/${foto.id}`, {
      method: "DELETE",
      headers: { Origin: ORIGEN, Cookie: `__Host-aig_sesion=${valorCookie}` },
    });
    if (r.ok) quitadas++;
  }
  comprobar(
    "quitar una foto la borra de la base y de la nube",
    quitadas === fotosDeLaCasa.length &&
      Number(consultar(`SELECT COUNT(*) AS n FROM fotos WHERE propiedad_id = ${casaId};`, opciones)[0]?.n) === 0,
    `quitadas ${quitadas} de ${fotosDeLaCasa.length}`,
  );
  // Cloudinary borra en segundo plano (waitUntil): un momento antes de seguir.
  await esperar(2500);

  // ─── El dibujo de un servicio se escoge en Contenido ──────────
  // Con un servicio OCULTO (nunca sale en el sitio, ni en producción): aquí se
  // prueba el camino del panel a la base, que es el que tenía el hueco. La
  // ficha no mandaba `icono` y `guardarElemento` lo escribía siempre, así que
  // cada «Guardar» lo dejaba en blanco. Qué dibujo le toca a cada título es de
  // `tests/servicios.test.ts`.
  console.log("\nEl dibujo de un servicio (Panel › Contenido)");
  const TITULO_SERVICIO = "Servicio de recorrido F3";
  const servicioDePrueba = () =>
    consultar(`SELECT id, titulo, icono, visible FROM servicios WHERE titulo LIKE ${sql(`${TITULO_SERVICIO}%`)};`, opciones)[0];
  /** Llena y manda una ficha de servicio: la de «Agregar» (`id` nulo) o la de uno que ya existe. */
  const mandarFicha = (id, campos) =>
    evaluar(
      cdp,
      `(() => {
        const fichas = [...document.querySelectorAll('form')].filter((f) => f.querySelector('input[name="tipo"][value="servicio"]') && f.querySelector('select[name="icono"]'));
        const ficha = fichas.find((f) => ${id === null ? `!f.querySelector('input[name="id"]')` : `f.querySelector('input[name="id"]')?.value === '${id}'`});
        if (!ficha) return 'no se encontró la ficha';
        ficha.closest('details').open = true;
        const campos = ${JSON.stringify(campos)};
        for (const [nombre, valor] of Object.entries(campos)) {
          const campo = ficha.elements[nombre];
          if (!campo) return 'falta el campo ' + nombre;
          if (campo.type === 'checkbox') campo.checked = Boolean(valor);
          else campo.value = valor;
        }
        const escogido = ficha.elements.icono.value;
        // El botón de verdad, no \`requestSubmit\`: lo que la gente pulsa.
        [...ficha.querySelectorAll('button[type="submit"]')].find((b) => !b.name).click();
        return 'ok:' + escogido;
      })()`,
    );

  await cdp("Page.navigate", { url: `${BASE}/panel/contenido` });
  await esperar(3000);
  const alAgregar = await mandarFicha(null, { titulo: TITULO_SERVICIO, descripcion: "Prueba del recorrido. Oculto: no sale en el sitio.", icono: "promocion", visible: false });
  await esperarA(cdp, "location.search.includes('guardado=servicio')");
  await esperar(800);
  let servicio = servicioDePrueba();
  comprobar(
    "al agregar un servicio, el dibujo escogido llega a la base",
    alAgregar === "ok:promocion" && servicio?.icono === "promocion" && Number(servicio?.visible) === 0,
    `${alAgregar} · ${JSON.stringify(servicio)}`,
  );

  if (servicio) {
    // Cambiar SOLO el título: el dibujo tiene que sobrevivir al guardado.
    await cdp("Page.navigate", { url: `${BASE}/panel/contenido` });
    await esperar(2500);
    const alEditar = await mandarFicha(servicio.id, { titulo: `${TITULO_SERVICIO} (editado)` });
    await esperarA(cdp, "location.search.includes('guardado=servicio')");
    await esperar(800);
    servicio = servicioDePrueba();
    comprobar(
      "guardar otra cosa ya no borra el dibujo (la ficha lo trae puesto y lo vuelve a mandar)",
      alEditar === "ok:promocion" && servicio?.icono === "promocion" && servicio?.titulo.endsWith("(editado)"),
      `${alEditar} · ${JSON.stringify(servicio)}`,
    );

    await cdp("Page.navigate", { url: `${BASE}/panel/contenido` });
    await esperar(2500);
    const alSoltar = await mandarFicha(servicio.id, { icono: "" });
    await esperarA(cdp, "location.search.includes('guardado=servicio')");
    await esperar(800);
    servicio = servicioDePrueba();
    comprobar("«Automático» lo deja vacío: vuelve a decidir el título", alSoltar === "ok:" && servicio?.icono === "", `${alSoltar} · ${JSON.stringify(servicio)}`);
  }

  // ─── 8. El sitio público no baja nada del panel ───────────────
  console.log("\n8. Navegar el sitio público no descarga nada del panel");
  const assets = join(RAIZ, "build", "client", "assets");
  if (!remoto || !existsSync(assets)) {
    console.log("  · se salta: hay que construir (npm run build) y medirlo contra el sitio desplegado");
  } else {
    // Los trozos del panel se reconocen por lo que DICEN, no por su nombre:
    // `routes/publico/marco.tsx` y `routes/panel/marco.tsx` producen archivos
    // que se llaman igual.
    // «Qué busca la gente» es de Métricas (21/09/2026): su trozo, con las
    // gráficas, pesa 10 KB y no traía ninguna de las otras cuatro frases, así
    // que esta comprobación no lo estaba vigilando.
    const MARCAS = ["Pegar texto de Facebook", "Hacer portada", "Mandar a la papelera", "Contraseña temporal", "Qué busca la gente", "Solo los que faltan por cerrar"];
    const trozosDelPanel = readdirSync(assets)
      .filter((archivo) => archivo.endsWith(".js"))
      .filter((archivo) => {
        const contenido = readFileSync(join(assets, archivo), "utf8");
        return MARCAS.some((marca) => contenido.includes(marca));
      });
    comprobar(`se identifican los trozos del panel por su contenido (${trozosDelPanel.length})`, trozosDelPanel.length > 0);

    const [unaCasa] = consultar("SELECT slug FROM propiedades WHERE estado = 'publicada' ORDER BY id LIMIT 1;", opciones);
    // `/servicios` entra porque comparte un módulo con el panel: el catálogo de
    // dibujos (`shared/servicios.ts`) lo leen la página pública y Panel ›
    // Contenido. Es solo datos, pero es justo el tipo de puente por el que un
    // día podría colarse un trozo del panel.
    const rutasPublicas = ["/", "/propiedades", `/propiedades/${unaCasa.slug}`, "/servicios"];
    const pedidos = [];
    navegador.alEvento((mensaje) => {
      if (mensaje.method === "Network.requestWillBeSent") pedidos.push(mensaje.params.request.url);
    });

    await cdp("Network.clearBrowserCache");
    for (const ruta of rutasPublicas) {
      await cdp("Page.navigate", { url: BASE + ruta });
      await esperar(3500);
    }

    const colados = pedidos.filter((url) => trozosDelPanel.some((trozo) => url.includes(trozo)));
    comprobar(
      "ninguno de esos trozos se pide al navegar el sitio público",
      colados.length === 0,
      colados.slice(0, 5).join(" · "),
    );
    console.log(`  · se miraron ${pedidos.length} peticiones en ${rutasPublicas.length} páginas`);
  }
} finally {
  console.log("\nLimpieza");
  if (casaId) {
    ejecutarSql(
      // Los EVENTOS van primero. El recorrido publica la casa y después la
      // abre en el sitio público, y esa visita deja un `ficha_vista` que
      // apunta a ella: sin borrarlo, `DELETE FROM propiedades` revienta con
      // «FOREIGN KEY constraint failed» y la casa de prueba se queda
      // PUBLICADA en el sitio (pasó en producción el 17/09/2026, PLAN §17).
      `DELETE FROM eventos WHERE propiedad_id = ${casaId};
       DELETE FROM notas_prospecto WHERE prospecto_id IN (SELECT id FROM prospectos WHERE propiedad_id = ${casaId});
       DELETE FROM prospectos WHERE propiedad_id = ${casaId};
       DELETE FROM fotos WHERE propiedad_id = ${casaId};
       DELETE FROM bitacora WHERE entidad IN ('propiedad','foto') AND entidad_id = ${sql(String(casaId))};
       DELETE FROM propiedades WHERE id = ${casaId};
       DELETE FROM zonas WHERE slug = 'morelia-recorrido' AND NOT EXISTS (SELECT 1 FROM propiedades WHERE zona_id = zonas.id);`,
      opciones,
    );
  }
  // El servicio de prueba nace oculto, pero igual no se queda: aparecería en
  // Panel › Contenido como un renglón que nadie escribió.
  ejecutarSql("DELETE FROM servicios WHERE titulo LIKE 'Servicio de recorrido F3%';", opciones);
  ejecutarSql(
    `DELETE FROM eventos WHERE propiedad_id IN (SELECT id FROM propiedades WHERE titulo LIKE 'Casa de recorrido F3%');
     DELETE FROM prospectos WHERE propiedad_id IN (SELECT id FROM propiedades WHERE titulo LIKE 'Casa de recorrido F3%');
     DELETE FROM fotos WHERE propiedad_id IN (SELECT id FROM propiedades WHERE titulo LIKE 'Casa de recorrido F3%');
     DELETE FROM propiedades WHERE titulo LIKE 'Casa de recorrido F3%';`,
    opciones,
  );
  soltarReferencias(prueba.id);
  borrarUsuarioDePrueba(prueba.id, CORREO, opciones);
  navegador?.cerrar();
  const quedan = consultar("SELECT COUNT(*) AS n FROM propiedades WHERE titulo LIKE 'Casa de recorrido F3%';", opciones)[0]?.n;
  const serviciosDePrueba = consultar("SELECT COUNT(*) AS n FROM servicios WHERE titulo LIKE 'Servicio de recorrido F3%';", opciones)[0]?.n;
  comprobar(
    "no queda rastro del recorrido",
    Number(quedan) === 0 && Number(serviciosDePrueba) === 0 && !buscarUsuario(CORREO, opciones),
    `casas ${quedan}, servicios ${serviciosDePrueba}`,
  );
}

const fallidas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallidas.length} de ${resultados.length} comprobaciones pasaron.`);
if (fallidas.length) {
  console.log("Fallaron:\n" + fallidas.map((f) => `  - ${f.nombre}`).join("\n"));
  process.exit(1);
}
