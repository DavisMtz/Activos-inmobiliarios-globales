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

// ─── «Pegar texto de Facebook» (PLAN §11.3, paso 2) ───────────────

/**
 * Lee el texto con el que el equipo publica una casa en Facebook y saca los
 * datos que ya están escritos ahí, para no capturarlos dos veces.
 *
 * Regla de toda esta parte: **antes no contestar que contestar de más.** Lo que
 * se devuelve rellena campos vacíos de un formulario y una persona lo confirma;
 * un dato inventado se cuela al sitio, y uno que falta solo se escribe a mano.
 * Por eso, ante duda (un monto sin contexto, unos metros que no dicen si son de
 * terreno o de construcción) se devuelve null.
 */

/** El alfiler con el que marcan la ubicación. */
const ALFILER = cp(0x1f4cd);

export type DatosDeFacebook = {
  operacion: "venta" | "renta" | "venta_renta" | null;
  tipo: string | null;
  condicion: string | null;
  precio: number | null;
  precioRenta: number | null;
  recamaras: number | null;
  banosCompletos: number | null;
  mediosBanos: number | null;
  estacionamientos: number | null;
  niveles: number | null;
  m2Terreno: number | null;
  m2Construccion: number | null;
  ciudad: string | null;
  colonia: string | null;
};

const SIN_DATOS: DatosDeFacebook = {
  operacion: null,
  tipo: null,
  condicion: null,
  precio: null,
  precioRenta: null,
  recamaras: null,
  banosCompletos: null,
  mediosBanos: null,
  estacionamientos: null,
  niveles: null,
  m2Terreno: null,
  m2Construccion: null,
  ciudad: null,
  colonia: null,
};

/** «Recámaras» → «recamaras». De paso, NFKD convierte «m²» en «m2». */
const plano = (texto: string): string =>
  texto
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const NUMEROS_ESCRITOS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};
/** Lo que cuenta como cantidad: cifras o los números escritos hasta diez. */
const CANTIDAD = `\\d{1,3}|${Object.keys(NUMEROS_ESCRITOS).join("|")}`;

function cuantos(texto: string | undefined, maximo: number): number | null {
  if (!texto) return null;
  const escrito = NUMEROS_ESCRITOS[texto];
  const n = escrito ?? Number(texto);
  return Number.isInteger(n) && n >= 1 && n <= maximo ? n : null;
}

/**
 * «3,000,000.00» → 3000000. Null si hay que adivinar («3.000.000», «2.5
 * millones»). Los metros conservan sus decimales: redondear «93.5 m²» a 94
 * desmentía al inventario en nueve casas (medido sobre las 188 reales).
 */
function montoDe(bruto: string, { decimales = false } = {}): number | null {
  const sinMiles = bruto.replace(/,/g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(sinMiles)) return null;
  const n = Number(sinMiles);
  if (!Number.isFinite(n) || n <= 0) return null;
  return decimales ? Math.round(n * 100) / 100 : Math.round(n);
}

/** Montos que no son el precio de la casa. */
const OTROS_MONTOS = /enganche|mensualidad|credito|financia|apartad|comision|descuento|cuota|mantenimiento|predial/;
const PALABRAS_RENTA = /renta|mensual|al mes/;
const MONTO = /\$\s*(\d[\d,]*(?:\.\d{1,2})?)/g;
const METROS = /(\d[\d,]*(?:\.\d{1,2})?)\s*(?:m2|mts2|mt2|metros(?:\s+cuadrados)?)\b/g;

const TIPOS_EN_TEXTO: [RegExp, string][] = [
  [/\bdepartamento|\bdepto\b|\bdpto\b/, "departamento"],
  [/\bterreno|\blote\b|\bpredio\b/, "terreno"],
  [/\bbodega/, "bodega"],
  [/\boficina/, "oficina"],
  [/\bedificio/, "edificio"],
  [/\blocal\b/, "local"],
  [/\bcasa|\bresidencia|\bvilla\b/, "casa"],
];

const CONDICIONES_EN_TEXTO: [RegExp, string][] = [
  [/\bpreventa\b|\ben preventa\b/, "preventa"],
  [/\bsemi\s?nueva\b/, "seminueva"],
  [/\bremodelada\b/, "remodelada"],
  [/\bnueva\b|\ba estrenar\b/, "nueva"],
];

/** Renglones que hablan de OTRAS recámaras, no de cuántas tiene la casa. */
const RECAMARA_AJENA = /secundari|adicional|extra|de servicio|visitas|principal/;

/** Cómo llegar no es dónde está: eso no es una colonia. */
const ES_REFERENCIA =
  /^(salida|cerca|a\s+(solo|unos?|dos|tres|cuatro|cinco|\d)|frente|junto|sobre|camino|rumbo|atras|detras|calle|av\.?\s|avenida|blvd|boulevard|carretera|esquina|entre|zona|privad[ao]\s+residencial|fraccionamiento\s+privado)\b/;

/** El estado no es la ciudad. */
const ES_ESTADO = /^(michoacan|mich\.?|mexico|mx)$/;

/**
 * Cada dato junta TODAS las cifras que el texto da para él. Si el texto se
 * contradice —y se contradice seguido: «3 recámaras + estudio / 4ª recámara»,
 * que el inventario cuenta como 4—, no se elige ninguna y el campo se queda
 * vacío para que lo escriba una persona. Medido sobre las 188 descripciones
 * reales: quedarse con la primera cifra acertaba 82 veces y fallaba 56.
 */
type Candidatos = {
  precio: number[];
  precioRenta: number[];
  recamaras: number[];
  banosCompletos: number[];
  mediosBanos: number[];
  estacionamientos: number[];
  niveles: number[];
  m2Terreno: number[];
  m2Construccion: number[];
};

const unico = (valores: number[]): number | null => {
  if (!valores.length) return null;
  const distintos = new Set(valores);
  return distintos.size === 1 ? valores[0] : null;
};

/**
 * Renglones que enumeran un cuarto SIN decir cuántos hay: «▪️ Recámara /
 * estudio», «🚿 Baño completo». Van sueltos en la lista de la publicación y el
 * inventario los suma al total, así que si aparecen junto a una cifra («3
 * recámaras»), el total real no está escrito en ninguna parte: son 3 o son 4
 * según a quién se le pregunte. Medido en las 188: es la causa de 29 de los 29
 * desacuerdos en recámaras.
 *
 * El renglón puede empezar con viñetas, emojis o el número de la lista
 * («6️⃣ 🚿 Baño completo»), y por eso se salta todo lo que no sea letra.
 */
const empiezaCon = (renglon: string, palabra: string): boolean =>
  new RegExp(`^[\\s\\p{P}\\p{S}\\p{N}]*${palabra}`, "u").test(renglon);

export function datosDeTextoFacebook(entrada: string): DatosDeFacebook {
  const datos: DatosDeFacebook = { ...SIN_DATOS };
  if (typeof entrada !== "string" || !entrada.trim()) return datos;

  const candidatos: Candidatos = {
    precio: [],
    precioRenta: [],
    recamaras: [],
    banosCompletos: [],
    mediosBanos: [],
    estacionamientos: [],
    niveles: [],
    m2Terreno: [],
    m2Construccion: [],
  };

  /** Cuartos enumerados sin número: vuelven ambiguo el total (ver `empiezaCon`). */
  const sueltos = { recamaras: 0, banos: 0 };

  const normalizado = entrada.normalize("NFKC").replace(/\r\n?/g, "\n");
  const completo = plano(normalizado);

  // Operación, tipo y condición salen del texto entero: casi siempre van en el
  // encabezado, y un «se vende» a media descripción también cuenta.
  const hayVenta = /\bventa\b|\bvende\b|\bvendo\b/.test(completo);
  const hayRenta = /\brenta\b|\brenta mos\b|\brento\b|\bse renta\b/.test(completo);
  datos.operacion = hayVenta && hayRenta ? "venta_renta" : hayVenta ? "venta" : hayRenta ? "renta" : null;
  datos.tipo = TIPOS_EN_TEXTO.find(([patron]) => patron.test(completo))?.[1] ?? null;
  datos.condicion = CONDICIONES_EN_TEXTO.find(([patron]) => patron.test(completo))?.[1] ?? null;

  for (const original of normalizado.split("\n")) {
    const r = plano(original);
    if (!r.trim()) continue;

    // ── Precios ──────────────────────────────────────────────────
    if (!OTROS_MONTOS.test(r)) {
      const montos = [...r.matchAll(MONTO)].map((m) => montoDe(m[1])).filter((m): m is number => m !== null);
      const conVenta = /venta|precio/.test(r);
      const conRenta = PALABRAS_RENTA.test(r);
      if (montos.length >= 2 && conVenta && conRenta) {
        // «Venta $3,000,000 · Renta $20,000»: el orden en el que están escritos.
        candidatos.precio.push(montos[0]);
        candidatos.precioRenta.push(montos[1]);
      } else {
        for (const monto of montos) {
          if (conRenta) candidatos.precioRenta.push(monto);
          // Sin ninguna palabra que lo diga, un monto grande es el de venta; uno
          // chico puede ser cualquier cosa (una cuota, un enganche) y se ignora.
          else if (conVenta || monto >= 300_000) candidatos.precio.push(monto);
        }
      }
    }

    // ── Recámaras ────────────────────────────────────────────────
    if (/recamaras?|dormitorios?|habitacion/.test(r)) {
      const encontrado =
        r.match(new RegExp(`(${CANTIDAD})\\s*(?:\\w+\\s+)?(?:recamaras?|habitaciones?|dormitorios?|rec\\b)`)) ??
        r.match(new RegExp(`(?:recamaras?|habitaciones?|dormitorios?)\\s*:?\\s*(${CANTIDAD})\\b`));
      const n = cuantos(encontrado?.[1], 20);
      // «Recámara principal…», «3 recámaras secundarias», «estudio o cuarta
      // recámara»: cuentan una parte, no el total.
      const parcial = RECAMARA_AJENA.test(r) || /\bestudio\b/.test(r);
      if (n !== null && !parcial) candidatos.recamaras.push(n);
      else if (parcial || empiezaCon(r, "(?:recamaras?|dormitorios?|habitacion)")) sueltos.recamaras++;
    }

    // ── Baños: «2.5 baños» son 2 completos y 1 medio ─────────────
    const medios =
      r.match(new RegExp(`(${CANTIDAD})\\s*medios?\\s*ba[nñ]os?`)) ??
      r.match(new RegExp(`medios?\\s*ba[nñ]os?\\s*:?\\s*(${CANTIDAD})\\b`));
    if (medios) {
      const n = cuantos(medios[1], 20);
      if (n !== null) candidatos.mediosBanos.push(n);
    } else if (/\bmedio\s+ba[nñ]o|1\/2\s*ba[nñ]o/.test(r)) {
      candidatos.mediosBanos.push(1);
    } else if (/ba[nñ]os?\b/.test(r)) {
      const banos =
        r.match(new RegExp(`(${CANTIDAD})([.,]5)?\\s*ba[nñ]os?`)) ??
        r.match(new RegExp(`ba[nñ]os?(?:\\s+completos?)?\\s*:?\\s*(${CANTIDAD})([.,]5)?\\b`));
      const completos = cuantos(banos?.[1], 20);
      if (completos !== null) {
        candidatos.banosCompletos.push(completos);
        if (banos?.[2]) candidatos.mediosBanos.push(1);
      } else {
        // «Recámara principal con baño completo» es otro baño que el total
        // escrito no incluye: con eso, la cifra deja de ser de fiar.
        sueltos.banos++;
      }
    }

    // ── Metros: solo si el renglón dice de qué son ───────────────
    const iTerreno = r.search(/terreno|lote\b|superficie/);
    const iConstruccion = r.search(/construc|construido|constru\b|habitable/);
    if (iTerreno >= 0 || iConstruccion >= 0) {
      for (const encontrado of r.matchAll(METROS)) {
        const valor = montoDe(encontrado[1], { decimales: true });
        if (valor === null || valor > 1_000_000) continue;
        const posicion = encontrado.index ?? 0;
        const deTerreno =
          iConstruccion < 0 ||
          (iTerreno >= 0 && Math.abs(posicion - iTerreno) < Math.abs(posicion - iConstruccion));
        if (deTerreno) candidatos.m2Terreno.push(valor);
        else candidatos.m2Construccion.push(valor);
      }
    }

    // ── Estacionamientos ─────────────────────────────────────────
    if (/cochera|garage|garaje|estacionamiento|cajon|auto/.test(r)) {
      const encontrado =
        r.match(new RegExp(`(?:cochera|garage|garaje|estacionamiento)[^\\n]{0,24}?para\\s+(${CANTIDAD})`)) ??
        r.match(new RegExp(`(${CANTIDAD})\\s*(?:cajones|autos?|coches?|vehiculos?|carros?)`)) ??
        r.match(new RegExp(`(?:cocheras?|garages?|garajes?|estacionamientos?)\\s*:?\\s*(${CANTIDAD})\\b`));
      const n = cuantos(encontrado?.[1], 20);
      if (n !== null) candidatos.estacionamientos.push(n);
    }

    // ── Niveles ──────────────────────────────────────────────────
    if (!/ultimo|primer|segundo|tercer|cuarto piso/.test(r)) {
      const encontrado = r.match(new RegExp(`(${CANTIDAD})\\s*(?:niveles?|pisos?|plantas?)\\b`));
      const n = cuantos(encontrado?.[1], 10);
      if (n !== null) candidatos.niveles.push(n);
    }

    // ── Ubicación: el renglón del alfiler ────────────────────────
    if (datos.colonia === null) {
      let ubicacion: string | null = null;
      if (original.includes(ALFILER)) {
        ubicacion = original.split(ALFILER).slice(1).join(" ");
      } else {
        const encabezado = original.match(/^\s*(?:ubicacion|ubicaci[oó]n|zona|colonia|fraccionamiento)\s*:\s*(.+)$/i);
        if (encabezado) ubicacion = encabezado[1];
      }
      if (ubicacion) {
        const limpia = quitarEmojis(ubicacion)
          .replace(/^(?:ubicad[ao]s?\s+en|ubicacion|ubicaci[oó]n|en)\s+/i, "")
          .replace(/^[\s:.\-–—]+|[\s.,;:]+$/g, "")
          .slice(0, 120);
        // El renglón del alfiler mezcla la colonia con referencias y el estado:
        // «Salida al Aeropuerto | Plaza El Prado», «Av. Periodismo | Morelia, Michoacán».
        const partes = limpia
          .split(/\s*[,|]\s*/)
          .map((parte) => parte.trim())
          .filter((parte) => parte && /\p{L}/u.test(parte) && !ES_ESTADO.test(plano(parte)));

        if (partes.length >= 2) {
          const ultima = partes[partes.length - 1];
          if (ultima.length <= 40 && !ES_REFERENCIA.test(plano(ultima))) datos.ciudad ??= ultima;
        }
        // Una referencia («a dos cuadras de…») o una frase de folleto no son
        // una colonia: mejor dejarlo vacío que llenar el campo con eso.
        const colonia = partes
          .slice(0, partes.length >= 2 ? -1 : undefined)
          .find((parte) => parte.length <= 40 && !ES_REFERENCIA.test(plano(parte)));
        if (colonia) datos.colonia = colonia;
      }
    }
  }

  // Un dato solo se da por bueno si el texto no se contradice.
  datos.precio = unico(candidatos.precio);
  datos.precioRenta = unico(candidatos.precioRenta);
  // Con cuartos enumerados sueltos, la cifra escrita no es el total.
  datos.recamaras = sueltos.recamaras ? null : unico(candidatos.recamaras);
  datos.banosCompletos = sueltos.banos ? null : unico(candidatos.banosCompletos);
  datos.mediosBanos = unico(candidatos.mediosBanos);
  datos.estacionamientos = unico(candidatos.estacionamientos);
  datos.niveles = unico(candidatos.niveles);
  datos.m2Terreno = unico(candidatos.m2Terreno);
  datos.m2Construccion = unico(candidatos.m2Construccion);

  return datos;
}
