/**
 * Filtros del listado, siempre en la URL (PLAN §10.1). Un enlace con filtros
 * se puede compartir y Google lo puede leer; el sitio actual los guarda en
 * JavaScript y no se puede ni mandar por WhatsApp.
 *
 * Este archivo es la ÚNICA definición de qué se puede filtrar: lo leen el
 * loader del listado, la API pública y el formulario (que es un `GET` normal,
 * así que funciona sin JavaScript).
 */

import { LARGO_MINIMO_BUSQUEDA, patronBusqueda } from "./busqueda";

export const OPERACIONES = ["venta", "renta"] as const;
export type Operacion = (typeof OPERACIONES)[number];

export const TIPOS = [
  "casa",
  "departamento",
  "terreno",
  "local",
  "oficina",
  "bodega",
  "edificio",
  "otro",
] as const;
export type Tipo = (typeof TIPOS)[number];

export const ORDENES = ["recientes", "precio_asc", "precio_desc", "m2_desc"] as const;
export type Orden = (typeof ORDENES)[number];

export const ORDEN_PREDETERMINADO: Orden = "recientes";
export const POR_PAGINA = 12;

/** Estados que se muestran en el listado (PLAN §10.1: vendida y rentada no salen). */
export const ESTADOS_EN_LISTADO = ["publicada", "apartada"] as const;
/** Estados con ficha accesible por su URL, aunque ya no se ofrezcan. */
export const ESTADOS_CON_FICHA = ["publicada", "apartada", "vendida", "rentada"] as const;

export type Filtros = {
  operacion: Operacion | null;
  tipo: Tipo | null;
  /** Slug de la ciudad («morelia»); se resuelve contra el catálogo. */
  ciudad: string | null;
  /** Slug de la zona («morelia-altozano»), tal como está en `zonas.slug`. */
  zona: string | null;
  /** Texto libre: colonia, fraccionamiento, título o clave. */
  q: string | null;
  precioMin: number | null;
  precioMax: number | null;
  /** Mínimos, no exactos: «3 recámaras» incluye las de 4. */
  recamaras: number | null;
  banos: number | null;
  /**
   * Rasgos que se buscan en el texto de la ficha (`?con=alberca,una+planta`):
   * la casa tiene que traerlos todos. Ver `shared/rasgos.ts`.
   */
  rasgos: string[];
  orden: Orden;
  pagina: number;
};

export const FILTROS_VACIOS: Filtros = {
  operacion: null,
  tipo: null,
  ciudad: null,
  zona: null,
  q: null,
  precioMin: null,
  precioMax: null,
  recamaras: null,
  banos: null,
  rasgos: [],
  orden: ORDEN_PREDETERMINADO,
  pagina: 1,
};

// ─── Etiquetas para la interfaz ───────────────────────────────────

export const ETIQUETA_OPERACION: Record<Operacion, string> = {
  venta: "En venta",
  renta: "En renta",
};

export const ETIQUETA_TIPO: Record<Tipo, string> = {
  casa: "Casa",
  departamento: "Departamento",
  terreno: "Terreno",
  local: "Local",
  oficina: "Oficina",
  bodega: "Bodega",
  edificio: "Edificio",
  otro: "Otro",
};

export const ETIQUETA_TIPO_PLURAL: Record<Tipo, string> = {
  casa: "Casas",
  departamento: "Departamentos",
  terreno: "Terrenos",
  local: "Locales",
  oficina: "Oficinas",
  bodega: "Bodegas",
  edificio: "Edificios",
  otro: "Otros inmuebles",
};

export const ETIQUETA_ORDEN: Record<Orden, string> = {
  recientes: "Más recientes",
  precio_asc: "Precio: de menor a mayor",
  precio_desc: "Precio: de mayor a menor",
  m2_desc: "Más grandes",
};

/**
 * Una casa en `venta_renta` sale en las dos búsquedas, y su precio se compara
 * contra la columna de la operación que se está mirando.
 */
export const COLUMNA_PRECIO: Record<Operacion, "precio" | "precio_renta"> = {
  venta: "precio",
  renta: "precio_renta",
};

/** Sin operación elegida, los precios que se enseñan y se filtran son los de venta. */
export const columnaPrecio = (operacion: Operacion | null): "precio" | "precio_renta" =>
  operacion ? COLUMNA_PRECIO[operacion] : "precio";

// ─── URL → filtros ────────────────────────────────────────────────

const unoDe = <T extends string>(valor: string | null, permitidos: readonly T[]): T | null =>
  valor && (permitidos as readonly string[]).includes(valor) ? (valor as T) : null;

/** Cifras enteras y no negativas. Un «3.5» o un «abc» se ignoran, no rompen. */
function entero(valor: string | null, { maximo = Number.MAX_SAFE_INTEGER } = {}): number | null {
  if (!valor) return null;
  const limpio = valor.replace(/[\s,$]/g, "");
  if (!/^\d{1,12}$/.test(limpio)) return null;
  const n = Number(limpio);
  return n > maximo ? maximo : n;
}

// ─── Rasgos (`?con=alberca,una+planta`) ───────────────────────────
// Aquí solo se LEEN de la URL. Buscarlos en las fichas es cosa del servidor
// (`shared/rasgos.ts`): este archivo viaja al navegador y no debe cargar con
// ese vocabulario.

export const MAXIMO_DE_RASGOS = 3;
export const LARGO_MAXIMO_DE_RASGO = 30;

/** Un rasgo tal como llega de la URL o del modelo → limpio, o null si no sirve para buscar. */
export function limpiarRasgo(crudo: string): string | null {
  const texto = crudo.replace(/\s+/g, " ").trim().toLowerCase().slice(0, LARGO_MAXIMO_DE_RASGO).trim();
  return /\p{L}{3}/u.test(texto) ? texto : null;
}

/** Para no repetir «Alberca» y «alberca»: sin acentos ni signos. */
export const llaveDeRasgo = (rasgo: string): string =>
  (rasgo.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ");

/** De lo que venga (la URL, el modelo) a la lista: limpios, sin repetidos y hasta tres. */
export function rasgosUnicos(crudos: readonly string[]): string[] {
  const vistos = new Set<string>();
  const rasgos: string[] = [];
  for (const crudo of crudos) {
    const rasgo = limpiarRasgo(crudo);
    const llave = rasgo ? llaveDeRasgo(rasgo) : "";
    if (!rasgo || !llave || vistos.has(llave)) continue;
    vistos.add(llave);
    rasgos.push(rasgo);
    if (rasgos.length >= MAXIMO_DE_RASGOS) break;
  }
  return rasgos;
}

const leerRasgos = (valor: string | null): string[] => (valor ? rasgosUnicos(valor.split(",")) : []);

const slug = (valor: string | null): string | null => {
  if (!valor) return null;
  const limpio = valor.trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(limpio) ? limpio : null;
};

export function leerFiltros(parametros: URLSearchParams): Filtros {
  const operacion = unoDe(parametros.get("operacion"), OPERACIONES);

  let precioMin = entero(parametros.get("precio_min"));
  let precioMax = entero(parametros.get("precio_max"));
  // Al revés (de 5 a 1 millón) devolvería cero casas sin explicar por qué.
  if (precioMin !== null && precioMax !== null && precioMin > precioMax) {
    [precioMin, precioMax] = [precioMax, precioMin];
  }

  const textoQ = (parametros.get("q") ?? "").trim();

  return {
    operacion,
    tipo: unoDe(parametros.get("tipo"), TIPOS),
    ciudad: slug(parametros.get("ciudad")),
    zona: slug(parametros.get("zona")),
    // Si no da ni para un patrón, es como no haber escrito nada.
    q: patronBusqueda(textoQ) ? textoQ.replace(/\s+/g, " ") : null,
    precioMin,
    precioMax,
    recamaras: entero(parametros.get("recamaras"), { maximo: 20 }),
    banos: entero(parametros.get("banos"), { maximo: 20 }),
    rasgos: leerRasgos(parametros.get("con")),
    orden: unoDe(parametros.get("orden"), ORDENES) ?? ORDEN_PREDETERMINADO,
    pagina: Math.max(1, entero(parametros.get("pagina"), { maximo: 10_000 }) ?? 1),
  };
}

// ─── Filtros → URL ────────────────────────────────────────────────

/**
 * Solo lo que no es el valor por omisión: así la URL del listado sin filtros es
 * `/propiedades` a secas y no arrastra una cola de parámetros vacíos.
 */
export function aParametros(filtros: Partial<Filtros>): URLSearchParams {
  const p = new URLSearchParams();
  const poner = (nombre: string, valor: string | number | null | undefined) => {
    if (valor !== null && valor !== undefined && valor !== "") p.set(nombre, String(valor));
  };
  poner("operacion", filtros.operacion);
  poner("tipo", filtros.tipo);
  poner("ciudad", filtros.ciudad);
  poner("zona", filtros.zona);
  poner("q", filtros.q);
  poner("precio_min", filtros.precioMin);
  poner("precio_max", filtros.precioMax);
  poner("recamaras", filtros.recamaras);
  poner("banos", filtros.banos);
  if (filtros.rasgos?.length) poner("con", filtros.rasgos.join(","));
  if (filtros.orden && filtros.orden !== ORDEN_PREDETERMINADO) poner("orden", filtros.orden);
  if (filtros.pagina && filtros.pagina > 1) poner("pagina", filtros.pagina);
  return p;
}

/** `/propiedades?operacion=venta&tipo=casa`, listo para un `<a href>`. */
export function rutaDeListado(filtros: Partial<Filtros>, base = "/propiedades"): string {
  const p = aParametros(filtros).toString();
  return p ? `${base}?${p}` : base;
}

/** Cuántos filtros de contenido hay puestos (el orden y la página no cuentan). */
export function cuantosFiltros(filtros: Filtros): number {
  return [
    filtros.operacion,
    filtros.tipo,
    filtros.ciudad,
    filtros.zona,
    filtros.q,
    filtros.precioMin,
    filtros.precioMax,
    filtros.recamaras,
    filtros.banos,
    ...filtros.rasgos,
  ].filter((v) => v !== null).length;
}

export const hayFiltros = (filtros: Filtros): boolean => cuantosFiltros(filtros) > 0;

export { LARGO_MINIMO_BUSQUEDA, patronBusqueda };
