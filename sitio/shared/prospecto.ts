/**
 * Prospectos: de qué tipo son y por qué estados pasan (PLAN §7 y §11.2).
 *
 * ÚNICA definición de las dos listas, espejo de los `CHECK` de la tabla: las
 * usan el formulario del sitio público, la bandeja del panel, la API y el CSV.
 * `server/db/prospectos.ts` las reexporta para que el sitio público no tenga
 * que saber que viven aquí.
 */

export const TIPOS_PROSPECTO = ["general", "propiedad", "vender", "credito"] as const;
export type TipoProspecto = (typeof TIPOS_PROSPECTO)[number];

/** Cómo se dice en la bandeja de dónde salió cada mensaje. */
export const ETIQUETA_TIPO_PROSPECTO: Record<TipoProspecto, string> = {
  general: "Mensaje de contacto",
  propiedad: "Preguntó por una casa",
  vender: "Quiere vender o rentar",
  credito: "Pregunta de crédito",
};

export const ESTADOS_PROSPECTO = ["nuevo", "contactado", "cita", "cerrado", "descartado"] as const;
export type EstadoProspecto = (typeof ESTADOS_PROSPECTO)[number];

export const esEstadoProspecto = (valor: unknown): valor is EstadoProspecto =>
  typeof valor === "string" && (ESTADOS_PROSPECTO as readonly string[]).includes(valor);

export const ETIQUETA_ESTADO_PROSPECTO: Record<EstadoProspecto, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  cita: "Con cita",
  cerrado: "Cerrado",
  descartado: "Descartado",
};

/** Qué significa cada estado, en palabras del equipo y no del programa. */
export const EXPLICACION_ESTADO_PROSPECTO: Record<EstadoProspecto, string> = {
  nuevo: "Nadie lo ha atendido todavía.",
  contactado: "Ya se le llamó o se le escribió.",
  cita: "Hay una visita o una cita acordada.",
  cerrado: "Terminó: se cerró el trato o ya no siguió.",
  descartado: "No era un cliente real: número falso, publicidad o equivocación.",
};

/** Los que siguen vivos, o sea lo que el equipo tiene pendiente hoy. */
export const ESTADOS_ABIERTOS: readonly EstadoProspecto[] = ["nuevo", "contactado", "cita"];

/**
 * El paso que sigue, para ofrecerlo con un solo botón en la bandeja.
 *
 * No es una máquina de estados: desde la ficha se puede poner cualquiera de los
 * cinco. Marcar «contactado» por error y no poder volver atrás sería peor que
 * tener un botón de más, y quien atiende va a hacerlo desde el celular.
 */
export const SIGUIENTE_ESTADO: Partial<Record<EstadoProspecto, EstadoProspecto>> = {
  nuevo: "contactado",
  contactado: "cita",
  cita: "cerrado",
};
