/**
 * Búsqueda por texto del listado (PLAN §10.1). El buscador tiene que encontrar
 * «Tres Marías» escribiendo «tres marias», porque 93 de las 123 zonas tienen
 * una sola casa y un desplegable con todas no sirve (PLAN §15, F2).
 *
 * Cómo se resuelve, y por qué así (medido contra D1 el 17/09/2026):
 *
 * 1. `LIKE` de SQLite **ya ignora mayúsculas y minúsculas en ASCII**, así que
 *    «tres» encuentra «Tres» sin hacer nada.
 * 2. Lo que `LIKE` no hace es quitar acentos. La letra que PUEDE venir
 *    acentuada se compara con `_`, que casa con cualquier carácter: «marias»
 *    se convierte en `m_r__s` y encuentra tanto «Marías» como «Marias».
 * 3. **D1 rechaza los patrones de más de ~50 caracteres** con «LIKE or GLOB
 *    pattern too complex». Por eso el patrón se corta, y por eso NO se usa un
 *    `GLOB` con una clase por letra (`[aáAÁ]`): el primer intento medía 75
 *    caracteres para «tres marias» y D1 lo rechazaba entero.
 *
 * Todo lo que no sea letra ni cifra se vuelve `%`, así «santa-fe» encuentra
 * «Santa Fe» y, de paso, ningún carácter del buscador llega crudo al patrón:
 * un `%` o un `_` escritos por una persona no se convierten en comodines
 * inesperados.
 *
 * Este archivo no importa nada: lo usan el Worker, el panel y los scripts.
 */

/** Letras que en estos textos pueden llegar acentuadas o con tilde. */
const ACENTUABLES = "aeiounc";

/** Menos de esto casaría con medio catálogo. */
export const LARGO_MINIMO_BUSQUEDA = 3;

/** El tope de D1 es ~50; se deja margen. */
export const LARGO_MAXIMO_PATRON = 48;

/** «Marías» → «marias»: la letra base, en minúscula y sin acento. */
function base(caracter: string): string {
  return caracter
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Patrón para `LIKE`. Devuelve null si lo escrito no da para buscar: muy
 * corto, o solo letras acentuables (`%___%` encontraría todo).
 */
export function patronBusqueda(texto: string): string | null {
  const partes: string[] = [];
  let utiles = 0;
  let literales = 0;
  let ultimoComodin = true; // el patrón empieza con `%`

  for (const caracter of texto.trim()) {
    // +1 por el `%` de apertura y +1 por el de cierre.
    if (partes.length + 2 >= LARGO_MAXIMO_PATRON) break;

    const letra = base(caracter);
    if (/^[a-z]$/.test(letra)) {
      const pieza = ACENTUABLES.includes(letra) ? "_" : letra;
      if (pieza !== "_") literales++;
      partes.push(pieza);
      utiles++;
      ultimoComodin = false;
    } else if (/^[0-9]$/.test(letra)) {
      partes.push(letra);
      literales++;
      utiles++;
      ultimoComodin = false;
    } else if (!ultimoComodin) {
      // Espacios, comas, puntos y guiones: cualquier cosa, o nada.
      partes.push("%");
      ultimoComodin = true;
    }
  }

  if (utiles < LARGO_MINIMO_BUSQUEDA || literales === 0) return null;
  return `%${partes.join("")}${ultimoComodin ? "" : "%"}`;
}
