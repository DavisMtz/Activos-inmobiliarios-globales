const pesos = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

/** `3000000` → «$3,000,000». Sin precio, null: quien pinta decide qué mostrar. */
export const precioMXN = (valor: number | null | undefined): string | null =>
  typeof valor === "number" && Number.isFinite(valor) ? pesos.format(valor) : null;

const metros = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/** `180` → «180 m²». */
export const m2 = (valor: number | null | undefined): string | null =>
  typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? `${metros.format(valor)} m²` : null;
