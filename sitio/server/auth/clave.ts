/**
 * Contraseñas: PBKDF2-SHA-256 sobre Web Crypto (PLAN §8.1).
 *
 * Este archivo NO importa nada a propósito: `scripts/crear-maestro.mjs` lo
 * importa tal cual desde Node (que ya sabe quitar los tipos), así el hash que
 * genera el script y el que verifica el Worker salen del MISMO código.
 *
 * 100 000 iteraciones y ni una más: medido en Cuponera, sobre esta misma
 * cuenta, 200 000 revientan siempre por CPU. Por la misma razón ninguna
 * petición debe derivar dos veces (dos de 100 000 son lo mismo que una de
 * 200 000). La compensación contra fuerza bruta es el limitador de intentos.
 */

export const ITERACIONES = 100_000;
const BYTES_SAL = 16;
const BYTES_HASH = 32;

/** Sin 0, O, 1, l ni I: la clave temporal se dicta o se copia de WhatsApp. */
export const ALFABETO_TEMPORAL = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const LARGO_TEMPORAL = 12;

/**
 * Bytes al azar con la forma de un hash: ninguna contraseña coincide. Cuando el correo no existe se
 * verifica contra este, para que la respuesta tarde lo mismo y no delate
 * qué correos tienen cuenta (PLAN §8.1).
 */
export const HASH_RELLENO =
  "pbkdf2$100000$9yvaTZqvXO96DIjbj9RhrQ==$BNB/J2eSGbxTC666j+u2nQzdqTtm1DOKH3+ocTxAS3U=";

const aBase64 = (bytes: Uint8Array): string => {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
};

const deBase64 = (texto: string): Uint8Array => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

async function derivar(clave: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: sal as BufferSource, iterations: iteraciones },
    material,
    BYTES_HASH * 8,
  );
  return new Uint8Array(bits);
}

/** Devuelve `pbkdf2$<iteraciones>$<sal base64>$<hash base64>`. */
export async function hashClave(clave: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(BYTES_SAL));
  const hash = await derivar(clave, sal, ITERACIONES);
  return `pbkdf2$${ITERACIONES}$${aBase64(sal)}$${aBase64(hash)}`;
}

/** Un `===` sobre los bytes delataría cuántos coinciden por lo que tarda. */
function igualesEnTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

export async function verificarClave(clave: string, almacenado: string): Promise<boolean> {
  const partes = almacenado.split("$");
  if (partes.length !== 4 || partes[0] !== "pbkdf2") return false;
  const iteraciones = Number(partes[1]);
  // Un número mayor en la base (a mano o por error) tumbaría el Worker por CPU.
  if (!Number.isInteger(iteraciones) || iteraciones < 10_000 || iteraciones > ITERACIONES) return false;
  let sal: Uint8Array;
  let esperado: Uint8Array;
  try {
    sal = deBase64(partes[2]);
    esperado = deBase64(partes[3]);
  } catch {
    return false;
  }
  return igualesEnTiempoConstante(await derivar(clave, sal, iteraciones), esperado);
}

/**
 * La genera siempre el servidor (o el script del maestro), nunca una persona.
 * Muestreo por rechazo: con `byte % 57` a secas, las primeras letras del
 * alfabeto saldrían más seguido que las últimas.
 */
export function generarClaveTemporal(): string {
  const n = ALFABETO_TEMPORAL.length;
  const tope = 256 - (256 % n);
  let clave = "";
  while (clave.length < LARGO_TEMPORAL) {
    for (const byte of crypto.getRandomValues(new Uint8Array(LARGO_TEMPORAL * 2))) {
      if (byte < tope && clave.length < LARGO_TEMPORAL) clave += ALFABETO_TEMPORAL[byte % n];
    }
  }
  return clave;
}
