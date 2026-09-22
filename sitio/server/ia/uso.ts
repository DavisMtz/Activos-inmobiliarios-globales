/**
 * El gasto y la memoria de la IA (migración `0005`).
 *
 * - **El tope va en CONSULTAS por día**, no en Neurons: los Neurons los cuenta
 *   Cloudflare y esa cuenta no se puede leer desde el Worker. Los tokens se
 *   guardan para poder estimarlos.
 * - **Lo ya interpretado se guarda por su HUELLA.** La llave es el SHA-256 de la
 *   frase normalizada: aquí no queda escrito lo que la gente busca.
 * - **Nada de esto puede tumbar una búsqueda.** Si la tabla no existe (la
 *   migración va primero, pero por si acaso) o D1 no contesta, las lecturas
 *   devuelven «no hay» y las escrituras se callan: la persona busca igual.
 */

import { ahora, diaDeMorelia } from "../fechas";

/** Siete días: en una ciudad la gente busca lo mismo, y el catálogo no cambia lo que una frase QUIERE decir. */
const VIGENCIA_DE_CACHE_MS = 7 * 24 * 3_600_000;

/** «2026-09-20» en la hora de Morelia. Vive en `server/fechas.ts`, que también la usan las métricas. */
export { diaDeMorelia };

// ─── La memoria ───────────────────────────────────────────────────

/** SHA-256 en hexadecimal de los trozos, separados por un carácter que ninguno trae. */
export async function huella(...trozos: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(trozos.join("\n"));
  const resumen = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function leerDeCache(db: D1Database, clave: string): Promise<Record<string, unknown> | null> {
  try {
    const fila = await db
      .prepare("SELECT valor FROM ia_cache WHERE clave = ? AND expira > ?")
      .bind(clave, ahora())
      .first<{ valor: string }>();
    if (!fila) return null;
    const valor: unknown = JSON.parse(fila.valor);
    return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Guarda y, de paso, barre lo caducado: aquí no hay tareas programadas, y una
 * escritura que ya se pagó es el mejor sitio para colgarlo.
 */
export async function guardarEnCache(db: D1Database, clave: string, valor: Record<string, unknown>): Promise<void> {
  try {
    const expira = new Date(Date.now() + VIGENCIA_DE_CACHE_MS).toISOString();
    await db.batch([
      db
        .prepare(
          `INSERT INTO ia_cache (clave, valor, expira) VALUES (?, ?, ?)
           ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, expira = excluded.expira`,
        )
        .bind(clave, JSON.stringify(valor), expira),
      db.prepare("DELETE FROM ia_cache WHERE expira < ?").bind(ahora()),
    ]);
  } catch (error) {
    console.error("IA: no se guardó en caché:", error instanceof Error ? error.message : error);
  }
}

/** Al cambiar de modelo o de instrucciones lo guardado deja de servir; así no espera siete días. */
export async function vaciarCache(db: D1Database): Promise<void> {
  try {
    await db.prepare("DELETE FROM ia_cache").run();
  } catch {
    // Sin tabla no hay nada que vaciar.
  }
}

// ─── El gasto ─────────────────────────────────────────────────────

/** Consultas al modelo en lo que va del día. Si no se puede leer, null: quien pregunta decide. */
export async function consultasDeHoy(db: D1Database): Promise<number | null> {
  try {
    const fila = await db.prepare("SELECT consultas FROM ia_uso WHERE dia = ?").bind(diaDeMorelia()).first<{ consultas: number }>();
    return fila?.consultas ?? 0;
  } catch {
    return null;
  }
}

export type Anotacion = {
  consultas?: number;
  fallos?: number;
  deCache?: number;
  ms?: number;
  tokensEntrada?: number;
  tokensSalida?: number;
};

/** Suma al día de hoy. Va por `waitUntil`: la cuenta no le hace esperar a nadie. */
export async function anotarUso(db: D1Database, a: Anotacion): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO ia_uso (dia, consultas, fallos, de_cache, ms, tokens_entrada, tokens_salida)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(dia) DO UPDATE SET
           consultas = consultas + excluded.consultas,
           fallos = fallos + excluded.fallos,
           de_cache = de_cache + excluded.de_cache,
           ms = ms + excluded.ms,
           tokens_entrada = tokens_entrada + excluded.tokens_entrada,
           tokens_salida = tokens_salida + excluded.tokens_salida`,
      )
      .bind(
        diaDeMorelia(),
        a.consultas ?? 0,
        a.fallos ?? 0,
        a.deCache ?? 0,
        Math.trunc(a.ms ?? 0),
        a.tokensEntrada ?? 0,
        a.tokensSalida ?? 0,
      )
      .run();
  } catch (error) {
    console.error("IA: uso no anotado:", error instanceof Error ? error.message : error);
  }
}

export type UsoDelDia = {
  dia: string;
  consultas: number;
  fallos: number;
  deCache: number;
  ms: number;
  tokensEntrada: number;
  tokensSalida: number;
};

/** Lo que enseña el panel: en qué se fue el día y si el modelo contesta bien. */
export async function usoReciente(db: D1Database, dias = 7): Promise<UsoDelDia[]> {
  try {
    const desde = diaDeMorelia(new Date(Date.now() - (dias - 1) * 24 * 3_600_000));
    const { results } = await db
      .prepare(
        `SELECT dia, consultas, fallos, de_cache AS deCache, ms,
                tokens_entrada AS tokensEntrada, tokens_salida AS tokensSalida
           FROM ia_uso WHERE dia >= ? ORDER BY dia DESC`,
      )
      .bind(desde)
      .all<UsoDelDia>();
    return results;
  } catch {
    return [];
  }
}
