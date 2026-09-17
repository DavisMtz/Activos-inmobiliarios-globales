/**
 * Prospectos (PLAN §12). Quién ve qué lo decide el alcance del permiso y se
 * aplica en la capa de datos: aquí solo se comprueba que tenga el permiso en
 * algún grado, y la consulta ya sale recortada a lo suyo.
 *
 * El CSV NO se monta aquí: vive en `/api/panel/prospectos.csv`, que no cuelga
 * de este prefijo (ver `index.ts`).
 */

import { Hono } from "hono";
import { puede } from "../../../shared/permisos";
import {
  agregarNota,
  asignarProspecto,
  cambiarEstadoProspecto,
  leerFiltrosProspectos,
  leerProspecto,
  listarProspectos,
} from "../../db/panel/prospectos";
import type { EntornoHono } from "../tipos";
import { actorDe, cuerpo, idDeRuta, noEncontrado, noPermitido, responder, responderFallo } from "./comun";

export const apiProspectos = new Hono<EntornoHono>();

apiProspectos.get("/", async (c) => {
  const actor = actorDe(c);
  if (!puede(actor, "prospectos.ver")) return noPermitido(c);
  const filtros = leerFiltrosProspectos(new URL(c.req.url).searchParams);
  return c.json(await listarProspectos(c.var.servicios.db, actor, filtros));
});

apiProspectos.get("/:id", async (c) => {
  const actor = actorDe(c);
  if (!puede(actor, "prospectos.ver")) return noPermitido(c);
  const id = idDeRuta(c);
  if (!id) return noEncontrado(c, "Ese prospecto no existe.");
  const r = await leerProspecto(c.var.servicios.db, actor, id);
  return r.ok ? c.json(r.valor) : responderFallo(c, r);
});

/**
 * Un solo endpoint para los dos cambios que admite un prospecto: su estado y
 * quién lo atiende. Son permisos distintos (§9: asignar es de maestro y
 * director), así que se resuelven por separado en la capa de datos.
 */
apiProspectos.patch("/:id", async (c) => {
  const id = idDeRuta(c);
  if (!id) return noEncontrado(c, "Ese prospecto no existe.");
  const actor = actorDe(c);
  const datos = await cuerpo(c);
  const db = c.var.servicios.db;

  if (datos.asesor_id !== undefined) {
    const r = await asignarProspecto(db, actor, id, datos.asesor_id);
    if (!r.ok) return responderFallo(c, r);
    if (datos.estado === undefined) return c.json({ ok: true, asesor_id: r.valor.asesorId });
  }
  if (datos.estado !== undefined) {
    return responder(c, await cambiarEstadoProspecto(db, actor, id, datos.estado), (v) => ({
      ok: true,
      estado: v.estado,
    }));
  }
  return c.json({ error: "datos_invalidos", mensaje: "No dijiste qué cambiar." }, 400);
});

apiProspectos.post("/:id/notas", async (c) => {
  const id = idDeRuta(c);
  if (!id) return noEncontrado(c, "Ese prospecto no existe.");
  const datos = await cuerpo(c);
  const r = await agregarNota(c.var.servicios.db, actorDe(c), id, datos.texto);
  return responder(c, r, ({ nota }) => ({ ok: true, nota }));
});
