/**
 * El dinero de una frase: «menos de 2 millones 251 mil», «entre 3 y 4.5 mdp»,
 * «15 mil al mes», «que no pase de 12000».
 *
 * Por qué no se le deja al modelo, medido el 20/09/2026 con el de fábrica:
 * **no sabe sumar** («menos de 2 millones 251 mil» volvió como $2,010,000) **ni
 * sigue la regla del papel** (a «casa de 2 millones y medio» le puso un MÍNIMO,
 * con las instrucciones diciendo que una cifra suelta es un tope). Un precio
 * equivocado esconde casas sin avisar, así que aquí el precio es entero del
 * código: el monto por aritmética y el papel por su comparador. Al modelo ni se
 * le pregunta.
 *
 * De paso, las búsquedas por precio más comunes ya no esperan a nadie: «casas
 * de menos de 2 millones» se lee entera sin preguntar.
 *
 * Este archivo no importa nada. Recibe las piezas de `piezasDe` (sin acentos,
 * en minúsculas, con las cifras enteras: «4.5», «3,500,000»).
 */

const EN_LETRA: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veinticinco: 25,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};

const UNIDADES: Record<string, number> = {
  mil: 1_000,
  k: 1_000,
  millon: 1_000_000,
  millones: 1_000_000,
  mdp: 1_000_000,
};

/** Lo que sigue a un número y dice que NO es dinero. */
const NO_ES_DINERO = new Set(["metros", "metro", "m", "mts", "mt", "m2", "mts2", "cuadrados", "hectareas", "hectarea", "ha", "km", "kilometros", "minutos", "min"]);

/** «3,500,000» → 3500000; «4.5» → 4.5; «1.500.000» → 1500000. Null si no es una cifra. */
export function cifraDe(pieza: string): number | null {
  if (!/^\d/.test(pieza)) return null;
  // Separadores de millar: grupos de tres.
  if (/^\d{1,3}(,\d{3})+$/.test(pieza)) return Number(pieza.replaceAll(",", ""));
  if (/^\d{1,3}(\.\d{3}){2,}$/.test(pieza)) return Number(pieza.replaceAll(".", ""));
  // Decimales, con punto o con coma.
  if (/^\d+[.,]\d{1,2}$/.test(pieza)) return Number(pieza.replace(",", "."));
  if (/^\d+$/.test(pieza)) return Number(pieza);
  // «3.500» suelto: en México el punto es decimal, pero nadie escribe tres decimales.
  if (/^\d{1,3}\.\d{3}$/.test(pieza)) return Number(pieza.replace(".", ""));
  return null;
}

/** Un número en la posición `i`, en cifras o en letra («treinta y cinco»). Devuelve cuántas piezas ocupa. */
function numeroEn(piezas: string[], i: number): { valor: number; largo: number } | null {
  const pieza = piezas[i];
  if (pieza === undefined) return null;
  const cifra = cifraDe(pieza);
  if (cifra !== null) return { valor: cifra, largo: 1 };
  const letra = EN_LETRA[pieza];
  if (letra === undefined) return null;
  // «treinta y cinco», «ciento veinte», «doscientos cincuenta».
  if (letra >= 20 && letra < 100 && piezas[i + 1] === "y") {
    const unidad = EN_LETRA[piezas[i + 2] ?? ""];
    if (unidad !== undefined && unidad < 10) return { valor: letra + unidad, largo: 3 };
  }
  if (letra >= 100) {
    const resto = numeroEn(piezas, i + 1);
    if (resto && resto.valor < 100 && cifraDe(piezas[i + 1] ?? "") === null) return { valor: letra + resto.valor, largo: 1 + resto.largo };
  }
  return { valor: letra, largo: 1 };
}

export type Cantidad = {
  valor: number;
  /** Las piezas que ocupa: [desde, hasta). */
  desde: number;
  hasta: number;
};

/**
 * Una cantidad de dinero que empieza en `i`, o null.
 * «2 millones 251 mil», «3 millones y medio», «4.5 mdp», «800 mil», «18 k»,
 * «medio millón», «millón y medio», «12000», «3,500,000».
 */
function cantidadEn(piezas: string[], i: number): Cantidad | null {
  // «medio millón», «millón y medio».
  if (/^medi[oa]$/.test(piezas[i] ?? "") && UNIDADES[piezas[i + 1] ?? ""] === 1_000_000) return { valor: 500_000, desde: i, hasta: i + 2 };
  if (UNIDADES[piezas[i] ?? ""] === 1_000_000 && piezas[i + 1] === "y" && /^medi[oa]$/.test(piezas[i + 2] ?? "")) {
    return { valor: 1_500_000, desde: i, hasta: i + 3 };
  }

  const numero = numeroEn(piezas, i);
  if (!numero) return null;
  let fin = i + numero.largo;
  const unidad = UNIDADES[piezas[fin] ?? ""];

  if (unidad === undefined) {
    // Una cifra suelta solo es dinero si es grande, no es un año y no mide nada.
    const esCifra = cifraDe(piezas[i] ?? "") !== null;
    if (!esCifra || numero.valor < 1_000 || NO_ES_DINERO.has(piezas[fin] ?? "")) return null;
    if (numero.valor >= 1_900 && numero.valor <= 2_100) return null;
    return { valor: Math.round(numero.valor), desde: i, hasta: fin };
  }

  fin++;
  let valor = numero.valor * unidad;

  if (unidad === 1_000_000) {
    // «3 millones y medio».
    if (piezas[fin] === "y" && /^medi[oa]$/.test(piezas[fin + 1] ?? "")) {
      valor += 500_000;
      fin += 2;
    } else {
      // «2 millones 251 mil», «3 millones con 200 mil».
      const salto = piezas[fin] === "con" || piezas[fin] === "y" ? 1 : 0;
      const miles = numeroEn(piezas, fin + salto);
      if (miles && miles.valor < 1_000 && UNIDADES[piezas[fin + salto + miles.largo] ?? ""] === 1_000) {
        valor += miles.valor * 1_000;
        fin += salto + miles.largo + 1;
      }
    }
  } else if (unidad === 1_000) {
    // «15 mil 500», «ocho mil quinientos».
    const cientos = numeroEn(piezas, fin);
    const sigue = piezas[fin + (cientos?.largo ?? 0)] ?? "";
    if (cientos && cientos.valor >= 100 && cientos.valor < 1_000 && UNIDADES[sigue] === undefined && !NO_ES_DINERO.has(sigue)) {
      valor += cientos.valor;
      fin += cientos.largo;
    }
  }

  return { valor: Math.round(valor), desde: i, hasta: fin };
}

/** Todas las cantidades de dinero de la frase, en orden. */
export function cantidadesDe(piezas: string[]): Cantidad[] {
  const cantidades: Cantidad[] = [];
  for (let i = 0; i < piezas.length; i++) {
    const cantidad = cantidadEn(piezas, i);
    if (!cantidad) continue;
    cantidades.push(cantidad);
    i = cantidad.hasta - 1;
  }

  // «entre 3 y 4.5 millones», «de 10 a 20 mil»: la unidad del segundo es también la del primero.
  for (const segunda of cantidades) {
    const conector = piezas[segunda.desde - 1];
    if (conector !== "y" && conector !== "a" && conector !== "o" && conector !== "hasta") continue;
    const i = segunda.desde - 2;
    const primero = cifraDe(piezas[i] ?? "") ?? EN_LETRA[piezas[i] ?? ""] ?? null;
    if (primero === null || primero >= 1_000 || cantidades.some((c) => i >= c.desde && i < c.hasta)) continue;
    const escala = segunda.valor >= 1_000_000 ? 1_000_000 : 1_000;
    if (primero * escala >= segunda.valor) continue;
    cantidades.push({ valor: Math.round(primero * escala), desde: i, hasta: i + 1 });
  }

  return cantidades.sort((a, b) => a.desde - b.desde);
}

const ES_TOPE = new Set(["hasta", "maximo", "max", "tope", "presupuesto", "menos", "menor", "abajo", "debajo", "pase", "rebase", "exceda", "pasar", "baje", "bajar"]);
const ES_MINIMO = new Set(["desde", "minimo", "min", "mas", "mayor", "arriba", "encima", "partir", "supere"]);
/** Entre el comparador y la cantidad puede ir esto: «hasta DE unos 3 millones», «presupuesto de $…». */
const PEGAMENTO = new Set(["de", "los", "las", "unos", "unas", "a", "que", "el", "la", "como", "por", "un", "precio"]);
/** Detrás de la cantidad: no dice nada nuevo. */
const COLA = new Set(["pesos", "peso", "mxn", "mn"]);

export type Dinero = {
  precioMin: number | null;
  precioMax: number | null;
  /** Hubo un comparador claro («menos de», «entre… y…»). Si no, el papel es una suposición (tope). */
  seguro: boolean;
  /** Todos los montos escritos: con estos se le exige al modelo que justifique los suyos. */
  montos: number[];
  /** Piezas de la frase que ya quedaron explicadas. */
  usadas: Set<number>;
  /** «15 mil al mes», «mensuales»: habla de una renta. */
  alMes: boolean;
};

/**
 * Lee los precios de una frase. Con una cantidad: tope, salvo que un comparador
 * diga que es un mínimo. Con dos: un rango. Con más, no se arriesga.
 */
export function leerDinero(piezas: string[]): Dinero {
  const cantidades = cantidadesDe(piezas);
  const dinero: Dinero = { precioMin: null, precioMax: null, seguro: false, montos: cantidades.map((c) => c.valor), usadas: new Set(), alMes: false };
  if (!cantidades.length || cantidades.length > 2) return dinero;

  const usar = (desde: number, hasta: number) => {
    for (let i = desde; i < hasta; i++) dinero.usadas.add(i);
  };

  /** El comparador que precede a una cantidad, saltando el pegamento; y desde dónde empieza. */
  const comparadorDe = (cantidad: Cantidad): { papel: "tope" | "minimo" | null; desde: number } => {
    let i = cantidad.desde - 1;
    while (i >= 0 && PEGAMENTO.has(piezas[i]!)) i--;
    const palabra = piezas[i] ?? "";
    if (ES_TOPE.has(palabra) || ES_MINIMO.has(palabra)) {
      let desde = i;
      // «que NO pase de», «por debajo de», «a partir de», «como máximo»: se llevan su arranque.
      while (desde > 0 && ["no", "que", "por", "a", "como", "de"].includes(piezas[desde - 1]!)) desde--;
      // «no más de 3 millones» es un tope; «no menos de 3», «que no baje de 3», un mínimo.
      // («que no pase de» y «que no rebase» ya son topes con su «no» puesto.)
      const negado = piezas.slice(desde, i).includes("no");
      const seVoltea = negado && ["mas", "mayor", "menos", "menor", "baje", "bajar"].includes(palabra);
      const base = ES_TOPE.has(palabra) ? "tope" : "minimo";
      const papel = seVoltea ? (base === "tope" ? "minimo" : "tope") : base;
      return { papel, desde };
    }
    return { papel: null, desde: cantidad.desde };
  };

  for (const cantidad of cantidades) {
    usar(cantidad.desde, cantidad.hasta);
    let fin = cantidad.hasta;
    // «2 millones DE pesos».
    if (piezas[fin] === "de" && COLA.has(piezas[fin + 1] ?? "")) dinero.usadas.add(fin++);
    while (COLA.has(piezas[fin] ?? "")) dinero.usadas.add(fin++);
    // «al mes», «por mes», «mensuales».
    if ((piezas[fin] === "al" || piezas[fin] === "por") && piezas[fin + 1] === "mes") {
      dinero.alMes = true;
      usar(fin, fin + 2);
    } else if (/^mensual(es)?$/.test(piezas[fin] ?? "")) {
      dinero.alMes = true;
      dinero.usadas.add(fin);
    }
  }

  if (cantidades.length === 2) {
    const [a, b] = cantidades as [Cantidad, Cantidad];
    // «entre A y B», «de A a B», «desde A hasta B»: lo que va antes de A y entre las dos es de la expresión.
    const antes = piezas[a.desde - 1] ?? "";
    const enMedio = piezas.slice(a.hasta, b.desde);
    const esRango = enMedio.length <= 2 && enMedio.every((p) => ["y", "a", "hasta", "o", "de", "los", "las"].includes(p));
    if (!esRango) {
      dinero.usadas.clear();
      return dinero;
    }
    usar(a.hasta, b.desde);
    if (["entre", "de", "desde"].includes(antes)) dinero.usadas.add(a.desde - 1);
    dinero.precioMin = Math.min(a.valor, b.valor);
    dinero.precioMax = Math.max(a.valor, b.valor);
    dinero.seguro = true;
    return dinero;
  }

  const [unica] = cantidades as [Cantidad];
  const { papel, desde } = comparadorDe(unica);
  if (papel) {
    usar(desde, unica.desde);
    dinero.seguro = true;
  } else {
    // «casa DE 3 millones», «POR 3 millones», «EN 3 millones»: el arranque se va con la cantidad.
    let i = unica.desde - 1;
    while (i >= 0 && ["de", "por", "en", "unos", "unas", "los", "como"].includes(piezas[i]!)) dinero.usadas.add(i--);
  }
  if (papel === "minimo") dinero.precioMin = unica.valor;
  else dinero.precioMax = unica.valor;
  return dinero;
}
