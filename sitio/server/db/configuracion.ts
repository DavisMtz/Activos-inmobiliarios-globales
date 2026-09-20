/**
 * Lectura de la tabla `configuracion` y de `servicios` (PLAN §6.3). Nada del
 * negocio vive en el código: teléfono, dirección, redes y todos los textos
 * salen de aquí y se editan desde el panel (F3).
 *
 * Cada clave guarda un JSON. Si una fila falta, viene rota o le falta un campo,
 * se devuelve el valor vacío y quien pinta lo oculta: el sitio nunca enseña
 * «undefined» ni se cae porque alguien guardó algo raro desde el panel.
 */

import { MODELO_DE_FABRICA, modeloValido } from "../ia/motor";

export type Contacto = {
  telefono: string;
  correo: string;
  direccion: string;
  horario: string;
};

export type WhatsAppConfig = {
  numero: string;
  plantillaPropiedad: string;
  plantillaGeneral: string;
};

export type Redes = { facebook: string; instagram: string };

export type Portada = {
  saludo: string;
  titular: string;
  lema: string;
  presentacion: string;
  introServicios: string;
  /** Clave de la casa cuya portada se usa de fondo (null = la más reciente). */
  imagenPropiedadClave: string | null;
};

export type Valor = { nombre: string; descripcion: string };

export type Nosotros = {
  historia: string;
  mision: string;
  /** Hoy vacía a propósito: en el sitio actual es copia de la misión (PLAN §6.3). */
  vision: string;
  valores: Valor[];
};

export type AvisoPrivacidad = {
  estado: string;
  advertencia: string;
  actualizado: string;
  texto: string;
};

/**
 * El buscador que entiende frases (PLAN §10.5). Sin fila, con el JSON dañado o
 * con cualquier cosa que no sea un `true` escrito a propósito, está APAGADO:
 * equivocarse hacia «no gastar» es lo barato.
 */
export type BusquedaIA = {
  activa: boolean;
  /** Uno de `MODELOS` (`server/ia/motor.ts`); vacío o desconocido = el de fábrica. */
  modelo: string;
  /** Consultas al modelo por día; al llegar, el buscador sigue sin él hasta mañana. */
  topeDiario: number;
};

export type Servicio = { id: number; titulo: string; descripcion: string; icono: string | null };

export type Pregunta = { id: number; pregunta: string; respuesta: string };

/** Lo que necesita el marco de TODAS las páginas públicas: pie y botón de WhatsApp. */
export type ConfigDelSitio = {
  contacto: Contacto;
  whatsapp: WhatsAppConfig;
  redes: Redes;
};

const CONTACTO_VACIO: Contacto = { telefono: "", correo: "", direccion: "", horario: "" };
const WHATSAPP_VACIO: WhatsAppConfig = { numero: "", plantillaPropiedad: "", plantillaGeneral: "" };
const REDES_VACIAS: Redes = { facebook: "", instagram: "" };
const PORTADA_VACIA: Portada = {
  saludo: "",
  titular: "",
  lema: "",
  presentacion: "",
  introServicios: "",
  imagenPropiedadClave: null,
};
export const TOPE_DIARIO_DE_FABRICA = 300;
export const TOPE_DIARIO_MAXIMO = 5_000;
const BUSQUEDA_IA_APAGADA: BusquedaIA = { activa: false, modelo: MODELO_DE_FABRICA, topeDiario: TOPE_DIARIO_DE_FABRICA };
const NOSOTROS_VACIO: Nosotros = { historia: "", mision: "", vision: "", valores: [] };
const AVISO_VACIO: AvisoPrivacidad = { estado: "", advertencia: "", actualizado: "", texto: "" };

// ─── Lectura tolerante del JSON guardado ──────────────────────────

type Bolsa = Record<string, unknown>;

const cadena = (bolsa: Bolsa, campo: string): string => {
  const valor = bolsa[campo];
  return typeof valor === "string" ? valor.trim() : "";
};

function bolsaDe(crudo: string | undefined): Bolsa {
  if (!crudo) return {};
  try {
    const valor = JSON.parse(crudo);
    return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Bolsa) : {};
  } catch {
    return {};
  }
}

const ARMADORES = {
  contacto: (b: Bolsa): Contacto => ({
    telefono: cadena(b, "telefono"),
    correo: cadena(b, "correo"),
    direccion: cadena(b, "direccion"),
    horario: cadena(b, "horario"),
  }),
  whatsapp: (b: Bolsa): WhatsAppConfig => ({
    numero: cadena(b, "numero"),
    plantillaPropiedad: cadena(b, "plantilla_propiedad"),
    plantillaGeneral: cadena(b, "plantilla_general"),
  }),
  redes: (b: Bolsa): Redes => ({ facebook: cadena(b, "facebook"), instagram: cadena(b, "instagram") }),
  portada: (b: Bolsa): Portada => ({
    saludo: cadena(b, "saludo"),
    titular: cadena(b, "titular"),
    lema: cadena(b, "lema"),
    presentacion: cadena(b, "presentacion"),
    introServicios: cadena(b, "intro_servicios"),
    imagenPropiedadClave: cadena(b, "imagen_propiedad_clave") || null,
  }),
  nosotros: (b: Bolsa): Nosotros => ({
    historia: cadena(b, "historia"),
    mision: cadena(b, "mision"),
    vision: cadena(b, "vision"),
    valores: Array.isArray(b.valores)
      ? (b.valores as Bolsa[])
          .filter((v) => v && typeof v === "object")
          .map((v) => ({ nombre: cadena(v, "nombre"), descripcion: cadena(v, "descripcion") }))
          .filter((v) => v.nombre)
      : [],
  }),
  aviso_privacidad: (b: Bolsa): AvisoPrivacidad => ({
    estado: cadena(b, "estado"),
    advertencia: cadena(b, "advertencia"),
    actualizado: cadena(b, "actualizado"),
    texto: cadena(b, "texto"),
  }),
  busqueda_ia: (b: Bolsa): BusquedaIA => {
    const tope = Number(b.tope_diario);
    return {
      activa: b.activa === true,
      modelo: modeloValido(b.modelo) ? b.modelo : MODELO_DE_FABRICA,
      // Un 0 escrito a propósito vale («hoy no se gasta»); lo ilegible, el de fábrica.
      topeDiario: Number.isInteger(tope) && tope >= 0 && tope <= TOPE_DIARIO_MAXIMO ? tope : TOPE_DIARIO_DE_FABRICA,
    };
  },
} as const;

export type ClaveConfig = keyof typeof ARMADORES;

export type Configuracion = {
  contacto: Contacto;
  whatsapp: WhatsAppConfig;
  redes: Redes;
  portada: Portada;
  nosotros: Nosotros;
  avisoPrivacidad: AvisoPrivacidad;
  busquedaIA: BusquedaIA;
};

const VACIA: Configuracion = {
  contacto: CONTACTO_VACIO,
  whatsapp: WHATSAPP_VACIO,
  redes: REDES_VACIAS,
  portada: PORTADA_VACIA,
  nosotros: NOSOTROS_VACIO,
  avisoPrivacidad: AVISO_VACIO,
  busquedaIA: BUSQUEDA_IA_APAGADA,
};

function armar(filas: { clave: string; valor: string }[]): Configuracion {
  const crudas = new Map(filas.map((f) => [f.clave, f.valor]));
  return {
    contacto: ARMADORES.contacto(bolsaDe(crudas.get("contacto"))),
    whatsapp: ARMADORES.whatsapp(bolsaDe(crudas.get("whatsapp"))),
    redes: ARMADORES.redes(bolsaDe(crudas.get("redes"))),
    portada: ARMADORES.portada(bolsaDe(crudas.get("portada"))),
    nosotros: ARMADORES.nosotros(bolsaDe(crudas.get("nosotros"))),
    avisoPrivacidad: ARMADORES.aviso_privacidad(bolsaDe(crudas.get("aviso_privacidad"))),
    busquedaIA: ARMADORES.busqueda_ia(bolsaDe(crudas.get("busqueda_ia"))),
  };
}

// ─── Consultas ────────────────────────────────────────────────────

/** Todas las claves de una vez: son 7 filas, no vale la pena pedirlas por separado. */
export async function leerConfiguracion(db: D1Database): Promise<Configuracion> {
  const { results } = await db.prepare("SELECT clave, valor FROM configuracion").all<{ clave: string; valor: string }>();
  return results.length ? armar(results) : VACIA;
}

/** Solo lo del pie y el botón de WhatsApp, que va en todas las páginas. */
export async function leerConfigDelSitio(db: D1Database): Promise<ConfigDelSitio> {
  const { results } = await db
    .prepare("SELECT clave, valor FROM configuracion WHERE clave IN ('contacto','whatsapp','redes')")
    .all<{ clave: string; valor: string }>();
  const completa = armar(results);
  return { contacto: completa.contacto, whatsapp: completa.whatsapp, redes: completa.redes };
}

/** Solo el interruptor del buscador: es lo único que el listado necesita de aquí. */
export async function leerBusquedaIA(db: D1Database): Promise<BusquedaIA> {
  const fila = await db.prepare("SELECT valor FROM configuracion WHERE clave = 'busqueda_ia'").first<{ valor: string }>();
  return ARMADORES.busqueda_ia(bolsaDe(fila?.valor));
}

export async function leerServicios(db: D1Database): Promise<Servicio[]> {
  const { results } = await db
    .prepare("SELECT id, titulo, descripcion, icono FROM servicios WHERE visible = 1 ORDER BY orden, id")
    .all<Servicio>();
  return results;
}

/** Las preguntas frecuentes visibles, en el orden que les dio el equipo en el panel. */
export async function leerPreguntas(db: D1Database): Promise<Pregunta[]> {
  const { results } = await db
    .prepare("SELECT id, pregunta, respuesta FROM preguntas WHERE visible = 1 ORDER BY orden, id")
    .all<Pregunta>();
  return results;
}

export { armar as armarConfiguracion, VACIA as CONFIGURACION_VACIA };
