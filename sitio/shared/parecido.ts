/**
 * Palabras que «se parecen»: lo que deja que «altosano» encuentre Altozano,
 * «benta» sea venta y «departamneto» sea departamento. Lo usan las dos capas
 * del buscador —la que no gasta (`shared/frase.ts`) y la que revisa lo que
 * contesta el modelo (`shared/intencion.ts`)—, así que un error de dedo se
 * perdona igual con la IA encendida que apagada.
 *
 * Dos pasos, los dos baratos (125 colonias × unas cuantas palabras por frase):
 *
 * 1. **Cómo suena.** Los errores al escribir en español casi nunca son de
 *    dedo: son de oído. `s/z/c`, `b/v`, la `h` muda, `k/c/qu`, `ll/y`, `g/j` y
 *    la letra doblada. `comoSuena` los iguala ANTES de comparar, y con eso
 *    «altosano» y «Altozano» ya son la misma palabra, sin gastar tolerancia.
 * 2. **Cuánto se parecen.** Sobre eso, distancia de edición con trasposición
 *    («departamneto»), con un tope que depende del largo: a una palabra de
 *    cuatro letras no se le perdona nada —«casa» y «cava» son cosas
 *    distintas—, y a una de ocho, dos.
 *
 * Este archivo no importa nada.
 */

/** «Tres  Marías, #4» → «tres marias 4»: minúsculas, sin acentos, solo letras y cifras. */
export function aplanar(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * La palabra como suena en el español de México. No es fonética de verdad:
 * es la lista de confusiones que la gente comete al escribir, y nada más.
 * Recibe UNA palabra ya aplanada.
 */
export function comoSuena(palabra: string): string {
  return (
    palabra
      // La «ch» es un sonido propio: se aparta para que no la toquen la «c» ni la «h».
      .replace(/ch/g, "#")
      .replace(/ll/g, "y")
      .replace(/qu(?=[ei])/g, "k")
      .replace(/gu(?=[ei])/g, "g")
      .replace(/g(?=[ei])/g, "j")
      .replace(/c(?=[ei])/g, "s")
      .replace(/c/g, "k")
      .replace(/z/g, "s")
      .replace(/x(?=[aeiou])/g, "j")
      .replace(/v/g, "b")
      .replace(/h/g, "")
      .replace(/#/g, "ch")
      // Letra doblada: «rrecamaras», «cassa».
      .replace(/([a-z])\1+/g, "$1")
  );
}

/** Cuántos errores se le perdonan a una palabra, según su largo. */
export const erroresPerdonados = (largo: number): number => (largo >= 8 ? 2 : largo >= 5 ? 1 : 0);

/**
 * Distancia de edición con trasposición de letras vecinas (Damerau, en su
 * variante de «alineación óptima»). Con `tope`: en cuanto es seguro que se
 * pasa, devuelve `tope + 1` y deja de contar.
 */
export function distancia(a: string, b: string, tope = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  if (!a.length || !b.length) return Math.max(a.length, b.length);

  let anteanterior: number[] = [];
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    let minimo = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let valor = Math.min(anterior[j]! + 1, actual[j - 1]! + 1, anterior[j - 1]! + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        valor = Math.min(valor, anteanterior[j - 2]! + 1);
      }
      actual.push(valor);
      if (valor < minimo) minimo = valor;
    }
    if (minimo > tope) return tope + 1;
    anteanterior = anterior;
    anterior = actual;
  }
  return anterior[b.length]!;
}

/**
 * ¿Son la misma palabra, mal escrita? Compara cómo suenan y perdona según el
 * largo de la más corta. Devuelve los errores que hubo, o null si no se parecen:
 * así quien compara contra muchas candidatas puede quedarse con la más cercana.
 */
export function erroresEntre(escrita: string, correcta: string): number | null {
  const [a, b] = [comoSuena(escrita), comoSuena(correcta)];
  if (a === b) return 0;
  const perdonados = erroresPerdonados(Math.min(a.length, b.length));
  if (!perdonados) return null;
  // La primera letra casi nunca se equivoca, y exigirla descarta la mayoría de
  // los parecidos casuales («renta»/«venta» suenan casi igual y son lo contrario).
  if (a[0] !== b[0]) return null;
  const d = distancia(a, b, perdonados);
  return d <= perdonados ? d : null;
}

export const seParecen = (escrita: string, correcta: string): boolean => erroresEntre(escrita, correcta) !== null;
