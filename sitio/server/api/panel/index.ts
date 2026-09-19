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
import { leerFiltrosProspectos, nombreDelCSV, prospectosEnCSV } from "../../db/panel/prospectos";
import type { EntornoHono } from "../tipos";
import { apiBitacora } from "./bitacora";
import { actorDe, cuerpo, noPermitido, responderFallo } from "./comun";
import { apiConfiguracion } from "./configuracion";
import { rutasDeContenido } from "./contenido";
import { apiCuenta } from "./cuenta";
import { apiEntregas } from "./entregas";
import { apiFotos } from "./fotos";
import { apiMetricas } from "./metricas";
import { apiPropiedades } from "./propiedades";
import { apiProspectos } from "./prospectos";
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

/**
 * El CSV va ANTES del prefijo `/prospectos` y con su propia ruta: es un archivo
 * que se descarga, no JSON, y `prospectos.csv` no es un hijo de `prospectos`.
 *
 * Se manda con `Content-Disposition` para que el navegador lo guarde en vez de
 * enseñarlo, y el nombre va en ASCII: un nombre con acentos necesita la forma
 * `filename*=UTF-8''…`, que no todos los navegadores leen igual.
 */
apiPanel.get("/prospectos.csv", async (c) => {
  const filtros = leerFiltrosProspectos(new URL(c.req.url).searchParams);
  const r = await prospectosEnCSV(c.var.servicios.db, actorDe(c), filtros);
  if (!r.ok) return responderFallo(c, r);
  return new Response(r.valor, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreDelCSV()}"`,
    },
  });
});

apiPanel.route("/mi-cuenta", apiCuenta);
apiPanel.route("/propiedades", apiPropiedades);
apiPanel.route("/prospectos", apiProspectos);
apiPanel.route("/metricas", apiMetricas);
apiPanel.route("/fotos", apiFotos);
apiPanel.route("/servicios", rutasDeContenido("servicio"));
apiPanel.route("/entregas", apiEntregas);
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
