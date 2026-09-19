/**
 * Redirecciones de las URLs viejas (PLAN §10.3). Se resuelven en el Worker
 * ANTES de React, así que no cuesta una pantalla en blanco ni un rebote.
 *
 * Por qué importan: el sitio actual tiene indexadas rutas en inglés
 * (`/properties/…`), dos listados duplicados y **nueve páginas de la plantilla
 * «Findero»** que nunca se borraron y que hoy están públicas: `/home`,
 * `/faq` («How do I create an account at Findero.me?»), `/contact-us` (con una
 * dirección de San Francisco), `/inicio-sesion` (que regala «User: demo
 * Password: demo»), `/registration`, `/agents`, `/single-agent`,
 * `/map-listing` y `/account`. Ninguna sobrevive a la mudanza.
 *
 * Este archivo es una función pura: no toca la base ni el entorno, así que se
 * prueba con Vitest (PLAN §16). Las redirecciones guardadas en la tabla
 * `redirecciones` (las que dejó la siembra) las resuelve el Worker aparte.
 */

/** Tipos del sitio viejo → los de `propiedades.tipo`. */
const TIPOS_VIEJOS: Record<string, string> = {
  casa: "casa",
  casas: "casa",
  departamento: "departamento",
  departamentos: "departamento",
  terreno: "terreno",
  terrenos: "terreno",
  bodega: "bodega",
  bodegas: "bodega",
  edificio: "edificio",
  edificios: "edificio",
  oficina: "oficina",
  oficinas: "oficina",
  local: "local",
  locales: "local",
  // «Inmueble» y «villa» no tienen equivalente: se mandan al listado completo.
  inmueble: "",
  villa: "",
};

/** Las nueve páginas de la plantilla, más las rutas viejas que ya no existen. */
const A_LA_PORTADA = new Set([
  "/home",
  "/faq",
  "/agents",
  "/single-agent",
  "/inicio-sesion",
  "/registration",
  "/account",
  "/map-listing",
]);

const DIRECTAS: Record<string, string> = {
  "/properties": "/propiedades",
  "/acerca": "/nosotros",
  "/contact-us": "/contacto",
  "/aviso-de-privacidad-2": "/aviso-de-privacidad",
};

/**
 * Minúsculas y sin barra final. La raíz se queda como `/`.
 * Se decodifica para que `/properties/terreno-de-2942m%C2%B2` y su forma ya
 * decodificada lleguen al mismo sitio (la siembra encontró justo ese caso).
 */
export function normalizarRuta(ruta: string): string {
  let limpia = ruta;
  try {
    limpia = decodeURIComponent(ruta);
  } catch {
    // Un porcentaje suelto («%zz») no se puede decodificar: se usa tal cual.
  }
  limpia = limpia.toLowerCase().replace(/\/{2,}/g, "/");
  return limpia.length > 1 ? limpia.replace(/\/+$/, "") : "/";
}

/**
 * Devuelve a dónde mandar esa ruta vieja, o null si no hay regla. El que
 * llama compara con la ruta pedida: si el destino es el mismo, no redirige
 * (si no, `/propiedades` se redirigiría a sí misma para siempre).
 */
export function destinoDeRutaVieja(rutaNormalizada: string): string | null {
  if (A_LA_PORTADA.has(rutaNormalizada)) return "/";
  if (DIRECTAS[rutaNormalizada]) return DIRECTAS[rutaNormalizada];

  const partes = rutaNormalizada.split("/").filter(Boolean);
  if (partes.length < 2) return null;
  const [seccion, ...resto] = partes;
  const valor = resto.join("/");

  switch (seccion) {
    // El slug se conserva: `/properties/casa-en-el-prado-4` mantiene el suyo.
    case "properties":
      return `/propiedades/${valor}`;

    case "purpose":
      if (valor === "venta" || valor === "renta") return `/propiedades?operacion=${valor}`;
      // «venta-renta» y cualquier otra: al listado completo.
      return "/propiedades";

    case "property-type": {
      const tipo = TIPOS_VIEJOS[valor];
      return tipo ? `/propiedades?tipo=${tipo}` : "/propiedades";
    }

    // La taxonomía vieja de ubicación es por CIUDAD, no por colonia.
    case "location":
      return valor ? `/propiedades?ciudad=${valor}` : "/propiedades";

    // «Casa nueva», «Casa semi nueva»…: son condiciones, no un filtro de F2.
    case "type-of-housing":
      return "/propiedades";

    default:
      return null;
  }
}

/** Rutas que el Worker no debe tocar: las suyas y las de los archivos. */
export function esRutaDeSistema(ruta: string): boolean {
  return (
    ruta.startsWith("/api") ||
    ruta.startsWith("/panel") ||
    // El enlace personal de una entrega: su llave va en la ruta y no se toca.
    ruta.startsWith("/entrega/") ||
    ruta.startsWith("/assets/") ||
    ruta.startsWith("/marca/") ||
    ruta.startsWith("/.well-known/") ||
    ruta === "/robots.txt" ||
    ruta === "/sitemap.xml" ||
    ruta === "/favicon.ico" ||
    // Cualquier archivo con extensión (.png, .css, .js…).
    /\.[a-z0-9]{2,5}$/i.test(ruta)
  );
}
