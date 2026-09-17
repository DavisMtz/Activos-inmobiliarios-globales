/**
 * Bitácora (PLAN §12): quién cambió qué y cuándo. La ven el maestro y el
 * director; nunca trae contraseñas (PLAN §11.4).
 */

import { Hono } from "hono";
import { puede } from "../../../shared/permisos";
import { leerBitacora, leerFiltrosBitacora, personasConRastro } from "../../db/panel/bitacora";
import type { EntornoHono } from "../tipos";
import { actorDe, noPermitido } from "./comun";

export const apiBitacora = new Hono<EntornoHono>();

apiBitacora.get("/", async (c) => {
  if (!puede(actorDe(c), "bitacora.ver")) return noPermitido(c);
  const filtros = leerFiltrosBitacora(new URL(c.req.url).searchParams);
  return c.json(await leerBitacora(c.var.servicios.db, filtros));
});

apiBitacora.get("/personas", async (c) => {
  if (!puede(actorDe(c), "bitacora.ver")) return noPermitido(c);
  return c.json({ items: await personasConRastro(c.var.servicios.db) });
});
