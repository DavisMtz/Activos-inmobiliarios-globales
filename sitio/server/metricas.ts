/**
 * Las cuentas de la pantalla de Métricas que no tocan la base: la ventana de
 * tiempo, las cubetas de la serie, los rangos de precio, la rejilla de horas y
 * la mediana. Son puras para poder probarlas (`tests/metricas.test.ts`); las
 * consultas viven en `server/db/panel/metricas.ts`.
 */

import { diaDeLaSemana, diaDeMorelia, diasEntre, inicioDeDiaMorelia, sumarDias } from "./fechas";

// ─── La ventana ───────────────────────────────────────────────────

export type Ventana = {
  /** 7, 30, 90 o `null` (= desde el principio). */
  dias: number | null;
  /** Hoy en Morelia: el último día que se enseña, que va a medias. */
  hoy: string;
  /** El primer día que entra; `null` en «Todo», que empieza con el primer dato. */
  primerDia: string | null;
  /** El instante UTC en que empieza ese día; `null` en «Todo». */
  desde: string | null;
  /**
   * Contra qué se compara: el mismo largo justo antes, y cortado a la MISMA
   * hora de hoy. Contra días completos, hoy —que va a medias— haría que cada
   * mañana todo pareciera ir a la baja.
   */
  anterior: { desde: string; hasta: string } | null;
};

/**
 * «Los últimos 7 días» son hoy y los seis de antes, en días de Morelia: siete
 * barras completas en la gráfica, no siete veces 24 horas contadas desde este
 * minuto (la primera saldría cortada y parecería un día flojo).
 */
export function ventanaDeMetricas(dias: number | null, ahora: Date = new Date()): Ventana {
  const hoy = diaDeMorelia(ahora);
  if (dias === null) return { dias, hoy, primerDia: null, desde: null, anterior: null };
  const primerDia = sumarDias(hoy, 1 - dias);
  return {
    dias,
    hoy,
    primerDia,
    desde: inicioDeDiaMorelia(primerDia),
    anterior: {
      desde: inicioDeDiaMorelia(sumarDias(primerDia, -dias)),
      hasta: new Date(ahora.getTime() - dias * 86_400_000).toISOString(),
    },
  };
}

// ─── La serie ─────────────────────────────────────────────────────

export type Cubeta = "dia" | "semana" | "mes";

/** Hasta tres meses, un punto por día; hasta dos años, por semana; más, por mes. */
export const cubetaPara = (dias: number): Cubeta => (dias <= 92 ? "dia" : dias <= 731 ? "semana" : "mes");

export type Cuentas = {
  vistas: number;
  whatsapp: number;
  telefono: number;
  compartir: number;
  prospectos: number;
};

export const cuentasEnCero = (): Cuentas => ({ vistas: 0, whatsapp: 0, telefono: 0, compartir: 0, prospectos: 0 });

export type PuntoSerie = Cuentas & {
  /** Primer y último día que abarca el punto (iguales si la cubeta es de días). */
  desde: string;
  hasta: string;
};

/**
 * La serie entera, de `primerDia` a `hoy`, con los huecos en cero. SQL solo
 * devuelve los días que tuvieron algo, y una gráfica que se salta los vacíos
 * miente sobre el ritmo.
 */
export function armarSerie(porDia: ReadonlyMap<string, Cuentas>, primerDia: string, hoy: string, cubeta: Cubeta): PuntoSerie[] {
  const puntos: PuntoSerie[] = [];
  let actual: PuntoSerie | null = null;
  let claveActual = "";
  const cuantos = diasEntre(primerDia, hoy);
  for (let i = 0; i <= cuantos; i++) {
    const dia = sumarDias(primerDia, i);
    const clave = claveDeCubeta(dia, cubeta);
    if (!actual || clave !== claveActual) {
      actual = { desde: dia, hasta: dia, ...cuentasEnCero() };
      claveActual = clave;
      puntos.push(actual);
    }
    actual.hasta = dia;
    const delDia = porDia.get(dia);
    if (delDia) {
      actual.vistas += delDia.vistas;
      actual.whatsapp += delDia.whatsapp;
      actual.telefono += delDia.telefono;
      actual.compartir += delDia.compartir;
      actual.prospectos += delDia.prospectos;
    }
  }
  return puntos;
}

function claveDeCubeta(dia: string, cubeta: Cubeta): string {
  if (cubeta === "dia") return dia;
  if (cubeta === "mes") return dia.slice(0, 7);
  return sumarDias(dia, -diaDeLaSemana(dia)); // el lunes de su semana
}

// ─── Horas ────────────────────────────────────────────────────────

/**
 * A qué hora se ven las casas: 7 × 24, de lunes a domingo y de 0 a 23 h, en la
 * hora de Morelia. SQLite numera la semana desde el domingo (`%w` = 0).
 */
export function rejillaDeHoras(filas: readonly { dow: number; hora: number; n: number }[]): number[][] {
  const rejilla = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const fila of filas) {
    const dia = (Number(fila.dow) + 6) % 7;
    const hora = Number(fila.hora);
    if (dia >= 0 && dia < 7 && hora >= 0 && hora < 24) rejilla[dia][hora] += Number(fila.n);
  }
  return rejilla;
}

// ─── Precio ───────────────────────────────────────────────────────

/**
 * Los cortes salen del catálogo real (21/09/2026, 185 casas con precio de
 * venta): 12 · 43 · 64 · 39 · 18 · 9. Por partes iguales de dinero, casi todas
 * caerían en la primera.
 */
export const RANGOS_DE_PRECIO = [
  { clave: "hasta-1.5", hasta: 1_500_000, etiqueta: "Hasta 1.5 M" },
  { clave: "1.5-3", hasta: 3_000_000, etiqueta: "1.5 a 3 M" },
  { clave: "3-5", hasta: 5_000_000, etiqueta: "3 a 5 M" },
  { clave: "5-8", hasta: 8_000_000, etiqueta: "5 a 8 M" },
  { clave: "8-15", hasta: 15_000_000, etiqueta: "8 a 15 M" },
  { clave: "mas-15", hasta: Number.POSITIVE_INFINITY, etiqueta: "Más de 15 M" },
] as const;

export function rangoDePrecio(precio: number | null | undefined): string | null {
  if (typeof precio !== "number" || !Number.isFinite(precio) || precio <= 0) return null;
  return RANGOS_DE_PRECIO.find((rango) => precio < rango.hasta)?.clave ?? null;
}

// ─── Estadística ──────────────────────────────────────────────────

/** La mediana y no el promedio: un prospecto olvidado un mes no debe tapar a los que se atendieron en una hora. */
export function mediana(valores: readonly number[]): number | null {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}
