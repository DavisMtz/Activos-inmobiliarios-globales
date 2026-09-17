/**
 * Lo que repiten todos los módulos de la API del panel: leer el cuerpo, saber
 * quién actúa y contestar igual en todas partes.
 *
 * Formato de error (PLAN §12): `{ error, mensaje }`. `error` es un código
 * estable para el programa y `mensaje` es para la persona, en español.
 */

import type { Context } from "hono";
import type { Actor } from "../../../shared/permisos";
import type { Fallo, Resultado } from "../../resultado";
import type { EntornoHono } from "../tipos";

export type Contexto = Context<EntornoHono>;

export const responderFallo = (c: Contexto, f: Fallo) => c.json({ error: f.error, mensaje: f.mensaje }, f.estado);

export const noPermitido = (c: Contexto) =>
  c.json({ error: "sin_permiso", mensaje: "No tienes permiso para hacer esto." }, 403);

export const noEncontrado = (c: Contexto, mensaje = "No existe eso.") =>
  c.json({ error: "no_encontrado", mensaje }, 404);

export const datosInvalidos = (c: Contexto, mensaje: string, campo?: string) =>
  c.json({ error: "datos_invalidos", campo, mensaje }, 400);

/** Quién actúa, en lo mínimo que necesita `puede()`. */
export const actorDe = (c: Contexto): Actor => ({ id: c.var.sesion.usuario.id, rol: c.var.sesion.usuario.rol });

/**
 * El cuerpo como bolsa de valores, venga en JSON o como formulario. Si no se
 * puede leer, una bolsa vacía: cada endpoint valida lo suyo y contesta qué
 * falta, en vez de reventar con un 500.
 */
export async function cuerpo(c: Contexto): Promise<Record<string, unknown>> {
  const tipo = c.req.header("content-type") ?? "";
  try {
    if (tipo.includes("form")) {
      const formulario = await c.req.formData();
      return Object.fromEntries([...formulario.entries()].map(([nombre, valor]) => [nombre, valor]));
    }
    const leido: unknown = await c.req.json();
    return leido && typeof leido === "object" && !Array.isArray(leido) ? (leido as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Un id numérico de la ruta; null si no es un entero (y entonces: 404). */
export function idDeRuta(c: Contexto, nombre = "id"): number | null {
  const crudo = c.req.param(nombre);
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Atajo para los endpoints que solo reenvían lo que devolvió la capa de datos. */
export function responder<T>(c: Contexto, r: Resultado<T>, conValor?: (valor: T) => object) {
  if (!r.ok) return responderFallo(c, r);
  return c.json(conValor ? conValor(r.valor) : { ok: true });
}
