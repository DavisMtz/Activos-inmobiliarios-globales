#!/usr/bin/env node
/**
 * Descarga UNA vez el HTML de las 188 fichas del sitio actual (PLAN §14.1) a
 * `analisis/crudo/fichas/<slug>.html`. La galería en orden solo vive ahí: la API
 * de WordPress no la da y unir por el `post` de los medios pierde fotos.
 *
 *   node scripts/descargar-fichas.mjs
 *
 * Una por una y con pausa (es el sitio vivo del negocio). Reanudable: lo que ya
 * está descargado no se vuelve a pedir.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CRUDO = fileURLToPath(new URL("../../analisis/crudo/", import.meta.url));
const DESTINO = join(CRUDO, "fichas");
const PAUSA_MS = 700;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 Safari/537.36";

const propiedades = [
  ...JSON.parse(readFileSync(join(CRUDO, "api_properties.json"), "utf8")),
  ...JSON.parse(readFileSync(join(CRUDO, "api_properties_p2.json"), "utf8")),
];
mkdirSync(DESTINO, { recursive: true });

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
let bajadas = 0;
let saltadas = 0;
const fallidas = [];

for (const [i, p] of propiedades.entries()) {
  const archivo = join(DESTINO, `${p.slug}.html`);
  if (existsSync(archivo)) {
    saltadas++;
    continue;
  }
  let intento = 0;
  while (true) {
    intento++;
    try {
      const r = await fetch(p.link, { headers: { "User-Agent": UA } });
      const html = await r.text();
      // Una ficha válida pesa ~380 KB. Hay fichas SIN galería (solo foto de portada): se guardan igual.
      if (r.status !== 200 || html.length < 50_000 || !html.includes("Especificaciones")) {
        throw new Error(`estado ${r.status}, ${html.length} bytes`);
      }
      writeFileSync(archivo, html, "utf8");
      bajadas++;
      break;
    } catch (error) {
      if (intento >= 3) {
        fallidas.push(`${p.slug}: ${error.message}`);
        break;
      }
      await esperar(3_000 * intento);
    }
  }
  if ((i + 1) % 20 === 0) console.log(`${i + 1}/${propiedades.length}`);
  await esperar(PAUSA_MS);
}

console.log(`\nListo. Descargadas: ${bajadas} · ya estaban: ${saltadas} · fallidas: ${fallidas.length} · total: ${propiedades.length}`);
if (fallidas.length) {
  console.log(fallidas.join("\n"));
  process.exit(1);
}
