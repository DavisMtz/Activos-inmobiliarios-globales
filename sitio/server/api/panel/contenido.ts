/**
 * Servicios, testimonios y preguntas (PLAN §12). Las tres listas se manejan
 * igual, así que hay una implementación y se monta tres veces, cada una en su
 * ruta: `/servicios`, `/testimonios`, `/preguntas`.
 */

import { Hono } from "hono";
import {
  borrarElemento,
  guardarElemento,
  leerElementos,
  ordenarElementos,
  type TipoDeContenido,
} from "../../db/panel/contenido";
import type { EntornoHono } from "../tipos";
import { actorDe, cuerpo, idDeRuta, noEncontrado, responder } from "./comun";

export function rutasDeContenido(tipo: TipoDeContenido) {
  const rutas = new Hono<EntornoHono>();

  // Leer es para cualquiera con sesión: son los textos del sitio, que además
  // ya son públicos. Cambiarlos sí exige permiso, y lo comprueba la capa de datos.
  rutas.get("/", async (c) => c.json({ items: await leerElementos(c.var.servicios.db, tipo) }));

  rutas.post("/", async (c) => {
    const r = await guardarElemento(c.var.servicios.db, actorDe(c), tipo, null, await cuerpo(c));
    return responder(c, r, ({ id }) => ({ ok: true, id }));
  });

  /** El orden que quedó al arrastrar la lista. */
  rutas.post("/orden", async (c) => {
    const datos = await cuerpo(c);
    const ids = Array.isArray(datos.ids) ? datos.ids.map(Number) : [];
    return responder(c, await ordenarElementos(c.var.servicios.db, actorDe(c), tipo, ids));
  });

  rutas.patch("/:id", async (c) => {
    const id = idDeRuta(c);
    if (id === null) return noEncontrado(c);
    const r = await guardarElemento(c.var.servicios.db, actorDe(c), tipo, id, await cuerpo(c));
    return responder(c, r, ({ id: guardado }) => ({ ok: true, id: guardado }));
  });

  rutas.delete("/:id", async (c) => {
    const id = idDeRuta(c);
    if (id === null) return noEncontrado(c);
    return responder(c, await borrarElemento(c.var.servicios.db, actorDe(c), tipo, id));
  });

  return rutas;
}
