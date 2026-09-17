/**
 * Todas las fechas de la base son texto ISO 8601 en UTC, siempre con el mismo
 * largo (`2026-09-16T23:04:05.123Z`), para que comparar textos en SQL sea
 * comparar fechas. Nunca `datetime('now')`: usa otro formato.
 */

export const ahora = (): string => new Date().toISOString();

export const enMinutos = (n: number): string => new Date(Date.now() + n * 60_000).toISOString();

export const enHoras = (n: number): string => enMinutos(n * 60);

export const enDias = (n: number): string => enHoras(n * 24);

/** El principio de una ventana de tiempo: «los últimos 30 días» (métricas, F4). */
export const haceDias = (n: number): string => enDias(-n);
