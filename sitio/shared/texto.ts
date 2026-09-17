/**
 * Texto de las casas (PLAN §11.3). Hoy el equipo escribe cada casa para
 * Facebook: letras «negritas» de Unicode, emojis como viñetas, separadores
 * «━━━», hashtags y un bloque final de «Informes y citas» con teléfono. Aquí
 * se convierte en texto limpio para la ficha.
 *
 * Este archivo NO importa nada a propósito: lo usan el Worker, el panel (F3)
 * y `scripts/sembrar-desde-wordpress.mjs` desde Node, que lo importa tal cual.
 *
 * Trampa de las herramientas de edición: aquí no se escriben escapes Unicode
 * (barra invertida + u + cifras) porque llegan al archivo como el carácter real.
 * Los caracteres especiales se construyen con `String.fromCodePoint`.
 */

// ─── Utilidades de caracteres ─────────────────────────────────────

const cp = (...codigos: number[]) => String.fromCodePoint(...codigos);

/** Letras y cifras «negritas/cursivas» matemáticas: U+1D400–U+1D7FF. */
export const LETRAS_MATEMATICAS = new RegExp(`[${cp(0x1d400)}-${cp(0x1d7ff)}]`, "u");

/** Selector de variación, unión de ancho cero y marca de tecla (van pegados a los emojis). */
const PEGAMENTO_EMOJI = new RegExp(`[${cp(0xfe0e, 0xfe0f, 0x200d, 0x20e3)}]`, "gu");

/** Viñetas que el equipo usa al inicio de renglón. Se convierten en «• ». */
const VINETAS = ["✔", "✅", "☑", "▪", "▫", "◾", "◽", "■", "□", "🔹", "🔸", "🔺", "🔻", "➡", "➤", "►", "▶", "👉", "✓", "•", "·", "-", "*"];

// ─── HTML de WordPress → texto ────────────────────────────────────

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  laquo: "«",
  raquo: "»",
  iexcl: "¡",
  iquest: "¿",
};

export function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entera, cuerpo: string) => {
    if (cuerpo[0] === "#") {
      const codigo = cuerpo[1] === "x" || cuerpo[1] === "X" ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(codigo) && codigo > 0 && codigo <= 0x10ffff ? cp(codigo) : entera;
    }
    return ENTIDADES[cuerpo.toLowerCase()] ?? entera;
  });
}

/** Conserva los saltos de párrafo y de renglón; quita todas las etiquetas. */
export function htmlATexto(html: string): string {
  const texto = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    // Con atributos: el editor de WordPress escribe <br data-start="1524" ... />.
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<hr\b[^>]*>/gi, "\n\n")
    .replace(/<\/(p|div|h[1-6])>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  return ordenarRenglones(decodificarEntidades(texto));
}

/** Espacios y renglones vacíos: como mucho una línea en blanco seguida. */
function ordenarRenglones(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((r) => r.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Normalización de la descripción ─────────────────────────────

const SEPARADOR = /^[━─═▬—–_=~.·•*\-\s]{3,}$/u;
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;
const CIERRE_DE_CONTACTO =
  /informes y citas|cont[aá]ctanos|comun[ií]cate|agenda (tu|una) (cita|visita)|para (m[aá]s )?informaci[oó]n|m[aá]s informes|whats ?app|llama(nos)? al/i;
const SOLO_CONTACTO = /^[\s\p{P}\p{S}]*((activos inmobiliarios globales)|(\+?52)?[\s\d()-]{8,}|info@\S+|www\.\S+)[\s\p{P}\p{S}]*$/iu;
/** Teléfono de 10 cifras (con o sin +52 y separadores). Los precios llevan comas y no caen aquí. */
const TELEFONO = /(\+?52[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

/** Quita las frases que traen un teléfono: si el número cambia, la ficha no debe seguir diciéndolo. */
function sinFrasesConTelefono(renglon: string): string {
  if (!TELEFONO.test(renglon)) return renglon;
  return renglon
    .split(/(?<=[.!?])\s+|(?=[¡¿])/u)
    .filter((frase) => !TELEFONO.test(frase))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Un renglón que solo dice el precio: el precio vive en su campo y se edita ahí. */
const SOLO_PRECIO = /^[\s\p{P}\p{S}]*(precio( de (venta|renta))?|renta( mensual)?|venta)?\s*:?\s*\$\s?[\d,.]+(\s*(mxn|pesos|m\.n\.|mensuales|al mes))?[\s\p{P}\p{S}]*$/iu;

const INICIO_CON_VINETA = new RegExp(`^[${VINETAS.map((v) => v.replace(/[-*]/g, "\\$&")).join("")}\\s]+`, "u");

/** Quita emojis. Una viñeta al inicio se vuelve «• » para que la lista siga siendo lista;
 *  un emoji que solo adornaba (📍, 🔑, 🌟) desaparece y queda el texto. */
function quitarEmojis(renglon: string): string {
  const sinPegamento = renglon.replace(PEGAMENTO_EMOJI, "");
  const conVineta = VINETAS.some((v) => sinPegamento.startsWith(v));
  const r = sinPegamento
    // Las banderas (🇪🇸) son pares de «indicadores regionales», no pictogramas.
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}/gu, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!conVineta) return r;
  const contenido = r.replace(INICIO_CON_VINETA, "").trim();
  return contenido ? `• ${contenido}` : "";
}

/** «Lic. Eberth Martínez Corona»: el asesor que el equipo pone al final del texto. */
// Sin la bandera «i» a propósito: con ella, \p{Lu} aceptaría minúsculas.
const NOMBRE_DE_ASESOR =
  /^([Ll]ic|[Ll]icenciad[oa]|[Ii]ng|[Aa]rq|[Mm]tr[oa]|[Dd]ra?|[Cc]\.\s?[Pp])\.?\s+\p{Lu}[\p{L}.'-]+(\s+\p{Lu}[\p{L}.'-]+){1,4}$/u;
/** «Precio sujeto a disponibilidad y cambio sin previo aviso»: se queda en la ficha. */
const AVISO_LEGAL = /sujet[oa]s? a (cambio|disponibilidad)|sin previo aviso|puede(n)? cambiar sin/i;

type Renglon = { texto: string; enBlanco: boolean };

/** Limpia un renglón. Devuelve "" si todo lo que tenía era adorno, precio o teléfono. */
function limpiarRenglon(original: string): string {
  let r = original.replace(HASHTAG, "$1").trim();
  if (!r || SEPARADOR.test(r)) return "";
  r = sinFrasesConTelefono(quitarEmojis(r));
  return SOLO_PRECIO.test(r) ? "" : r;
}

/**
 * Descripción limpia para la ficha:
 * 1. `normalize("NFKC")`: las letras «negritas» pasan a letras normales.
 * 2. Fuera separadores «━━━», hashtags y emojis (las viñetas quedan como «• »).
 * 3. Fuera frases con teléfono y renglones que solo repiten el precio (los dos
 *    viven en sus campos y se editan ahí).
 * 4. Fuera el bloque final de «Informes y citas» con nombre del asesor y
 *    teléfono: el sitio nuevo tiene su propio contacto por casa. Un aviso legal
 *    que venga en ese bloque («precio sujeto a…») se conserva.
 */
export function normalizarDescripcion(texto: string): string {
  const renglones: Renglon[] = texto
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((original) => ({ texto: original.trim() ? limpiarRenglon(original) : "", enBlanco: !original.trim() }))
    // Un renglón vaciado por la limpieza desaparece; uno que ya estaba en blanco separa párrafos.
    .filter((r) => r.enBlanco || r.texto);

  // El cierre de contacto se busca en el último tercio y solo si lo que sigue es
  // contacto o aviso legal: así no se corta un «contáctanos» a media descripción.
  const conTexto = renglones.filter((r) => r.texto);
  const esContacto = (x: string) =>
    x.length <= 60 && (SOLO_CONTACTO.test(x) || CIERRE_DE_CONTACTO.test(x) || NOMBRE_DE_ASESOR.test(x));
  for (let k = Math.floor(conTexto.length * 0.66); k < conTexto.length; k++) {
    const cierre = conTexto[k].texto;
    if (!CIERRE_DE_CONTACTO.test(cierre) || cierre.length > 90) continue;
    const cola = conTexto.slice(k + 1);
    if (cola.length <= 5 && cola.every((r) => esContacto(r.texto) || AVISO_LEGAL.test(r.texto))) {
      for (const r of conTexto.slice(k)) if (!AVISO_LEGAL.test(r.texto)) r.texto = "";
      break;
    }
  }

  return ordenarRenglones(
    renglones
      .filter((r) => r.enBlanco || (r.texto && !(SOLO_CONTACTO.test(r.texto) && r.texto.length <= 60)))
      .map((r) => r.texto)
      .join("\n"),
  );
}

/** El asesor nombrado en el texto de Facebook («Lic. …»), para sugerir a quién asignar la casa. */
export function asesorMencionado(texto: string): string | null {
  for (const original of texto.normalize("NFKC").split("\n")) {
    const renglon = quitarEmojis(original.trim());
    if (NOMBRE_DE_ASESOR.test(renglon)) return renglon;
  }
  return null;
}

/**
 * Resumen de ≤160 caracteres para la tarjeta y la meta description: la
 * primera frase «útil», es decir, con minúsculas (no un encabezado en
 * mayúsculas) y de al menos 40 caracteres. Null si no hay ninguna.
 */
export function resumenDe(descripcion: string, maximo = 160): string | null {
  for (const renglon of descripcion.split("\n")) {
    const limpio = renglon.replace(/^•\s*/, "").trim();
    if (limpio.length < 40 || !/\p{Ll}/u.test(limpio)) continue;
    const letras = limpio.replace(/[^\p{L}]/gu, "");
    const mayusculas = letras.replace(/[^\p{Lu}]/gu, "");
    if (letras.length && mayusculas.length / letras.length > 0.6) continue;
    // Encabezados y direcciones («Casa en Venta – Av. Escritor…», «Amado Nervo, Centro,
    // Morelia, Michoacán»): casi todas sus palabras largas empiezan con mayúscula.
    const palabras = limpio.split(/\s+/).filter((p) => /^\p{L}{3,}/u.test(p));
    const conMayuscula = palabras.filter((p) => /^\p{Lu}/u.test(p)).length;
    if (palabras.length && conMayuscula / palabras.length > 0.5) continue;

    // Frases completas mientras quepan; una abreviatura («Av.») no corta el resumen en seco.
    const frases = limpio.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/gu) ?? [limpio];
    let resumen = "";
    for (const frase of frases) {
      const junto = `${resumen} ${frase.trim()}`.trim();
      if (junto.length > maximo) break;
      resumen = junto;
      if (resumen.length >= 40) break;
    }
    if (resumen.length >= 40) return resumen;

    const corte = limpio.slice(0, maximo - 1);
    const espacio = corte.lastIndexOf(" ");
    return `${(espacio > 60 ? corte.slice(0, espacio) : corte).replace(/[\s,;:.]+$/u, "")}…`;
  }
  return null;
}

// ─── Otros ────────────────────────────────────────────────────────

/** «Club Campestre Erandeni» → «club-campestre-erandeni». */
export function slugificar(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Comparación sin mayúsculas ni acentos: «Tres Marias» = «Tres Marías». */
export const sinAcentos = (texto: string): string => slugificar(texto).replace(/-/g, " ");
