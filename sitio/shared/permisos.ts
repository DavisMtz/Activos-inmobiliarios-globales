/**
 * ÚNICA matriz de roles (PLAN §9). Cambiar quién puede qué es editar ESTE
 * archivo y nada más: el servidor decide con `puede()` en cada endpoint, y la
 * interfaz usa la misma función solo para esconder lo que no se puede hacer.
 *
 * Las pruebas (`tests/permisos.test.ts`) recorren la tabla completa, así que
 * un cambio aquí sin cambiar la prueba se nota.
 */

export const ROLES = ["maestro", "director", "asesor", "contenido"] as const;
export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Record<Rol, string> = {
  maestro: "Maestro",
  director: "Director",
  asesor: "Asesor",
  contenido: "Contenido",
};

/**
 * Cómo de amplio es un permiso para un rol:
 * - `todo`: sin restricción.
 * - `propias`: solo lo que tiene `asesor_id` = su id (casas o prospectos).
 * - `vistas`: métricas limitadas a vistas por casa (rol contenido).
 * - `equipo`: gestionar usuarios, solo de los roles asesor y contenido (director).
 * - `no`: nada.
 */
export type Alcance = "todo" | "propias" | "vistas" | "equipo" | "no";

export type Permiso =
  | "propiedades.ver"
  | "propiedades.crear"
  | "propiedades.editar"
  | "propiedades.publicar"
  | "propiedades.estado_comercial"
  | "propiedades.asignar_asesor"
  | "propiedades.papelera"
  | "fotos.gestionar"
  | "contenido.editar"
  | "configuracion.contacto"
  | "configuracion.aviso"
  | "configuracion.buscador"
  | "prospectos.ver"
  | "prospectos.gestionar"
  | "prospectos.asignar"
  | "prospectos.exportar"
  | "metricas.ver"
  | "usuarios.gestionar"
  | "bitacora.ver"
  | "sistema.gestionar"
  | "cuenta.propia";

//                                        maestro   director   asesor      contenido
const fila = (m: Alcance, d: Alcance, a: Alcance, c: Alcance): Record<Rol, Alcance> => ({
  maestro: m,
  director: d,
  asesor: a,
  contenido: c,
});

export const MATRIZ: Record<Permiso, Record<Rol, Alcance>> = {
  "propiedades.ver": fila("todo", "todo", "todo", "todo"),
  // El asesor crea, pero lo suyo nace en «revisión» (ver `estadoInicialAlCrear`).
  "propiedades.crear": fila("todo", "todo", "todo", "todo"),
  "propiedades.editar": fila("todo", "todo", "propias", "todo"),
  // D14: la persona de contenido sí publica (confirmado el 16/09/2026).
  "propiedades.publicar": fila("todo", "todo", "no", "todo"),
  "propiedades.estado_comercial": fila("todo", "todo", "propias", "todo"),
  "propiedades.asignar_asesor": fila("todo", "todo", "no", "no"),
  "propiedades.papelera": fila("todo", "todo", "no", "no"),
  "fotos.gestionar": fila("todo", "todo", "propias", "todo"),
  "contenido.editar": fila("todo", "todo", "no", "todo"),
  "configuracion.contacto": fila("todo", "todo", "no", "no"),
  "configuracion.aviso": fila("todo", "todo", "no", "no"),
  // Encender o apagar el buscador con IA, su modelo y su tope diario (PLAN §10.5).
  "configuracion.buscador": fila("todo", "todo", "no", "no"),
  "prospectos.ver": fila("todo", "todo", "propias", "no"),
  "prospectos.gestionar": fila("todo", "todo", "propias", "no"),
  "prospectos.asignar": fila("todo", "todo", "no", "no"),
  "prospectos.exportar": fila("todo", "todo", "no", "no"),
  "metricas.ver": fila("todo", "todo", "propias", "vistas"),
  "usuarios.gestionar": fila("todo", "equipo", "no", "no"),
  "bitacora.ver": fila("todo", "todo", "no", "no"),
  "sistema.gestionar": fila("todo", "no", "no", "no"),
  "cuenta.propia": fila("todo", "todo", "todo", "todo"),
};

/** Lo mínimo que hace falta saber de quien actúa. */
export type Actor = { id: string; rol: Rol };

/**
 * El recurso sobre el que se actúa, si lo hay:
 * - casa o prospecto: `{ asesor_id }`;
 * - usuario: `{ id, rol }` (el rol que tiene, o el que se le quiere dar).
 */
export type Recurso = { asesor_id?: string | null } | { id?: string; rol: Rol };

export const alcance = (actor: Actor, permiso: Permiso): Alcance => MATRIZ[permiso][actor.rol];

/** Roles que el director puede crear y administrar. */
export const ROLES_DEL_EQUIPO: readonly Rol[] = ["asesor", "contenido"];

/**
 * ¿Puede `actor` ejercer `permiso` sobre `recurso`?
 *
 * Sin recurso contesta «¿tiene este permiso en algún grado?», que es lo que
 * necesitan los listados y los botones; el listado aplica después el filtro
 * de su alcance (por ejemplo, un asesor solo recibe sus prospectos).
 */
export function puede(actor: Actor, permiso: Permiso, recurso?: Recurso): boolean {
  const a = alcance(actor, permiso);
  switch (a) {
    case "no":
      return false;
    case "todo":
    case "vistas":
      return true;
    case "propias":
      if (!recurso || !("asesor_id" in recurso)) return true;
      return recurso.asesor_id === actor.id;
    case "equipo":
      if (!recurso || !("rol" in recurso)) return true;
      return ROLES_DEL_EQUIPO.includes(recurso.rol);
  }
}

/**
 * Reglas duras sobre cuentas que no caben en la tabla (PLAN §9). Devuelven el
 * motivo del rechazo, o null si se permite. La regla de «siempre queda al
 * menos un maestro activo» necesita la base y vive en el servidor.
 */
export function problemaAlGestionarUsuario(
  actor: Actor,
  objetivo: { id: string; rol: Rol },
  cambio: { rolNuevo?: Rol; desactivar?: boolean },
): string | null {
  const esUnoMismo = actor.id === objetivo.id;
  if (esUnoMismo && cambio.rolNuevo && cambio.rolNuevo !== objetivo.rol) return "No puedes cambiar tu propio rol.";
  if (esUnoMismo && cambio.desactivar) return "No puedes desactivar tu propia cuenta.";
  if (!puede(actor, "usuarios.gestionar", { id: objetivo.id, rol: objetivo.rol })) {
    return "No tienes permiso para gestionar esta cuenta.";
  }
  if (cambio.rolNuevo && !puede(actor, "usuarios.gestionar", { rol: cambio.rolNuevo })) {
    return "No tienes permiso para dar ese rol.";
  }
  return null;
}

/** El asesor sube casas, pero no las publica: lo suyo espera revisión. */
export const estadoInicialAlCrear = (actor: Actor): "borrador" | "revision" =>
  puede(actor, "propiedades.publicar") ? "borrador" : "revision";
