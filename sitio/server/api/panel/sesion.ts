/**
 * Entrar y salir. Es lo único de `/api/panel/*` que se atiende SIN sesión, así
 * que se monta antes de la guardia (ver `index.ts`).
 */

import { Hono } from "hono";
import { cerrarSesion, iniciarSesion } from "../../auth/acceso";
import { cookieBorrada, tokenDeCookie } from "../../auth/sesion";
import { contextoDePeticion } from "../../http";
import type { EntornoHono } from "../tipos";
import { cuerpo, responderFallo } from "./comun";

export const apiSesion = new Hono<EntornoHono>();

apiSesion.post("/sesion", async (c) => {
  const datos = await cuerpo(c);
  const r = await iniciarSesion(
    c.var.servicios,
    { correo: datos.correo, clave: datos.clave },
    contextoDePeticion(c.req.raw),
  );
  if (!r.ok) return responderFallo(c, r);
  c.header("Set-Cookie", r.valor.cookie);
  return c.json({ ok: true, debe_cambiar_clave: r.valor.soloCambioClave });
});

apiSesion.delete("/sesion", async (c) => {
  await cerrarSesion(c.var.servicios, tokenDeCookie(c.req.raw));
  c.header("Set-Cookie", cookieBorrada());
  return c.json({ ok: true });
});
