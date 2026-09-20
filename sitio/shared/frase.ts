/**
 * Leer una frase del buscador SIN modelo: la capa que no gasta.
 *
 * La mayoría de lo que la gente escribe no necesita inteligencia artificial,
 * necesita vocabulario: «casa altozano», «depa en renta», «terreno barato»,
 * «kasa en benta 3 rrecamaras». Aquí se reconoce eso —con los errores de dedo
 * y de oído perdonados por `shared/parecido.ts`— en microsegundos y gratis.
 * Al modelo (`shared/intencion.ts`) solo le llega lo que esta capa no pudo
 * explicar: precios, lugares escritos dentro de una frase larga y rasgos como
 * «con alberca».
 *
 * Y sirve dos veces: lo que aquí se reconoce es también con lo que se le
 * EXIGE al modelo que justifique su respuesta. Una operación, un tipo o un
 * orden que el modelo afirme y que ninguna palabra de la frase sostenga, se
 * tira: es la forma de que «casa en altozano» no acabe filtrando por «venta»
 * porque al modelo le pareció lo normal (medido: el modelo chico lo hacía en
 * 9 de 15 frases).
 */

import type { Operacion, Orden, Tipo } from "./filtros";
import { erroresEntre } from "./parecido";

// ─── Vocabulario ──────────────────────────────────────────────────

type Vocabulario<T extends string> = Record<T, readonly string[]>;

/** Ya aplanadas: sin acentos y en minúsculas. */
const DE_OPERACION: Vocabulario<Operacion> = {
  venta: ["venta", "ventas", "vender", "vendo", "venden", "compra", "comprar", "compro", "adquirir"],
  renta: ["renta", "rentas", "rentar", "rento", "rentan", "alquiler", "alquilar", "arrendar", "arrendamiento"],
};

export type TipoBuscable = Exclude<Tipo, "otro">;

const DE_TIPO: Vocabulario<TipoBuscable> = {
  casa: ["casa", "casas", "casita", "residencia", "residencias"],
  departamento: ["departamento", "departamentos", "depa", "depas", "depto", "deptos", "dpto", "apartamento", "apartamentos", "penthouse"],
  terreno: ["terreno", "terrenos", "lote", "lotes", "predio", "predios"],
  local: ["local", "locales"],
  oficina: ["oficina", "oficinas", "consultorio", "consultorios"],
  bodega: ["bodega", "bodegas", "nave", "naves"],
  edificio: ["edificio", "edificios"],
};

/** «Más recientes» no está: es el orden de siempre, pedirlo no cambia nada. */
export type OrdenPedido = Exclude<Orden, "recientes">;

const DE_ORDEN: Vocabulario<OrdenPedido> = {
  precio_asc: ["barato", "barata", "baratos", "baratas", "economico", "economica", "economicos", "economicas", "accesible", "accesibles"],
  precio_desc: ["lujo", "lujosa", "lujoso", "lujosas", "lujosos", "exclusiva", "exclusivo", "premium", "cara", "caras", "caro", "caros"],
  m2_desc: ["grande", "grandes", "amplia", "amplio", "amplias", "amplios", "espaciosa", "espacioso", "enorme", "enormes"],
};

/**
 * Los rasgos que más se piden, para no gastar una consulta al modelo en «casa
 * con alberca». La lista es corta a propósito: lo que no esté aquí («vista al
 * lago», «cerca del Tec») sí es trabajo del modelo. Cómo se buscan después, con
 * sus sinónimos, está en `shared/rasgos.ts`.
 */
const RASGOS_DE_VARIAS_PALABRAS: { piezas: string[]; rasgo: string }[] = Object.entries({
  "roof garden": "roof garden",
  "cuarto de servicio": "cuarto de servicio",
  "cuarto de lavado": "cuarto de lavado",
  "una sola planta": "una planta",
  "una planta": "una planta",
  "1 planta": "una planta",
  "un solo piso": "una planta",
  "un piso": "una planta",
  "1 piso": "una planta",
  "un solo nivel": "una planta",
  "un nivel": "una planta",
  "1 nivel": "una planta",
  "dos plantas": "dos plantas",
  "2 plantas": "dos plantas",
  "dos pisos": "dos plantas",
  "2 pisos": "dos plantas",
  "dos niveles": "dos plantas",
  "2 niveles": "dos plantas",
  "planta baja": "planta baja",
  "casa club": "casa club",
  "area verde": "área verde",
  "areas verdes": "área verde",
  "paneles solares": "paneles solares",
  "aire acondicionado": "aire acondicionado",
  "cocina integral": "cocina integral",
  "pet friendly": "mascotas",
}).map(([escrito, rasgo]) => ({ piezas: escrito.split(" "), rasgo }));

/** Sin acentos (como se comparan) → como se escriben (como se enseñan y se buscan). */
const RASGOS_DE_UNA_PALABRA: Record<string, string> = {
  alberca: "alberca",
  piscina: "alberca",
  jardin: "jardín",
  cochera: "cochera",
  garage: "cochera",
  garaje: "cochera",
  terraza: "terraza",
  roof: "roof garden",
  estudio: "estudio",
  elevador: "elevador",
  vigilancia: "vigilancia",
  seguridad: "vigilancia",
  amueblado: "amueblado",
  amueblada: "amueblada",
  amueblados: "amueblado",
  privada: "privada",
  coto: "coto",
  mascotas: "mascotas",
  gimnasio: "gimnasio",
  asador: "asador",
  sotano: "sótano",
  balcon: "balcón",
  patio: "patio",
  vestidor: "vestidor",
  jacuzzi: "jacuzzi",
  chimenea: "chimenea",
  cisterna: "cisterna",
  infonavit: "infonavit",
  fovissste: "fovissste",
};

export const DE_RECAMARAS = ["recamara", "recamaras", "rec", "recs", "habitacion", "habitaciones", "cuarto", "cuartos", "dormitorio", "dormitorios", "alcoba", "alcobas"];
export const DE_BANOS = ["bano", "banos"];

/**
 * Palabras que no dicen nada de la casa. Quitarlas es lo que deja ver si la
 * frase quedó explicada entera o si sobra algo para el modelo.
 */
const RELLENO = new Set(
  (
    "a al algo algun alguna algunas algunos ando asi aqui busca buscando buscar busco como cual de del donde el ella en era es esa ese eso " +
    "esta este esto estoy favor fracc fraccionamiento gracias hay hola inmueble inmuebles interesa interesan la las le les lo los me mi mis muy " +
    "necesito o para pero por porfa porfavor propiedad propiedades que quiero quisiera se ser si sobre son su sus te tenga tengan tengo tiene tienen " +
    "un una unas uno unos ver y ya zona colonia colonias col cerca cerquita rumbo lado con comercial lugar vivir familia avenida av calle"
  ).split(" "),
);

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
};

// ─── Piezas ───────────────────────────────────────────────────────

/**
 * La frase en piezas: palabras sin acentos y cantidades enteras («4.5»,
 * «3,500,000» y «3rec» → «3» + «rec»). Todo lo demás separa.
 */
export function piezasDe(frase: string): string[] {
  const plana = frase.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  return plana.match(/\d+(?:[.,]\d+)*|[a-z]+/g) ?? [];
}

const esCantidad = (pieza: string | undefined): boolean => pieza !== undefined && /^\d/.test(pieza);

// ─── Reconocer ────────────────────────────────────────────────────

/** Los valores del vocabulario que casan con la palabra. Exacta gana a parecida. */
function enVocabulario<T extends string>(palabra: string, vocabulario: Vocabulario<T>): T | null {
  let mejor: { valor: T; errores: number } | null = null;
  for (const [valor, formas] of Object.entries(vocabulario) as [T, readonly string[]][]) {
    for (const forma of formas) {
      const errores = erroresEntre(palabra, forma);
      if (errores === null) continue;
      if (errores === 0) return valor;
      if (!mejor || errores < mejor.errores) mejor = { valor, errores };
    }
  }
  return mejor?.valor ?? null;
}

export const esDe = (palabra: string, formas: readonly string[]): boolean =>
  EN_LETRA[palabra] === undefined && formas.some((forma) => erroresEntre(palabra, forma) !== null);

/** «AIG-0042», «aig 42», «aig0042» → «AIG-0042». Lo que la gente dicta por teléfono. */
export function claveEnFrase(frase: string): string | null {
  const hallada = /\baig\s*-?\s*(\d{1,4})\b/i.exec(frase);
  return hallada ? `AIG-${hallada[1]!.padStart(4, "0")}` : null;
}

export type Lectura = {
  operacion: Operacion | null;
  tipo: TipoBuscable | null;
  orden: OrdenPedido | null;
  recamaras: number | null;
  banos: number | null;
  clave: string | null;
  /** Rasgos conocidos, como se buscan: «alberca», «roof garden». */
  rasgos: string[];
  /**
   * Lo que quedó sin explicar, en orden y sin acentos: ni vocabulario, ni
   * relleno, ni cantidades entendidas. Vacío = la frase se leyó entera.
   */
  resto: string[];
};

/** Uno solo, o ninguno: «casa o departamento» no se puede pedir con un filtro, así que no filtra. */
const elUnico = <T>(hallados: Set<T>): T | null => (hallados.size === 1 ? [...hallados][0]! : null);

/**
 * Lee lo que se puede leer con vocabulario. No adivina precios ni lugares: eso
 * es `resto`, y decide si vale la pena preguntarle al modelo.
 */
export function leerFrase(frase: string): Lectura {
  const clave = claveEnFrase(frase);
  const piezas = piezasDe(frase);
  const usada = new Array<boolean>(piezas.length).fill(false);

  const operaciones = new Set<Operacion>();
  const tipos = new Set<TipoBuscable>();
  const ordenes = new Set<OrdenPedido>();
  const rasgos: string[] = [];
  let recamaras: number | null = null;
  let banos: number | null = null;

  // Lo que se pide que NO tenga («sin escaleras») no se puede filtrar: se
  // aparta para que nadie —ni esta capa ni el modelo— lo busque al revés.
  const negada = (i: number): boolean => piezas[i - 1] === "sin" || piezas[i - 1] === "ni";

  // Los rasgos de varias palabras van primero: «una planta» empieza con relleno
  // y «cuarto de servicio» parecería una recámara.
  for (let i = 0; i < piezas.length; i++) {
    const hallado = RASGOS_DE_VARIAS_PALABRAS.find((r) => r.piezas.every((palabra, j) => piezas[i + j] === palabra));
    if (!hallado) continue;
    if (!negada(i)) rasgos.push(hallado.rasgo);
    for (let j = 0; j < hallado.piezas.length; j++) usada[i + j] = true;
    i += hallado.piezas.length - 1;
  }

  // La clave, con sus cifras: «aig 42».
  if (clave) {
    piezas.forEach((pieza, i) => {
      if (pieza !== "aig") return;
      usada[i] = true;
      if (esCantidad(piezas[i + 1])) usada[i + 1] = true;
    });
  }

  // «3 recámaras», «tres cuartos», «2 baños y medio».
  piezas.forEach((pieza, i) => {
    if (usada[i]) return;
    const cantidad = /^\d{1,2}$/.test(pieza) ? Number(pieza) : EN_LETRA[pieza];
    const siguiente = piezas[i + 1];
    if (!cantidad || cantidad > 10 || !siguiente) return;
    if (esDe(siguiente, DE_RECAMARAS)) {
      // «un cuarto de servicio», «un cuarto de lavado»: no es una recámara.
      if (/^cuartos?$/.test(siguiente) && piezas[i + 2] === "de") return;
      recamaras ??= cantidad;
      usada[i] = usada[i + 1] = true;
    } else if (esDe(siguiente, DE_BANOS)) {
      banos ??= cantidad;
      usada[i] = usada[i + 1] = true;
      if (piezas[i + 2] === "y" && /^medi[oa]$/.test(piezas[i + 3] ?? "")) usada[i + 2] = usada[i + 3] = true;
    }
  });

  piezas.forEach((pieza, i) => {
    if (usada[i] || esCantidad(pieza)) return;
    if (RELLENO.has(pieza) || pieza === "sin" || pieza === "ni") {
      usada[i] = true;
      return;
    }
    if (negada(i)) {
      usada[i] = true;
      return;
    }
    const operacion = enVocabulario(pieza, DE_OPERACION);
    const tipo = operacion ? null : enVocabulario(pieza, DE_TIPO);
    // «casa con bodega»: la bodega es un rasgo de la casa, no otro tipo.
    if (tipo && tipos.size && !tipos.has(tipo) && ["con", "y"].includes(piezas[i - 1] ?? "")) {
      rasgos.push(pieza);
      usada[i] = true;
      return;
    }
    const orden = operacion || tipo ? null : enVocabulario(pieza, DE_ORDEN);
    if (operacion) operaciones.add(operacion);
    if (tipo) tipos.add(tipo);
    if (orden) ordenes.add(orden);
    if (operacion || tipo || orden) {
      usada[i] = true;
      return;
    }
    const rasgo = Object.keys(RASGOS_DE_UNA_PALABRA).find(
      (conocido) => erroresEntre(pieza, conocido) === 0 || pieza === `${conocido}s` || pieza === `${conocido}es`,
    );
    if (rasgo) {
      rasgos.push(RASGOS_DE_UNA_PALABRA[rasgo]!);
      usada[i] = true;
    }
  });

  // «la más grande», «lo más barato»: el «más» ya lo dijo el orden.
  piezas.forEach((pieza, i) => {
    if (!usada[i] && pieza === "mas" && usada[i + 1] && enVocabulario(piezas[i + 1]!, DE_ORDEN)) usada[i] = true;
  });

  return {
    operacion: elUnico(operaciones),
    tipo: elUnico(tipos),
    orden: elUnico(ordenes),
    recamaras,
    banos,
    clave,
    rasgos: [...new Set(rasgos)],
    resto: piezas.filter((_, i) => !usada[i]),
  };
}
