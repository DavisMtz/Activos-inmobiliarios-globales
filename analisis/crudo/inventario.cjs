// Recorre las 188 fichas públicas (una por una, sin prisa) y arma el inventario
// estructurado que el sitio NO expone por la API: precio, recámaras, baños, m², galería.
// Uso: node inventario.cjs [--prueba]
const fs = require("fs");
const path = require("path");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 Safari/537.36";
const props = [...require("./api_properties.json"), ...require("./api_properties_p2.json")];
const terms = {};
for (const t of ["type-of-housing", "property-type", "location", "purpose"]) {
  for (const x of require(`./api_${t}.json`)) terms[x.id] = x.name;
}

const texto = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8211;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function analizar(html) {
  const t = texto(html);
  const precio = (t.match(/\$\s?([\d,]+(?:\.\d{2})?)/) || [])[1];
  const bloque = (t.match(/Especificaciones:(.*?)Description/) || [])[1] || "";
  const specs = {};
  for (const m of bloque.matchAll(/([A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,40}):\s*([^:]*?)(?=\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,39}:|$)/g)) {
    specs[m[1].trim()] = m[2].trim();
  }
  const fotos = new Set(
    [...html.matchAll(/wp-content\/uploads\/(\d{4}\/\d{2}\/[^"' )]+?)(?:-\d+x\d+)?(?:-scaled)?\.(jpe?g|png|webp)/gi)]
      .map((m) => m[1])
      .filter((f) => !/favicon|bg-image|logo|Activos-Inmobiliarios_/i.test(f))
  );
  const para = (t.match(/Para:\s*(Venta \/ Renta|Venta|Renta)/) || [])[1];
  return { precio, para, specs, fotos: fotos.size };
}

async function main() {
  const prueba = process.argv.includes("--prueba");
  const lista = prueba ? props.slice(0, 3) : props;
  const salida = [];
  for (const [i, p] of lista.entries()) {
    let r = { id: p.id, titulo: texto(p.title.rendered), slug: p.slug, url: p.link, alta: p.date, modificada: p.modified, autor: p.author, foto_portada: p.featured_media };
    for (const t of ["type-of-housing", "property-type", "location", "purpose"]) r[t] = p[t].map((id) => terms[id] || id);
    r.descripcion_caracteres = texto(p.content.rendered).length;
    r.descripcion_con_letras_unicode = /[\u{1D400}-\u{1D7FF}]/u.test(p.content.rendered);
    try {
      const res = await fetch(p.link, { headers: { "User-Agent": UA } });
      r.http = res.status;
      Object.assign(r, analizar(await res.text()));
    } catch (e) {
      r.error = String(e);
    }
    salida.push(r);
    if (prueba) console.log(JSON.stringify(r, null, 1));
    else if (i % 20 === 0) console.log(`${i + 1}/${lista.length}`);
    await new Promise((ok) => setTimeout(ok, 700));
  }
  if (!prueba) {
    fs.writeFileSync(path.join(__dirname, "inventario_propiedades.json"), JSON.stringify(salida, null, 1));
    console.log("listo:", salida.length);
  }
}
main();
