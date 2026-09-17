#!/usr/bin/env node
/**
 * Compara fichas del sitio ACTUAL (se piden en vivo, no se usa lo descargado)
 * contra la D1: precio, recámaras, baños, m² y orden exacto de las fotos
 * (PLAN §15, «listo cuando» de F1).
 *
 *   node scripts/comparar-con-sitio-actual.mjs --remote casa-en-el-prado-4 casa-en-la-chapultepec-oriente
 *
 * La extracción está escrita aparte a propósito: no reutiliza el código de la
 * siembra, así un error de la siembra no se «confirma» a sí mismo.
 */
import { parseArgs } from "node:util";
import { consultar, texto as sql } from "./lib/d1.mjs";

const { values, positionals: slugs } = parseArgs({
  allowPositionals: true,
  options: { local: { type: "boolean", default: false }, remote: { type: "boolean", default: false } },
});
if (values.local === values.remote || !slugs.length) {
  console.error("Uso: node scripts/comparar-con-sitio-actual.mjs --local|--remote <slug> [<slug>…]");
  process.exit(1);
}
const remoto = values.remote;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 Safari/537.36";

const nombreBase = (url) =>
  decodeURIComponent(url.split("?")[0].split("/").pop())
    .replace(/-\d+x\d+(?=\.\w+$)/, "")
    .replace(/-scaled(?=\.\w+$)/, "")
    .toLowerCase();
const plano = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");

let todoBien = true;
for (const slug of slugs) {
  const respuesta = await fetch(`https://activosinmobiliariosglobales.com/properties/${slug}/`, { headers: { "User-Agent": UA } });
  const html = await respuesta.text();
  const texto = plano(html);
  const spec = (nombre) => Number((texto.match(new RegExp(`${nombre}:\\s*([\\d.,]+)`)) || [])[1]?.replace(/,/g, "")) || null;
  const vivo = {
    precio: Number((texto.match(/\$\s?([\d,]+)(?:\.\d{2})?/) || [])[1]?.replace(/,/g, "")) || null,
    recamaras: spec("Habitaciones"),
    banos: spec("Baños completos"),
    terreno: spec("Tamaño de la propiedad"),
    construccion: spec("En construcción"),
  };
  const inicioGaleria = html.search(/>\s*Galer[ií]a:?\s*</);
  const bloque = inicioGaleria >= 0 ? html.slice(inicioGaleria, html.indexOf("Propiedades Similares", inicioGaleria)) : "";
  const galeria = [...bloque.matchAll(/<figure class=['"]gallery-item['"][\s\S]*?href=['"]([^'"]+)['"]/g)].map((m) => nombreBase(m[1]));
  const portadaViva = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];

  const slugNuevo = decodeURIComponent(slug).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [p] = consultar(
    `SELECT id, clave, titulo, operacion, precio, precio_renta, recamaras, banos_completos, m2_terreno, m2_construccion
       FROM propiedades WHERE wp_id IS NOT NULL AND slug IN (${sql(slug)}, ${sql(slugNuevo)});`,
    { remoto },
  );
  if (!p) {
    console.log(`\n✖ ${slug}: no está en la D1`);
    todoBien = false;
    continue;
  }
  const fotos = consultar(`SELECT url_origen, es_portada FROM fotos WHERE propiedad_id = ${p.id} ORDER BY orden;`, { remoto });
  const enD1 = fotos.map((f) => nombreBase(f.url_origen));
  // La siembra antepone la portada cuando no está en la galería (o cuando no hay galería).
  const antepuesta = enD1.length && !galeria.includes(enD1[0]) && portadaViva && enD1[0] === nombreBase(portadaViva);
  const galeriaEnD1 = antepuesta ? enD1.slice(1) : enD1;

  const filas = [
    ["precio", vivo.precio, p.operacion === "renta" ? p.precio_renta : p.precio],
    ["recámaras", vivo.recamaras, p.recamaras],
    ["baños completos", vivo.banos, p.banos_completos],
    ["m² de terreno", vivo.terreno, p.m2_terreno],
    ["m² de construcción", vivo.construccion, p.m2_construccion],
    ["fotos de galería", galeria.length, galeriaEnD1.length],
  ];
  console.log(`\n${p.clave} · ${p.titulo} (${slug}) — sitio actual HTTP ${respuesta.status}`);
  for (const [campo, a, b] of filas) {
    const ok = (a ?? null) === (b ?? null);
    todoBien &&= ok;
    console.log(`  ${ok ? "✔" : "✖"} ${campo.padEnd(20)} sitio actual: ${a ?? "—"} · D1: ${b ?? "—"}`);
  }
  const mismoOrden = JSON.stringify(galeria) === JSON.stringify(galeriaEnD1);
  todoBien &&= mismoOrden;
  console.log(`  ${mismoOrden ? "✔" : "✖"} orden de fotos idéntico${antepuesta ? " (más la portada, antepuesta)" : ""}`);
  const portadaOk = !portadaViva || fotos.some((f) => f.es_portada === 1 && nombreBase(f.url_origen) === nombreBase(portadaViva));
  todoBien &&= portadaOk;
  console.log(`  ${portadaOk ? "✔" : "✖"} la portada es la del sitio actual`);
  await new Promise((ok) => setTimeout(ok, 1_000));
}
console.log(todoBien ? "\nTodo coincide." : "\nHAY DIFERENCIAS.");
process.exit(todoBien ? 0 : 1);
