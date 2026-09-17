/**
 * Las casas desde el panel (PLAN §12). Quien decide es el servidor: cada
 * endpoint llama a `puede()` o se apoya en la capa de datos, que lo comprueba
 * dentro del mismo `UPDATE … WHERE`.
 */

import { Hono } from "hono";
import { puede } from "../../../shared/permisos";
import { ESTADOS_PROPIEDAD, revisarPropiedad, type EstadoPropiedad } from "../../../shared/propiedad";
import {
  asesoresAsignables,
  cambiarEstado,
  crearPropiedad,
  editarPropiedad,
  leerDelPanel,
  leerFiltrosPanel,
  listarPanel,
  moverAPapelera,
  zonasConocidas,
} from "../../db/panel/propiedades";
import { acomodarFotos, registrarFoto } from "../../db/panel/fotos";
import type { EntornoHono } from "../tipos";
import { actorDe, cuerpo, datosInvalidos, idDeRuta, noEncontrado, noPermitido, responder } from "./comun";

export const apiPropiedades = new Hono<EntornoHono>();

apiPropiedades.get("/", async (c) => {
  const { db, config } = c.var.servicios;
  if (!puede(actorDe(c), "propiedades.ver")) return noPermitido(c);
  const filtros = leerFiltrosPanel(new URL(c.req.url).searchParams);
  const pagina = await listarPanel(db, filtros, config.cloudinary.cloudName);
  return c.json(pagina);
});

/** Lo que el formulario necesita para sus desplegables. */
apiPropiedades.get("/apoyo", async (c) => {
  const { db } = c.var.servicios;
  const [asesores, zonas] = await Promise.all([asesoresAsignables(db), zonasConocidas(db)]);
  return c.json({ asesores, zonas });
});

apiPropiedades.post("/", async (c) => {
  const revision = revisarPropiedad(await cuerpo(c));
  if (!revision.ok) return datosInvalidos(c, revision.mensaje, revision.campo);
  const r = await crearPropiedad(c.var.servicios.db, actorDe(c), revision.valor);
  return responder(c, r, (creada) => ({ ok: true, ...creada }));
});

apiPropiedades.get("/:id", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa casa no existe.");
  const { db, config } = c.var.servicios;
  const casa = await leerDelPanel(db, id, config.cloudinary.cloudName);
  return casa ? c.json(casa) : noEncontrado(c, "Esa casa no existe.");
});

apiPropiedades.patch("/:id", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa casa no existe.");
  const revision = revisarPropiedad(await cuerpo(c));
  if (!revision.ok) return datosInvalidos(c, revision.mensaje, revision.campo);
  const r = await editarPropiedad(c.var.servicios.db, actorDe(c), id, revision.valor);
  return responder(c, r, (editada) => ({ ok: true, ...editada }));
});

apiPropiedades.post("/:id/estado", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa casa no existe.");
  const datos = await cuerpo(c);
  const estado = ESTADOS_PROPIEDAD.find((e) => e === datos.estado);
  if (!estado) return datosInvalidos(c, "Ese estado no existe.", "estado");
  const r = await cambiarEstado(c.var.servicios.db, actorDe(c), id, estado as EstadoPropiedad);
  return responder(c, r, ({ estado: nuevo }) => ({ ok: true, estado: nuevo }));
});

apiPropiedades.post("/:id/papelera", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa casa no existe.");
  return responder(c, await moverAPapelera(c.var.servicios.db, actorDe(c), id, { restaurar: false }));
});

apiPropiedades.post("/:id/restaurar", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa casa no existe.");
  return responder(c, await moverAPapelera(c.var.servicios.db, actorDe(c), id, { restaurar: true }));
});

// ─── Fotos de una casa (PLAN §13.2) ───────────────────────────────

/** Registra una foto que el navegador YA subió a Cloudinary. */
apiPropiedades.post("/:id/fotos", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa casa no existe.");
  const datos = await cuerpo(c);
  const r = await registrarFoto(c.var.servicios.db, c.var.servicios.config, actorDe(c), id, {
    publicId: datos.public_id ?? datos.publicId,
    version: datos.version,
    signature: datos.signature,
    ancho: datos.width ?? datos.ancho,
    alto: datos.height ?? datos.alto,
    alt: datos.alt,
  });
  return responder(c, r, (foto) => ({ ok: true, foto }));
});

/** Orden, portada y texto alternativo. */
apiPropiedades.patch("/:id/fotos", async (c) => {
  const id = idDeRuta(c);
  if (id === null) return noEncontrado(c, "Esa casa no existe.");
  const datos = await cuerpo(c);
  const fotos = Array.isArray(datos.fotos)
    ? (datos.fotos as Record<string, unknown>[])
        .filter((f) => f && typeof f === "object")
        .map((f) => ({
          id: Number(f.id),
          orden: f.orden === undefined ? undefined : Number(f.orden),
          alt: typeof f.alt === "string" ? f.alt : undefined,
        }))
    : [];
  const portadaId = datos.portada_id === undefined ? undefined : Number(datos.portada_id);
  return responder(c, await acomodarFotos(c.var.servicios.db, actorDe(c), id, { fotos, portadaId }));
});
