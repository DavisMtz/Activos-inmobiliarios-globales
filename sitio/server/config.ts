/**
 * Única puerta a `env` (PLAN §6.1). Valida, aplica valores por defecto y
 * reparte. Ningún otro archivo lee variables ni secretos directamente: así
 * mudarse de workers.dev al dominio real, o de una cuenta de Cloudinary a
 * otra, es cambiar configuración y no código.
 */

export type Config = {
  /** Sin barra final. Alimenta canonical, og:url, sitemap y WhatsApp. */
  sitioUrl: string;
  /** Encendido salvo "0" explícito (ver `leerConfig`). */
  modoDemo: boolean;
  nombreNegocio: string;
  /** Vacío = no se carga la etiqueta de Google Analytics. */
  ga4Id: string;
  cloudinary: {
    cloudName: string;
    carpeta: string;
    apiKey: string;
    apiSecret: string;
    /** Las tres credenciales presentes: se puede firmar una subida. */
    configurado: boolean;
  };
  correo: { proveedor: "nulo" | "brevo"; avisosA: string; brevoApiKey: string };
  turnstile: { siteKey: string; secret: string };
};

export type Servicios = {
  config: Config;
  db: D1Database;
  limites: { acceso: RateLimit; formularios: RateLimit };
};

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function leerConfig(env: Env): Config {
  // Los secretos que todavía no existen (Brevo, Turnstile) no aparecen en el
  // tipo generado por `wrangler types`; se leen igual, sin tipo.
  const suelto = env as unknown as Record<string, unknown>;

  const sitioUrl = texto(env.SITIO_URL).replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(sitioUrl)) {
    throw new Error(`SITIO_URL debe ser un origen absoluto sin ruta; llegó «${sitioUrl}»`);
  }

  const cloudName = texto(env.CLOUDINARY_CLOUD_NAME);
  const apiKey = texto(suelto.CLOUDINARY_API_KEY);
  const apiSecret = texto(suelto.CLOUDINARY_API_SECRET);

  return {
    sitioUrl,
    // Solo un "0" escrito a propósito apaga la demo. Equivocarse hacia «no
    // indexar» es barato; equivocarse hacia «indexar la propuesta» la pone a
    // competir en Google con el sitio vivo.
    modoDemo: texto(env.MODO_DEMO) !== "0",
    nombreNegocio: texto(env.NOMBRE_NEGOCIO) || "Activos Inmobiliarios Globales",
    ga4Id: texto(env.GA4_ID),
    cloudinary: {
      cloudName,
      carpeta: texto(env.CLOUDINARY_CARPETA) || "aig",
      apiKey,
      apiSecret,
      configurado: Boolean(cloudName && apiKey && apiSecret),
    },
    correo: {
      proveedor: texto(env.CORREO_PROVEEDOR) === "brevo" ? "brevo" : "nulo",
      avisosA: texto(env.CORREO_AVISOS_A),
      brevoApiKey: texto(suelto.BREVO_API_KEY),
    },
    turnstile: {
      siteKey: texto(env.TURNSTILE_SITE_KEY),
      secret: texto(suelto.TURNSTILE_SECRET),
    },
  };
}

export function crearServicios(env: Env): Servicios {
  return {
    config: leerConfig(env),
    db: env.DB,
    limites: { acceso: env.LIMITE_ACCESO, formularios: env.LIMITE_FORMULARIOS },
  };
}
