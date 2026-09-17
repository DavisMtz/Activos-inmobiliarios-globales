/**
 * Firma de subida y borrado de fotos (PLAN §12 y §13.2).
 *
 * El archivo no pasa por aquí: el navegador pide la firma, sube directo a
 * Cloudinary y después registra el resultado en `/propiedades/:id/fotos`.
 */

import { Hono } from "hono";
import { borrarDeCloudinary, borrarFoto, datosParaSubir, propiedadDeFoto } from "../../db/panel/fotos";
import type { EntornoHono } from "../tipos";
import { actorDe, cuerpo, datosInvalidos, idDeRuta, noEncontrado, responder } from "./comun";

export const apiFotos = new Hono<EntornoHono>();

apiFotos.post("/firma", async (c) => {
  const datos = await cuerpo(c);
  const propiedadId = Number(datos.propiedad_id ?? datos.propiedadId);
  if (!Number.isInteger(propiedadId) || propiedadId <= 0) {
    return datosInvalidos(c, "Falta la casa a la que va la foto.", "propiedad_id");
  }
  const { db, config } = c.var.servicios;
  const r = await datosParaSubir(db, config, actorDe(c), propiedadId);
  return responder(c, r, (firma) => ({ ok: true, ...firma }));
});

apiFotos.delete("/:id", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa foto no existe.");
  const { db, config } = c.var.servicios;

  const propiedadId = await propiedadDeFoto(db, id);
  if (propiedadId === null) return noEncontrado(c, "Esa foto no existe.");

  const r = await borrarFoto(db, actorDe(c), propiedadId, id);
  if (!r.ok) return responder(c, r);

  // Primero la base, después la nube y sin hacer esperar a nadie: si esto
  // falla queda una huérfana (que `fotos:migrar --verificar` encuentra), no un
  // hueco en el sitio.
  if (r.valor.publicId) {
    c.executionCtx.waitUntil(borrarDeCloudinary(config.cloudinary, r.valor.publicId));
  }
  return c.json({ ok: true });
});
