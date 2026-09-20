/**
 * Los lugares que EXISTEN en el catálogo, y cómo reconocerlos en lo que
 * escribe una persona: «altosano», «tresmarias», «jesus monte».
 *
 * Por qué el lugar acaba en el texto del buscador (`q`) y no en el filtro de
 * colonia: el catálogo tiene la misma zona repartida en muchas colonias
 * —«Altozano», «Club de Golf Altozano», «Coto Mirlos, Altozano», «Jardines del
 * Valle, Altozano»…—. Quien escribe «altozano» quiere las 16 casas, no las 8
 * de la colonia que se llama exactamente así. Buscar por texto el nombre BIEN
 * escrito las trae todas; este archivo se encarga de lo de «bien escrito».
 *
 * Dos candados, los dos medidos contra las descripciones reales:
 *
 * - **Solo se corrige lo que no existe.** «cocina» se parece a «colina» (La
 *   Colina) tanto como «altosano» a «altozano»; la diferencia es que «cocina»
 *   es una palabra que el catálogo usa. Una palabra que aparece en los textos
 *   de las casas no se toca.
 * - **Una palabra suelta que también es un rasgo no es un lugar.** «jardín»,
 *   «terraza», «vista», «bosque» y «club» salen en nombres de colonias, pero
 *   quien escribe «casa con jardín» pide un jardín.
 */

import { piezasDe } from "./frase";
import { erroresEntre } from "./parecido";

/** No cuentan para comparar nombres: «Jesús del Monte» es «jesus monte». */
const CONECTORES = new Set(["de", "del", "la", "las", "los", "el", "y", "en"]);

/**
 * Palabras que salen en nombres de colonias pero que, SUELTAS, no nombran
 * ningún lugar. Acompañadas sí valen: «vista bella», «ciudad hidalgo».
 *
 * - Las que son un rasgo de la casa («jardín», «terraza», «vista») no valen
 *   solas nunca: quien escribe «casa con jardín» pide un jardín.
 * - Las genéricas («ciudad» de Ciudad Hidalgo, «san» de San Pedro) no valen como
 *   TROZO de un nombre más largo; si son el nombre entero («Obrera», «Unión»),
 *   sí. Medido: «casa con vista a la ciudad» acababa buscando en «Ciudad».
 */
const SON_RASGOS = new Set(
  "jardin jardines terraza terrazas vista vistas bosque bosques club golf privada privado torre torres paseo paseos real residencial condominio coto".split(" "),
);
const SON_GENERICAS = new Set(
  (
    "ciudad estado san santa santo valle loma lomas puerta rincon colinas colina union norte sur oriente poniente villa villas hacienda campo nuevo nueva " +
    "zona circuito popular obrera cosmos diamante sol cielo aves parque monte"
  ).split(" "),
);

export type NombreDeLugar = {
  /** Como se escribe: «Tres Marías». */
  escrito: string;
  /** Sin acentos ni conectores: [«tres», «marias»]. */
  piezas: string[];
};

export type Lugares = {
  nombres: NombreDeLugar[];
  /** Todas las piezas de todos los nombres: para saber si una palabra «es de lugar». */
  piezas: Set<string>;
};

const significativas = (texto: string): string[] => piezasDe(texto).filter((pieza) => !CONECTORES.has(pieza));

/**
 * De las colonias y ciudades del catálogo a nombres comparables. Una colonia
 * como «Lomalta, Tres Marías» son dos nombres, y los dos valen por separado.
 */
export function prepararLugares(filas: { colonia: string | null; ciudad: string | null }[]): Lugares {
  const vistos = new Map<string, NombreDeLugar>();
  const agregar = (escrito: string) => {
    const limpio = escrito.replace(/\s+/g, " ").trim();
    const piezas = significativas(limpio);
    if (!limpio || !piezas.length) return;
    const llave = piezas.join(" ");
    if (!vistos.has(llave)) vistos.set(llave, { escrito: limpio, piezas });
  };
  for (const fila of filas) {
    if (fila.ciudad) agregar(fila.ciudad);
    for (const parte of (fila.colonia ?? "").split(",")) agregar(parte);
  }
  const nombres = [...vistos.values()];
  return { nombres, piezas: new Set(nombres.flatMap((n) => n.piezas)) };
}

export type LugarHallado = {
  /** Como se escribe de verdad, para buscarlo y para enseñarlo: «Tres Marías». */
  escrito: string;
  /** Qué piezas de la frase ocupa: [desde, hasta). */
  desde: number;
  hasta: number;
  /** Hubo que corregir algo («altosano»). */
  corregido: boolean;
};

/** El tramo del nombre que casó, tal como se escribe: de «Club de Golf Altozano», «Club de Golf». */
function tramoEscrito(nombre: NombreDeLugar, desde: number, cuantas: number): string {
  if (desde === 0 && cuantas === nombre.piezas.length) return nombre.escrito;
  const palabras = nombre.escrito.split(" ");
  // Las piezas significativas, con la posición de su palabra original.
  const posiciones: number[] = [];
  palabras.forEach((palabra, i) => {
    const pieza = piezasDe(palabra)[0];
    if (pieza && !CONECTORES.has(pieza)) posiciones.push(i);
  });
  const primera = posiciones[desde];
  const ultima = posiciones[desde + cuantas - 1];
  if (primera === undefined || ultima === undefined) return nombre.escrito;
  return palabras
    .slice(primera, ultima + 1)
    .join(" ")
    .replace(/[,.;]+$/, "");
}

/**
 * El lugar más largo que aparece en las piezas de una frase, o null.
 *
 * `existe` dice si una palabra ya es del catálogo (de un nombre o de los textos
 * de las casas): solo lo que NO existe se corrige por parecido.
 */
export function buscarLugar(piezas: string[], lugares: Lugares, existe: (pieza: string) => boolean): LugarHallado | null {
  // Conectores fuera, pero recordando dónde estaba cada pieza en la frase.
  const utiles = piezas.map((pieza, i) => ({ pieza, i })).filter(({ pieza }) => !CONECTORES.has(pieza) && !/^\d/.test(pieza));
  if (!utiles.length) return null;

  const casa = (escrita: string, correcta: string): "igual" | "parecida" | null => {
    if (escrita === correcta) return "igual";
    // «marias»/«maria», «prados»/«prado»: el plural no es un error.
    if (escrita.length >= 4 && (escrita === `${correcta}s` || correcta === `${escrita}s`)) return "igual";
    if (existe(escrita)) return null;
    return erroresEntre(escrita, correcta) !== null ? "parecida" : null;
  };

  let mejor: (LugarHallado & { largo: number; exacto: boolean }) | null = null;

  for (const nombre of lugares.nombres) {
    for (let enNombre = 0; enNombre < nombre.piezas.length; enNombre++) {
      for (let enFrase = 0; enFrase < utiles.length; enFrase++) {
        let largo = 0;
        let corregido = false;
        while (enNombre + largo < nombre.piezas.length && enFrase + largo < utiles.length) {
          const como = casa(utiles[enFrase + largo]!.pieza, nombre.piezas[enNombre + largo]!);
          if (!como) break;
          if (como === "parecida") corregido = true;
          largo++;
        }
        if (!largo) continue;
        const completo = largo === nombre.piezas.length;
        // Una sola palabra que es un rasgo («jardín»), o un trozo genérico
        // («ciudad»), no es un lugar.
        const sola = nombre.piezas[enNombre]!;
        if (largo === 1 && (SON_RASGOS.has(sola) || (!completo && SON_GENERICAS.has(sola)))) continue;
        const gana =
          !mejor ||
          largo > mejor.largo ||
          // A igual largo, lo exacto gana a lo corregido y el nombre entero al trozo.
          (largo === mejor.largo && ((!corregido && mejor.corregido) || (corregido === mejor.corregido && completo && !mejor.exacto)));
        if (gana) {
          mejor = {
            escrito: tramoEscrito(nombre, enNombre, largo),
            desde: utiles[enFrase]!.i,
            hasta: utiles[enFrase + largo - 1]!.i + 1,
            corregido,
            largo,
            exacto: completo,
          };
        }
      }
    }
  }

  // «tresmarias», «elprado»: todo junto.
  if (!mejor) {
    for (const { pieza, i } of utiles) {
      if (pieza.length < 6 || existe(pieza)) continue;
      const nombre = lugares.nombres.find((n) => n.piezas.length > 1 && erroresEntre(pieza, n.piezas.join("")) !== null);
      if (nombre) return { escrito: nombre.escrito, desde: i, hasta: i + 1, corregido: true };
    }
    return null;
  }

  return { escrito: mejor.escrito, desde: mejor.desde, hasta: mejor.hasta, corregido: mejor.corregido };
}
