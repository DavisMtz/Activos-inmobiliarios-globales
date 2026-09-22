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

// ─── Días de Morelia ──────────────────────────────────────────────
//
// Un «día» del equipo empieza a medianoche de Morelia, no de Greenwich: con
// `substr(creado_en, 1, 10)` el día se partiría a las 18:00 y una visita de las
// 7 de la tarde contaría para mañana. En SQL es `date(creado_en, '-6 hours')`,
// que da lo mismo que `diaDeMorelia` (medido en la D1 local el 21/09/2026 con
// instantes a ambos lados de la frontera).

/** Morelia va en UTC-6 todo el año: sin horario de verano desde 2022. */
export const DESFASE_MORELIA_MS = 6 * 3_600_000;
const DIA_MS = 86_400_000;

/** «2026-09-20»: el día de Morelia en que cae un instante. */
export const diaDeMorelia = (fecha: Date = new Date()): string =>
  new Date(fecha.getTime() - DESFASE_MORELIA_MS).toISOString().slice(0, 10);

/** El instante UTC en que empieza un día de Morelia: «2026-09-20» → «2026-09-20T06:00:00.000Z». */
export const inicioDeDiaMorelia = (dia: string): string =>
  new Date(Date.parse(`${dia}T00:00:00.000Z`) + DESFASE_MORELIA_MS).toISOString();

/** El día que queda `n` días después (o antes, con `n` negativo). */
export const sumarDias = (dia: string, n: number): string =>
  new Date(Date.parse(`${dia}T00:00:00.000Z`) + n * DIA_MS).toISOString().slice(0, 10);

/** Cuántos días van de `a` a `b` («2026-09-01» a «2026-09-03» = 2). */
export const diasEntre = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / DIA_MS);

/** 0 = lunes … 6 = domingo: la semana empieza en lunes, como el calendario de aquí. */
export const diaDeLaSemana = (dia: string): number => (new Date(`${dia}T00:00:00.000Z`).getUTCDay() + 6) % 7;
