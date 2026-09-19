import type { Config } from "./config";

/** Datos de la petición que necesitan el freno de intentos y la bitácora. */
export function contextoDePeticion(request: Request): { ip: string; agente: string | null } {
  return {
    // Cloudflare pone esta cabecera en el borde y pisa la que mande el cliente.
    // En local no existe: todo cae en «sin-ip», y los scripts de verificación
    // mandan la suya para no bloquearse entre casos.
    ip: request.headers.get("cf-connecting-ip") ?? "sin-ip",
    agente: request.headers.get("user-agent"),
  };
}

const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

export const esRutaDelPanel = (ruta: string): boolean =>
  ruta === "/panel" || ruta.startsWith("/panel/") || ruta.startsWith("/panel.") || ruta.startsWith("/api/panel");

/**
 * Freno de CSRF (PLAN §8.3): además de `SameSite=Lax`, toda petición que
 * modifica algo del panel exige que `Origin` sea exactamente este sitio. Sin
 * `Origin` también se rechaza: los navegadores lo mandan siempre en un POST.
 */
export function origenAjeno(request: Request, url: URL): boolean {
  if (METODOS_SEGUROS.has(request.method) || !esRutaDelPanel(url.pathname)) return false;
  return request.headers.get("Origin") !== url.origin;
}

/**
 * Cabeceras que van en TODA respuesta del Worker. Las de los archivos
 * estáticos (JS, CSS, imágenes) salen de `public/_headers`.
 */
export function aplicarCabeceras(respuesta: Response, url: URL, config: Config): Response {
  // Algunas respuestas nacen con cabeceras inmutables (p. ej. Response.redirect).
  const r = new Response(respuesta.body, respuesta);
  const h = r.headers;
  const panel = esRutaDelPanel(url.pathname);

  if (config.modoDemo || panel) h.set("X-Robots-Tag", "noindex, nofollow");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // El enlace personal de una entrega lleva su llave en la ruta: que no quede
  // en ninguna caché, que no viaje en el `Referer` a Cloudinary (las fotos de
  // esa página se piden a otro dominio) y que ningún buscador la guarde.
  const enlaceDeEntrega = url.pathname.startsWith("/entrega/") || url.pathname.startsWith("/api/entregas/");
  if (enlaceDeEntrega) {
    h.set("Cache-Control", "no-store");
    h.set("Referrer-Policy", "no-referrer");
    h.set("X-Robots-Tag", "noindex, nofollow");
  }

  if (panel) {
    h.set("Cache-Control", "no-store");
    // Nadie tiene por qué meter el panel en un iframe (clickjacking).
    h.set("X-Frame-Options", "DENY");
    h.set("Content-Security-Policy", "frame-ancestors 'none'");
  }
  return r;
}
