import type { Config } from "./config";

/**
 * robots.txt según el modo (PLAN §10.3). En la propuesta no se indexa nada:
 * si Google la encontrara, competiría con el sitio vivo del negocio.
 * El panel nunca se indexa, tampoco en producción.
 */
export function robotsTxt(config: Config): string {
  if (config.modoDemo) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nDisallow: /panel\nDisallow: /api/\n\nSitemap: ${config.sitioUrl}/sitemap.xml\n`;
}

/** Las páginas fijas que sí se indexan. El aviso de privacidad va `noindex`. */
const PAGINAS = ["/", "/propiedades", "/servicios", "/nosotros", "/contacto"];

const escapar = (texto: string): string =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Sitemap de las páginas y de las casas publicadas (PLAN §10.3). Las vendidas
 * y las rentadas NO entran: siguen accesibles por su URL, pero no se ofrecen.
 */
export function sitemapXml(
  config: Config,
  propiedades: { slug: string; actualizada_en: string }[],
): string {
  const entrada = (ruta: string, fecha?: string) =>
    `  <url><loc>${escapar(config.sitioUrl + ruta)}</loc>${
      fecha ? `<lastmod>${escapar(fecha.slice(0, 10))}</lastmod>` : ""
    }</url>`;

  const urls = [
    ...PAGINAS.map((ruta) => entrada(ruta)),
    ...propiedades.map((p) => entrada(`/propiedades/${encodeURIComponent(p.slug)}`, p.actualizada_en)),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
