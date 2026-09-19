/**
 * Fotos de las entregas desde el panel (F5). Lo demás (crear, publicar,
 * ocultar, borrar) va por la acción de la pantalla `/panel/entregas`, como el
 * resto del contenido; aquí solo lo que el navegador hace con `fetch` al subir.
 */

import { Hono } from "hono";
import { borrarDeCloudinary } from "../../cloudinary";
import { borrarFotoDeEntrega, firmaParaElEquipo, registrarFotoDelEquipo } from "../../db/panel/entregas";
import type { EntornoHono } from "../tipos";
import { actorDe, cuerpo, idDeRuta, noEncontrado, responder } from "./comun";

export const apiEntregas = new Hono<EntornoHono>();

apiEntregas.post("/:id/firma", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa entrega no existe.");
  const { db, config } = c.var.servicios;
  const r = await firmaParaElEquipo(db, config.cloudinary, actorDe(c), id);
  return responder(c, r, (firma) => ({ ok: true, ...firma }));
});

apiEntregas.post("/:id/fotos", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa entrega no existe.");
  const { db, config } = c.var.servicios;
  const datos = await cuerpo(c);
  const r = await registrarFotoDelEquipo(db, config.cloudinary, actorDe(c), id, {
    publicId: datos.public_id,
    version: datos.version,
    signature: datos.signature,
    ancho: datos.width,
    alto: datos.height,
  });
  return responder(c, r, (foto) => ({ ok: true, id: foto.id }));
});

apiEntregas.delete("/fotos/:id", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa foto no existe.");
  const { db, config } = c.var.servicios;
  const r = await borrarFotoDeEntrega(db, actorDe(c), id);
  if (!r.ok) return responder(c, r);
  // Primero la base, después la nube (como las fotos de las casas).
  c.executionCtx.waitUntil(borrarDeCloudinary(config.cloudinary, r.valor.publicId));
  return c.json({ ok: true });
});
