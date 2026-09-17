/**
 * Métricas (PLAN §12). Un solo endpoint de lectura: lo que devuelve depende del
 * alcance de `metricas.ver` (§9), que aplica la capa de datos.
 */

import { Hono } from "hono";
import { puede } from "../../../shared/permisos";
import { leerDiasDeMetricas, leerMetricas } from "../../db/panel/metricas";
import type { EntornoHono } from "../tipos";
import { actorDe, noPermitido } from "./comun";

export const apiMetricas = new Hono<EntornoHono>();

apiMetricas.get("/", async (c) => {
  const actor = actorDe(c);
  if (!puede(actor, "metricas.ver")) return noPermitido(c);
  const dias = leerDiasDeMetricas(new URL(c.req.url).searchParams);
  return c.json(await leerMetricas(c.var.servicios.db, actor, dias));
});
