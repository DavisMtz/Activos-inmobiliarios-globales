/**
 * API del panel (PLAN §12). Todo lo de aquí exige sesión, cabecera `Origin`
 * correcta (eso lo aplica `server/app.ts` a todo lo que modifica) y el permiso
 * que toque.
 *
 * El orden importa: entrar y salir se montan ANTES de la guardia, porque son
 * justo las dos cosas que se hacen sin sesión válida.
 */

import { Hono } from "hono";
import { puede } from "../../../shared/permisos";
import { asesorMencionado, datosDeTextoFacebook, normalizarDescripcion, resumenDe } from "../../../shared/texto";
import { permitidoConClaveTemporal, sesionDePeticion } from "../../auth/guardia";
import type { EntornoHono } from "../tipos";
import { apiBitacora } from "./bitacora";
import { actorDe, cuerpo, noPermitido } from "./comun";
import { apiConfiguracion } from "./configuracion";
import { rutasDeContenido } from "./contenido";
import { apiCuenta } from "./cuenta";
import { apiFotos } from "./fotos";
import { apiPropiedades } from "./propiedades";
import { apiSesion } from "./sesion";
import { apiRedirecciones, apiSistema } from "./sistema";
import { apiUsuarios } from "./usuarios";

export const apiPanel = new Hono<EntornoHono>();

// ─── Sin sesión todavía ────────────────────────────────────────────
apiPanel.route("/", apiSesion);

// ─── Guardia: de aquí para abajo, sesión obligatoria ───────────────
apiPanel.use("*", async (c, next) => {
  const encontrada = await sesionDePeticion(c.var.servicios, c.req.raw);
  if (!encontrada) {
    return c.json({ error: "sin_sesion", mensaje: "Tu sesión terminó. Vuelve a entrar." }, 401);
  }
  if (encontrada.sesion.soloCambioClave && !permitidoConClaveTemporal(c.req.method, c.req.path)) {
    return c.json(
      { error: "debe_cambiar_clave", mensaje: "Primero cambia tu contraseña temporal." },
      403,
    );
  }
  c.set("sesion", encontrada.sesion);
  c.set("token", encontrada.token);
  await next();
});

apiPanel.route("/mi-cuenta", apiCuenta);
apiPanel.route("/propiedades", apiPropiedades);
apiPanel.route("/fotos", apiFotos);
apiPanel.route("/servicios", rutasDeContenido("servicio"));
apiPanel.route("/testimonios", rutasDeContenido("testimonio"));
apiPanel.route("/preguntas", rutasDeContenido("pregunta"));
apiPanel.route("/configuracion", apiConfiguracion);
apiPanel.route("/usuarios", apiUsuarios);
apiPanel.route("/bitacora", apiBitacora);
apiPanel.route("/sistema", apiSistema);
apiPanel.route("/redirecciones", apiRedirecciones);

/**
 * «Pegar texto de Facebook» (PLAN §11.3). La misma función que corre en el
 * navegador, también aquí: así el botón sirve igual sin JavaScript, y lo que
 * se guarda es lo que la persona vio.
 */
apiPanel.post("/texto-facebook", async (c) => {
  if (!puede(actorDe(c), "propiedades.crear")) return noPermitido(c);
  const datos = await cuerpo(c);
  const texto = typeof datos.texto === "string" ? datos.texto.slice(0, 20_000) : "";
  const descripcion = normalizarDescripcion(texto);
  return c.json({
    datos: datosDeTextoFacebook(texto),
    descripcion,
    resumen: resumenDe(descripcion),
    asesor: asesorMencionado(texto),
  });
});

apiPanel.all("*", (c) => c.json({ error: "no_encontrado", mensaje: "No existe esa operación." }, 404));
