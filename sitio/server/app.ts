import { Hono } from "hono";
import { RouterContextProvider } from "react-router";
import { contextoServidor } from "../app/contexto";
import { apiPanel } from "./api/panel";
import type { EntornoHono } from "./api/tipos";
import { crearServicios } from "./config";
import { aplicarCabeceras, contextoDePeticion, origenAjeno } from "./http";
import { robotsTxt } from "./seo";

type ManejadorReact = (request: Request, contexto: RouterContextProvider) => Promise<Response>;

/**
 * La pieza única (PLAN §4.1): Hono recibe todo; atiende `/api/*`,
 * `robots.txt`, `sitemap.xml` (y en F2 las redirecciones) y le pasa lo demás
 * a React Router. El manejador de React llega por parámetro para que este
 * archivo no dependa del módulo virtual del build y se pueda probar suelto.
 */
export function crearApp(manejarReact: ManejadorReact) {
  const app = new Hono<EntornoHono>();

  app.use("*", async (c, next) => {
    const servicios = crearServicios(c.env);
    c.set("servicios", servicios);
    const url = new URL(c.req.url);

    if (origenAjeno(c.req.raw, url)) {
      c.res = c.json({ error: "origen_no_permitido", mensaje: "Petición rechazada." }, 403);
    } else {
      await next();
    }
    c.res = aplicarCabeceras(c.res, url, servicios.config);
  });

  app.get("/robots.txt", (c) => c.text(robotsTxt(c.var.servicios.config)));

  // Con MODO_DEMO=1 responde 404 (PLAN §10.3). El sitemap de producción
  // (publicadas, listados y páginas) llega con F2.
  app.get("/sitemap.xml", (c) => c.text("No encontrado", 404));

  app.route("/api/panel", apiPanel);
  app.all("/api/*", (c) => c.json({ error: "no_encontrado", mensaje: "No existe esa operación." }, 404));

  app.all("*", (c) => {
    const contexto = new RouterContextProvider();
    contexto.set(contextoServidor, {
      servicios: c.var.servicios,
      peticion: contextoDePeticion(c.req.raw),
      esperar: (promesa) => c.executionCtx.waitUntil(promesa),
    });
    return manejarReact(c.req.raw, contexto);
  });

  app.onError((error, c) => {
    console.error(error);
    const url = new URL(c.req.url);
    if (url.pathname.startsWith("/api/")) {
      return c.json({ error: "error_interno", mensaje: "Algo falló. Intenta de nuevo en un momento." }, 500);
    }
    return c.text("Algo falló. Intenta de nuevo en un momento.", 500);
  });

  return app;
}
