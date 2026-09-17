/**
 * Configuración editable (PLAN §12): contacto, WhatsApp, redes, portada,
 * nosotros y aviso de privacidad. Nada de esto vive en el código.
 */

import { Hono } from "hono";
import { puede } from "../../../shared/permisos";
import { leerConfiguracion } from "../../db/configuracion";
import {
  CLAVES_EDITABLES,
  PERMISO_DE_CLAVE,
  TITULO_DE_CLAVE,
  esClaveEditable,
  guardarConfiguracion,
} from "../../db/panel/configuracion";
import type { EntornoHono } from "../tipos";
import { actorDe, cuerpo, noEncontrado, responder } from "./comun";

export const apiConfiguracion = new Hono<EntornoHono>();

apiConfiguracion.get("/", async (c) => {
  const actor = actorDe(c);
  const configuracion = await leerConfiguracion(c.var.servicios.db);
  return c.json({
    configuracion,
    // Qué puede tocar esta persona: la pantalla esconde lo demás, pero quien
    // decide es el servidor (PLAN §9).
    secciones: CLAVES_EDITABLES.map((clave) => ({
      clave,
      titulo: TITULO_DE_CLAVE[clave],
      puedeEditar: puede(actor, PERMISO_DE_CLAVE[clave]),
    })),
  });
});

apiConfiguracion.patch("/:clave", async (c) => {
  const clave = c.req.param("clave");
  if (!esClaveEditable(clave)) return noEncontrado(c, "Esa parte de la configuración no existe.");
  const r = await guardarConfiguracion(c.var.servicios.db, actorDe(c), clave, await cuerpo(c));
  return responder(c, r, ({ campos }) => ({ ok: true, campos }));
});
