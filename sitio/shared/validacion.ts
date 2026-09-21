/** Reglas que comparten el navegador (para avisar pronto) y el servidor (que decide). */

export const normalizarCorreo = (correo: string): string => correo.trim().toLowerCase();

/**
 * Laxa a propósito: la validación estricta rechaza direcciones válidas y la
 * única prueba real de un correo es que llegue un mensaje.
 */
export const correoValido = (correo: string): boolean =>
  correo.length <= 254 && /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(correo.trim());

/** Diez cifras es un celular mexicano; con clave de país llega a doce. */
export const telefonoValido = (telefono: string): boolean => telefono.replace(/\D+/g, "").length >= 10;

// ─── Los formularios que dejan un prospecto ───────────────────────

/** Lo que se revisa, en el orden en que se enseña: el primer error manda. */
export const CAMPOS_DE_PROSPECTO = ["nombre", "telefono", "correo", "acepto"] as const;
export type CampoDeProspecto = (typeof CAMPOS_DE_PROSPECTO)[number];

export type DatosDeProspecto = { nombre: string; telefono: string; correo: string; acepto: boolean };

/**
 * El único error que no es de UN campo sino del par teléfono/correo. Viaja
 * como error de `telefono` (el primero del par), y la página de Contacto lo
 * reconoce por este texto para enseñarlo debajo de los dos.
 */
export const SIN_FORMA_DE_CONTESTAR = "Déjanos un teléfono o un correo para poder contestarte.";

/**
 * UNA regla para los tres formularios (contacto, «Me interesa» y la API): la
 * aplica el servidor, que decide, y el navegador, que avisa antes de mandar y
 * junto al campo. Devuelve todos los problemas, no solo el primero: el
 * navegador los marca a la vez.
 *
 * **Sin teléfono y sin correo no hay a quién contestarle** (21/09/2026): el
 * formulario de contacto aceptaba un nombre solo y el asesor no tenía por
 * dónde buscarlo. «Me interesa» ya exigía el teléfono.
 */
export function problemasDeProspecto(
  { nombre, telefono, correo, acepto }: DatosDeProspecto,
  { telefonoObligatorio = false }: { telefonoObligatorio?: boolean } = {},
): Partial<Record<CampoDeProspecto, string>> {
  const problemas: Partial<Record<CampoDeProspecto, string>> = {};
  if (nombre.length < 2) problemas.nombre = "Escribe tu nombre.";

  if (telefonoObligatorio && !telefonoValido(telefono)) {
    problemas.telefono = "Escribe un teléfono de 10 dígitos para poder contestarte.";
  } else if (telefono && !telefonoValido(telefono)) {
    problemas.telefono = "Ese teléfono no parece completo.";
  } else if (!telefono && !correo) {
    problemas.telefono = SIN_FORMA_DE_CONTESTAR;
  }

  if (correo && !correoValido(correo)) problemas.correo = "Revisa el correo.";
  if (!acepto) problemas.acepto = "Necesitamos que aceptes el aviso de privacidad.";
  return problemas;
}

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
