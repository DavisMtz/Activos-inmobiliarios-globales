import { pbkdf2Sync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ALFABETO_TEMPORAL,
  HASH_RELLENO,
  ITERACIONES,
  LARGO_TEMPORAL,
  generarClaveTemporal,
  hashClave,
  verificarClave,
} from "../server/auth/clave";
// El módulo que usa `crear-maestro.mjs`, importado como lo importa el script.
// @ts-expect-error: módulo .mjs sin tipos
import { prepararTemporal } from "../scripts/lib/usuarios.mjs";

/**
 * Compatibilidad del hash entre el script (Node) y el Worker (PLAN §8.5).
 * Además de la vuelta completa, se verifica contra una implementación
 * INDEPENDIENTE (`node:crypto`): eso prueba que el formato es PBKDF2-SHA-256
 * estándar y no un acuerdo accidental entre dos copias del mismo código.
 * La prueba de punta a punta contra workerd la hace `npm run verificar`.
 */

const FORMATO = /^pbkdf2\$100000\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$/;

function hashConNode(clave: string): string {
  const sal = randomBytes(16);
  const hash = pbkdf2Sync(clave, sal, ITERACIONES, 32, "sha256");
  return `pbkdf2$${ITERACIONES}$${sal.toString("base64")}$${hash.toString("base64")}`;
}

function verificarConNode(clave: string, almacenado: string): boolean {
  const [, iter, sal, hash] = almacenado.split("$");
  const calculado = pbkdf2Sync(clave, Buffer.from(sal, "base64"), Number(iter), 32, "sha256");
  return calculado.toString("base64") === hash;
}

describe("clave.ts", () => {
  it("hashea con el formato pbkdf2$100000$sal$hash y verifica", async () => {
    const hash = await hashClave("una frase larga de prueba");
    expect(hash).toMatch(FORMATO);
    expect(await verificarClave("una frase larga de prueba", hash)).toBe(true);
    expect(await verificarClave("una frase larga de prueba!", hash)).toBe(false);
  });

  it("dos hashes de la misma clave son distintos (sal aleatoria)", async () => {
    expect(await hashClave("misma clave 123")).not.toBe(await hashClave("misma clave 123"));
  });

  it("es PBKDF2-SHA-256 estándar: node:crypto verifica lo de clave.ts y al revés", async () => {
    const deClave = await hashClave("Contraseña con acentos ñ 1");
    expect(verificarConNode("Contraseña con acentos ñ 1", deClave)).toBe(true);
    const deNode = hashConNode("Contraseña con acentos ñ 1");
    expect(await verificarClave("Contraseña con acentos ñ 1", deNode)).toBe(true);
  });

  it("la temporal del script (crear-maestro) se verifica con clave.ts", async () => {
    const { clave, hash, expira } = await prepararTemporal();
    expect(hash).toMatch(FORMATO);
    expect(await verificarClave(clave, hash)).toBe(true);
    expect(Date.parse(expira) - Date.now()).toBeGreaterThan(71 * 3_600_000);
  });

  it("rechaza hashes mal formados o con más iteraciones de las que aguanta el Worker", async () => {
    expect(await verificarClave("x", "")).toBe(false);
    expect(await verificarClave("x", "bcrypt$10$abc$def")).toBe(false);
    expect(await verificarClave("x", "pbkdf2$200000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA")).toBe(false);
    expect(await verificarClave("x", "pbkdf2$100000$no-es-base64$@@@")).toBe(false);
  });

  it("el hash de relleno tiene forma válida y no acepta nada común", async () => {
    expect(HASH_RELLENO).toMatch(FORMATO);
    for (const intento of ["", "demo", "123456", "contraseña"]) {
      expect(await verificarClave(intento, HASH_RELLENO)).toBe(false);
    }
  });
});

describe("contraseña temporal", () => {
  it("mide 12 y usa solo el alfabeto sin caracteres ambiguos", () => {
    for (let i = 0; i < 200; i++) {
      const clave = generarClaveTemporal();
      expect(clave).toHaveLength(LARGO_TEMPORAL);
      expect(clave).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
      expect(clave).not.toMatch(/[0O1lI]/);
    }
  });

  it("reparte todas las letras del alfabeto (muestreo sin sesgo evidente)", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 500; i++) for (const c of generarClaveTemporal()) vistos.add(c);
    expect(vistos.size).toBe(ALFABETO_TEMPORAL.length);
  });
});
