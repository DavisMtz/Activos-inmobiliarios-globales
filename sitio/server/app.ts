import { Hono } from "hono";
import { RouterContextProvider } from "react-router";
import { contextoServidor } from "../app/contexto";
import { apiPanel } from "./api/panel/index";
import { apiPublica } from "./api/publica";
import type { EntornoHono } from "./api/tipos";
import { crearServicios } from "./config";
import { slugsPublicados } from "./db/propiedades";
import { aplicarCabeceras, contextoDePeticion, origenAjeno } from "./http";
import { destinoDeRutaVieja, esRutaDeSistema, normalizarRuta } from "./redirecciones";
import { robotsTxt, sitemapXml } from "./seo";

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

  app.get("/sitemap.xml", async (c) => {
    const { config, db } = c.var.servicios;
    // Con MODO_DEMO=1 no hay sitemap: la propuesta no se indexa (PLAN §10.3).
    if (config.modoDemo) return c.text("No encontrado", 404);
    const propiedades = await slugsPublicados(db);
    return c.body(sitemapXml(config, propiedades), 200, { "Content-Type": "application/xml; charset=utf-8" });
  });

  /**
   * Redirecciones de las URLs viejas, ANTES de React (PLAN §10.3): primero la
   * tabla `redirecciones` que dejó la siembra y luego las reglas. Se redirige
   * solo si el destino es distinto, para no dar vueltas sobre la misma ruta.
   */
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    if (c.req.method !== "GET" || esRutaDeSistema(url.pathname)) return next();

    const normalizada = normalizarRuta(url.pathname);
    const guardada = await c.var.servicios.db
      .prepare("SELECT destino, codigo FROM redirecciones WHERE origen = ?")
      .bind(normalizada)
      .first<{ destino: string; codigo: number }>();

    const destino = guardada?.destino ?? destinoDeRutaVieja(normalizada);
    if (destino && destino !== url.pathname + url.search) {
      // Lo que traía la URL vieja se conserva salvo que el destino ya traiga lo suyo.
      const final = destino.includes("?") ? destino : destino + url.search;
      return c.redirect(final, (guardada?.codigo as 301 | 302) ?? 301);
    }
    // `/propiedades/` → `/propiedades`: la barra final también es una URL distinta.
    if (normalizada !== url.pathname) return c.redirect(normalizada + url.search, 301);
    return next();
  });

  app.route("/api/panel", apiPanel);
  app.route("/api", apiPublica);
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
