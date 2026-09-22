/**
 * Las cuentas y los textos de las gráficas del panel, sin JSX: cómo se escribe
 * una cifra, una fecha, un porcentaje o un cambio, y dónde acaba un eje. Viven
 * aparte de `graficas.tsx` para poder probarlos (`tests/metricas.test.ts`).
 */

// ─── Cifras y fechas ──────────────────────────────────────────────
// Con listas propias y no con `Intl`: el servidor y el navegador traen tablas
// distintas («sep» contra «sept.») y la diferencia rompería la hidratación.

export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
export const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
export const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export const cifra = (n: number): string => n.toLocaleString("es-MX");

export const partesDe = (dia: string) => {
  const [anio, mes, d] = dia.split("-").map(Number);
  return { anio, mes, d };
};

/** 0 = lunes. `dia` es un día de Morelia («2026-09-21»), no un instante. */
export const semanaDe = (dia: string): number => (new Date(`${dia}T00:00:00.000Z`).getUTCDay() + 6) % 7;

/** «21 sep». */
export const fechaCorta = (dia: string): string => {
  const { mes, d } = partesDe(dia);
  return `${d} ${MESES[mes - 1]}`;
};

export type Cubeta = "dia" | "semana" | "mes";

/** Cómo se nombra un punto de la serie: «sábado 20 sep», «del 15 al 21 sep», «septiembre de 2026». */
export function nombreDePunto(punto: { desde: string; hasta: string }, cubeta: Cubeta): string {
  if (cubeta === "dia") return `${DIAS_LARGOS[semanaDe(punto.desde)]} ${fechaCorta(punto.desde)}`;
  if (cubeta === "semana") return `Del ${fechaCorta(punto.desde)} al ${fechaCorta(punto.hasta)}`;
  const { anio, mes } = partesDe(punto.desde);
  return `${MESES_LARGOS[mes - 1]} de ${anio}`;
}

/** La etiqueta corta del eje: «20 sep» o «sep 26». */
export function marcaDeEje(punto: { desde: string }, cubeta: Cubeta): string {
  if (cubeta === "mes") {
    const { anio, mes } = partesDe(punto.desde);
    return `${MESES[mes - 1]} ${String(anio).slice(2)}`;
  }
  return fechaCorta(punto.desde);
}

/**
 * El tope del eje: redondo y justo por encima del máximo (7 → 8, 18 → 20,
 * 130 → 150). Con cifras de hasta 5 se queda en el máximo: un eje que llega a
 * 5 con un solo clic de 1 haría ver enana la única barra.
 */
export function topeBonito(maximo: number): number {
  if (!(maximo > 0)) return 1;
  if (maximo <= 5) return Math.ceil(maximo);
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  for (const paso of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (paso * potencia >= maximo) return Math.round(paso * potencia);
  }
  return 10 * potencia;
}

export const porcentaje = (parte: number, total: number): number => (total > 0 ? (parte / total) * 100 : 0);

/**
 * «12 %»: redondo desde 10, con un decimal por debajo («3.5 %»), y nunca «0 %»
 * para algo que sí pasó: lo más chico que se escribe es «0.1 %».
 */
export function textoPorcentaje(valor: number): string {
  if (!Number.isFinite(valor)) return "—";
  if (valor <= 0) return "0 %";
  const redondo = valor >= 10 ? Math.round(valor) : Math.max(0.1, Math.round(valor * 10) / 10);
  return `${redondo.toLocaleString("es-MX")} %`;
}

/**
 * Cuánto cambió contra el periodo anterior. Con cifras chicas (menos de 10 en
 * el periodo anterior) se dice la diferencia y no el porcentaje: «de 2 a 3»
 * sería «+50 %», y eso asusta o ilusiona sin razón.
 */
export function textoDeCambio(valor: number, anterior: number): { texto: string; sentido: "sube" | "baja" | "igual" } {
  const diferencia = valor - anterior;
  if (diferencia === 0) return { texto: "Igual que", sentido: "igual" };
  const sentido = diferencia > 0 ? "sube" : "baja";
  if (anterior < 10) {
    return { texto: `${cifra(Math.abs(diferencia))} ${diferencia > 0 ? "más" : "menos"} que`, sentido };
  }
  return { texto: `${textoPorcentaje(Math.abs(porcentaje(diferencia, anterior)))} ${diferencia > 0 ? "más" : "menos"} que`, sentido };
}
