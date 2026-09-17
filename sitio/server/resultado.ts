/**
 * Lo que devuelven las operaciones del servidor. Un fallo previsto (datos
 * inválidos, sin permiso, demasiados intentos) no se lanza: se devuelve con
 * su estado HTTP y un mensaje para la persona, igual para la API y para las
 * acciones de React Router.
 */

export type Fallo = {
  ok: false;
  estado: 400 | 401 | 403 | 404 | 409 | 429;
  /** Código estable para programas: `debe_cambiar_clave`, `demasiados_intentos`… */
  error: string;
  /** Texto para la persona, en español. */
  mensaje: string;
};

export type Resultado<T> = { ok: true; valor: T } | Fallo;

export const exito = <T>(valor: T): Resultado<T> => ({ ok: true, valor });

export const fallo = (estado: Fallo["estado"], error: string, mensaje: string): Fallo => ({
  ok: false,
  estado,
  error,
  mensaje,
});
