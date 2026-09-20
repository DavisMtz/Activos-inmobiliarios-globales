/**
 * Mide modelos de Workers AI como intérpretes del buscador, ANTES de confiarle
 * el sitio a ninguno: cuántas frases entiende bien, cuánto tarda y cuánto
 * cuesta. El modelo no se elige leyendo su ficha; se elige con esta tabla.
 *
 *   npm run medir:ia
 *   npm run medir:ia -- --modelos @cf/ibm-granite/granite-4.0-h-micro,@cf/qwen/qwen3-30b-a3b-fp8
 *   npm run medir:ia -- --vueltas 2 --detalle      (cada fallo, campo por campo)
 *   npm run medir:ia -- --sin-esquema              (sin `response_format`, solo el mensaje)
 *
 * Usa las MISMAS instrucciones, el mismo esquema y el mismo validador que el
 * Worker (`shared/intencion.ts`): lo que aquí acierta es lo que acertará allá.
 *
 * Va por la API REST con la sesión de wrangler de esta máquina (necesita el
 * ámbito `ai`; `npx wrangler login` lo vuelve a pedir). El token se lee al
 * correr y no se escribe en ningún lado: el repositorio es público.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { FRASES } from "./lib/frases-de-prueba.mjs";
import { importarTs } from "./lib/importar-ts.mjs";

const { ESQUEMA_DE_INTENCION, INSTRUCCIONES, extraerJson, mensajeDeFrase, validarIntencion } = await importarTs("shared/intencion.ts");
const { aplanar } = await importarTs("shared/parecido.ts");

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

/**
 * Candidatos del catálogo del 20/09/2026, con su precio en USD por millón de
 * tokens (entrada, salida). `familia` dice cómo se les habla: los «clásicos»
 * reciben el esquema directo y contestan en `response`; los compatibles con
 * OpenAI lo reciben envuelto y contestan en `choices[0].message.content`.
 */
const CANDIDATOS = {
  "@cf/ibm-granite/granite-4.0-h-micro": { precio: [0.017, 0.112], familia: "clasica" },
  "@cf/meta/llama-3.2-3b-instruct": { precio: [0.0509, 0.335], familia: "clasica" },
  "@cf/meta/llama-3.1-8b-instruct-fp8": { precio: [0.152, 0.287], familia: "clasica" },
  "@cf/qwen/qwen3-30b-a3b-fp8": { precio: [0.0509, 0.335], familia: "clasica" },
  "@cf/zai-org/glm-4.7-flash": { precio: [0.0605, 0.4], familia: "openai" },
  "@cf/google/gemma-4-26b-a4b-it": { precio: [0.1, 0.3], familia: "openai" },
  "@cf/openai/gpt-oss-20b": { precio: [0.2, 0.3], familia: "openai" },
  "@cf/mistralai/mistral-small-3.1-24b-instruct": { precio: [0.351, 0.555], familia: "clasica" },
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": { precio: [0.293, 2.253], familia: "clasica" },
};

/** Workers AI cobra en Neurons: 0.011 USD por cada 1,000. */
const USD_POR_NEURON = 0.011 / 1000;

const { values: opciones } = parseArgs({
  options: {
    modelos: { type: "string" },
    vueltas: { type: "string", default: "1" },
    detalle: { type: "boolean", default: false },
    "sin-esquema": { type: "boolean", default: false },
    "sin-pensar": { type: "boolean", default: true },
    // Sin llamar a nadie: cuánto entiende SOLO la capa de vocabulario, catálogo aparte.
    "sin-modelo": { type: "boolean", default: false },
    salida: { type: "string" },
    tope: { type: "string", default: "20000" },
  },
});

// ─── La sesión de wrangler ────────────────────────────────────────

function leerSesion() {
  const archivo = join(homedir(), ".wrangler", "config", "default.toml");
  if (!existsSync(archivo)) throw new Error("No hay sesión de wrangler: corre `npx wrangler login`.");
  const texto = readFileSync(archivo, "utf8");
  const token = /^oauth_token\s*=\s*"([^"]+)"/m.exec(texto)?.[1];
  const expira = /^expiration_time\s*=\s*"([^"]+)"/m.exec(texto)?.[1];
  return { token, expira: expira ? Date.parse(expira) : 0 };
}

function sesionVigente(rechazado) {
  let sesion = leerSesion();
  // wrangler renueva el token al correr cualquier orden autenticada. Otra
  // sesión de wrangler en esta máquina puede renovarlo a media medición, y el
  // anterior deja de valer (401): por eso también se renueva si lo rechazaron.
  if (!sesion.token || sesion.token === rechazado || sesion.expira - Date.now() < 5 * 60_000) {
    execFileSync(process.execPath, [join(RAIZ, "node_modules", "wrangler", "bin", "wrangler.js"), "whoami"], {
      cwd: RAIZ,
      stdio: "ignore",
    });
    sesion = leerSesion();
  }
  if (!sesion.token) throw new Error("La sesión de wrangler no trae token OAuth.");
  return sesion.token;
}

async function cuentaDe(token) {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const cache = join(RAIZ, "node_modules", ".cache", "wrangler", "wrangler-account.json");
  if (existsSync(cache)) {
    const id = JSON.parse(readFileSync(cache, "utf8"))?.account?.id;
    if (id) return id;
  }
  const r = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers: { authorization: `Bearer ${token}` } });
  const id = (await r.json())?.result?.[0]?.id;
  if (!id) throw new Error("No se pudo saber la cuenta de Cloudflare.");
  return id;
}

// ─── Una consulta ─────────────────────────────────────────────────

function cuerpoPara(modelo, frase) {
  const { familia } = CANDIDATOS[modelo] ?? { familia: "clasica" };
  const cuerpo = {
    messages: [
      { role: "system", content: INSTRUCCIONES },
      { role: "user", content: mensajeDeFrase(frase) },
    ],
    max_tokens: 220,
    temperature: 0,
  };
  if (!opciones["sin-esquema"]) {
    cuerpo.response_format =
      familia === "openai"
        ? { type: "json_schema", json_schema: { name: "intencion", schema: ESQUEMA_DE_INTENCION, strict: true } }
        : { type: "json_schema", json_schema: ESQUEMA_DE_INTENCION };
  }
  if (familia === "openai" && opciones["sin-pensar"]) {
    // Razonar en voz alta aquí es pagar segundos y tokens por llenar un formulario.
    cuerpo.chat_template_kwargs = { enable_thinking: false };
    cuerpo.reasoning_effort = "low";
  }
  return cuerpo;
}

function textoDe(resultado) {
  if (!resultado || typeof resultado !== "object") return { texto: "", uso: {} };
  const uso = resultado.usage ?? {};
  if (resultado.response !== undefined && resultado.response !== null) {
    return { texto: typeof resultado.response === "string" ? resultado.response : JSON.stringify(resultado.response), uso };
  }
  const mensaje = resultado.choices?.[0]?.message;
  if (mensaje) return { texto: mensaje.content ?? "", uso };
  // La API de «responses» de los gpt-oss.
  const salida = Array.isArray(resultado.output) ? resultado.output : [];
  const trozos = salida.flatMap((o) => (Array.isArray(o.content) ? o.content : [])).map((c) => c.text ?? "");
  return { texto: trozos.join(""), uso };
}

async function preguntar(cuenta, modelo, frase, reintento = false) {
  if (opciones["sin-modelo"]) return { ms: 0, texto: "", jsonValido: true, intencion: validarIntencion(null, frase), entrada: 0, salida: 0 };
  const inicio = performance.now();
  let estado = 0;
  let bruto = null;
  try {
    const respuesta = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cuenta}/ai/run/${modelo}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cuerpoPara(modelo, frase)),
      signal: AbortSignal.timeout(Number(opciones.tope)),
    });
    estado = respuesta.status;
    bruto = await respuesta.json().catch(() => null);
  } catch (error) {
    return { ms: performance.now() - inicio, error: String(error.message ?? error) };
  }
  const ms = performance.now() - inicio;
  if (estado === 401 && !reintento) {
    token = sesionVigente(token);
    return preguntar(cuenta, modelo, frase, true);
  }
  if (estado !== 200 || !bruto?.success) {
    return { ms, error: `HTTP ${estado}: ${JSON.stringify(bruto?.errors ?? bruto).slice(0, 300)}` };
  }
  const { texto, uso } = textoDe(bruto.result);
  const crudo = extraerJson(texto);
  return {
    ms,
    texto,
    jsonValido: crudo !== null && typeof crudo === "object",
    intencion: validarIntencion(crudo, frase),
    entrada: Number(uso.prompt_tokens) || 0,
    salida: Number(uso.completion_tokens) || 0,
  };
}

// ─── Calificar ────────────────────────────────────────────────────

const CAMPOS = ["operacion", "tipo", "lugar", "recamaras", "banos", "precioMin", "precioMax", "orden", "palabras"];

const raiz = (palabra) => aplanar(palabra).replace(/(es|s|a|o)$/, "");

function campoAcertado(campo, esperado, obtenido) {
  if (campo === "palabras") {
    // Una lista de listas = varias lecturas aceptadas.
    const lecturas = Array.isArray(esperado?.[0]) ? esperado : [esperado ?? []];
    const dadas = (obtenido ?? []).map(raiz);
    return lecturas.some((lectura) => {
      const pedidas = lectura.map(raiz);
      const estanTodas = pedidas.every((p) => dadas.some((d) => d.includes(p) || p.includes(d)));
      const sobran = dadas.filter((d) => !pedidas.some((p) => d.includes(p) || p.includes(d)));
      return estanTodas && sobran.length === 0;
    });
  }
  const aceptados = Array.isArray(esperado) ? esperado : [esperado ?? null];
  if (campo === "lugar") {
    return aceptados.some((a) => {
      if (a === null) return obtenido === null;
      if (obtenido === null) return false;
      const [x, y] = [aplanar(a), aplanar(obtenido)];
      return y.includes(x) || x.includes(y);
    });
  }
  return aceptados.includes(obtenido ?? null);
}

function calificar(esperado, intencion) {
  const dada = intencion ?? { palabras: [] };
  const fallos = CAMPOS.filter((campo) => !campoAcertado(campo, esperado[campo], dada[campo] ?? (campo === "palabras" ? [] : null)));
  return { fallos, perfecta: fallos.length === 0 };
}

const percentil = (valores, p) => {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))] ?? 0;
};

// ─── Correr ───────────────────────────────────────────────────────

const modelos = opciones["sin-modelo"]
  ? ["(sin modelo: solo vocabulario)"]
  : (opciones.modelos ? opciones.modelos.split(",") : Object.keys(CANDIDATOS)).map((m) => m.trim()).filter(Boolean);
const vueltas = Math.max(1, Number(opciones.vueltas) || 1);

let token = opciones["sin-modelo"] ? "" : sesionVigente();
const cuenta = opciones["sin-modelo"] ? "" : await cuentaDe(token);

console.log(`Midiendo ${modelos.length} modelo(s) con ${FRASES.length} frases × ${vueltas} vuelta(s)` + (opciones["sin-esquema"] ? ", SIN response_format" : "") + "\n");

async function medirModelo(modelo) {
  const filas = [];
  // Una de calentamiento que no cuenta: la primera llamada carga el modelo.
  await preguntar(cuenta, modelo, "casa en venta");
  for (let vuelta = 0; vuelta < vueltas; vuelta++) {
    for (const { frase, esperado } of FRASES) {
      const r = await preguntar(cuenta, modelo, frase);
      filas.push({ frase, esperado, ...r, ...calificar(esperado, r.intencion) });
    }
  }
  return { modelo, filas };
}

// Los modelos van a la vez (son servicios distintos); las frases de cada uno,
// en fila, para que la latencia sea la de una persona buscando y no la de una cola.
const resultados = await Promise.all(modelos.map(medirModelo));

const resumen = resultados.map(({ modelo, filas }) => {
  const buenas = filas.filter((f) => !f.error);
  const tiempos = buenas.map((f) => f.ms);
  const [pe, ps] = CANDIDATOS[modelo]?.precio ?? [0, 0];
  const entrada = buenas.reduce((s, f) => s + f.entrada, 0) / Math.max(1, buenas.length);
  const salida = buenas.reduce((s, f) => s + f.salida, 0) / Math.max(1, buenas.length);
  const usd = (entrada * pe + salida * ps) / 1_000_000;
  const camposBien = filas.reduce((s, f) => s + (CAMPOS.length - f.fallos.length), 0);
  return {
    modelo: modelo.replace("@cf/", ""),
    errores: filas.length - buenas.length,
    "json ok": `${filas.filter((f) => f.jsonValido).length}/${filas.length}`,
    perfectas: `${filas.filter((f) => f.perfecta).length}/${filas.length}`,
    "campos %": Math.round((camposBien / (filas.length * CAMPOS.length)) * 1000) / 10,
    "p50 ms": Math.round(percentil(tiempos, 50)),
    "p90 ms": Math.round(percentil(tiempos, 90)),
    "max ms": Math.round(Math.max(0, ...tiempos)),
    "tok ent": Math.round(entrada),
    "tok sal": Math.round(salida),
    "neurons/búsq": Math.round((usd / USD_POR_NEURON) * 100) / 100,
    "búsq/10k neurons": usd ? Math.round(10_000 / (usd / USD_POR_NEURON)) : 0,
  };
});

console.table(resumen);

if (opciones.detalle) {
  for (const { modelo, filas } of resultados) {
    console.log(`\n── ${modelo}`);
    for (const f of filas) {
      if (f.perfecta) continue;
      console.log(`  ✖ «${f.frase}» [${Math.round(f.ms)} ms]`);
      if (f.error) {
        console.log(`      ${f.error}`);
        continue;
      }
      for (const campo of f.fallos) {
        console.log(`      ${campo}: esperaba ${JSON.stringify(f.esperado[campo] ?? null)}, llegó ${JSON.stringify(f.intencion?.[campo] ?? null)}`);
      }
      if (!f.jsonValido) console.log(`      respuesta: ${JSON.stringify(f.texto).slice(0, 200)}`);
    }
  }
}

if (opciones.salida) {
  writeFileSync(opciones.salida, JSON.stringify({ fecha: new Date().toISOString(), resumen, resultados }, null, 1), "utf8");
  console.log(`\nDetalle completo en ${opciones.salida}`);
}
