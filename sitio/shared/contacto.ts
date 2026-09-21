/**
 * «¿Qué necesitas?», del formulario de contacto (21/09/2026). Solo datos: lo
 * leen la página (para pintar las opciones) y su `action` (para guardarlas).
 *
 * **No hizo falta migración.** La tabla `prospectos` ya distinguía `vender`
 * («Quiere vender o rentar») y `credito` («Pregunta de crédito»), con su
 * etiqueta en la bandeja, y ningún formulario los llenaba: el de contacto
 * mandaba todo como `general`. Aquí cada opción dice qué tipo le toca y, cuando
 * la etiqueta del tipo no alcanza, una frase que se antepone al mensaje para
 * que quien atiende sepa qué le piden sin preguntar otra vez.
 *
 * Es opcional: sin elegir nada sale un `general` sin frase, como antes.
 */

import type { TipoProspecto } from "./prospecto";

export const MOTIVOS_DE_CONTACTO = [
  { valor: "comprar", etiqueta: "Comprar", tipo: "general", frase: "Quiere comprar." },
  { valor: "rentar", etiqueta: "Rentar", tipo: "general", frase: "Quiere rentar." },
  { valor: "vender", etiqueta: "Vender", tipo: "vender", frase: "Quiere vender." },
  { valor: "poner-en-renta", etiqueta: "Poner en renta", tipo: "vender", frase: "Quiere poner en renta." },
  // La etiqueta del tipo ya lo dice todo en la bandeja.
  { valor: "credito", etiqueta: "Crédito", tipo: "credito", frase: null },
] as const satisfies readonly { valor: string; etiqueta: string; tipo: TipoProspecto; frase: string | null }[];

export type MotivoDeContacto = (typeof MOTIVOS_DE_CONTACTO)[number];

/** El motivo que llegó del formulario, o null si no vino o no es de la lista. */
export function motivoDeContacto(valor: unknown): MotivoDeContacto | null {
  return MOTIVOS_DE_CONTACTO.find((m) => m.valor === valor) ?? null;
}

/** «Quiere vender. Tengo una casa en…», o el mensaje tal cual si no hay frase. */
export function mensajeConMotivo(motivo: MotivoDeContacto | null, mensaje: string): string {
  const texto = mensaje.trim();
  if (!motivo?.frase) return texto;
  return texto ? `${motivo.frase} ${texto}` : motivo.frase;
}

/** El primer nombre, para dar las gracias: «María José López» → «María». */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0]?.slice(0, 30) ?? "";
}
