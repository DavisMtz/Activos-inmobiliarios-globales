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
