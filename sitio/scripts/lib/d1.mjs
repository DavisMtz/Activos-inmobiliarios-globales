/**
 * Ejecuta SQL contra la D1 local o remota con el wrangler del proyecto.
 *
 * Se invoca `node node_modules/wrangler/bin/wrangler.js` y no `npx wrangler`:
 * en Windows `execFileSync('npx')` no encuentra `npx.cmd` sin `shell: true`, y
 * con `shell: true` cmd.exe rompe los argumentos con espacios (Cuponera).
 *
 * Dos trampas de `wrangler d1 execute --remote`, medidas el 16/09/2026:
 * - Con `--file` va por la API de IMPORTACIÓN: ejecuta, pero NO devuelve las
 *   filas de un SELECT (solo «Total queries executed»). Las lecturas van con
 *   `--command`.
 * - Con `--file` imprime líneas de avance («├ Checking if file needs
 *   uploading») ANTES del JSON aunque se pida `--json`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const WRANGLER = join(RAIZ, "node_modules", "wrangler", "bin", "wrangler.js");
export const BASE_DATOS = "activos-inmobiliarios-db";

/** Escapa un valor para meterlo entre comillas simples en SQL. */
export const texto = (valor) => (valor === null || valor === undefined ? "NULL" : `'${String(valor).replaceAll("'", "''")}'`);

function wrangler(argumentos) {
  try {
    const salida = execFileSync(process.execPath, [WRANGLER, "d1", "execute", BASE_DATOS, ...argumentos, "--yes", "--json"], {
      cwd: RAIZ,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024,
    });
    const inicio = salida.search(/^\[/m);
    if (inicio === -1) throw new Error(`wrangler no devolvió JSON:\n${salida}`);
    return JSON.parse(salida.slice(inicio));
  } catch (error) {
    const detalle = error.stdout || error.stderr || error.message;
    throw new Error(`wrangler d1 execute falló:\n${detalle}`);
  }
}

/**
 * Escritura (una o varias sentencias) desde un archivo temporal que se borra
 * siempre: puede llevar hashes de claves y así no pasan por la línea de comandos.
 */
export function ejecutarSql(sql, { remoto }) {
  const carpeta = mkdtempSync(join(tmpdir(), "aig-sql-"));
  const archivo = join(carpeta, "consulta.sql");
  try {
    writeFileSync(archivo, sql, "utf8");
    return wrangler([remoto ? "--remote" : "--local", "--file", archivo]);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

/** Aplica un archivo .sql que ya existe (p. ej. la semilla generada). */
export function ejecutarArchivo(ruta, { remoto }) {
  return wrangler([remoto ? "--remote" : "--local", "--file", ruta]);
}

/** Lectura de UNA sentencia: devuelve sus filas. */
export function consultar(sql, { remoto }) {
  const resultados = wrangler([remoto ? "--remote" : "--local", "--command", sql]);
  const ultimo = Array.isArray(resultados) ? resultados[resultados.length - 1] : resultados;
  return ultimo?.results ?? [];
}
