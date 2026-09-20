/**
 * Lo que el buscador necesita saber del catálogo para entender una frase: qué
 * lugares existen, qué palabras usan las casas y el texto de cada una. Sale de
 * UNA consulta (las casas visibles con su zona: 188 filas) y se queda en la
 * memoria del Worker un minuto.
 *
 * Por qué en memoria y no en D1 ni en KV: es un derivado barato de volver a
 * armar, lo usan solo las búsquedas con frase o con rasgos, y un minuto de
 * retraso en que una casa recién publicada aparezca al buscar «alberca» no le
 * importa a nadie. Si el Worker arranca en frío, se arma de nuevo y ya.
 */

import { ESTADOS_EN_LISTADO } from "../../shared/filtros";
import { piezasDe } from "../../shared/frase";
import { prepararLugares, type Lugares } from "../../shared/lugares";
import { textoComparable } from "../../shared/rasgos";

export type Corpus = {
  lugares: Lugares;
  /** Toda palabra (sin acentos) que aparece en un lugar o en el texto de una casa. */
  vocabulario: Set<string>;
  casas: { id: number; comparable: string }[];
};

const VIGENCIA_MS = 60_000;

let guardado: { corpus: Corpus; hasta: number } | null = null;

type Fila = {
  id: number;
  titulo: string;
  resumen: string | null;
  descripcion: string | null;
  colonia: string | null;
  ciudad: string | null;
};

export function armarCorpus(filas: Fila[]): Corpus {
  const vocabulario = new Set<string>();
  const casas = filas.map((fila) => {
    const comparable = textoComparable(fila.titulo, fila.resumen, fila.descripcion);
    for (const pieza of comparable.split(" ")) if (pieza.length >= 3) vocabulario.add(pieza);
    return { id: fila.id, comparable };
  });
  const lugares = prepararLugares(filas);
  for (const fila of filas) for (const pieza of piezasDe(`${fila.colonia ?? ""} ${fila.ciudad ?? ""}`)) vocabulario.add(pieza);
  return { lugares, vocabulario, casas };
}

export async function leerCorpus(db: D1Database): Promise<Corpus> {
  if (guardado && guardado.hasta > Date.now()) return guardado.corpus;
  const estados = ESTADOS_EN_LISTADO.map((e) => `'${e}'`).join(",");
  const { results } = await db
    .prepare(
      `SELECT p.id, p.titulo, p.resumen, p.descripcion, z.colonia, z.ciudad
         FROM propiedades p LEFT JOIN zonas z ON z.id = p.zona_id
        WHERE p.eliminada_en IS NULL AND p.estado IN (${estados})`,
    )
    .all<Fila>();
  const corpus = armarCorpus(results);
  guardado = { corpus, hasta: Date.now() + VIGENCIA_MS };
  return corpus;
}

/** Para las pruebas y para cuando el equipo guarda una casa: que el siguiente la vea ya. */
export function olvidarCorpus(): void {
  guardado = null;
}
