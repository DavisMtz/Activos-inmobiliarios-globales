#!/usr/bin/env node
/**
 * Datos de muestra para MIRAR la pantalla de Métricas en la D1 LOCAL.
 *
 *   npm run metricas:muestra -- --local            siembra y deja sesiones de maestro, asesora y contenido
 *   npm run metricas:muestra -- --local --limpiar  lo quita todo y devuelve lo que tocó
 *
 * Para mirarla: `AIG_COOKIE=<cookies.maestro del JSON de abajo> npm run capturar -- <url> salida.png 1366 4300 0`.
 * Cierra SIEMPRE con `--limpiar`: las verificaciones de F3 y F4 esperan la base sin cuentas de prueba.
 *
 * Producción apenas tiene una semana de visitas y un prospecto, y la base local
 * ni eso: sin datos con forma no se puede juzgar una gráfica. Esto siembra
 * cuatro meses de visitas con el ritmo de un sitio real (más en fin de semana
 * y en la noche, unas casas mucho más vistas que otras), prospectos en todos
 * los estados con su rastro en la bitácora, dos asesores de prueba con casas a
 * su nombre y unas cuantas casas apartadas o vendidas.
 *
 * **Nunca en remoto**, ni con bandera: son cifras inventadas y en producción
 * se leerían como del negocio (CLAUDE.md: no inventar contenido del negocio).
 *
 * Lo que toca de lo que ya existía (el asesor y el estado de unas casas) queda
 * anotado en `%TEMP%\aig-metricas-demo.json`, junto con la cookie de la sesión
 * de muestra, y `--limpiar` lo devuelve tal cual. Ese archivo vive fuera del
 * repositorio, que es público.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { consultar, ejecutarSql, texto as sql } from "./lib/d1.mjs";

const { values } = parseArgs({
  options: {
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    limpiar: { type: "boolean", default: false },
    dias: { type: "string", default: "120" },
  },
});
if (values.remote || !values.local) {
  console.error("Solo con --local: son datos inventados y en producción se leerían como del negocio.");
  process.exit(1);
}
const opciones = { remoto: false };
const ARCHIVO = join(tmpdir(), "aig-metricas-demo.json");
const MARCA = "Demo métricas";
const correoDe = (quien) => `metricas-${quien}@ejemplo.invalid`;

// ─── Limpiar ──────────────────────────────────────────────────────

function limpiar() {
  const anotado = existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, "utf8")) : null;
  const usuarios = consultar(`SELECT id FROM usuarios WHERE correo LIKE 'metricas-%@ejemplo.invalid';`, opciones).map((f) => f.id);
  const listaUsuarios = usuarios.map(sql).join(", ") || "''";
  const partes = [
    // De las hojas a la raíz (PLAN §17): nada debe quedar apuntando a lo que se borra.
    `DELETE FROM bitacora WHERE entidad = 'prospecto' AND entidad_id IN (SELECT CAST(id AS TEXT) FROM prospectos WHERE nombre LIKE '${MARCA}%');`,
    `DELETE FROM notas_prospecto WHERE prospecto_id IN (SELECT id FROM prospectos WHERE nombre LIKE '${MARCA}%');`,
    `DELETE FROM prospectos WHERE nombre LIKE '${MARCA}%';`,
    `DELETE FROM bitacora WHERE usuario_id IN (${listaUsuarios});`,
    `DELETE FROM bitacora WHERE entidad = 'usuario' AND entidad_id IN (${listaUsuarios});`,
  ];
  if (anotado?.eventos) {
    partes.push(`DELETE FROM eventos WHERE id BETWEEN ${Number(anotado.eventos.desde)} AND ${Number(anotado.eventos.hasta)};`);
  }
  for (const casa of anotado?.casas ?? []) {
    partes.push(
      `UPDATE propiedades SET asesor_id = ${sql(casa.asesor_id)}, estado = ${sql(casa.estado)} WHERE id = ${Number(casa.id)};`,
    );
  }
  partes.push(
    `UPDATE propiedades SET asesor_id = NULL WHERE asesor_id IN (${listaUsuarios});`,
    `DELETE FROM sesiones WHERE usuario_id IN (${listaUsuarios});`,
    `DELETE FROM usuarios WHERE id IN (${listaUsuarios});`,
  );
  ejecutarSql(partes.join("\n"), opciones);
  if (existsSync(ARCHIVO)) rmSync(ARCHIVO);
  const quedan = consultar(
    `SELECT (SELECT COUNT(*) FROM usuarios WHERE correo LIKE 'metricas-%') AS cuentas,
            (SELECT COUNT(*) FROM prospectos WHERE nombre LIKE '${MARCA}%') AS prospectos,
            (SELECT COUNT(*) FROM eventos) AS eventos,
            (SELECT COUNT(*) FROM propiedades WHERE estado = 'publicada' AND eliminada_en IS NULL) AS publicadas;`,
    opciones,
  )[0];
  console.log("Limpio:", JSON.stringify(quedan));
}

if (values.limpiar) {
  limpiar();
  process.exit(0);
}
if (existsSync(ARCHIVO)) {
  console.log("Ya había una siembra de muestra: se limpia primero.");
  limpiar();
}

// ─── Azar con semilla: la misma muestra cada vez ──────────────────

let semilla = 20260921;
const azar = () => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
};
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

// ─── Cuentas ──────────────────────────────────────────────────────

const ahoraIso = new Date().toISOString();
const cuentas = [
  { quien: "maestro", nombre: "Revisión de métricas", rol: "maestro" },
  { quien: "asesora", nombre: "Asesora de prueba", rol: "asesor" },
  { quien: "asesor", nombre: "Asesor de prueba", rol: "asesor" },
  // Para mirar lo que ve cada rol: contenido ve solo vistas (PLAN §9).
  { quien: "contenido", nombre: "Contenido de prueba", rol: "contenido" },
].map((cuenta) => ({ ...cuenta, id: crypto.randomUUID(), correo: correoDe(cuenta.quien) }));

// Clave imposible de usar: la sesión se crea aquí mismo, sin pasar por el acceso.
const claveInutil = `pbkdf2$100000$${randomBytes(16).toString("base64")}$${randomBytes(32).toString("base64")}`;
// Una sesión por rol que se quiera mirar: maestro, una asesora y contenido.
const sesiones = Object.fromEntries(
  [cuentas[0], cuentas[1], cuentas[3]].map((cuenta) => [cuenta.quien, randomBytes(32).toString("base64url")]),
);

const sentencias = cuentas.map(
  (c) => `INSERT INTO usuarios (id, correo, nombre, rol, clave_hash, debe_cambiar_clave, activo, creado_en)
          VALUES (${sql(c.id)}, ${sql(c.correo)}, ${sql(c.nombre)}, ${sql(c.rol)}, ${sql(claveInutil)}, 0, 1, ${sql(ahoraIso)});`,
);
for (const [quien, token] of Object.entries(sesiones)) {
  const cuenta = cuentas.find((c) => c.quien === quien);
  const huella = createHash("sha256").update(token).digest("hex");
  sentencias.push(
    `INSERT INTO sesiones (id_hash, usuario_id, solo_cambio_clave, expira_en, agente, creada_en)
     VALUES (${sql(huella)}, ${sql(cuenta.id)}, 0, ${sql(new Date(Date.now() + 86_400_000).toISOString())}, 'sembrar-metricas-demo', ${sql(ahoraIso)});`,
  );
}

// ─── Las casas: popularidad desigual, dos asesores ────────────────

const casas = consultar(
  `SELECT id, estado, asesor_id FROM propiedades WHERE eliminada_en IS NULL AND estado = 'publicada' ORDER BY id;`,
  opciones,
);
// Unas pocas casas se llevan casi todo (como en cualquier catálogo): peso 1/rango.
const barajadas = [...casas].sort(() => azar() - 0.5);
const pesos = barajadas.map((_, i) => 1 / (i + 3) ** 0.9);
const sumaPesos = pesos.reduce((a, b) => a + b, 0);
const casaAlAzar = () => {
  let x = azar() * sumaPesos;
  for (let i = 0; i < barajadas.length; i++) {
    x -= pesos[i];
    if (x <= 0) return barajadas[i];
  }
  return barajadas[barajadas.length - 1];
};

const tocadas = new Map();
const tocar = (casa) => {
  if (!tocadas.has(casa.id)) tocadas.set(casa.id, { id: casa.id, estado: casa.estado, asesor_id: casa.asesor_id });
};
barajadas.forEach((casa, i) => {
  const asesor = i % 5 === 0 ? cuentas[1] : i % 5 === 1 ? cuentas[2] : null;
  if (!asesor) return;
  tocar(casa);
  sentencias.push(`UPDATE propiedades SET asesor_id = ${sql(asesor.id)} WHERE id = ${casa.id};`);
});

// ─── Visitas: cuatro meses con ritmo ──────────────────────────────

const dias = Number(values.dias);
const MORELIA = 6 * 3_600_000;
const hoyLocal = new Date(Date.now() - MORELIA);
hoyLocal.setUTCHours(0, 0, 0, 0);
// Peso de cada hora del día (hora de Morelia): mediodía y, sobre todo, la noche.
const PESO_HORA = [1, 0.5, 0.3, 0.2, 0.2, 0.3, 0.6, 1.2, 2, 2.6, 3, 3.2, 3.6, 3.8, 3.4, 3, 3, 3.2, 3.8, 4.6, 5.4, 5.8, 4.8, 2.6];
const sumaHoras = PESO_HORA.reduce((a, b) => a + b, 0);
const horaAlAzar = () => {
  let x = azar() * sumaHoras;
  for (let h = 0; h < 24; h++) {
    x -= PESO_HORA[h];
    if (x <= 0) return h;
  }
  return 23;
};

const eventos = [];
for (let d = dias - 1; d >= 0; d--) {
  const inicioDia = hoyLocal.getTime() - d * 86_400_000 + MORELIA;
  const semana = new Date(inicioDia - MORELIA).getUTCDay(); // 0 = domingo
  const finDeSemana = semana === 0 || semana === 6 ? 1.45 : semana === 5 ? 1.15 : 1;
  const crecimiento = 0.55 + 0.45 * ((dias - d) / dias); // el sitio va ganando visitas
  const base = 34 * crecimiento * finDeSemana * (0.75 + azar() * 0.5);
  const vistasDelDia = Math.round(d === 0 ? base * 0.45 : base); // hoy va a medias
  for (let v = 0; v < vistasDelDia; v++) {
    const cuando = inicioDia + horaAlAzar() * 3_600_000 + entre(0, 3_599) * 1000;
    if (cuando > Date.now()) continue;
    const casa = casaAlAzar();
    eventos.push(["ficha_vista", casa.id, new Date(cuando).toISOString()]);
    if (azar() < 0.035) eventos.push(["whatsapp_click", casa.id, new Date(cuando + entre(20, 400) * 1000).toISOString()]);
  }
}

// ─── Prospectos, con su rastro en la bitácora ─────────────────────

const TIPOS = [
  ["propiedad", 0.62],
  ["general", 0.22],
  ["vender", 0.1],
  ["credito", 0.06],
];
const tipoAlAzar = () => {
  let x = azar();
  for (const [tipo, peso] of TIPOS) {
    x -= peso;
    if (x <= 0) return tipo;
  }
  return "general";
};
const prospectos = [];
for (let d = dias - 1; d >= 0; d--) {
  const cuantos = azar() < 0.42 ? entre(1, 2) : 0;
  for (let k = 0; k < cuantos; k++) {
    const creado = hoyLocal.getTime() + MORELIA - d * 86_400_000 + horaAlAzar() * 3_600_000 + entre(0, 3_599) * 1000;
    if (creado > Date.now()) continue;
    const edad = d;
    // Lo viejo ya se resolvió; lo reciente sigue abierto.
    const estado =
      edad > 30
        ? elegir(["cerrado", "cerrado", "descartado", "cita", "cerrado", "contactado"])
        : edad > 7
          ? elegir(["contactado", "cita", "cita", "cerrado", "descartado", "nuevo"])
          : elegir(["nuevo", "nuevo", "contactado", "nuevo", "cita"]);
    const tipo = tipoAlAzar();
    const casa = tipo === "propiedad" ? casaAlAzar() : null;
    const asesor = estado === "nuevo" && azar() < 0.5 ? null : elegir([cuentas[1], cuentas[2], cuentas[0]]);
    const espera = estado === "nuevo" ? null : Math.min(edad * 24 + 1, 0.5 + azar() * azar() * 60) * 3_600_000;
    prospectos.push({ creado, estado, tipo, casa, asesor, espera });
  }
}

// ─── Movimientos del catálogo ─────────────────────────────────────

const movidas = [];
const candidatas = barajadas.slice(20, 40);
for (const [i, destino] of ["apartada", "vendida", "vendida", "apartada", "rentada", "vendida"].entries()) {
  const casa = candidatas[i];
  if (!casa) break;
  tocar(casa);
  const cuando = new Date(Date.now() - entre(1, 80) * 86_400_000).toISOString();
  movidas.push({ casa, destino, cuando });
}

// ─── Escribir ─────────────────────────────────────────────────────

const antes = Number(consultar("SELECT COALESCE(MAX(id), 0) AS n FROM eventos;", opciones)[0]?.n ?? 0);
ejecutarSql(sentencias.join("\n"), opciones);

for (let i = 0; i < eventos.length; i += 400) {
  const lote = eventos.slice(i, i + 400);
  ejecutarSql(
    `INSERT INTO eventos (tipo, propiedad_id, creado_en) VALUES ${lote.map(([t, c, f]) => `(${sql(t)}, ${c}, ${sql(f)})`).join(", ")};`,
    opciones,
  );
}
const despues = Number(consultar("SELECT COALESCE(MAX(id), 0) AS n FROM eventos;", opciones)[0]?.n ?? 0);

const conProspectos = [];
prospectos.forEach((p, i) => {
  const nombre = `${MARCA} ${String(i + 1).padStart(3, "0")}`;
  conProspectos.push(
    `INSERT INTO prospectos (tipo, propiedad_id, nombre, telefono, correo, mensaje, acepto_aviso, origen, estado, asesor_id, creado_en)
     VALUES (${sql(p.tipo)}, ${p.casa ? p.casa.id : "NULL"}, ${sql(nombre)}, '4430000000', ${sql(`demo-${i + 1}@ejemplo.invalid`)},
             'Mensaje de muestra', 1, 'demo-metricas', ${sql(p.estado)}, ${p.asesor ? sql(p.asesor.id) : "NULL"}, ${sql(new Date(p.creado).toISOString())});`,
  );
  if (p.espera !== null) {
    const quien = p.asesor ?? cuentas[0];
    conProspectos.push(
      `INSERT INTO bitacora (usuario_id, entidad, entidad_id, accion, cambios, creado_en)
       SELECT ${sql(quien.id)}, 'prospecto', CAST(id AS TEXT), 'estado', ${sql(JSON.stringify({ estado: ["nuevo", p.estado] }))},
              ${sql(new Date(p.creado + p.espera).toISOString())}
         FROM prospectos WHERE nombre = ${sql(nombre)};`,
    );
  }
});
for (const movida of movidas) {
  conProspectos.push(
    `UPDATE propiedades SET estado = ${sql(movida.destino)} WHERE id = ${movida.casa.id};`,
    `INSERT INTO bitacora (usuario_id, entidad, entidad_id, accion, cambios, creado_en)
     VALUES (${sql(cuentas[0].id)}, 'propiedad', ${sql(String(movida.casa.id))}, 'estado',
             ${sql(JSON.stringify({ estado: ["publicada", movida.destino] }))}, ${sql(movida.cuando)});`,
  );
}
ejecutarSql(conProspectos.join("\n"), opciones);

writeFileSync(
  ARCHIVO,
  JSON.stringify(
    {
      creado: ahoraIso,
      cookie: sesiones.maestro,
      cookies: sesiones,
      eventos: { desde: antes + 1, hasta: despues },
      casas: [...tocadas.values()],
    },
    null,
    2,
  ),
);

console.log(
  `Sembrado en LOCAL: ${eventos.length} eventos, ${prospectos.length} prospectos, ${movidas.length} casas movidas, ${tocadas.size} casas tocadas.`,
);
console.log(`Sesión de muestra y lo que hay que devolver: ${ARCHIVO}`);
console.log("Para quitarlo todo: node scripts/sembrar-metricas-demo.mjs --local --limpiar");
