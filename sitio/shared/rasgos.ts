/**
 * Los RASGOS de una casa: lo que se pide con palabras y no con un filtro
 * («con alberca», «de una planta», «que tenga estudio»).
 *
 * El sitio anterior tenía 30 amenidades en el filtro y ninguna capturada en las
 * fichas: filtrar por ellas daba vacío (PLAN §10.1). Aquí no se captura nada
 * nuevo: se busca en lo que el equipo YA escribe —título, resumen y
 * descripción—, que es donde de verdad dice «alberca» (8 casas), «jardín» (79)
 * o «roof garden» (28).
 *
 * Se compara en JavaScript y no en SQL a propósito: `LIKE` no quita acentos, el
 * truco de `shared/busqueda.ts` (comparar con `_` cada vocal) da falsos
 * positivos en un texto largo («cochera» acaba casando con «hermosa»), y aquí
 * además se perdonan el plural, el género, los sinónimos y los errores de dedo.
 * Son 188 textos: cuesta microsegundos.
 *
 * Esto corre SOLO en el servidor. Lo que viaja en la URL (`?con=alberca`) lo lee
 * `shared/filtros.ts`, que sí llega al navegador y por eso no importa este
 * archivo: el vocabulario de aquí y de `shared/frase.ts` no es peso público.
 */

import { piezasDe } from "./frase";
import { erroresEntre } from "./parecido";

/**
 * Lo mismo dicho de otra forma. Todo va sin acentos, y cada forma se busca como
 * frase al inicio de palabra. Solo lo que de verdad se usa al describir una casa.
 */
const GRUPOS_DE_SINONIMOS: readonly (readonly string[])[] = [
  ["alberca", "piscina"],
  ["cochera", "garage", "garaje", "estacionamiento"],
  ["una planta", "un piso", "un nivel", "una sola planta", "un solo nivel", "un solo piso", "planta unica"],
  ["dos plantas", "dos pisos", "dos niveles", "2 plantas", "2 pisos", "2 niveles"],
  ["vigilancia", "seguridad", "caseta"],
  ["privada", "coto", "fraccionamiento cerrado", "acceso controlado"],
  ["roof garden", "roofgarden", "roof"],
  ["amueblad", "muebles"],
  ["mascota", "pet friendly"],
  ["elevador", "ascensor"],
  ["gimnasio", "gym"],
  ["cuarto de servicio", "cuarto servicio"],
  ["asador", "parrilla"],
  ["area verde", "areas verdes"],
];

/**
 * De cada forma a su grupo entero. Se arma al primer uso, no al cargar el archivo.
 */
let sinonimos: Map<string, readonly string[]> | null = null;
function sinonimosDe(llave: string): readonly string[] | undefined {
  if (!sinonimos) {
    sinonimos = new Map();
    for (const grupo of GRUPOS_DE_SINONIMOS) for (const forma of grupo) if (!sinonimos.has(forma)) sinonimos.set(forma, grupo);
  }
  return sinonimos.get(llave);
}

/** Género y número fuera: «amueblada», «amueblados» y «amueblado» son la misma raíz. */
const raizDe = (pieza: string): string => (pieza.length >= 5 ? pieza.replace(/(es|s|a|o)$/, "") : pieza);

/** El texto de una casa listo para comparar: piezas sin acentos, entre espacios. */
export const textoComparable = (...trozos: (string | null | undefined)[]): string =>
  ` ${piezasDe(trozos.filter(Boolean).join(" ")).join(" ")} `;

/**
 * Las formas de buscar un rasgo: él mismo y sus sinónimos. Cada una es un
 * patrón al INICIO de palabra, con la terminación libre pero SOLO la
 * terminación: de «plano» se busca «plan» + (o, a, os, as…), que encuentra
 * «planos» y no «planta». Buscar la raíz como prefijo a secas confundía las dos
 * (medido en las pruebas). A una palabra corta solo se le perdona el plural.
 */
function patronesDe(rasgo: string): RegExp[] {
  const piezas = piezasDe(rasgo);
  if (!piezas.length) return [];
  const llave = piezas.join(" ");
  const formas = sinonimosDe(llave) ?? sinonimosDe(raizDe(llave)) ?? [llave];
  return formas.map((forma) => {
    const palabras = forma.split(" ");
    const ultima = palabras[palabras.length - 1]!;
    const final = ultima.length >= 5 ? "(?:[aoe]s?|s)?" : "(?:s|es)?";
    return new RegExp(` ${[...palabras.slice(0, -1), raizDe(ultima)].join(" ")}${final} `);
  });
}

/** ¿El texto de la casa trae el rasgo, en alguna de sus formas? */
export function tieneElRasgo(comparable: string, patrones: RegExp[]): boolean {
  return patrones.some((patron) => patron.test(comparable));
}

/** ¿Alguna palabra del catálogo es esta misma, con otra terminación? */
const estaEnElCatalogo = (pieza: string, vocabulario: Set<string>): boolean => {
  if (vocabulario.has(pieza)) return true;
  const raiz = raizDe(pieza);
  return ["", "a", "o", "e", "s", "as", "os", "es"].some((final) => vocabulario.has(raiz + final));
};

/**
 * Los patrones con los que se va a buscar cada rasgo, corrigiendo el que esté
 * mal escrito: si «alverca» no aparece en NINGUNA casa y hay una palabra del
 * catálogo que se le parece, se busca esa.
 */
export function prepararRasgos(rasgos: string[], vocabulario: Set<string>): { rasgo: string; patrones: RegExp[] }[] {
  return rasgos.map((rasgo) => {
    const corregidas = piezasDe(rasgo).map((pieza) => {
      if (pieza.length < 5 || estaEnElCatalogo(pieza, vocabulario)) return pieza;
      let mejor: { palabra: string; errores: number } | null = null;
      for (const palabra of vocabulario) {
        const errores = erroresEntre(pieza, palabra);
        if (errores !== null && (!mejor || errores < mejor.errores)) mejor = { palabra, errores };
      }
      return mejor?.palabra ?? pieza;
    });
    return { rasgo, patrones: patronesDe(corregidas.join(" ")) };
  });
}

/** Las casas que traen TODOS los rasgos pedidos. */
export function casasConRasgos(
  casas: { id: number; comparable: string }[],
  rasgos: string[],
  vocabulario: Set<string>,
): number[] {
  const preparados = prepararRasgos(rasgos, vocabulario);
  return casas.filter((casa) => preparados.every(({ patrones }) => tieneElRasgo(casa.comparable, patrones))).map((casa) => casa.id);
}
