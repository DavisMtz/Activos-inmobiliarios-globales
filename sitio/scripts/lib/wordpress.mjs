/**
 * Cómo se lee una casa de WordPress (PLAN §14), en un solo lugar. Lo usan la
 * siembra de F1 (`sembrar-desde-wordpress.mjs`, sobre lo descargado el
 * 16/09/2026) y la sincronización (`sincronizar-con-wordpress.mjs`, contra el
 * sitio vivo): si una regla cambia, cambia para las dos.
 */
import {
  asesorMencionado,
  decodificarEntidades,
  htmlATexto,
  normalizarDescripcion,
  resumenDe,
  sinAcentos,
  slugificar,
} from "../../shared/texto.ts";
import { texto as sql } from "./d1.mjs";

export const TAXONOMIAS = ["type-of-housing", "property-type", "location", "purpose"];

// ─── Mapeos (PLAN §14) ──────────────────────────────────────────

export const OPERACIONES = { venta: "venta", renta: "renta", "venta / renta": "venta_renta", "venta y renta": "venta_renta" };
export const TIPOS = {
  casa: "casa",
  departamento: "departamento",
  terreno: "terreno",
  bodega: "bodega",
  edificio: "edificio",
  oficinas: "oficina",
  oficina: "oficina",
  local: "local",
  villa: "casa",
  inmueble: "otro",
};
export const CONDICIONES = { "casa nueva": "nueva", "casa semi nueva": "seminueva", "casa remodelada": "remodelada" };
export const CIUDADES = {
  morelia: "Morelia",
  patzcuaro: "Pátzcuaro",
  tarimbaro: "Tarímbaro",
  "ciudad hidalgo": "Ciudad Hidalgo",
  guanajuato: "Guanajuato",
  ixtapa: "Ixtapa",
  "estado de mexico": "Estado de México",
};

/** «…/WhatsApp-Image-1-150x150.jpeg» y «…-scaled.jpeg» → «whatsapp-image-1.jpeg». */
export function nombreBase(url) {
  const archivo = decodeURIComponent(String(url).split("?")[0].split("/").pop() ?? "");
  return archivo.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, "").replace(/-scaled(?=\.[a-z0-9]+$)/i, "").toLowerCase();
}

export const numero = (valor) => {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(String(valor).replace(/m²|m2/gi, "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};
export const entero = (valor) => {
  const n = numero(valor);
  return n === null ? null : Math.round(n);
};
export const fechaUtc = (gmt) => new Date(`${gmt}Z`).toISOString();

const mismaCiudad = (texto, ciudad) => sinAcentos(texto).replace(/^cd /, "ciudad ") === sinAcentos(ciudad);

/**
 * Colonia a partir del título (PLAN §14): «Casa en Fracc. Lomalta (M2 – 35)» →
 * «Lomalta». Los títulos los escribe el equipo a mano, así que el resultado va
 * siempre con aviso «colonia adivinada» para que alguien lo confirme.
 */
export function coloniaDeTitulo(titulo, ciudad) {
  // «local(es)» y no «locales?», que no aceptaba «Local comercial en…» (corregido el 21/10/2026).
  if (!/^(casas?|departamentos?|terrenos?|local(es)?|bodegas?|oficinas?|edificios?|inmuebles?|propiedad(es)?|residencias?)\b/i.test(titulo)) {
    return null;
  }
  const tras = titulo.match(/^.*?\ben\s+(.+)$/i)?.[1];
  if (!tras) return null;
  // «en renta en Cedros» y también «en renta Lomalta» (este, desde el 21/10/2026).
  let colonia = tras.replace(/^(renta|venta)\s+(en\s+)?/i, "").replace(/^la\s+/, "");
  const conCiudad = colonia.match(/^(.+?)\s+en\s+(.+)$/i);
  if (conCiudad && mismaCiudad(conCiudad[1], ciudad)) colonia = conCiudad[2];
  colonia = colonia
    .replace(/\([^)]*\)/g, " ")
    .replace(/\|.*$/, "")
    .replace(/[«»"“”]/g, "")
    .replace(/\b(fracc\.?|fraccionamiento|col\.|colonia)\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,;]+$/, "");
  // «Altozano, Modelo Fresno», «Altozano, CIRCUITO TEJONES 1», «Terranova 1, Tarímbaro»:
  // lo que va tras la coma es un modelo de casa, una calle o la ciudad, no la zona.
  let partes = colonia.split(/\s*,\s*/);
  if (partes.length > 1 && mismaCiudad(partes[partes.length - 1], ciudad)) partes = partes.slice(0, -1);
  if (partes.length > 1) partes = [partes[0], ...partes.slice(1).filter((x) => !/^(modelo|prototipo|circuito|calle|av\.?|avenida)\b/i.test(x))];
  colonia = partes.join(", ");
  if (!colonia || /^\d/.test(colonia) || /m²|\bm2\b/i.test(colonia)) return null;
  if (/^(calle|av|avenida|blvd|boulevard)(\.|\s|$)/i.test(colonia)) return null;
  // «coto privado», «coto con 133 casas», «Desarrollo»: descripciones, no lugares
  // (pero «Coto Mirlos» sí es un lugar).
  if (/^(coto|desarrollo|lujo)(\s+(con|privado|privada)\b.*)?$/i.test(colonia)) return null;
  if (mismaCiudad(colonia, ciudad)) return null;
  return colonia;
}

/** La galería en orden, del HTML de la ficha: del encabezado «Galería:» a «Propiedades Similares». */
export function galeriaDeFicha(html) {
  const inicio = html.search(/>\s*Galer[ií]a:?\s*</);
  if (inicio < 0) return [];
  const fin = html.indexOf("Propiedades Similares", inicio);
  const bloque = html.slice(inicio, fin > 0 ? fin : undefined);
  const fotos = [];
  for (const [figura] of bloque.matchAll(/<figure class=['"]gallery-item['"][\s\S]*?<\/figure>/g)) {
    const href = figura.match(/href=['"]([^'"]+)['"]/)?.[1];
    // El visor de Elementor lleva en base64 el id del archivo de WordPress.
    let id = null;
    const ajustes = figura.match(/settings%3D([^"'&]+)/)?.[1];
    if (ajustes) {
      try {
        id = JSON.parse(Buffer.from(decodeURIComponent(ajustes), "base64").toString("utf8")).id ?? null;
      } catch {}
    }
    if (href || id) fotos.push({ id, href: href ? decodificarEntidades(href) : null });
  }
  return fotos;
}

const textoDeFicha = (h) =>
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
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Precio, «Para» y especificaciones de una ficha: lo que la API no da. Es lo que
 * hicieron `analisis/crudo/inventario.cjs` y `limpiar-inventario.cjs` con las
 * 188 del 16/09/2026. `categorias` son los nombres de las taxonomías de la casa,
 * tal como los da la API: el último campo de «Especificaciones» se los traga
 * («Planta baja: Si Casa nueva Morelia»).
 */
export function inventarioDeFicha(html, categorias) {
  const t = textoDeFicha(html);
  const precio = (t.match(/\$\s?([\d,]+(?:\.\d{2})?)/) || [])[1];
  const bloque = (t.match(/Especificaciones:(.*?)Description/) || [])[1] || "";
  const specs = {};
  for (const m of bloque.matchAll(/([A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,40}):\s*([^:]*?)(?=\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,39}:|$)/g)) {
    specs[m[1].trim()] = m[2].trim();
  }
  for (const [campo, valor] of Object.entries(specs)) {
    let limpio = valor;
    for (const c of categorias) limpio = limpio.replace(new RegExp(`\\s+${escapar(c)}(?=\\s|$)`, "g"), "");
    specs[campo] = limpio.trim();
  }
  const para = (t.match(/Para:\s*(Venta \/ Renta|Venta|Renta)/) || [])[1];
  return { precio, para, specs };
}

// ─── Una casa ───────────────────────────────────────────────────

/**
 * Una casa de la API de WordPress, lista para la D1. El `contexto` trae:
 * - `inventario`: Map de id → `{ precio, para, specs }`, lo que solo dice el HTML de la ficha;
 * - `terminos`: `{ taxonomía: Map de id → nombre }`;
 * - `medios` y `mediosPorArchivo`: los medios de WordPress, por id y por `nombreBase`;
 * - `htmlFicha`: el HTML de su ficha, o null si no se tiene (queda sin galería).
 */
export function armarCasa(p, { inventario, terminos, medios, mediosPorArchivo, htmlFicha }) {
  const nombres = (p, taxonomia) => (p[taxonomia] ?? []).map((id) => terminos[taxonomia].get(id)).filter(Boolean);
  const medioDe = ({ id, href }) => (id && medios.get(id)) || (href && mediosPorArchivo.get(nombreBase(href))) || null;

  const inv = inventario.get(p.id) ?? { specs: {} };
  const avisos = ["confirmar disponibilidad"];
  const titulo = decodificarEntidades(p.title.rendered).replace(/\s+/g, " ").trim();

  // Slug: se conserva el de WordPress. Si traía caracteres fuera de [a-z0-9-]
  // (hay uno con «m²» codificado) se limpia y la URL vieja queda en redirecciones.
  const slugWp = decodeURIComponent(p.slug);
  const slug = /^[a-z0-9-]+$/.test(slugWp) ? slugWp : slugificar(slugWp);
  if (slug !== slugWp) avisos.push(`dirección cambiada: «${slugWp}» → «${slug}»`);

  // Operación
  const proposito = nombres(p, "purpose")[0] ?? inv.para;
  let operacion = proposito ? OPERACIONES[proposito.toLowerCase()] : undefined;
  if (!operacion) {
    operacion = "venta";
    avisos.push("operación supuesta: venta (WordPress no la tenía)");
  }

  // Tipo: si trae varios («Inmueble» y «Terreno») manda el concreto.
  const tiposWp = nombres(p, "property-type");
  const tipoWp = tiposWp.find((t) => t.toLowerCase() !== "inmueble") ?? tiposWp[0] ?? "";
  let tipo = TIPOS[tipoWp.toLowerCase()];
  if (!tipo) {
    tipo = "otro";
    avisos.push(`tipo sin equivalente: «${tipoWp || "vacío"}»`);
  } else if (tipoWp.toLowerCase() === "inmueble") {
    avisos.push("tipo «Inmueble» de WordPress: elegir el tipo real");
  } else if (tipoWp.toLowerCase() === "villa") {
    avisos.push("tipo «villa» de WordPress tomado como casa");
  }

  // Descripción
  const descripcionOriginal = htmlATexto(p.content.rendered);
  const descripcion = normalizarDescripcion(descripcionOriginal);
  const resumen = resumenDe(descripcion);
  if (!resumen) avisos.push("sin resumen: escribir uno");
  // El nombre se quita de la descripción, pero sirve para asignar la casa en el panel.
  const asesor = asesorMencionado(descripcionOriginal);
  if (asesor) avisos.push(`asesor mencionado en el texto: «${asesor}»`);

  // Condición
  let condicion = CONDICIONES[(nombres(p, "type-of-housing")[0] ?? "").toLowerCase()] ?? null;
  if (/\bpreventa\b/i.test(descripcionOriginal.normalize("NFKC"))) {
    condicion = "preventa";
    avisos.push("preventa detectada en la descripción");
  }

  // Precio
  const precioWp = entero(inv.precio);
  let precio = null;
  let precioRenta = null;
  if (operacion === "renta") precioRenta = precioWp;
  else precio = precioWp;
  if (operacion === "venta_renta") avisos.push("falta precio de renta");

  // Zona
  const ciudadWp = nombres(p, "location")[0];
  let ciudad = ciudadWp ? (CIUDADES[sinAcentos(ciudadWp)] ?? ciudadWp) : null;
  if (!ciudad) {
    ciudad = "Morelia";
    avisos.push("ciudad supuesta: Morelia (WordPress no tenía ubicación)");
  }
  if (sinAcentos(ciudad) === "estado de mexico") avisos.push("ubicación: WordPress tiene un estado, no una ciudad");
  const colonia = coloniaDeTitulo(titulo, ciudad);
  avisos.push(colonia ? "colonia adivinada del título" : "colonia no detectada");

  // Especificaciones (leídas del HTML de cada ficha por inventario.cjs)
  const s = inv.specs ?? {};
  const anio = String(s["Año de construccion"] ?? "").match(/\b(19|20)\d{2}\b/)?.[0];

  // Fotos
  const galeria = htmlFicha ? galeriaDeFicha(htmlFicha) : [];
  if (!galeria.length) avisos.push("sin galería en WordPress: solo la foto de portada");

  const vistas = new Set();
  const fotos = [];
  for (const item of galeria) {
    const medio = medioDe(item);
    const url = medio?.source_url ?? item.href;
    if (!url || vistas.has(url) || (medio && !String(medio.mime_type).startsWith("image/"))) continue;
    vistas.add(url);
    fotos.push({ url, ancho: medio?.media_details?.width ?? null, alto: medio?.media_details?.height ?? null, idWp: medio?.id ?? item.id });
  }
  const portada = medios.get(p.featured_media);
  let indicePortada = portada ? fotos.findIndex((f) => f.idWp === portada.id || f.url === portada.source_url) : -1;
  if (portada && indicePortada < 0 && String(portada.mime_type).startsWith("image/")) {
    fotos.unshift({ url: portada.source_url, ancho: portada.media_details?.width ?? null, alto: portada.media_details?.height ?? null, idWp: portada.id });
    indicePortada = 0;
  }
  if (indicePortada < 0 && fotos.length) {
    indicePortada = 0;
    avisos.push("sin foto de portada en WordPress: se usó la primera de la galería");
  }

  return {
    wpId: p.id,
    slug,
    slugWp,
    titulo,
    operacion,
    tipo,
    condicion,
    precio,
    precioRenta,
    recamaras: entero(s["Habitaciones"]),
    banosCompletos: entero(s["Baños completos"]),
    mediosBanos: entero(s["Medios Baños"]),
    estacionamientos: entero(s["Estacionamientos"]),
    niveles: entero(s["Cantidad de Pisos"]),
    m2Terreno: numero(s["Tamaño de la propiedad"]),
    m2Construccion: numero(s["En construcción"]),
    anio: anio ? Number(anio) : null,
    ciudad,
    colonia,
    resumen,
    descripcion,
    descripcionOriginal,
    avisos,
    creada: fechaUtc(p.date_gmt),
    actualizada: fechaUtc(p.modified_gmt),
    fotos: fotos.map((f, i) => ({ ...f, orden: i, esPortada: i === indicePortada ? 1 : 0 })),
  };
}

// ─── SQL ────────────────────────────────────────────────────────

/** La zona de una casa: una por ciudad y colonia («Tres Marias» y «Tres Marías» comparten slug). */
export const slugDeZona = (casa) => slugificar(`${casa.ciudad} ${casa.colonia ?? ""}`);

export function sqlZona(z) {
  return `INSERT OR IGNORE INTO zonas (ciudad, colonia, slug) VALUES (${sql(z.ciudad)}, ${sql(z.colonia)}, ${sql(z.slug)});`;
}

/** Por `wp_id`; lo editado en el panel no se toca. La casa ya trae su `clave` y su `zona` (el slug). */
export function sqlPropiedad(c) {
  const columnas = {
    clave: sql(c.clave),
    slug: sql(c.slug),
    wp_id: c.wpId,
    titulo: sql(c.titulo),
    operacion: sql(c.operacion),
    tipo: sql(c.tipo),
    condicion: sql(c.condicion),
    estado: sql("publicada"),
    precio: c.precio ?? "NULL",
    precio_renta: c.precioRenta ?? "NULL",
    recamaras: c.recamaras ?? "NULL",
    banos_completos: c.banosCompletos ?? "NULL",
    medios_banos: c.mediosBanos ?? "NULL",
    estacionamientos: c.estacionamientos ?? "NULL",
    niveles: c.niveles ?? "NULL",
    m2_terreno: c.m2Terreno ?? "NULL",
    m2_construccion: c.m2Construccion ?? "NULL",
    anio_construccion: c.anio ?? "NULL",
    zona_id: `(SELECT id FROM zonas WHERE slug = ${sql(c.zona)})`,
    resumen: sql(c.resumen),
    descripcion: sql(c.descripcion),
    descripcion_original: sql(c.descripcionOriginal),
    revisar: sql(JSON.stringify(c.avisos)),
    creada_en: sql(c.creada),
    actualizada_en: sql(c.actualizada),
    publicada_en: sql(c.creada),
  };
  const nombresColumnas = Object.keys(columnas);
  // clave y estado no se actualizan: una vez dadas, son del negocio.
  const actualizables = nombresColumnas.filter((n) => !["clave", "wp_id", "estado", "creada_en", "publicada_en"].includes(n));
  return (
    `INSERT INTO propiedades (${nombresColumnas.join(", ")}) VALUES (${Object.values(columnas).join(", ")})` +
    ` ON CONFLICT(wp_id) DO UPDATE SET ${actualizables.map((n) => `${n} = excluded.${n}`).join(", ")}` +
    ` WHERE propiedades.actualizada_en <= excluded.actualizada_en;`
  );
}

/** Solo se reemplazan las fotos que siguen en WordPress: las que ya están en Cloudinary se conservan. */
export function sqlFotos(c) {
  const casaSinEditar = `wp_id = ${c.wpId} AND actualizada_en = ${sql(c.actualizada)}`;
  // INDEXED BY a propósito: sin él SQLite busca por `public_id IS NULL` y cada DELETE
  // lee TODAS las fotos pendientes (188 × 3,241 filas leídas en una base nueva). El
  // plan gratuito de D1 da 5 millones de lecturas al día para toda la cuenta (PLAN §17).
  const lineas = [
    `DELETE FROM fotos INDEXED BY idx_fotos_propiedad WHERE propiedad_id = (SELECT id FROM propiedades WHERE ${casaSinEditar}) AND public_id IS NULL;`,
  ];
  if (!c.fotos.length) return lineas;
  const filas = c.fotos
    .map((f) => `(${sql(f.url)}, ${f.ancho ?? "NULL"}, ${f.alto ?? "NULL"}, ${sql(`${c.titulo}, foto ${f.orden + 1} de ${c.fotos.length}`)}, ${f.orden}, ${f.esPortada})`)
    .join(", ");
  lineas.push(
    `INSERT INTO fotos (propiedad_id, url_origen, ancho, alto, alt, orden, es_portada)` +
      ` SELECT p.id, v.column1, v.column2, v.column3, v.column4, v.column5, v.column6` +
      ` FROM (VALUES ${filas}) AS v JOIN propiedades p ON p.${casaSinEditar.replace(" AND ", " AND p.")}` +
      ` WHERE NOT EXISTS (SELECT 1 FROM fotos f WHERE f.propiedad_id = p.id AND f.url_origen = v.column1);`,
  );
  return lineas;
}

/** Si la dirección cambió, la vieja de WordPress redirige a la nueva. */
export function sqlRedirecciones(c) {
  if (c.slug === c.slugWp) return [];
  return [...new Set([`/properties/${c.slugWp}`, `/properties/${encodeURIComponent(c.slugWp).toLowerCase()}`])].map(
    (origen) => `INSERT OR REPLACE INTO redirecciones (origen, destino, codigo) VALUES (${sql(origen)}, ${sql(`/propiedades/${c.slug}`)}, 301);`,
  );
}
