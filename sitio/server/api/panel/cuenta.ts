/**
 * «Mi cuenta» (PLAN §11.2): los datos de quien entró y su contraseña.
 *
 * El cambio de contraseña va en DOS peticiones (PLAN §17): primero
 * `/clave/verificar` confirma la actual y después `/clave` guarda la nueva.
 * No es por gusto: verificar y derivar son dos PBKDF2 de 100 000 iteraciones y
 * dos en la misma petición rebasan el CPU de un Worker.
 */

import { Hono } from "hono";
import { cambiarClave, confirmarClaveActual } from "../../auth/acceso";
import { editarDatos } from "../../db/panel/usuarios";
import { contextoDePeticion } from "../../http";
import type { EntornoHono } from "../tipos";
import { actorDe, cuerpo, responder, responderFallo } from "./comun";

export const apiCuenta = new Hono<EntornoHono>();

apiCuenta.get("/", (c) => {
  const { usuario, soloCambioClave } = c.var.sesion;
  return c.json({ usuario, debe_cambiar_clave: soloCambioClave });
});

apiCuenta.patch("/", async (c) => {
  const datos = await cuerpo(c);
  const actor = actorDe(c);
  const r = await editarDatos(c.var.servicios.db, actor, actor.id, datos);
  return responder(c, r, (usuario) => ({ ok: true, usuario }));
});

apiCuenta.post("/clave/verificar", async (c) => {
  const datos = await cuerpo(c);
  const r = await confirmarClaveActual(c.var.servicios, c.var.sesion, c.var.token, datos.actual);
  return responder(c, r, ({ minutos }) => ({ ok: true, minutos }));
});

apiCuenta.post("/clave", async (c) => {
  const datos = await cuerpo(c);
  const r = await cambiarClave(
    c.var.servicios,
    c.var.sesion,
    c.var.token,
    { nueva: datos.nueva, confirmacion: datos.confirmacion },
    contextoDePeticion(c.req.raw),
  );
  if (!r.ok) return responderFallo(c, r);
  c.header("Set-Cookie", r.valor.cookie);
  return c.json({ ok: true });
});
