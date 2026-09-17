/**
 * Cómo se dice en la pantalla lo que la base guarda en clave (`estado`,
 * `clave_temporal`, `contenido`). Vive aquí, y no en cada componente, para que
 * la bitácora y los avisos usen las mismas palabras.
 */

export const ENTIDADES_DE_BITACORA = ["propiedad", "foto", "usuario", "configuracion", "contenido", "prospecto", "sistema"];

export const ETIQUETA_ENTIDAD: Record<string, string> = {
  propiedad: "Casas",
  foto: "Fotos",
  usuario: "Cuentas",
  configuracion: "Configuración",
  contenido: "Contenido",
  prospecto: "Prospectos",
  sistema: "Sistema",
};

export const ETIQUETA_ACCION: Record<string, string> = {
  crear: "creó",
  editar: "editó",
  estado: "cambió el estado de",
  papelera: "mandó a la papelera",
  restaurar: "restauró",
  subir: "subió una foto a",
  acomodar: "acomodó las fotos de",
  borrar: "borró",
  ordenar: "ordenó",
  rol: "cambió el rol de",
  activar: "activó",
  desactivar: "desactivó",
  clave_temporal: "generó una contraseña temporal para",
  clave: "cambió su contraseña",
  acceso: "entró",
  acceso_fallido: "intentó entrar",
  salida: "salió",
};

/** Lo que se lee cuando la acción no está en la lista: mejor el verbo crudo que un hueco. */
export const comoSeDice = (accion: string): string => ETIQUETA_ACCION[accion] ?? accion.replace(/_/g, " ");
