#!/usr/bin/env node
/**
 * Verificación de F4 contra la app CORRIENDO (PLAN §15).
 *
 *   node scripts/verificar-f4.mjs --base http://localhost:5180 --local
 *   node scripts/verificar-f4.mjs --base https://activos-inmobiliarios.logidma.workers.dev --remote
 *
 * Los tres «listo cuando» de F4:
 *   1. Un asesor ve SOLO sus prospectos.
 *   2. El CSV abre bien en Excel, con acentos (BOM UTF-8).
 *   3. Las métricas cuadran con la tabla `eventos`.
 *
 * Como en F2 y F3, **lo esperado está escrito a mano**, leído de PLAN §9, y no
 * sale de `shared/permisos.ts`: si saliera de ahí, la prueba solo diría que el
 * código es igual a sí mismo. Las cifras de las métricas se comparan además
 * contra un `COUNT(*)` escrito aparte, contra la tabla.
 *
 * Crea cuatro cuentas desechables, una casa y varios prospectos con sus
 * eventos, y lo borra todo al terminar, de las hojas a la raíz (notas →
 * prospectos → eventos → bitácora → casa → cuentas), que es el orden que exigen
 * las claves foráneas de D1.
 *
 * El CSV NUNCA se escribe en disco: lleva datos de personas y este repositorio
 * es público.
 */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { RAIZ, consultar, ejecutarSql, texto as sql } from "./lib/d1.mjs";
import { importarTs } from "./lib/importar-ts.mjs";
import { borrarUsuarioDePrueba, buscarUsuario, crearUsuarioConTemporal } from "./lib/usuarios.mjs";

// La MISMA ventana que usa la pantalla (días de Morelia, 21/09/2026): contada
// aparte como «30 × 24 horas desde este minuto», el `COUNT(*)` a mano se lleva
// las visitas de la noche de hace 30 días y deja de cuadrar sin que nada falle.
const { ventanaDeMetricas } = await importarTs("server/metricas.ts");

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:5180" },
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    // Las capturas se toman AQUÍ, con los prospectos de prueba en pantalla:
    // después de la limpieza las dos pantallas están vacías.
    capturas: { type: "boolean", default: false },
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
  const cabeceras = { "user-agent": "verificar-f4" };
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

/**
 * Lo mismo, pero en BYTES. Hace falta para el CSV: `Response.text()` descarta
 * el BOM al decodificar (así lo manda el estándar), así que comprobar el BOM
 * con el texto diría que no está aunque sí esté.
 */
async function pedirBytes(ruta, { cookie } = {}) {
  const r = await fetch(BASE + ruta, { headers: cabecerasDe({ cookie }), redirect: "manual" });
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { estado: r.status, cabeceras: r.headers, bytes };
}

// ─── Cuentas de prueba, una por rol ───────────────────────────────

const ROLES = ["maestro", "director", "asesor", "contenido"];
const correoDe = (rol) => `f4-${rol}@ejemplo.invalid`;
const gente = {};
const aBorrar = { usuarios: [], propiedades: [] };

/** Antes de borrar una cuenta hay que soltar lo que apunta a ella (PLAN §17). */
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

/** Entrar aguantando el freno de intentos: en producción son 8 por minuto (§8.4). */
async function entrar(correo, clave) {
  for (let intento = 1; intento <= 3; intento++) {
    const r = await pedir("/api/panel/sesion", { metodo: "POST", json: { correo, clave } });
    if (r.estado !== 429) return r;
    console.log("  … el freno de intentos está lleno; esperando 65 s");
    await esperar(65_000);
  }
  return { estado: 429, datos: null, texto: "freno de intentos", cookie: null };
}

async function prepararCuenta(rol) {
  const correo = correoDe(rol);
  const previo = buscarUsuario(correo, opciones);
  if (previo) {
    soltarReferencias(previo.id);
    borrarUsuarioDePrueba(previo.id, correo, opciones);
  }
  const creada = await crearUsuarioConTemporal({ correo, nombre: `Prueba ${rol} F4`, rol }, opciones);
  aBorrar.usuarios.push({ id: creada.id, correo });

  const entrada = await entrar(correo, creada.clave);
  const clave = `prueba f4 ${randomBytes(6).toString("base64url")}`;
  const cambio = await pedir("/api/panel/mi-cuenta/clave", {
    metodo: "POST",
    cookie: entrada.cookie,
    json: { nueva: clave, confirmacion: clave },
  });
  gente[rol] = { id: creada.id, correo, clave, cookie: cambio.cookie };
  return Boolean(cambio.cookie);
}

/** Todo lo que deja esta verificación se reconoce por aquí. */
const MARCA = "Prueba F4";

function limpiarDatosDePrueba() {
  ejecutarSql(
    `DELETE FROM notas_prospecto WHERE prospecto_id IN (SELECT id FROM prospectos WHERE nombre LIKE '${MARCA}%');
     DELETE FROM bitacora WHERE entidad = 'prospecto' AND entidad_id IN (SELECT CAST(id AS TEXT) FROM prospectos WHERE nombre LIKE '${MARCA}%');
     DELETE FROM prospectos WHERE nombre LIKE '${MARCA}%';
     DELETE FROM eventos WHERE propiedad_id IN (SELECT id FROM propiedades WHERE titulo LIKE '${MARCA}%');
     DELETE FROM prospectos WHERE propiedad_id IN (SELECT id FROM propiedades WHERE titulo LIKE '${MARCA}%');
     DELETE FROM fotos WHERE propiedad_id IN (SELECT id FROM propiedades WHERE titulo LIKE '${MARCA}%');
     DELETE FROM bitacora WHERE entidad IN ('propiedad','foto') AND entidad_id IN (SELECT CAST(id AS TEXT) FROM propiedades WHERE titulo LIKE '${MARCA}%');
     DELETE FROM propiedades WHERE titulo LIKE '${MARCA}%';
     DELETE FROM zonas WHERE slug = 'morelia-prueba-f4' AND NOT EXISTS (SELECT 1 FROM propiedades WHERE zona_id = zonas.id);`,
    opciones,
  );
}

function limpiarRestos() {
  for (const correo of ROLES.map(correoDe)) {
    const previo = buscarUsuario(correo, opciones);
    if (previo) {
      soltarReferencias(previo.id);
      borrarUsuarioDePrueba(previo.id, correo, opciones);
    }
  }
  limpiarDatosDePrueba();
}

const ahora = () => new Date().toISOString();
const haceDias = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

console.log(`\nVerificando F4 contra ${BASE} (${remoto ? "D1 remota" : "D1 local"})\n`);
limpiarRestos();
console.log("Preparando cuatro cuentas, una por rol");
for (const rol of ROLES) {
  comprobar(`sesión lista para ${rol}`, await prepararCuenta(rol));
}

try {
  // ─── La casa del asesor y sus eventos ──────────────────────────
  const nueva = await pedir("/api/panel/propiedades", {
    metodo: "POST",
    cookie: gente.asesor.cookie,
    json: {
      titulo: `${MARCA} casa del asesor`,
      operacion: "venta",
      tipo: "casa",
      ciudad: "Morelia",
      colonia: "Prueba F4",
      precio: "1500000",
    },
  });
  const casa = nueva.datos?.id;
  aBorrar.propiedades.push(casa);
  comprobar("la casa de prueba queda a nombre del asesor", Boolean(casa), JSON.stringify(nueva.datos));

  // La lista de casas trae las 25 con más vistas y, a empate, la de id más
  // bajo: con tráfico de verdad (o con la muestra de `sembrar-metricas-demo`)
  // 5 vistas ya no alcanzan para entrar y la casa de prueba se quedaba fuera.
  // Necesita más vistas que la 25.ª de TODA la historia.
  const umbral = Number(
    consultar(
      `SELECT COALESCE(MAX(n), 0) AS n FROM (
         SELECT COUNT(*) AS n FROM eventos WHERE tipo = 'ficha_vista' AND propiedad_id IS NOT NULL
          GROUP BY propiedad_id ORDER BY n DESC LIMIT 1 OFFSET 24);`,
      opciones,
    )[0]?.n ?? 0,
  );
  const vistasDePrueba = Math.max(5, umbral + 1);

  // Eventos medidos: las vistas de arriba, 2 clics de WhatsApp y 1 de teléfono
  // de HOY, y 3 vistas de hace 40 días, que la ventana de 30 tiene que dejar fuera.
  const eventos = [
    ...Array.from({ length: vistasDePrueba }, () => ["ficha_vista", ahora()]),
    ...Array.from({ length: 2 }, () => ["whatsapp_click", ahora()]),
    ["telefono_click", ahora()],
    ...Array.from({ length: 3 }, () => ["ficha_vista", haceDias(40)]),
  ];
  ejecutarSql(
    eventos
      .map(([tipo, cuando]) => `INSERT INTO eventos (tipo, propiedad_id, creado_en) VALUES (${sql(tipo)}, ${casa}, ${sql(cuando)});`)
      .join("\n"),
    opciones,
  );

  // ─── Tres prospectos: uno del asesor, uno del director, uno huérfano ─
  // El primero entra por la PUERTA PÚBLICA, para probar la cadena entera;
  // los otros dos por SQL, porque el formulario público tiene freno por IP y
  // en producción todo sale de la misma.
  const casaSembrada = consultar("SELECT slug FROM propiedades WHERE estado = 'publicada' LIMIT 1;", opciones)[0]?.slug;
  const publico = await pedir("/api/prospectos", {
    metodo: "POST",
    formulario: {
      tipo: "propiedad",
      propiedad: casaSembrada ?? "",
      nombre: `${MARCA} Martínez Ñandú`,
      telefono: "4431112233",
      correo: "f4-publico@ejemplo.invalid",
      mensaje: "¿Sigue disponible? Me interesa mucho.",
      acepto: "1",
    },
  });
  comprobar("un prospecto entra por el formulario público", publico.estado === 200, publico.texto.slice(0, 160));

  ejecutarSql(
    `INSERT INTO prospectos (tipo, propiedad_id, nombre, telefono, correo, mensaje, acepto_aviso, origen, estado, creado_en)
     VALUES ('propiedad', ${casa}, ${sql(`${MARCA} del asesor`)}, ${sql("=cmd|' /C calc'!A04432223344")}, 'f4-asesor@ejemplo.invalid',
             ${sql('=HYPERLINK("http://malo.invalid","Cobra aquí")')}, 1, 'prueba-f4', 'nuevo', ${sql(ahora())});
     INSERT INTO prospectos (tipo, propiedad_id, nombre, telefono, correo, mensaje, acepto_aviso, origen, estado, creado_en)
     VALUES ('general', NULL, ${sql(`${MARCA} sin asignar`)}, '4433334455', 'f4-huerfano@ejemplo.invalid',
             'Quiero informes', 1, 'prueba-f4', 'nuevo', ${sql(ahora())});`,
    opciones,
  );

  const ids = consultar(
    `SELECT id, nombre FROM prospectos WHERE nombre LIKE '${MARCA}%' ORDER BY id;`,
    opciones,
  );
  const delAsesor = ids.find((fila) => fila.nombre.includes("del asesor"))?.id;
  const publicoId = ids.find((fila) => fila.nombre.includes("Martínez"))?.id;
  const huerfano = ids.find((fila) => fila.nombre.includes("sin asignar"))?.id;
  comprobar("los tres prospectos de prueba existen", ids.length === 3, `hay ${ids.length}: ${JSON.stringify(ids)}`);

  // El maestro se lo asigna al asesor: ese es el único que debe ver.
  const asignado = await pedir(`/api/panel/prospectos/${delAsesor}`, {
    metodo: "PATCH",
    cookie: gente.maestro.cookie,
    json: { asesor_id: gente.asesor.id },
  });
  comprobar("el maestro le asigna uno al asesor", asignado.estado === 200, asignado.texto.slice(0, 160));

  // ─── 1. La matriz de §9 para prospectos y métricas ─────────────
  console.log("\n1. Cada endpoint responde lo que dice la matriz de §9");
  const M = 200;
  const N = 403;

  const CASOS = [
    // [nombre, método, ruta, cuerpo, { maestro, director, asesor, contenido }]
    ["ver la bandeja", "GET", "/api/panel/prospectos", null, { maestro: M, director: M, asesor: M, contenido: N }],
    ["ver un prospecto AJENO", "GET", `/api/panel/prospectos/${publicoId}`, null, { maestro: M, director: M, asesor: N, contenido: N }],
    ["ver el prospecto PROPIO", "GET", `/api/panel/prospectos/${delAsesor}`, null, { maestro: M, director: M, asesor: M, contenido: N }],
    ["cambiar el estado de uno AJENO", "PATCH", `/api/panel/prospectos/${publicoId}`, { estado: "contactado" }, { maestro: M, director: M, asesor: N, contenido: N }],
    ["cambiar el estado del PROPIO", "PATCH", `/api/panel/prospectos/${delAsesor}`, { estado: "contactado" }, { maestro: M, director: M, asesor: M, contenido: N }],
    // Se asigna al director para que el ajeno SIGA siendo ajeno para el asesor.
    ["asignar un prospecto", "PATCH", `/api/panel/prospectos/${publicoId}`, { asesor_id: null }, { maestro: M, director: M, asesor: N, contenido: N }],
    ["anotar en uno AJENO", "POST", `/api/panel/prospectos/${publicoId}/notas`, { texto: "Nota de prueba F4" }, { maestro: M, director: M, asesor: N, contenido: N }],
    ["anotar en el PROPIO", "POST", `/api/panel/prospectos/${delAsesor}/notas`, { texto: "Nota de prueba F4" }, { maestro: M, director: M, asesor: M, contenido: N }],
    ["exportar el CSV", "GET", "/api/panel/prospectos.csv", null, { maestro: M, director: M, asesor: N, contenido: N }],
    ["ver las métricas", "GET", "/api/panel/metricas", null, { maestro: M, director: M, asesor: M, contenido: M }],
  ];

  let casillas = 0;
  const malas = [];
  for (const [nombre, metodo, ruta, cuerpo, esperados] of CASOS) {
    for (const rol of ROLES) {
      const r = await pedir(ruta, { metodo, cookie: gente[rol].cookie, json: cuerpo ?? undefined });
      casillas++;
      if (r.estado !== esperados[rol]) {
        malas.push(`${rol} · ${nombre}: esperaba ${esperados[rol]} y respondió ${r.estado} (${r.texto.slice(0, 90)})`);
      }
    }
  }
  comprobar(`las ${casillas} casillas de la matriz responden lo esperado`, malas.length === 0, malas.slice(0, 8).join("\n      → "));

  // ─── 2. «Un asesor ve solo sus prospectos» ─────────────────────
  console.log("\n2. El asesor ve SOLO los suyos");
  const suyos = await pedir("/api/panel/prospectos", { cookie: gente.asesor.cookie });
  const items = suyos.datos?.items ?? [];
  comprobar(
    "en su bandeja hay exactamente uno, el que le asignaron",
    items.length === 1 && items[0]?.id === delAsesor,
    `${items.length} prospectos: ${JSON.stringify(items.map((p) => [p.id, p.nombre]))}`,
  );
  comprobar(
    "el que no tiene dueño tampoco es suyo",
    !items.some((p) => p.id === huerfano),
    `huérfano ${huerfano}`,
  );

  const todos = await pedir("/api/panel/prospectos", { cookie: gente.director.cookie });
  const cuantos = consultar("SELECT COUNT(*) AS n FROM prospectos;", opciones)[0]?.n;
  comprobar(
    "el director los ve todos (y son los que dice la tabla)",
    (todos.datos?.total ?? -1) === Number(cuantos),
    `API ${todos.datos?.total} · tabla ${cuantos}`,
  );

  // ─── 3. El CSV abre bien en Excel ──────────────────────────────
  console.log("\n3. El CSV abre bien en Excel, con acentos");
  const csv = await pedirBytes("/api/panel/prospectos.csv", { cookie: gente.maestro.cookie });
  comprobar("el maestro lo descarga", csv.estado === 200, `estado ${csv.estado}`);
  comprobar(
    "empieza por el BOM UTF-8 (EF BB BF), que es lo que hace que Excel lea los acentos",
    csv.bytes[0] === 0xef && csv.bytes[1] === 0xbb && csv.bytes[2] === 0xbf,
    `primeros bytes: ${[...csv.bytes.slice(0, 3)].map((b) => b.toString(16)).join(" ")}`,
  );
  comprobar(
    "se manda como archivo y como texto UTF-8",
    (csv.cabeceras.get("content-type") ?? "").includes("text/csv") &&
      (csv.cabeceras.get("content-type") ?? "").includes("utf-8") &&
      (csv.cabeceras.get("content-disposition") ?? "").includes("attachment"),
    `${csv.cabeceras.get("content-type")} · ${csv.cabeceras.get("content-disposition")}`,
  );

  const comoTexto = new TextDecoder("utf-8").decode(csv.bytes);
  comprobar("los acentos y la eñe vuelven intactos", comoTexto.includes("Martínez Ñandú"), comoTexto.slice(0, 200));
  comprobar("los encabezados van en español y con acentos", comoTexto.includes('"Teléfono"'));
  comprobar(
    "una celda que empieza por «=» va neutralizada, para que Excel no la ejecute",
    comoTexto.includes(`"'=HYPERLINK`),
    comoTexto.split("\r\n").find((renglon) => renglon.includes("HYPERLINK"))?.slice(0, 120) ?? "no salió",
  );
  comprobar(
    "un TELÉFONO tampoco puede colar una fórmula: en el archivo solo van cifras",
    !comoTexto.includes("=cmd") && comoTexto.includes('"04432223344"'),
    comoTexto.split("\r\n").find((renglon) => renglon.includes("04432223344"))?.slice(0, 140) ?? "no salió",
  );
  comprobar("los renglones acaban en CRLF", comoTexto.includes("\r\n"));
  // Se cuentan los renglones que EMPIEZAN por la columna Id y no las líneas del
  // archivo: un mensaje con salto de línea ocupa dos líneas dentro de su celda.
  const renglones = comoTexto.split("\r\n").filter((renglon) => /^"\d+",/.test(renglon)).length;
  comprobar(
    "trae un renglón por prospecto",
    renglones === Number(cuantos),
    `${renglones} renglones para ${cuantos} prospectos`,
  );
  comprobar(
    "el filtro de la pantalla también filtra el archivo",
    (await pedirBytes("/api/panel/prospectos.csv?estado=descartado", { cookie: gente.maestro.cookie })).bytes.length <
      csv.bytes.length,
  );

  // ─── 4. Las métricas cuadran con la tabla `eventos` ────────────
  console.log("\n4. Las métricas cuadran con la tabla `eventos`");
  const metricas = await pedir("/api/panel/metricas?dias=30", { cookie: gente.maestro.cookie });
  const mia = (metricas.datos?.casas ?? []).find((fila) => fila.id === casa);
  comprobar(
    "la casa de prueba sale en la lista con sus cifras de los últimos 30 días",
    mia?.vistas === vistasDePrueba && mia?.whatsapp === 2 && mia?.telefono === 1,
    `${vistasDePrueba} vistas esperadas · ${JSON.stringify(mia ?? null)}`,
  );

  const ventana30 = ventanaDeMetricas(30);
  const enLaTabla = consultar(
    `SELECT
       (SELECT COUNT(*) FROM eventos WHERE propiedad_id = ${casa} AND tipo = 'ficha_vista' AND creado_en >= ${sql(ventana30.desde)}) AS vistas30,
       (SELECT COUNT(*) FROM eventos WHERE propiedad_id = ${casa} AND tipo = 'ficha_vista') AS vistasTodo,
       (SELECT COUNT(*) FROM eventos WHERE tipo = 'ficha_vista' AND creado_en >= ${sql(ventana30.desde)}) AS totalVistas30,
       (SELECT COUNT(*) FROM prospectos WHERE propiedad_id = ${casa}) AS prospectosCasa;`,
    opciones,
  )[0];
  comprobar(
    "y son EXACTAMENTE las que cuenta un SELECT escrito a mano contra la tabla",
    mia?.vistas === Number(enLaTabla?.vistas30),
    `API ${mia?.vistas} · tabla ${enLaTabla?.vistas30}`,
  );
  comprobar(
    "el resumen del periodo también cuadra con la tabla",
    (metricas.datos?.resumen?.vistas ?? -1) === Number(enLaTabla?.totalVistas30),
    `API ${metricas.datos?.resumen?.vistas} · tabla ${enLaTabla?.totalVistas30}`,
  );

  const todoElTiempo = await pedir("/api/panel/metricas?dias=todo", { cookie: gente.maestro.cookie });
  const miaTodo = (todoElTiempo.datos?.casas ?? []).find((fila) => fila.id === casa);
  comprobar(
    "la ventana de 30 días deja fuera las vistas de hace 40, y «todo» las incluye",
    mia?.vistas === vistasDePrueba &&
      miaTodo?.vistas === Number(enLaTabla?.vistasTodo) &&
      miaTodo?.vistas === vistasDePrueba + 3,
    `30 días: ${mia?.vistas} · todo: ${miaTodo?.vistas} · tabla: ${enLaTabla?.vistasTodo}`,
  );
  comprobar(
    "los prospectos por casa salen de la tabla de prospectos",
    miaTodo?.prospectos === Number(enLaTabla?.prospectosCasa),
    `API ${miaTodo?.prospectos} · tabla ${enLaTabla?.prospectosCasa}`,
  );

  // El asesor: solo sus casas.
  const delAsesorMetricas = await pedir("/api/panel/metricas?dias=todo", { cookie: gente.asesor.cookie });
  const casasDelAsesor = delAsesorMetricas.datos?.casas ?? [];
  comprobar(
    "el asesor ve sus casas y solo las suyas",
    casasDelAsesor.length === 1 && casasDelAsesor[0]?.id === casa,
    `${casasDelAsesor.length} casas: ${JSON.stringify(casasDelAsesor.map((c) => c.clave))}`,
  );
  comprobar("y no recibe la tabla por asesor", delAsesorMetricas.datos?.asesores === null);

  // La persona de contenido: vistas y nada más (§9).
  const deContenido = await pedir("/api/panel/metricas?dias=todo", { cookie: gente.contenido.cookie });
  const resumenContenido = deContenido.datos?.resumen ?? {};
  const casaContenido = (deContenido.datos?.casas ?? []).find((fila) => fila.id === casa);
  comprobar(
    "contenido ve las vistas…",
    deContenido.estado === 200 && resumenContenido.vistas > 0 && casaContenido?.vistas === vistasDePrueba + 3,
    JSON.stringify(resumenContenido),
  );
  comprobar(
    "…y NADA de lo comercial: ni clics, ni prospectos, ni tabla por asesor",
    resumenContenido.whatsapp === 0 &&
      resumenContenido.telefono === 0 &&
      resumenContenido.prospectos === 0 &&
      casaContenido?.whatsapp === 0 &&
      casaContenido?.prospectos === 0 &&
      deContenido.datos?.asesores === null,
    JSON.stringify({ resumen: resumenContenido, casa: casaContenido }),
  );

  const conAsesores = metricas.datos?.asesores ?? [];
  const filaAsesor = conAsesores.find((fila) => fila.id === gente.asesor.id);
  comprobar(
    "el maestro sí ve la tabla por asesor, con las casas de cada quien",
    filaAsesor?.casas === 1,
    JSON.stringify(filaAsesor ?? null),
  );

  // ─── 4b. El tablero (21/09/2026): cada gráfica cuadra con la tabla ─
  // Cada cifra nueva se compara contra un SELECT escrito aparte, como las de
  // arriba: si saliera del mismo código, la prueba solo diría que el código es
  // igual a sí mismo.
  console.log("\n4b. Las gráficas del tablero cuadran con la tabla");
  const d = metricas.datos ?? {};
  const suma = (lista, campo) => (lista ?? []).reduce((total, fila) => total + Number(fila[campo] ?? 0), 0);
  const sumaRejilla = (rejilla) => (rejilla ?? []).flat().reduce((total, n) => total + n, 0);
  const puntos = d.serie?.puntos ?? [];
  comprobar(
    "la serie de 30 días trae 30 puntos, uno por día de Morelia, del primero a hoy",
    d.serie?.cubeta === "dia" &&
      puntos.length === 30 &&
      puntos[0]?.desde === ventana30.primerDia &&
      puntos.at(-1)?.desde === ventana30.hoy,
    `${d.serie?.cubeta} · ${puntos.length} puntos · ${puntos[0]?.desde} → ${puntos.at(-1)?.desde}`,
  );
  comprobar(
    "la suma de la serie es el total del periodo (vistas, WhatsApp y prospectos)",
    suma(puntos, "vistas") === d.resumen?.vistas &&
      suma(puntos, "whatsapp") === d.resumen?.whatsapp &&
      suma(puntos, "prospectos") === d.resumen?.prospectos,
    `serie ${suma(puntos, "vistas")}/${suma(puntos, "whatsapp")}/${suma(puntos, "prospectos")} · resumen ${d.resumen?.vistas}/${d.resumen?.whatsapp}/${d.resumen?.prospectos}`,
  );
  comprobar("el mapa de horas reparte esas mismas vistas", sumaRejilla(d.horas) === d.resumen?.vistas, `${sumaRejilla(d.horas)} contra ${d.resumen?.vistas}`);

  const anteriorEnLaTabla = consultar(
    `SELECT COUNT(*) AS n FROM eventos WHERE tipo = 'ficha_vista'
        AND creado_en >= ${sql(ventana30.anterior.desde)} AND creado_en < ${sql(ventana30.anterior.hasta)};`,
    opciones,
  )[0];
  comprobar(
    "el periodo anterior (mismo largo, cortado a la misma hora) cuadra con la tabla",
    d.anterior?.vistas === Number(anteriorEnLaTabla?.n),
    `API ${d.anterior?.vistas} · tabla ${anteriorEnLaTabla?.n}`,
  );
  comprobar("«Todo» no se compara con nada: no hay periodo anterior", todoElTiempo.datos?.anterior === null);

  const delCatalogo = consultar(
    `SELECT
       (SELECT COUNT(*) FROM propiedades WHERE eliminada_en IS NULL) AS casas,
       (SELECT COUNT(*) FROM propiedades WHERE eliminada_en IS NULL AND estado IN ('publicada', 'apartada')) AS enElSitio,
       (SELECT COUNT(*) FROM eventos e JOIN propiedades p ON p.id = e.propiedad_id
         WHERE e.tipo = 'ficha_vista' AND e.creado_en >= ${sql(ventana30.desde)} AND p.eliminada_en IS NULL) AS vistasDeCasas;`,
    opciones,
  )[0];
  comprobar(
    "«qué busca la gente» reparte TODAS las vistas de casas del catálogo y todas las casas del sitio",
    suma(d.demanda?.porTipo, "vistas") === Number(delCatalogo?.vistasDeCasas) &&
      suma(d.demanda?.porTipo, "catalogo") === Number(delCatalogo?.enElSitio),
    `vistas ${suma(d.demanda?.porTipo, "vistas")}/${delCatalogo?.vistasDeCasas} · catálogo ${suma(d.demanda?.porTipo, "catalogo")}/${delCatalogo?.enElSitio}`,
  );
  comprobar(
    "el inventario cuenta todas las casas, y «en el sitio» son las publicadas y las apartadas",
    Object.values(d.inventario?.porEstado ?? {}).reduce((total, n) => total + n, 0) === Number(delCatalogo?.casas) &&
      d.cobertura?.enElSitio === Number(delCatalogo?.enElSitio),
    JSON.stringify({ inventario: d.inventario?.porEstado, cobertura: d.cobertura, tabla: delCatalogo }),
  );

  const porEstadoEnLaTabla = Object.fromEntries(
    consultar(`SELECT estado, COUNT(*) AS n FROM prospectos WHERE creado_en >= ${sql(ventana30.desde)} GROUP BY estado;`, opciones).map(
      (fila) => [fila.estado, Number(fila.n)],
    ),
  );
  const panorama = d.prospectos ?? {};
  comprobar(
    "«cómo van los prospectos» es el GROUP BY estado de la tabla, y suma el total del periodo",
    Object.entries(panorama.porEstado ?? { x: -1 }).every(([estado, n]) => n === (porEstadoEnLaTabla[estado] ?? 0)) &&
      panorama.total === d.resumen?.prospectos,
    `API ${JSON.stringify(panorama.porEstado)} · tabla ${JSON.stringify(porEstadoEnLaTabla)}`,
  );

  const dc = deContenido.datos ?? {};
  comprobar(
    "contenido tiene sus gráficas de vistas, sin panorama de prospectos ni contactos en la serie",
    dc.prospectos === null &&
      (dc.serie?.puntos ?? []).every((p) => p.whatsapp === 0 && p.telefono === 0 && p.prospectos === 0) &&
      sumaRejilla(dc.horas) === dc.resumen?.vistas &&
      dc.resumen?.vistas > 0,
    JSON.stringify({ prospectos: dc.prospectos, vistas: dc.resumen?.vistas, horas: sumaRejilla(dc.horas) }),
  );

  const da = delAsesorMetricas.datos ?? {};
  comprobar(
    "el asesor: su inventario, su serie y sus prospectos son los de SU casa y nada más",
    da.casasEnTotal === 1 &&
      Object.values(da.inventario?.porEstado ?? {}).reduce((total, n) => total + n, 0) === 1 &&
      suma(da.serie?.puntos, "vistas") === vistasDePrueba + 3 &&
      da.prospectos?.total === Number(enLaTabla?.prospectosCasa),
    JSON.stringify({ casas: da.casasEnTotal, inventario: da.inventario?.porEstado, vistas: suma(da.serie?.puntos, "vistas"), prospectos: da.prospectos?.total }),
  );

  // ─── 5. Las pantallas existen y responden ──────────────────────
  console.log("\n5. Las pantallas nuevas responden (y el aviso del inicio ya lleva a algún lado)");
  const bandeja = await pedir("/panel/prospectos", { cookie: gente.director.cookie });
  comprobar(
    "la bandeja se pinta en el servidor, con el nombre del prospecto",
    bandeja.estado === 200 && bandeja.texto.includes("Martínez"),
    `estado ${bandeja.estado}`,
  );
  const pantallaMetricas = await pedir("/panel/metricas", { cookie: gente.director.cookie });
  comprobar(
    "la pantalla de métricas se pinta en el servidor",
    pantallaMetricas.estado === 200 && pantallaMetricas.texto.includes("Fichas vistas"),
    `estado ${pantallaMetricas.estado}`,
  );
  comprobar(
    "y sus gráficas también: el SVG ya viene en el HTML, sin esperar a JavaScript",
    pantallaMetricas.texto.includes("<svg") &&
      pantallaMetricas.texto.includes("Cómo van los prospectos") &&
      pantallaMetricas.texto.includes("A qué hora miran"),
  );
  const pantallaDeContenido = await pedir("/panel/metricas", { cookie: gente.contenido.cookie });
  comprobar(
    "contenido ve su pantalla sin nada comercial: ni prospectos ni clics de WhatsApp",
    pantallaDeContenido.estado === 200 &&
      pantallaDeContenido.texto.includes("Fichas vistas") &&
      !pantallaDeContenido.texto.includes("Cómo van los prospectos") &&
      !pantallaDeContenido.texto.includes("Clics en WhatsApp"),
    `estado ${pantallaDeContenido.estado}`,
  );
  const inicio = await pedir("/panel", { cookie: gente.director.cookie });
  comprobar(
    "el inicio enlaza la bandeja y el menú trae las dos secciones nuevas",
    inicio.texto.includes("/panel/prospectos") && inicio.texto.includes("/panel/metricas"),
  );
  const sinPermiso = await pedir("/panel/prospectos", { cookie: gente.contenido.cookie });
  comprobar("quien no puede verla recibe 403, no la pantalla", sinPermiso.estado === 403, `estado ${sinPermiso.estado}`);

  // Los tres formularios que el equipo pulsa NO pasan por la API de JSON, sino
  // por la acción de React Router. Que los nombres de los campos coincidan al
  // leerlos no basta: en F3, «Leer el texto» no hacía nada y el código se veía
  // bien (PLAN §17). Así que se pulsan de verdad.
  const enviar = (formulario, cookie) => pedir("/panel/prospectos", { metodo: "POST", cookie, formulario });
  const puestoEnCita = await enviar({ que: "estado", id: String(delAsesor), estado: "cita" }, gente.director.cookie);
  comprobar(
    "el formulario de estado guarda y devuelve al mismo renglón de la lista",
    puestoEnCita.estado === 302 && (puestoEnCita.cabeceras.get("location") ?? "").endsWith(`#p-${delAsesor}`),
    `${puestoEnCita.estado} · ${puestoEnCita.cabeceras.get("location")}`,
  );

  const notaPuesta = await enviar(
    { que: "nota", id: String(delAsesor), texto: "Nota escrita desde el formulario" },
    gente.director.cookie,
  );
  const asignada = await enviar(
    { que: "asignar", id: String(huerfano), asesor_id: gente.asesor.id },
    gente.director.cookie,
  );
  comprobar(
    "los de nota y asignar también",
    notaPuesta.estado === 302 && asignada.estado === 302,
    `nota ${notaPuesta.estado} · asignar ${asignada.estado}`,
  );

  const trasLosFormularios = consultar(
    `SELECT (SELECT estado FROM prospectos WHERE id = ${delAsesor}) AS estado,
            (SELECT asesor_id FROM prospectos WHERE id = ${huerfano}) AS asesor,
            (SELECT COUNT(*) FROM notas_prospecto WHERE prospecto_id = ${delAsesor} AND texto LIKE 'Nota escrita%') AS notas;`,
    opciones,
  )[0];
  comprobar(
    "y la base lo confirma: estado «cita», el huérfano asignado y la nota guardada",
    trasLosFormularios?.estado === "cita" &&
      trasLosFormularios?.asesor === gente.asesor.id &&
      Number(trasLosFormularios?.notas) === 1,
    JSON.stringify(trasLosFormularios ?? null),
  );

  // ─── 6. La bitácora registró los cambios, sin datos de personas ─
  console.log("\n6. La bitácora guarda el rastro, sin los datos de quien escribió");
  const bitacora = await pedir("/api/panel/bitacora?entidad=prospecto", { cookie: gente.maestro.cookie });
  const acciones = (bitacora.datos?.items ?? []).map((entrada) => entrada.accion);
  comprobar(
    "registra asignar, estado y nota",
    ["asignar", "estado", "nota"].every((accion) => acciones.includes(accion)),
    acciones.slice(0, 12).join(", "),
  );
  const volcado = JSON.stringify(bitacora.datos ?? {});
  comprobar(
    "y NO guarda el nombre, el teléfono ni el mensaje del prospecto",
    !volcado.includes("Martínez") && !volcado.includes("4431112233") && !volcado.includes("HYPERLINK"),
    volcado.slice(0, 200),
  );
  // ─── 7. Capturas, con los datos de prueba en pantalla ──────────
  if (values.capturas) {
    console.log("\n7. Capturas a 390 y 1366 px");
    const carpeta = join(RAIZ, "verificacion", "capturas", "f4");
    mkdirSync(carpeta, { recursive: true });
    // Solo el valor de la cookie: el guion de capturar lo recibe por entorno.
    const galleta = (gente.maestro.cookie ?? "").split("=").slice(1).join("=");

    for (const pantalla of ["prospectos", "metricas"]) {
      for (const [ancho, alto, movil] of [
        [390, 844, "1"],
        [1366, 900, "0"],
      ]) {
        const salida = join(carpeta, `${pantalla}-${ancho}.png`);
        const medida = execFileSync(
          process.execPath,
          [join(RAIZ, "scripts", "capturar.mjs"), `${BASE}/panel/${pantalla}`, salida, String(ancho), String(alto), movil],
          { encoding: "utf8", env: { ...process.env, AIG_COOKIE: galleta } },
        );
        const leido = JSON.parse(medida.split("\n")[0] || "{}");
        comprobar(
          `${pantalla} a ${ancho} px: con sesión y sin desplazamiento horizontal`,
          !/Entrar/.test(leido.titulo ?? "") && leido.scroll <= leido.ancho,
          `${JSON.stringify(leido)}`,
        );
      }
    }
  }
} finally {
  // ─── Limpieza ─────────────────────────────────────────────────
  console.log("\nLimpieza");
  limpiarDatosDePrueba();
  const ids = aBorrar.propiedades.filter(Boolean);
  if (ids.length) {
    ejecutarSql(
      `DELETE FROM eventos WHERE propiedad_id IN (${ids.join(",")});
       DELETE FROM notas_prospecto WHERE prospecto_id IN (SELECT id FROM prospectos WHERE propiedad_id IN (${ids.join(",")}));
       DELETE FROM prospectos WHERE propiedad_id IN (${ids.join(",")});
       DELETE FROM fotos WHERE propiedad_id IN (${ids.join(",")});
       DELETE FROM bitacora WHERE entidad IN ('propiedad','foto') AND entidad_id IN (${ids.map((id) => sql(String(id))).join(",")});
       DELETE FROM propiedades WHERE id IN (${ids.join(",")});
       DELETE FROM zonas WHERE slug = 'morelia-prueba-f4' AND NOT EXISTS (SELECT 1 FROM propiedades WHERE zona_id = zonas.id);`,
      opciones,
    );
  }
  for (const usuario of aBorrar.usuarios) {
    soltarReferencias(usuario.id);
    borrarUsuarioDePrueba(usuario.id, usuario.correo, opciones);
  }

  const quedan = consultar(
    `SELECT
       (SELECT COUNT(*) FROM prospectos WHERE nombre LIKE '${MARCA}%' OR origen = 'prueba-f4') AS prospectos,
       (SELECT COUNT(*) FROM propiedades WHERE titulo LIKE '${MARCA}%') AS casas,
       (SELECT COUNT(*) FROM zonas WHERE slug = 'morelia-prueba-f4') AS zonas;`,
    opciones,
  )[0];
  const cuentas = ROLES.filter((rol) => buscarUsuario(correoDe(rol), opciones)).length;
  comprobar(
    "no queda ni un prospecto, casa, zona o cuenta de prueba",
    Number(quedan?.prospectos) === 0 && Number(quedan?.casas) === 0 && Number(quedan?.zonas) === 0 && cuentas === 0,
    JSON.stringify({ ...quedan, cuentas }),
  );
}

const fallidas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallidas.length} de ${resultados.length} comprobaciones pasaron.`);
if (fallidas.length) {
  console.log("Fallaron:\n" + fallidas.map((f) => `  - ${f.nombre}`).join("\n"));
  process.exit(1);
}
