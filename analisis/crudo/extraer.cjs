// Extrae de cada HTML descargado lo que sirve para el análisis funcional.
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "html");
const soloTexto = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
const unicos = (arr) => [...new Set(arr)];

const archivos = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir);
for (const f of archivos) {
  const h = fs.readFileSync(path.join(dir, f), "utf8");
  const out = [];
  out.push(`\n################ ${f}  (${(h.length / 1024).toFixed(0)} KB)`);
  const title = (h.match(/<title>([^<]*)<\/title>/i) || [])[1];
  const desc = (h.match(/<meta name="description" content="([^"]*)"/i) || [])[1];
  out.push(`title: ${title} | description: ${desc || "(sin description)"}`);

  const heads = [...h.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => `h${m[1]}: ${soloTexto(m[2])}`).filter((x) => x.length > 4);
  out.push(`encabezados (${heads.length}): ${unicos(heads).slice(0, 40).join(" || ")}`);

  const forms = [...h.matchAll(/<form[\s\S]*?<\/form>/gi)].map((m) => {
    const cls = (m[0].match(/<form[^>]*class="([^"]*)"/i) || [])[1] || "";
    const campos = [...m[0].matchAll(/<(input|textarea|select)[^>]*>/gi)]
      .map((c) => {
        const t = (c[0].match(/type="([^"]*)"/i) || [])[1] || c[1];
        const n = (c[0].match(/name="([^"]*)"/i) || [])[1] || "";
        const ph = (c[0].match(/placeholder="([^"]*)"/i) || [])[1] || "";
        return t === "hidden" ? null : `${t}:${n}${ph ? `("${ph}")` : ""}`;
      })
      .filter(Boolean);
    return `[${cls.slice(0, 60)}] ${campos.join(", ")}`;
  });
  out.push(`formularios (${forms.length}): ${forms.join("  ##  ")}`);

  const hrefs = [...h.matchAll(/href="([^"]+)"/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const especiales = unicos(hrefs.filter((u) => /^(tel:|mailto:)|wa\.me|whatsapp|facebook|instagram|tiktok|youtube|linkedin|twitter|x\.com|maps\.|goo\.gl|calendly/i.test(u)));
  out.push(`contacto/redes: ${especiales.join(" | ")}`);

  const iframes = unicos([...h.matchAll(/<iframe[^>]*src="([^"]+)"/gi)].map((m) => m[1].slice(0, 140)));
  out.push(`iframes: ${iframes.join(" | ") || "-"}`);

  const scripts = [...h.matchAll(/<script[^>]*src="([^"]+)"/gi)].map((m) => m[1]);
  const dominios = unicos(scripts.map((s) => { try { return new URL(s, "https://activosinmobiliariosglobales.com").host; } catch { return s; } }));
  out.push(`scripts externos: ${scripts.length} archivos · dominios: ${dominios.join(", ")}`);
  const css = [...h.matchAll(/<link[^>]*rel=['"]stylesheet['"][^>]*>/gi)].length;
  const inlineCss = [...h.matchAll(/<style[\s\S]*?<\/style>/gi)].reduce((a, m) => a + m[0].length, 0);
  out.push(`hojas CSS enlazadas: ${css} · CSS en línea: ${(inlineCss / 1024).toFixed(0)} KB`);

  const imgs = [...h.matchAll(/<img[^>]*>/gi)];
  const sinAlt = imgs.filter((m) => !/alt="[^"]+"/i.test(m[0])).length;
  const lazy = imgs.filter((m) => /loading="lazy"/i.test(m[0])).length;
  out.push(`imágenes: ${imgs.length} (sin alt: ${sinAlt}, lazy: ${lazy})`);

  const ids = unicos([...h.matchAll(/\b(G-[A-Z0-9]{6,}|GTM-[A-Z0-9]{4,}|UA-\d+-\d+|AW-\d+)\b/g)].map((m) => m[1]));
  const pixel = /fbq\(|connect\.facebook\.net/.test(h);
  out.push(`analítica: ${ids.join(", ") || "-"} · pixel FB: ${pixel}`);

  const jet = unicos([...h.matchAll(/jet-smart-filters[-_a-z]*|jet-listing-grid|jet-popup[-_a-z]*|jet-reviews|jet-map[-_a-z]*|jet-engine-map|google-map|leaflet|mapbox/gi)].map((m) => m[0].toLowerCase()));
  out.push(`widgets jet/mapas: ${jet.slice(0, 25).join(", ")}`);

  const texto = soloTexto(h);
  out.push(`texto visible (${texto.length} car.): ${texto.slice(0, Number(process.env.LARGO || 1800))}`);
  console.log(out.join("\n"));
}
