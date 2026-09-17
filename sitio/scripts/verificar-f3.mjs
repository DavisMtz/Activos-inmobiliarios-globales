#!/usr/bin/env node
/**
 * Verificación de F3 contra la app CORRIENDO (PLAN §15, «listo cuando» 1 y 3–7).
 *
 *   node scripts/verificar-f3.mjs --base http://localhost:5180 --local
 *   node scripts/verificar-f3.mjs --base https://activos-inmobiliarios.logidma.workers.dev --remote
 *
 * Los criterios 2 y 8 (el recorrido a 390 px y que el sitio público no baje
 * nada del panel) van en `verificar-f3-navegador.mjs`, que sí necesita Chrome.
 *
 * **La tabla de permisos de abajo está escrita a mano**, leída de PLAN §9, y no
 * sale de `shared/permisos.ts`: si saliera de ahí, la prueba solo diría que el
 * código es igual a sí mismo. Es la misma regla que se usó en F2 con los
 * conteos de los filtros.
 *
 * Crea cuatro cuentas desechables (una por rol) y dos casas de prueba, y borra
 * todo al terminar, incluido lo que dejen las pruebas de escritura. Nunca toca
 * las cuentas reales.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { consultar, ejecutarSql, texto as sql } from "./lib/d1.mjs";
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

async function pedir(ruta, { metodo = "GET", cookie, json, formulario } = {}) {
  const cabeceras = { "user-agent": "verificar-f3" };
  // Cloudflare rechaza con «403 error code: 1000» toda petición de fuera que
  // traiga esta cabecera, así que solo se manda contra localhost (PLAN §17).
  if (!remoto) cabeceras["cf-connecting-ip"] = ipNueva();
  if (cookie) cabeceras.Cookie = cookie;
  if (metodo !== "GET") cabeceras.Origin = ORIGEN;
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

// ─── Cuentas de prueba, una por rol ───────────────────────────────

const ROLES = ["maestro", "director", "asesor", "contenido"];
const correoDe = (rol) => `f3-${rol}@ejemplo.invalid`;
const gente = {};
const aBorrar = { usuarios: [], propiedades: [] };

/**
 * Antes de borrar una cuenta de prueba hay que soltar lo que apunta a ella, o
 * D1 rechaza el borrado por clave foránea: la configuración guarda QUIÉN la
 * cambió, y una cuenta guarda quién la dio de alta. (Medido aquí: la primera
 * versión de la limpieza reventó justo al borrar al director.)
 */
function soltarReferencias(id) {
  ejecutarSql(
    `UPDATE configuracion SET actualizado_por = NULL WHERE actualizado_por = ${sql(id)};
     UPDATE usuarios SET creado_por = NULL WHERE creado_por = ${sql(id)};
     UPDATE propiedades SET creada_por = NULL WHERE creada_por = ${sql(id)};
     UPDATE propiedades SET asesor_id = NULL WHERE asesor_id = ${sql(id)};
     UPDATE prospectos SET asesor_id = NULL WHERE asesor_id = ${sql(id)};`,
    opciones,
  );
}

async function prepararCuenta(rol) {
  const correo = correoDe(rol);
  const previo = buscarUsuario(correo, opciones);
  if (previo) {
    soltarReferencias(previo.id);
    borrarUsuarioDePrueba(previo.id, correo, opciones);
  }
  const creada = await crearUsuarioConTemporal({ correo, nombre: `Prueba ${rol}`, rol }, opciones);
  aBorrar.usuarios.push({ id: creada.id, correo });

  const entrada = await pedir("/api/panel/sesion", { metodo: "POST", json: { correo, clave: creada.clave } });
  const clave = `prueba f3 ${randomBytes(6).toString("base64url")}`;
  const cambio = await pedir("/api/panel/mi-cuenta/clave", {
    metodo: "POST",
    cookie: entrada.cookie,
    json: { nueva: clave, confirmacion: clave },
  });
  gente[rol] = { id: creada.id, correo, clave, cookie: cambio.cookie };
  return Boolean(cambio.cookie);
}

/** Restos de una corrida anterior que se haya cortado a media limpieza. */
function limpiarRestos() {
  for (const correo of [...ROLES.map(correoDe), "f3-alta@ejemplo.invalid", "f3-otro-director@ejemplo.invalid"]) {
    const previo = buscarUsuario(correo, opciones);
    if (previo) {
      soltarReferencias(previo.id);
      borrarUsuarioDePrueba(previo.id, correo, opciones);
    }
  }
  ejecutarSql(
    `DELETE FROM fotos WHERE propiedad_id IN (SELECT id FROM propiedades WHERE titulo LIKE 'Casa de prueba F3%');
     DELETE FROM bitacora WHERE entidad IN ('propiedad','foto') AND entidad_id IN (SELECT CAST(id AS TEXT) FROM propiedades WHERE titulo LIKE 'Casa de prueba F3%');
     DELETE FROM propiedades WHERE titulo LIKE 'Casa de prueba F3%';`,
    opciones,
  );
}

console.log(`\nVerificando F3 contra ${BASE} (${remoto ? "D1 remota" : "D1 local"})\n`);
limpiarRestos();
console.log("Preparando cuatro cuentas, una por rol");
for (const rol of ROLES) {
  comprobar(`sesión lista para ${rol}`, await prepararCuenta(rol));
}

try {
  // ─── Dos casas: una del asesor de prueba y otra ajena ──────────
  const nuevaDelAsesor = await pedir("/api/panel/propiedades", {
    metodo: "POST",
    cookie: gente.asesor.cookie,
    json: { titulo: "Casa de prueba F3 asesor", operacion: "venta", tipo: "casa", ciudad: "Morelia", colonia: "Prueba F3" },
  });
  const nuevaAjena = await pedir("/api/panel/propiedades", {
    metodo: "POST",
    cookie: gente.maestro.cookie,
    json: { titulo: "Casa de prueba F3 ajena", operacion: "venta", tipo: "casa", ciudad: "Morelia", colonia: "Prueba F3" },
  });
  const casaPropia = nuevaDelAsesor.datos?.id;
  const casaAjena = nuevaAjena.datos?.id;
  aBorrar.propiedades.push(casaPropia, casaAjena);
  comprobar("la casa que crea el asesor nace en revisión", nuevaDelAsesor.datos?.estado === "revision", JSON.stringify(nuevaDelAsesor.datos));
  comprobar("la casa que crea el maestro nace en borrador", nuevaAjena.datos?.estado === "borrador", JSON.stringify(nuevaAjena.datos));

  // ─── 1. La matriz de permisos, escrita a mano (PLAN §9) ────────
  console.log("\n1. Cada endpoint responde lo que dice la matriz de §9");

  const casaBasica = (titulo) => ({ titulo, operacion: "venta", tipo: "casa", ciudad: "Morelia", colonia: "Prueba F3" });
  const M = 200;
  const N = 403;

  const CASOS = [
    // [nombre, método, ruta, cuerpo, { maestro, director, asesor, contenido }]
    ["ver la lista de casas", "GET", "/api/panel/propiedades", null, { maestro: M, director: M, asesor: M, contenido: M }],
    ["ver una casa", "GET", `/api/panel/propiedades/${casaAjena}`, null, { maestro: M, director: M, asesor: M, contenido: M }],
    ["editar una casa AJENA", "PATCH", `/api/panel/propiedades/${casaAjena}`, casaBasica("Casa de prueba F3 ajena"), { maestro: M, director: M, asesor: N, contenido: M }],
    ["editar la casa PROPIA", "PATCH", `/api/panel/propiedades/${casaPropia}`, casaBasica("Casa de prueba F3 asesor"), { maestro: M, director: M, asesor: M, contenido: M }],
    ["despublicar (pausar) una casa ajena", "POST", `/api/panel/propiedades/${casaAjena}/estado`, { estado: "pausada" }, { maestro: M, director: M, asesor: N, contenido: M }],
    ["marcar apartada una casa ajena", "POST", `/api/panel/propiedades/${casaAjena}/estado`, { estado: "apartada" }, { maestro: M, director: M, asesor: N, contenido: M }],
    // Este caso sí cambia la casa, así que se deshace entre un rol y el
    // siguiente: sin eso, el segundo se encontraba una casa ya en la papelera
    // y respondía 404 en vez de decir si tiene permiso.
    [
      "mandar a la papelera",
      "POST",
      `/api/panel/propiedades/${casaAjena}/papelera`,
      {},
      { maestro: M, director: M, asesor: N, contenido: N },
      () => ejecutarSql(`UPDATE propiedades SET eliminada_en = NULL WHERE id = ${casaAjena};`, opciones),
    ],
    ["pedir firma para subir una foto a una casa ajena", "POST", "/api/panel/fotos/firma", { propiedad_id: casaAjena }, { maestro: M, director: M, asesor: N, contenido: M }],
    ["leer el texto de Facebook", "POST", "/api/panel/texto-facebook", { texto: "CASA EN VENTA\n$1,000,000" }, { maestro: M, director: M, asesor: M, contenido: M }],
    ["ver los servicios", "GET", "/api/panel/servicios", null, { maestro: M, director: M, asesor: M, contenido: M }],
    ["cambiar los textos de la portada", "PATCH", "/api/panel/configuracion/portada", {}, { maestro: M, director: M, asesor: N, contenido: M }],
    ["cambiar los datos de contacto", "PATCH", "/api/panel/configuracion/contacto", {}, { maestro: M, director: M, asesor: N, contenido: N }],
    ["cambiar el aviso de privacidad", "PATCH", "/api/panel/configuracion/aviso_privacidad", {}, { maestro: M, director: M, asesor: N, contenido: N }],
    ["ver las cuentas", "GET", "/api/panel/usuarios", null, { maestro: M, director: M, asesor: N, contenido: N }],
    ["ver la bitácora", "GET", "/api/panel/bitacora", null, { maestro: M, director: M, asesor: N, contenido: N }],
    ["ver el sistema", "GET", "/api/panel/sistema", null, { maestro: M, director: N, asesor: N, contenido: N }],
    ["ver las redirecciones", "GET", "/api/panel/redirecciones", null, { maestro: M, director: N, asesor: N, contenido: N }],
    ["ver mi cuenta", "GET", "/api/panel/mi-cuenta", null, { maestro: M, director: M, asesor: M, contenido: M }],
  ];

  let casillas = 0;
  let malas = [];
  for (const [nombre, metodo, ruta, cuerpo, esperados, deshacer] of CASOS) {
    for (const rol of ROLES) {
      const r = await pedir(ruta, { metodo, cookie: gente[rol].cookie, json: cuerpo ?? undefined });
      casillas++;
      if (r.estado !== esperados[rol]) {
        malas.push(`${rol} · ${nombre}: esperaba ${esperados[rol]} y respondió ${r.estado} (${r.texto.slice(0, 90)})`);
      }
      deshacer?.();
    }
  }
  comprobar(`las ${casillas} casillas de la matriz responden lo esperado`, malas.length === 0, malas.slice(0, 8).join("\n      → "));

  // Alta de cuentas: el director solo puede con su equipo (§9).
  const altaAsesor = await pedir("/api/panel/usuarios", {
    metodo: "POST",
    cookie: gente.director.cookie,
    json: { nombre: "Alta De Prueba", correo: "f3-alta@ejemplo.invalid", rol: "asesor" },
  });
  if (altaAsesor.datos?.usuario?.id) aBorrar.usuarios.push({ id: altaAsesor.datos.usuario.id, correo: "f3-alta@ejemplo.invalid" });
  comprobar("el director puede dar de alta a un asesor", altaAsesor.estado === 200, altaAsesor.texto.slice(0, 160));

  const altaDirector = await pedir("/api/panel/usuarios", {
    metodo: "POST",
    cookie: gente.director.cookie,
    json: { nombre: "Otro Director", correo: "f3-otro-director@ejemplo.invalid", rol: "director" },
  });
  comprobar("el director NO puede crear otro director", altaDirector.estado === 403, `estado ${altaDirector.estado}`);

  // ─── 3. El asesor sube, el director publica ───────────────────
  console.log("\n3. El asesor sube y el director publica");
  const suya = await pedir(`/api/panel/propiedades/${casaPropia}/estado`, {
    metodo: "POST",
    cookie: gente.asesor.cookie,
    json: { estado: "publicada" },
  });
  comprobar("el asesor no puede publicar su propia casa", suya.estado === 403, `estado ${suya.estado} · ${suya.texto.slice(0, 120)}`);

  const sinDatos = await pedir(`/api/panel/propiedades/${casaPropia}/estado`, {
    metodo: "POST",
    cookie: gente.director.cookie,
    json: { estado: "publicada" },
  });
  comprobar(
    "publicar sin precio ni fotos se rechaza diciendo qué falta",
    sinDatos.estado === 400 && /precio|foto/i.test(sinDatos.datos?.mensaje ?? ""),
    `estado ${sinDatos.estado} · ${sinDatos.texto.slice(0, 160)}`,
  );

  // Se le ponen los datos que faltan (precio y una foto) y ahora sí.
  await pedir(`/api/panel/propiedades/${casaPropia}`, {
    metodo: "PATCH",
    cookie: gente.director.cookie,
    json: { ...casaBasica("Casa de prueba F3 asesor"), precio: "1500000" },
  });
  ejecutarSql(
    `INSERT INTO fotos (propiedad_id, url_origen, ancho, alto, alt, orden, es_portada)
     VALUES (${casaPropia}, 'https://ejemplo.invalid/foto-de-prueba.jpg', 1600, 1200, 'Foto de prueba', 0, 1);`,
    opciones,
  );
  const publicada = await pedir(`/api/panel/propiedades/${casaPropia}/estado`, {
    metodo: "POST",
    cookie: gente.director.cookie,
    json: { estado: "publicada" },
  });
  comprobar("con precio y foto, el director sí la publica", publicada.estado === 200, publicada.texto.slice(0, 160));

  const enElSitio = await pedir(`/api/propiedades?q=prueba+f3`);
  comprobar(
    "la casa publicada ya sale en el sitio público",
    enElSitio.estado === 200 && (enElSitio.datos?.items ?? []).some((casa) => casa.titulo.includes("Casa de prueba F3 asesor")),
    `${enElSitio.estado} · ${(enElSitio.datos?.items ?? []).length} resultados`,
  );

  // ─── 4. El teléfono se cambia y se ve en el sitio ──────────────
  console.log("\n4. El teléfono que cambia el director se ve en el sitio");
  const antes = consultar("SELECT valor FROM configuracion WHERE clave = 'contacto';", opciones)[0]?.valor ?? "{}";
  const contactoOriginal = JSON.parse(antes);
  const telefonoDePrueba = "443 111 2233";
  const cambioTelefono = await pedir("/api/panel/configuracion/contacto", {
    metodo: "PATCH",
    cookie: gente.director.cookie,
    json: { ...contactoOriginal, telefono: telefonoDePrueba },
  });
  comprobar("el director guarda el teléfono", cambioTelefono.estado === 200, cambioTelefono.texto.slice(0, 160));

  const contacto = await pedir("/contacto");
  const inicio = await pedir("/");
  comprobar(
    "el teléfono nuevo aparece en el sitio público, sin JavaScript",
    contacto.texto.includes(telefonoDePrueba) && inicio.texto.includes(telefonoDePrueba),
    `contacto ${contacto.texto.includes(telefonoDePrueba)} · portada ${inicio.texto.includes(telefonoDePrueba)}`,
  );

  // Se deja como estaba: esto corre también contra producción.
  ejecutarSql(
    `UPDATE configuracion SET valor = ${sql(antes)} WHERE clave = 'contacto';`,
    opciones,
  );
  const restaurado = await pedir("/contacto");
  comprobar(
    "y al restaurarlo, el sitio vuelve a decir el de siempre",
    !restaurado.texto.includes(telefonoDePrueba),
  );

  // ─── 5. Alta con temporal: entra, la cambia y vuelve a entrar ──
  console.log("\n5. Quien recibe una temporal entra, la cambia y vuelve a entrar");
  const nuevoAsesor = altaAsesor.datos;
  comprobar("la temporal llega una sola vez en la respuesta", typeof nuevoAsesor?.clave === "string" && nuevoAsesor.clave.length === 12, JSON.stringify(nuevoAsesor?.clave ?? null));

  const primeraEntrada = await pedir("/api/panel/sesion", {
    metodo: "POST",
    json: { correo: "f3-alta@ejemplo.invalid", clave: nuevoAsesor.clave },
  });
  comprobar("entra con la temporal y el sistema le exige cambiarla", primeraEntrada.datos?.debe_cambiar_clave === true, primeraEntrada.texto.slice(0, 160));

  const bloqueado = await pedir("/api/panel/propiedades", { cookie: primeraEntrada.cookie });
  comprobar("con esa sesión no puede hacer nada más (403)", bloqueado.estado === 403 && bloqueado.datos?.error === "debe_cambiar_clave", `estado ${bloqueado.estado}`);

  const claveNueva = `prueba f3 ${randomBytes(6).toString("base64url")}`;
  const cambiada = await pedir("/api/panel/mi-cuenta/clave", {
    metodo: "POST",
    cookie: primeraEntrada.cookie,
    json: { nueva: claveNueva, confirmacion: claveNueva },
  });
  comprobar("cambia la temporal por la suya", cambiada.estado === 200, cambiada.texto.slice(0, 160));

  const segundaEntrada = await pedir("/api/panel/sesion", {
    metodo: "POST",
    json: { correo: "f3-alta@ejemplo.invalid", clave: claveNueva },
  });
  comprobar("y vuelve a entrar con la nueva", segundaEntrada.estado === 200 && segundaEntrada.datos?.debe_cambiar_clave === false, segundaEntrada.texto.slice(0, 160));

  // ─── 6. Desactivar saca de inmediato ──────────────────────────
  console.log("\n6. Desactivar a alguien lo saca en su siguiente petición");
  const suSesion = segundaEntrada.cookie;
  const antesDe = await pedir("/api/panel/mi-cuenta", { cookie: suSesion });
  comprobar("con su sesión abierta, todo normal (200)", antesDe.estado === 200);

  const desactivar = await pedir(`/api/panel/usuarios/${nuevoAsesor.usuario.id}`, {
    metodo: "PATCH",
    cookie: gente.director.cookie,
    json: { activo: false },
  });
  comprobar("el director lo desactiva", desactivar.estado === 200, desactivar.texto.slice(0, 160));

  const despuesDe = await pedir("/api/panel/mi-cuenta", { cookie: suSesion });
  comprobar("su siguiente petición ya recibe 401", despuesDe.estado === 401, `estado ${despuesDe.estado}`);

  const noEntra = await pedir("/api/panel/sesion", { metodo: "POST", json: { correo: "f3-alta@ejemplo.invalid", clave: claveNueva } });
  comprobar("y tampoco puede volver a entrar", noEntra.estado === 401, `estado ${noEntra.estado}`);

  // ─── 7. La bitácora cuenta todo lo anterior, sin claves ───────
  console.log("\n7. La bitácora tiene el rastro, con quién y cuándo, y sin claves");
  const bitacora = await pedir("/api/panel/bitacora?entidad=propiedad", { cookie: gente.maestro.cookie });
  const acciones = (bitacora.datos?.items ?? []).map((entrada) => entrada.accion);
  comprobar(
    "registra crear, editar y el cambio de estado de las casas",
    ["crear", "editar", "estado"].every((accion) => acciones.includes(accion)),
    acciones.slice(0, 12).join(", "),
  );

  const conNombre = (bitacora.datos?.items ?? []).filter((entrada) => entrada.quien && entrada.quien !== "—");
  comprobar("cada movimiento dice quién lo hizo y cuándo", conNombre.length > 0 && conNombre.every((entrada) => Boolean(entrada.cuando)));

  const deCuentas = await pedir("/api/panel/bitacora?entidad=usuario", { cookie: gente.maestro.cookie });
  const volcado = JSON.stringify(deCuentas.datos ?? {});
  const claves = [nuevoAsesor.clave, claveNueva, gente.maestro.clave, gente.director.clave];
  comprobar(
    "ninguna contraseña aparece en la bitácora",
    !claves.some((clave) => volcado.includes(clave)) && !volcado.includes("pbkdf2$"),
  );

  const enLaBase = consultar(
    `SELECT COUNT(*) AS n FROM bitacora WHERE cambios LIKE '%pbkdf2$%' OR cambios LIKE ${sql(`%${claveNueva}%`)};`,
    opciones,
  )[0]?.n;
  comprobar("ni en la base, mirando directamente la tabla", Number(enLaBase) === 0, `filas: ${enLaBase}`);
} finally {
  // ─── Limpieza ─────────────────────────────────────────────────
  console.log("\nLimpieza");
  const ids = aBorrar.propiedades.filter(Boolean);
  if (ids.length) {
    ejecutarSql(
      `DELETE FROM fotos WHERE propiedad_id IN (${ids.join(",")});
       DELETE FROM bitacora WHERE entidad IN ('propiedad','foto') AND entidad_id IN (${ids.map((id) => sql(String(id))).join(",")});
       DELETE FROM propiedades WHERE id IN (${ids.join(",")});
       DELETE FROM zonas WHERE slug = 'morelia-prueba-f3' AND NOT EXISTS (SELECT 1 FROM propiedades WHERE zona_id = zonas.id);`,
      opciones,
    );
  }
  // Las casas que crearon los cuatro roles en la matriz.
  ejecutarSql(
    `DELETE FROM bitacora WHERE entidad = 'propiedad' AND entidad_id IN (SELECT CAST(id AS TEXT) FROM propiedades WHERE titulo LIKE 'Casa de prueba F3%');
     DELETE FROM fotos WHERE propiedad_id IN (SELECT id FROM propiedades WHERE titulo LIKE 'Casa de prueba F3%');
     DELETE FROM propiedades WHERE titulo LIKE 'Casa de prueba F3%';`,
    opciones,
  );
  for (const usuario of aBorrar.usuarios) {
    soltarReferencias(usuario.id);
    borrarUsuarioDePrueba(usuario.id, usuario.correo, opciones);
  }

  const quedan = consultar(
    "SELECT COUNT(*) AS n FROM propiedades WHERE titulo LIKE 'Casa de prueba F3%';",
    opciones,
  )[0]?.n;
  const gentQueda = ROLES.filter((rol) => buscarUsuario(correoDe(rol), opciones)).length;
  comprobar("no queda ninguna casa ni cuenta de prueba", Number(quedan) === 0 && gentQueda === 0, `casas ${quedan}, cuentas ${gentQueda}`);
}

const fallidas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallidas.length} de ${resultados.length} comprobaciones pasaron.`);
if (fallidas.length) {
  console.log("Fallaron:\n" + fallidas.map((f) => `  - ${f.nombre}`).join("\n"));
  process.exit(1);
}
