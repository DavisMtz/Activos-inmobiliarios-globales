/**
 * La INTENCIÓN de una búsqueda escrita como frase: «casa de 3 recámaras en
 * Altozano hasta 4 millones», «depa amueblado para rentar», «algo económico
 * para invertir». Es lo que se le pide al modelo de Workers AI y lo ÚNICO que
 * se le acepta de vuelta.
 *
 * El reparto de trabajo, que es lo que importa de este archivo:
 *
 * - **El modelo NO devuelve casas.** Devuelve filtros tipados: recámaras,
 *   precio, lugar… Nunca claves, nunca títulos, nunca «te recomiendo».
 * - **Lo que es vocabulario no se le pregunta.** Operación, tipo y orden los
 *   lee `shared/frase.ts` sin gastar, y mandan sobre lo que diga el modelo.
 * - **El lugar viaja como TEXTO**, tal como lo escribió la persona («altosano»),
 *   y lo corrige el código contra las colonias que existen de verdad
 *   (`shared/lugares.ts`). Así el modelo no puede inventar una colonia y el
 *   mensaje no carga con 125 nombres en cada consulta.
 * - **Nada de lo que contesta se cree.** `validarIntencion` está escrito a mano
 *   y exige que cada dato tenga de dónde salir EN LA FRASE: un modelo chico
 *   «completa» con gusto tres recámaras que nadie pidió.
 */

import type { Operacion, Orden, Tipo } from "./filtros";
import { DE_BANOS, DE_RECAMARAS, esDe, leerFrase, piezasDe, type Lectura } from "./frase";
import { erroresEntre } from "./parecido";

// ─── Lo que el modelo puede contestar ─────────────────────────────

export const MAXIMO_DE_PALABRAS = 3;
export const LARGO_MAXIMO_DE_PALABRA = 30;
export const LARGO_MAXIMO_DE_LUGAR = 60;
/** Más larga que esto no es una búsqueda: es alguien pegando un texto. */
export const LARGO_MAXIMO_DE_FRASE = 160;

export type Intencion = {
  operacion: Operacion | null;
  tipo: Tipo | null;
  /** Colonia, fraccionamiento o ciudad TAL COMO se escribió. La corrige `shared/lugares.ts`. */
  lugar: string | null;
  /** Mínimos, igual que los filtros: «3 recámaras» incluye las de 4. */
  recamaras: number | null;
  banos: number | null;
  /** Pesos mexicanos. */
  precioMin: number | null;
  precioMax: number | null;
  orden: Orden | null;
  /** Rasgos que se buscan en el texto de la ficha: «alberca», «una planta». */
  palabras: string[];
  /** La clave de una casa («AIG-0042»), si la frase la trae. */
  clave: string | null;
};

export const INTENCION_VACIA: Intencion = {
  operacion: null,
  tipo: null,
  lugar: null,
  recamaras: null,
  banos: null,
  precioMin: null,
  precioMax: null,
  orden: null,
  palabras: [],
  clave: null,
};

/**
 * El JSON Schema que se le pide al modelo. Es una AYUDA para que acierte más
 * veces, no una garantía: no todos los modelos lo respetan, y por eso manda
 * `validarIntencion`. Los campos van en el idioma del mensaje (`precio_max`).
 */
export const ESQUEMA_DE_INTENCION = {
  type: "object",
  properties: {
    lugar: { type: ["string", "null"] },
    recamaras: { type: ["integer", "null"] },
    banos: { type: ["integer", "null"] },
    precio_min: { type: ["integer", "null"] },
    precio_max: { type: ["integer", "null"] },
    palabras: { type: "array", items: { type: "string" } },
  },
  required: ["lugar", "recamaras", "banos", "precio_min", "precio_max", "palabras"],
} as const;

/**
 * Las instrucciones. Cortas a propósito —cada token del mensaje se paga en
 * cada consulta— y con ejemplos, que es lo que más sube el acierto de un modelo
 * chico. Se midieron con `npm run medir:ia` (PLAN §19); cambiarlas es volver a
 * medir, no un ajuste de redacción.
 */
export const INSTRUCCIONES = [
  "Eres el intérprete del buscador de una inmobiliaria de Morelia, México. De la frase de una persona sacas datos para filtrar propiedades.",
  "NO recomiendas ni inventas propiedades. Respondes SOLO un objeto JSON con estos campos; lo que la frase no diga va en null:",
  "- lugar: la colonia, fraccionamiento, avenida o ciudad que menciona, tal como la escribió, sin «en», «por» ni «cerca de».",
  "- recamaras y banos: el mínimo que pide, en entero. «cuartos» y «habitaciones» son recámaras.",
  "- precio_min y precio_max: pesos en entero. «3 millones» = 3000000, «2.5 mdp» = 2500000, «2 millones y medio» = 2500000, «3 millones 200 mil» = 3200000, «800 mil» = 800000, «15 mil» = 15000. «menos de», «hasta», «máximo», «que no pase de» y una cifra suelta van en precio_max; «más de», «desde», «mínimo» van en precio_min; «entre A y B» o «de A a B» llenan los dos. Metros, m2, pisos y autos NO son precios.",
  "- palabras: hasta 3 características que pide de la propiedad, CUALQUIERA que sea, para buscarlas en la descripción: alberca, jardín, estudio, elevador, cuarto de servicio, una planta, amueblado, roof garden, vista al lago, infonavit… En minúsculas. No pongas aquí el tipo de propiedad, la operación, el lugar ni las cifras. Si dice «sin» algo, no lo pongas. Si no pide ninguna: [].",
  "No deduzcas lo que no se dijo: «para familia grande» NO es un número de recámaras.",
  "Ejemplos:",
  "Frase: depa de 2 recamaras en renta por altosano que no pase de 15 mil",
  '{"lugar":"altosano","recamaras":2,"banos":null,"precio_min":null,"precio_max":15000,"palabras":[]}',
  "Frase: busco casa con alberca y cuarto de servicio entre 3 y 4.5 millones",
  '{"lugar":null,"recamaras":null,"banos":null,"precio_min":3000000,"precio_max":4500000,"palabras":["alberca","cuarto de servicio"]}',
  "Frase: terreno de 300 metros para invertir en patzcuaro",
  '{"lugar":"patzcuaro","recamaras":null,"banos":null,"precio_min":null,"precio_max":null,"palabras":[]}',
].join("\n");

/** Lo que se le manda como mensaje del usuario. */
export const mensajeDeFrase = (frase: string): string => `Frase: ${frase.replace(/\s+/g, " ").trim().slice(0, LARGO_MAXIMO_DE_FRASE)}`;

// ─── De dónde sale cada dato ──────────────────────────────────────

const EN_LETRA: Record<number, string[]> = {
  1: ["un", "una", "uno"],
  2: ["dos"],
  3: ["tres"],
  4: ["cuatro"],
  5: ["cinco"],
  6: ["seis"],
  7: ["siete"],
  8: ["ocho"],
  9: ["nueve"],
  10: ["diez"],
};

const PALABRAS_DE_CANTIDAD = new Set(
  "un una uno dos tres cuatro cinco seis siete ocho nueve diez once doce quince veinte treinta cuarenta cincuenta cien ciento medio media mil millon millones mdp k".split(" "),
);

/** ¿La frase trae alguna cantidad, en cifras o en letra? Sin eso, todo precio es inventado. */
export const traeCantidad = (piezas: string[]): boolean => piezas.some((p) => /^\d/.test(p) || PALABRAS_DE_CANTIDAD.has(p));

/** ¿Está ESTE número en la frase? «3», «tres». Es lo que corta las recámaras inventadas. */
const traeElNumero = (piezas: string[], n: number): boolean =>
  piezas.includes(String(n)) || (EN_LETRA[n] ?? []).some((palabra) => piezas.includes(palabra));

/**
 * ¿Sale de la frase? Cada palabra de `texto` (de 4 letras o más) tiene que
 * parecerse a alguna de la frase, o compartir raíz con ella: el modelo devuelve
 * «jardín» de «jardines», «amueblado» de «amueblada» y «altozano» de «altosano».
 */
function saleDeLaFrase(texto: string, piezas: string[]): boolean {
  const palabras = piezasDe(texto);
  const fuertes = palabras.filter((p) => p.length >= 4);
  const revisar = fuertes.length ? fuertes : palabras;
  if (!revisar.length) return false;
  return revisar.every((palabra) => {
    const raiz = palabra.replace(/(es|s|a|o)$/, "");
    return piezas.some((pieza) => erroresEntre(pieza, palabra) !== null || (raiz.length >= 4 && pieza.startsWith(raiz)));
  });
}

// ─── Validación ───────────────────────────────────────────────────

type Bolsa = Record<string, unknown>;

const esBolsa = (x: unknown): x is Bolsa => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Entero dentro de un rango, o null. Un modelo escribe «3,000,000»,
 * «$3000000» o «3000000.0» con toda naturalidad; «unos 3 millones», no.
 */
function entero(valor: unknown, minimo: number, maximo: number): number | null {
  let n = Number.NaN;
  if (typeof valor === "number") n = valor;
  else if (typeof valor === "string") {
    const limpio = valor.replace(/[\s,$]/g, "");
    if (/^\d+(\.\d+)?$/.test(limpio)) n = Number(limpio);
  }
  if (!Number.isFinite(n)) return null;
  const redondo = Math.round(n);
  return redondo >= minimo && redondo <= maximo ? redondo : null;
}

/** Lo que un modelo mete en `palabras` sin que sea un rasgo de la casa. */
const NO_SON_RASGOS = new Set(
  (
    "casa casas departamento departamentos depa terreno terrenos local oficina bodega edificio venta renta comprar rentar " +
    "barato barata economico economica grande amplia amplio nuevo nueva lujo inversion invertir recamara recamaras bano banos " +
    "millones pesos propiedad propiedades inmueble familia vivir"
  ).split(" "),
);

const DE_DINERO = new Set(["mil", "miles", "millon", "millones", "mdp", "pesos", "peso"]);

/** Lo que suena a lugar («en privada», «en el tercer piso») y es un rasgo de la casa. */
const RASGOS_QUE_PARECEN_LUGAR = /\b(privada|coto|cerrada|condominio|esquina|pisos?|planta|nivel|niveles)\b/;

/**
 * De la frase y de lo que haya contestado el modelo (o `null` si no se le
 * preguntó, o no contestó) a una `Intencion` en la que se puede confiar. Lo
 * que leyó `shared/frase.ts` manda; del modelo solo entra lo que la frase
 * sostiene. Devuelve null si no queda nada con qué filtrar, y entonces el
 * buscador de siempre sigue su camino.
 */
export function validarIntencion(crudo: unknown, frase: string, lectura: Lectura = leerFrase(frase)): Intencion | null {
  const modelo: Bolsa = esBolsa(crudo) ? crudo : {};
  const piezas = piezasDe(frase);
  const hayCantidad = traeCantidad(piezas);

  // Del modelo solo entran si la frase trae ESE número y además nombra las
  // recámaras (o los baños): el chico pone «banos: 3» al leer «3 recámaras».
  let recamaras = lectura.recamaras;
  if (recamaras === null && piezas.some((pieza) => esDe(pieza, DE_RECAMARAS))) {
    recamaras = entero(modelo.recamaras, 1, 10);
    if (recamaras !== null && !traeElNumero(piezas, recamaras)) recamaras = null;
  }
  let banos = lectura.banos;
  if (banos === null && piezas.some((pieza) => esDe(pieza, DE_BANOS))) {
    banos = entero(modelo.banos, 1, 10);
    if (banos !== null && !traeElNumero(piezas, banos)) banos = null;
  }

  let precioMin = hayCantidad ? entero(modelo.precio_min, 1_000, 2_000_000_000) : null;
  let precioMax = hayCantidad ? entero(modelo.precio_max, 1_000, 2_000_000_000) : null;
  if (precioMin !== null && precioMax !== null && precioMin > precioMax) [precioMin, precioMax] = [precioMax, precioMin];

  // El lugar y los rasgos solo pueden salir de lo que el vocabulario NO explicó:
  // «benta» ya se leyó como venta, no puede ser además una colonia.
  const libres = lectura.resto;
  let lugar = typeof modelo.lugar === "string" ? modelo.lugar.replace(/\s+/g, " ").trim().slice(0, LARGO_MAXIMO_DE_LUGAR) : "";
  if (lugar && !saleDeLaFrase(lugar, libres)) lugar = "";
  // «casa en privada»: es un rasgo de la casa, no una colonia.
  let rasgoDeLugar: string | null = null;
  if (lugar && RASGOS_QUE_PARECEN_LUGAR.test(piezasDe(lugar).join(" "))) {
    rasgoDeLugar = lugar.toLowerCase();
    lugar = "";
  }

  const sinEso = new Set(piezas.flatMap((pieza, i) => (pieza === "sin" && piezas[i + 1] ? [piezas[i + 1]!] : [])));
  // Primero los rasgos que ya leyó el vocabulario; después, los del modelo.
  const vistas = new Set<string>(lectura.rasgos.map((rasgo) => piezasDe(rasgo).join(" ")));
  const palabras: string[] = lectura.rasgos.slice(0, MAXIMO_DE_PALABRAS);
  const candidatas = [...(rasgoDeLugar ? [rasgoDeLugar] : []), ...(Array.isArray(modelo.palabras) ? modelo.palabras : [])];
  for (const valor of candidatas) {
    if (palabras.length >= MAXIMO_DE_PALABRAS) break;
    if (typeof valor !== "string") continue;
    const palabra = valor.replace(/\s+/g, " ").trim().toLowerCase().slice(0, LARGO_MAXIMO_DE_PALABRA);
    const partes = piezasDe(palabra);
    const llave = partes.join(" ");
    if (llave.length < 3 || vistas.has(llave) || !/[a-z]{3}/.test(llave)) continue;
    if (partes.every((parte) => NO_SON_RASGOS.has(parte))) continue;
    // «3 millones», «15 mil»: dinero, no un rasgo. («2 pisos» sí lo es.)
    if (partes.some((parte) => DE_DINERO.has(parte))) continue;
    if (partes.some((parte) => sinEso.has(parte))) continue;
    if (lugar && llave === piezasDe(lugar).join(" ")) continue;
    if (!saleDeLaFrase(palabra, libres)) continue;
    vistas.add(llave);
    palabras.push(palabra);
    if (palabras.length >= MAXIMO_DE_PALABRAS) break;
  }

  const intencion: Intencion = {
    operacion: lectura.operacion,
    tipo: lectura.tipo,
    lugar: lugar || null,
    recamaras,
    banos,
    precioMin,
    precioMax,
    orden: lectura.orden,
    palabras,
    clave: lectura.clave,
  };

  return dejaAlgo(intencion) ? intencion : null;
}

/** Una intención que no filtra ni ordena nada no es una intención. */
export const dejaAlgo = (i: Intencion): boolean =>
  i.operacion !== null ||
  i.tipo !== null ||
  i.lugar !== null ||
  i.recamaras !== null ||
  i.banos !== null ||
  i.precioMin !== null ||
  i.precioMax !== null ||
  i.orden !== null ||
  i.clave !== null ||
  i.palabras.length > 0;

/**
 * Saca el objeto JSON de lo que sea que haya contestado el modelo. Aunque se
 * pida `response_format`, uno chico lo envuelve a veces en ```json … ``` o le
 * antepone una frase amable (o su razonamiento entre <think>).
 */
export function extraerJson(texto: string): unknown {
  const limpio = texto
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  try {
    return JSON.parse(limpio);
  } catch {
    // Del primer «{» a la ÚLTIMA «}»: los objetos anidados dejan varias.
    const desde = limpio.indexOf("{");
    const hasta = limpio.lastIndexOf("}");
    if (desde < 0 || hasta <= desde) return null;
    try {
      return JSON.parse(limpio.slice(desde, hasta + 1));
    } catch {
      return null;
    }
  }
}
