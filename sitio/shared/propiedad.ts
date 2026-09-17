/**
 * Qué se puede editar de una casa, qué se exige para publicarla y qué le falta
 * (PLAN §11.2). ÚNICA definición de esas tres cosas: la usan el formulario del
 * panel (para avisar antes de guardar), la API del panel (que es la que decide)
 * y los avisos del inicio.
 *
 * Los números llegan como texto de un formulario o como número de un JSON, así
 * que todo entra por `unknown` y se limpia aquí. Un «$3,000,000» escrito a mano
 * vale; un «tres millones» no.
 */

import { TIPOS, type Tipo } from "./filtros";
import { slugificar } from "./texto";

// ─── Estados ──────────────────────────────────────────────────────

export const ESTADOS_PROPIEDAD = [
  "borrador",
  "revision",
  "publicada",
  "apartada",
  "vendida",
  "rentada",
  "pausada",
] as const;
export type EstadoPropiedad = (typeof ESTADOS_PROPIEDAD)[number];

export const ETIQUETA_ESTADO: Record<EstadoPropiedad, string> = {
  borrador: "Borrador",
  revision: "En revisión",
  publicada: "Publicada",
  apartada: "Apartada",
  vendida: "Vendida",
  rentada: "Rentada",
  pausada: "Pausada",
};

/** Lo que significa cada estado, en palabras del equipo y no del programa. */
export const EXPLICACION_ESTADO: Record<EstadoPropiedad, string> = {
  borrador: "Solo se ve aquí en el panel.",
  revision: "Lista para que la revisen y la publiquen.",
  publicada: "Se ve en el sitio y sale en las búsquedas.",
  apartada: "Se ve en el sitio con la franja «Apartada».",
  vendida: "Sale del listado; su página sigue abierta con la franja «Vendida».",
  rentada: "Sale del listado; su página sigue abierta con la franja «Rentada».",
  pausada: "Fuera del sitio, sin perder nada de lo capturado.",
};

/** Estados que decide quien publica (§9: «Publicar, despublicar y destacar»). */
export const ESTADOS_DE_PUBLICACION = ["borrador", "revision", "publicada", "pausada"] as const;
/** Estados del trato, que un asesor sí puede poner en sus casas (§9). */
export const ESTADOS_COMERCIALES = ["apartada", "vendida", "rentada"] as const;

export const esEstadoComercial = (estado: EstadoPropiedad): boolean =>
  (ESTADOS_COMERCIALES as readonly string[]).includes(estado);

// ─── Operación y condición ────────────────────────────────────────

/** Ojo: `filtros.OPERACIONES` es lo que se puede buscar (venta o renta). Una
 *  casa además puede estar en las dos a la vez. */
export const OPERACIONES_PROPIEDAD = ["venta", "renta", "venta_renta"] as const;
export type OperacionPropiedad = (typeof OPERACIONES_PROPIEDAD)[number];

export const ETIQUETA_OPERACION_PROPIEDAD: Record<OperacionPropiedad, string> = {
  venta: "En venta",
  renta: "En renta",
  venta_renta: "En venta o renta",
};

export const CONDICIONES = ["nueva", "preventa", "seminueva", "remodelada", "usada"] as const;
export type Condicion = (typeof CONDICIONES)[number];

export const ETIQUETA_CONDICION: Record<Condicion, string> = {
  nueva: "Nueva",
  preventa: "Preventa",
  seminueva: "Seminueva",
  remodelada: "Remodelada",
  usada: "Usada",
};

export const seVende = (operacion: OperacionPropiedad): boolean => operacion !== "renta";
export const seRenta = (operacion: OperacionPropiedad): boolean => operacion !== "venta";

// ─── Los campos que se editan ─────────────────────────────────────

export type CamposPropiedad = {
  titulo: string;
  operacion: OperacionPropiedad;
  tipo: Tipo;
  condicion: Condicion | null;
  precio: number | null;
  precioRenta: number | null;
  recamaras: number | null;
  banosCompletos: number | null;
  mediosBanos: number | null;
  estacionamientos: number | null;
  niveles: number | null;
  m2Terreno: number | null;
  m2Construccion: number | null;
  anioConstruccion: number | null;
  /** La zona se captura en palabras; el id de `zonas` lo resuelve el servidor. */
  ciudad: string;
  colonia: string | null;
  /** Solo el panel la ve: el sitio público nunca la pinta. */
  direccionPrivada: string | null;
  resumen: string | null;
  descripcion: string | null;
  videoUrl: string | null;
  destacada: boolean;
  asesorId: string | null;
};

export const LARGO_MAXIMO_RESUMEN = 160;
const LARGO_MAXIMO_DESCRIPCION = 20_000;

const TOPE: Record<string, number> = {
  precio: 2_000_000_000,
  recamaras: 50,
  banos: 50,
  mediosBanos: 20,
  estacionamientos: 50,
  niveles: 20,
  m2: 1_000_000,
};

// ─── Limpieza de lo que llega del formulario ──────────────────────

const texto = (valor: unknown, tope: number): string =>
  typeof valor === "string" || typeof valor === "number"
    ? String(valor).replace(/\s+/g, " ").trim().slice(0, tope)
    : "";

/** Conserva los renglones (una descripción es una lista) y limita el largo. */
const textoLargo = (valor: unknown, tope: number): string =>
  typeof valor === "string"
    ? valor
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((r) => r.replace(/[ \t]+/g, " ").trimEnd())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, tope)
    : "";

const vacio = (valor: unknown): boolean =>
  valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "");

type Numero = { ok: true; valor: number | null } | { ok: false };

/**
 * «$3,000,000», «3000000», «1,200.50» o 3000000 → número. Vacío → null.
 * Cualquier otra cosa («tres millones», «2 a 3») se rechaza en vez de
 * convertirse en un 2 silencioso.
 */
function numero(valor: unknown, { decimales = false, maximo = Number.MAX_SAFE_INTEGER } = {}): Numero {
  if (vacio(valor)) return { ok: true, valor: null };
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor < 0 || valor > maximo) return { ok: false };
    return { ok: true, valor: decimales ? Math.round(valor * 100) / 100 : Math.round(valor) };
  }
  if (typeof valor !== "string") return { ok: false };
  const limpio = valor.replace(/[\s$,]/g, "").replace(/(m2|m²|mxn|pesos)$/i, "");
  const patron = decimales ? /^\d{1,10}(\.\d{1,2})?$/ : /^\d{1,12}(\.0+)?$/;
  if (!patron.test(limpio)) return { ok: false };
  const n = Number(limpio);
  if (!Number.isFinite(n) || n > maximo) return { ok: false };
  return { ok: true, valor: decimales ? Math.round(n * 100) / 100 : Math.round(n) };
}

const unoDe = <T extends string>(valor: unknown, permitidos: readonly T[]): T | null =>
  typeof valor === "string" && (permitidos as readonly string[]).includes(valor) ? (valor as T) : null;

/** Una casilla marcada llega como "on", "1", "true" o true según quién la manda. */
const casilla = (valor: unknown): boolean =>
  valor === true || valor === 1 || valor === "1" || valor === "on" || valor === "true";

export type RevisionPropiedad =
  | { ok: true; valor: CamposPropiedad }
  | { ok: false; campo: string; mensaje: string };

const mal = (campo: string, mensaje: string): RevisionPropiedad => ({ ok: false, campo, mensaje });

const ANIO_MAXIMO = new Date().getFullYear() + 5;

/**
 * Revisa y limpia lo que llegó del formulario del panel. Lo que falta no es un
 * error (una casa se captura a medias y se sigue mañana): lo que falta sale en
 * `avisosDePropiedad` y lo que impide publicar, en `problemaAlPublicar`.
 */
export function revisarPropiedad(crudo: Record<string, unknown>): RevisionPropiedad {
  const titulo = texto(crudo.titulo, 140);
  if (titulo.length < 4) return mal("titulo", "Escribe un título de al menos 4 letras.");

  const operacion = unoDe(crudo.operacion, OPERACIONES_PROPIEDAD);
  if (!operacion) return mal("operacion", "Elige si se vende, se renta o las dos.");

  const tipo = unoDe(crudo.tipo, TIPOS);
  if (!tipo) return mal("tipo", "Elige el tipo de inmueble.");

  const condicion = vacio(crudo.condicion) ? null : unoDe(crudo.condicion, CONDICIONES);
  if (!vacio(crudo.condicion) && !condicion) return mal("condicion", "Esa condición no está en la lista.");

  const ciudad = texto(crudo.ciudad, 60);
  if (ciudad.length < 3) return mal("ciudad", "Escribe la ciudad (por ejemplo, Morelia).");
  const colonia = texto(crudo.colonia, 80) || null;

  const numeros: [keyof CamposPropiedad, unknown, { decimales?: boolean; maximo: number }, string, string][] = [
    ["precio", crudo.precio, { maximo: TOPE.precio }, "precio", "Revisa el precio de venta: solo cifras."],
    ["precioRenta", crudo.precio_renta ?? crudo.precioRenta, { maximo: TOPE.precio }, "precio_renta", "Revisa la renta mensual: solo cifras."],
    ["recamaras", crudo.recamaras, { maximo: TOPE.recamaras }, "recamaras", "Las recámaras van en cifras."],
    ["banosCompletos", crudo.banos_completos ?? crudo.banosCompletos, { maximo: TOPE.banos }, "banos_completos", "Los baños completos van en cifras."],
    ["mediosBanos", crudo.medios_banos ?? crudo.mediosBanos, { maximo: TOPE.mediosBanos }, "medios_banos", "Los medios baños van en cifras."],
    ["estacionamientos", crudo.estacionamientos, { maximo: TOPE.estacionamientos }, "estacionamientos", "Los estacionamientos van en cifras."],
    ["niveles", crudo.niveles, { maximo: TOPE.niveles }, "niveles", "Los niveles van en cifras."],
    ["m2Terreno", crudo.m2_terreno ?? crudo.m2Terreno, { decimales: true, maximo: TOPE.m2 }, "m2_terreno", "Los metros de terreno van en cifras."],
    ["m2Construccion", crudo.m2_construccion ?? crudo.m2Construccion, { decimales: true, maximo: TOPE.m2 }, "m2_construccion", "Los metros de construcción van en cifras."],
  ];

  const valores: Partial<Record<keyof CamposPropiedad, number | null>> = {};
  for (const [campo, crudoValor, opciones, nombre, mensaje] of numeros) {
    const leido = numero(crudoValor, opciones);
    if (!leido.ok) return mal(nombre, mensaje);
    valores[campo] = leido.valor;
  }

  const anio = numero(crudo.anio_construccion ?? crudo.anioConstruccion, { maximo: ANIO_MAXIMO });
  if (!anio.ok || (anio.valor !== null && anio.valor < 1900)) {
    return mal("anio_construccion", `El año de construcción va entre 1900 y ${ANIO_MAXIMO}.`);
  }

  const videoUrl = texto(crudo.video_url ?? crudo.videoUrl, 300) || null;
  if (videoUrl && !/^https:\/\/[^\s/]+\.[^\s/]+\//.test(`${videoUrl}/`)) {
    return mal("video_url", "El enlace del video tiene que empezar con https://");
  }

  const resumen = texto(crudo.resumen, LARGO_MAXIMO_RESUMEN + 1);
  if (resumen.length > LARGO_MAXIMO_RESUMEN) {
    return mal("resumen", `El resumen no puede pasar de ${LARGO_MAXIMO_RESUMEN} caracteres.`);
  }

  const asesorCrudo = texto(crudo.asesor_id ?? crudo.asesorId, 40);
  if (asesorCrudo && !/^[0-9a-fA-F-]{10,40}$/.test(asesorCrudo)) {
    return mal("asesor_id", "Ese asesor no existe.");
  }

  return {
    ok: true,
    valor: {
      titulo,
      operacion,
      tipo,
      condicion,
      precio: valores.precio ?? null,
      precioRenta: valores.precioRenta ?? null,
      recamaras: valores.recamaras ?? null,
      banosCompletos: valores.banosCompletos ?? null,
      mediosBanos: valores.mediosBanos ?? null,
      estacionamientos: valores.estacionamientos ?? null,
      niveles: valores.niveles ?? null,
      m2Terreno: valores.m2Terreno ?? null,
      m2Construccion: valores.m2Construccion ?? null,
      anioConstruccion: anio.valor,
      ciudad,
      colonia,
      direccionPrivada: texto(crudo.direccion_privada ?? crudo.direccionPrivada, 200) || null,
      resumen: resumen || null,
      descripcion: textoLargo(crudo.descripcion, LARGO_MAXIMO_DESCRIPCION) || null,
      videoUrl,
      destacada: casilla(crudo.destacada),
      asesorId: asesorCrudo || null,
    },
  };
}

// ─── Avisos: qué le falta a una casa ──────────────────────────────

export type Aviso = { clave: string; texto: string; impidePublicar: boolean };

/** Lo que hace falta para pintar una casa en el sitio, además de los campos. */
export type ContextoDeAvisos = {
  operacion: OperacionPropiedad;
  tipo: Tipo;
  precio: number | null;
  precioRenta: number | null;
  recamaras: number | null;
  banosCompletos: number | null;
  m2Terreno: number | null;
  m2Construccion: number | null;
  resumen: string | null;
  descripcion: string | null;
  colonia: string | null;
  asesorId: string | null;
  /** Cuántas fotos tiene cargadas. */
  fotos: number;
  /** JSON que dejó la siembra: ["colonia adivinada", …] (PLAN §14). */
  revisar: string | null;
};

const CON_RECAMARAS: readonly Tipo[] = ["casa", "departamento"];

/** Los avisos de la migración, tal como los guardó la siembra. */
function avisosGuardados(revisar: string | null): string[] {
  if (!revisar) return [];
  try {
    const valor = JSON.parse(revisar);
    return Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Qué le falta a la casa. Los que `impidePublicar` son los que el sitio
 * necesita para no enseñar un hueco: precio de lo que se ofrece, zona y foto.
 */
export function avisosDePropiedad(p: ContextoDeAvisos): Aviso[] {
  const avisos: Aviso[] = [];
  const aviso = (clave: string, texto: string, impidePublicar = false) =>
    avisos.push({ clave, texto, impidePublicar });

  if (seVende(p.operacion) && p.precio === null) aviso("precio", "Falta el precio de venta.", true);
  if (seRenta(p.operacion) && p.precioRenta === null) aviso("precio_renta", "Falta la renta mensual.", true);
  if (p.fotos === 0) aviso("fotos", "No tiene ninguna foto.", true);
  if (!p.colonia) aviso("colonia", "Falta la colonia o el fraccionamiento.", true);
  if (!p.resumen) aviso("resumen", "Sin resumen: es lo que se lee en la tarjeta y en Google.");
  if (!p.descripcion) aviso("descripcion", "Sin descripción.");
  if (CON_RECAMARAS.includes(p.tipo)) {
    if (p.recamaras === null) aviso("recamaras", "Faltan las recámaras.");
    if (p.banosCompletos === null) aviso("banos", "Faltan los baños.");
  }
  if (p.m2Terreno === null && p.m2Construccion === null) aviso("m2", "Faltan los metros cuadrados.");
  if (!p.asesorId) aviso("asesor", "Sin asesor asignado.");

  for (const guardado of avisosGuardados(p.revisar)) {
    aviso(`migracion:${slugificar(guardado).slice(0, 40)}`, guardado);
  }
  return avisos;
}

/** Null si se puede publicar; si no, el primer motivo, para decirlo en el botón. */
export function problemaAlPublicar(p: ContextoDeAvisos): string | null {
  const impide = avisosDePropiedad(p).filter((a) => a.impidePublicar);
  if (!impide.length) return null;
  return impide.length === 1
    ? impide[0].texto
    : `Para publicarla falta: ${impide.map((a) => a.texto.replace(/^(Falta|No tiene|Sin) /, "").replace(/\.$/, "")).join(", ")}.`;
}

// ─── Estado y dirección ───────────────────────────────────────────

/**
 * Lo que un asesor sube espera revisión (§9). Si la casa YA se publicó alguna
 * vez, editarla no la baja del sitio: el cambio se aplica y queda en la
 * bitácora.
 */
export function estadoTrasEditar(
  estado: EstadoPropiedad,
  { yaSePublico, puedePublicar }: { yaSePublico: boolean; puedePublicar: boolean },
): EstadoPropiedad {
  if (puedePublicar || yaSePublico) return estado;
  return estado === "borrador" ? "revision" : estado;
}

/** «Casa en El Prado» → «casa-en-el-prado». Vacío si el título no deja nada. */
export const slugDeTitulo = (titulo: string): string => slugificar(titulo);

/**
 * La dirección de una casa NO cambia cuando le corrigen el título: es una URL
 * que ya puede estar en WhatsApp o en Google. Solo se recalcula mientras la
 * casa nunca se haya publicado y no venga del sitio viejo.
 */
export const puedeCambiarElSlug = ({
  yaSePublico,
  vieneDeWordpress,
}: {
  yaSePublico: boolean;
  vieneDeWordpress: boolean;
}): boolean => !yaSePublico && !vieneDeWordpress;
