/** Reglas que comparten el navegador (para avisar pronto) y el servidor (que decide). */

export const normalizarCorreo = (correo: string): string => correo.trim().toLowerCase();

/**
 * Laxa a propósito: la validación estricta rechaza direcciones válidas y la
 * única prueba real de un correo es que llegue un mensaje.
 */
export const correoValido = (correo: string): boolean =>
  correo.length <= 254 && /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(correo.trim());

export const LARGO_MINIMO_CLAVE = 10;
const LARGO_MAXIMO_CLAVE = 128;

/**
 * Cuánto vive una contraseña temporal (PLAN §8.2). Una sola definición: la usan
 * el panel (cuando el director da de alta a alguien) y `scripts/lib/usuarios.mjs`.
 */
export const HORAS_CLAVE_TEMPORAL = 72;

/**
 * Reglas de la contraseña nueva (PLAN §8.1). Devuelve el problema o null.
 * «Distinta de la temporal» no está aquí: solo el servidor puede comprobarlo.
 */
export function problemaClaveNueva(clave: string, confirmacion: string, correo: string): string | null {
  if (clave.length < LARGO_MINIMO_CLAVE) {
    return `La contraseña necesita al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  }
  if (clave.length > LARGO_MAXIMO_CLAVE) return "Esa contraseña es demasiado larga.";
  if (clave !== confirmacion) return "Las dos contraseñas no coinciden.";
  // Con partes muy cortas («ana@…») la regla prohibiría casi cualquier clave.
  const usuario = normalizarCorreo(correo).split("@")[0] ?? "";
  if (usuario.length >= 4 && clave.toLowerCase().includes(usuario)) {
    return "La contraseña no puede contener tu correo.";
  }
  return null;
}
