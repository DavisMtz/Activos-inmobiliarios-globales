/**
 * Entregas: el comentario y las fotos del cliente al recibir su casa (F5).
 *
 * ÚNICA definición de las reglas que comparten la página del cliente, el panel
 * y el sitio: cómo se arma el nombre que se publica, qué dice el permiso que
 * se le pide y qué cuenta como una respuesta válida.
 *
 * El diseño lo decidió el usuario el 19/09/2026: el cliente contesta desde un
 * enlace personal, da DOS permisos por separado (comentario y fotos) y sale
 * publicado con su nombre y la inicial del apellido. Nada se publica hasta que
 * el equipo lo aprueba.
 */

export const ESTADOS_ENTREGA = ["invitado", "respondido", "aprobado", "oculto"] as const;
export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number];

export const ETIQUETA_ESTADO_ENTREGA: Record<EstadoEntrega, string> = {
  invitado: "Esperando al cliente",
  respondido: "Por revisar",
  aprobado: "Publicada",
  oculto: "Oculta",
};

/** Cuánto vive el enlace que se le manda al cliente. */
export const DIAS_DEL_ENLACE = 30;
/** Las que puede agregar el cliente, además de las del equipo. */
export const FOTOS_DEL_CLIENTE = 6;
/** Las que puede subir el equipo a una entrega. */
export const FOTOS_DEL_EQUIPO = 10;

export const TOPE_COMENTARIO = 600;
const TOPE_NOMBRE = 40;

/**
 * La versión del texto del permiso que vio el cliente. Se guarda con cada
 * respuesta: si el texto cambia, las respuestas viejas siguen diciendo qué
 * aceptaron exactamente. Cambiar un texto de abajo = cambiar esta fecha.
 */
export const VERSION_CONSENTIMIENTO = "2026-09-19";

export const PERMISO_COMENTARIO =
  "Autorizo que publiquen mi comentario en su sitio web, con mi nombre y la inicial de mi apellido.";
export const PERMISO_FOTOS =
  "Autorizo que publiquen las fotos de mi entrega en su sitio web. Si en ellas aparecen menores de edad, confirmo que soy su madre, padre o tutor.";
export const PUEDE_RETIRARLO =
  "Puedes pedirnos que lo retiremos cuando quieras, con un mensaje por WhatsApp.";

const limpio = (valor: unknown, tope: number): string =>
  typeof valor === "string" ? valor.replace(/\s+/g, " ").trim().slice(0, tope) : "";

/** «laura ELENA» → «Laura Elena». Respeta los acentos y las partículas cortas. */
function comoNombre(texto: string): string {
  return texto
    .toLocaleLowerCase("es-MX")
    .split(" ")
    .map((palabra, i) =>
      i > 0 && ["de", "del", "la", "las", "los", "y"].includes(palabra)
        ? palabra
        : palabra.charAt(0).toLocaleUpperCase("es-MX") + palabra.slice(1),
    )
    .join(" ");
}

/**
 * Lo único del nombre que sale al sitio: «Laura M.». La inicial es la del
 * primer apellido, saltando «de», «del» o «de la» («de la Torre» → «T.»).
 * Sin apellido, solo el nombre.
 */
export function nombrePublico(nombre: string, apellido: string): string {
  const pila = comoNombre(limpio(nombre, TOPE_NOMBRE));
  const palabras = limpio(apellido, TOPE_NOMBRE)
    .split(" ")
    .filter((p) => p && !["de", "del", "la", "las", "los", "y"].includes(p.toLocaleLowerCase("es-MX")));
  const inicial = palabras[0]?.charAt(0).toLocaleUpperCase("es-MX");
  return inicial ? `${pila} ${inicial}.` : pila;
}

export type RespuestaDelCliente = {
  nombre: string;
  apellido: string;
  nombrePublico: string;
  /** Vacío si no autorizó publicarlo: lo que no se va a usar no se guarda. */
  comentario: string;
  aceptaTexto: boolean;
  aceptaFotos: boolean;
};

export type RevisionDeRespuesta =
  | { ok: true; valor: RespuestaDelCliente; trampa: boolean }
  | { ok: false; campo: string; mensaje: string };

const marcado = (valor: FormDataEntryValue | null): boolean => valor === "1" || valor === "on" || valor === "true";

/**
 * Revisa lo que mandó el cliente desde su enlace. `hayFotos` dice si la
 * entrega tiene alguna foto (del equipo o suya): autorizar las fotos de una
 * entrega sin fotos no publica nada, así que no cuenta como respuesta.
 */
export function revisarRespuesta(formulario: FormData, hayFotos: boolean): RevisionDeRespuesta {
  const trampa = limpio(formulario.get("sitio_web"), 200) !== "";
  const nombre = limpio(formulario.get("nombre"), TOPE_NOMBRE);
  const apellido = limpio(formulario.get("apellido"), TOPE_NOMBRE);
  const comentario =
    typeof formulario.get("comentario") === "string"
      ? String(formulario.get("comentario")).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
      : "";
  const aceptaTexto = marcado(formulario.get("acepta_texto"));
  const aceptaFotos = marcado(formulario.get("acepta_fotos"));

  if (nombre.length < 2) return { ok: false, campo: "nombre", mensaje: "Escribe tu nombre." };
  if (comentario.length > TOPE_COMENTARIO) {
    return { ok: false, campo: "comentario", mensaje: `Tu comentario pasa de ${TOPE_COMENTARIO} letras; recórtalo un poco.` };
  }
  if (aceptaTexto && comentario.length < 10) {
    return { ok: false, campo: "comentario", mensaje: "Escribe tu comentario, o quita la marca de publicarlo." };
  }
  if (!aceptaTexto && !(aceptaFotos && hayFotos)) {
    return {
      ok: false,
      campo: "acepta_texto",
      mensaje: "Marca al menos un permiso. Si prefieres que no publiquemos nada, no hace falta enviar: puedes cerrar esta página.",
    };
  }

  return {
    ok: true,
    trampa,
    valor: {
      nombre,
      apellido,
      nombrePublico: nombrePublico(nombre, apellido),
      comentario: aceptaTexto ? comentario : "",
      aceptaTexto,
      aceptaFotos,
    },
  };
}

/**
 * El mensaje de WhatsApp con el que el equipo manda el enlace. El enlace va al
 * final y solo: así WhatsApp lo convierte en vínculo sin comerse el punto.
 */
export function mensajeDeInvitacion(nombreCliente: string, nombreNegocio: string, enlace: string): string {
  const pila = comoNombre(limpio(nombreCliente, TOPE_NOMBRE).split(" ")[0] ?? "");
  return [
    `¡Hola${pila ? ` ${pila}` : ""}! Gracias por confiar en ${nombreNegocio}.`,
    "Nos encantaría conocer tu experiencia. Aquí puedes ver las fotos de tu entrega y dejarnos un comentario; tú decides qué se publica:",
    enlace,
  ].join("\n\n");
}
