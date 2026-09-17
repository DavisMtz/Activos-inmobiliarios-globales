const pesos = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

/** `3000000` → «$3,000,000». Sin precio, null: quien pinta decide qué mostrar. */
export const precioMXN = (valor: number | null | undefined): string | null =>
  typeof valor === "number" && Number.isFinite(valor) ? pesos.format(valor) : null;

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * `2026-09-17T…` → «17 sept 2026». En UTC a propósito: las fechas de la base
 * son UTC, y dejar que cada navegador las corra a su huso haría que la misma
 * casa se viera cambiada «ayer» o «hoy» según quién mire.
 */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const valor = new Date(iso);
  return Number.isNaN(valor.getTime()) ? "" : fecha.format(valor);
}

const metros = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/** `180` → «180 m²». */
export const m2 = (valor: number | null | undefined): string | null =>
  typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? `${metros.format(valor)} m²` : null;
