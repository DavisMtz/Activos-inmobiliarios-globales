/**
 * Sistema y redirecciones (PLAN §12), solo para el maestro.
 */

import { Hono } from "hono";
import { puede } from "../../../shared/permisos";
import {
  borrarRedireccion,
  estadoDelSistema,
  guardarRedireccion,
  listarRedirecciones,
} from "../../db/panel/sistema";
import type { EntornoHono } from "../tipos";
import { actorDe, cuerpo, datosInvalidos, noPermitido, responder } from "./comun";

export const apiSistema = new Hono<EntornoHono>();

apiSistema.get("/", async (c) => {
  if (!puede(actorDe(c), "sistema.gestionar")) return noPermitido(c);
  const { db, config } = c.var.servicios;
  return c.json(await estadoDelSistema(db, config));
});

export const apiRedirecciones = new Hono<EntornoHono>();

apiRedirecciones.get("/", async (c) => {
  if (!puede(actorDe(c), "sistema.gestionar")) return noPermitido(c);
  return c.json({ items: await listarRedirecciones(c.var.servicios.db) });
});

apiRedirecciones.put("/", async (c) => {
  const r = await guardarRedireccion(c.var.servicios.db, actorDe(c), await cuerpo(c));
  return responder(c, r, (redireccion) => ({ ok: true, redireccion }));
});

apiRedirecciones.delete("/", async (c) => {
  // El origen es una ruta con barras, así que viaja en la consulta y no en el
  // camino: `/api/panel/redirecciones?origen=/properties/casa-x`.
  const origen = new URL(c.req.url).searchParams.get("origen") ?? "";
  if (!origen.startsWith("/")) return datosInvalidos(c, "Falta la ruta de origen.", "origen");
  return responder(c, await borrarRedireccion(c.var.servicios.db, actorDe(c), origen));
});
