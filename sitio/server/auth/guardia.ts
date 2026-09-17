import type { Servicios } from "../config";
import { leerSesion, tokenDeCookie, type SesionActiva } from "./sesion";

export type SesionConToken = { sesion: SesionActiva; token: string };

/** La sesión de la cookie, o null si no hay, venció o la cuenta está desactivada. */
export async function sesionDePeticion(s: Servicios, request: Request): Promise<SesionConToken | null> {
  const token = tokenDeCookie(request);
  const sesion = await leerSesion(s.db, token);
  return sesion && token ? { sesion, token } : null;
}

/**
 * Lo único que acepta una sesión con clave temporal (PLAN §8.2): cambiarla,
 * leer quién es (para saludar) y salir. Cualquier otra cosa: 403.
 */
export function permitidoConClaveTemporal(metodo: string, ruta: string): boolean {
  return (
    (metodo === "POST" && ruta === "/api/panel/mi-cuenta/clave") ||
    (metodo === "GET" && ruta === "/api/panel/mi-cuenta") ||
    (metodo === "DELETE" && ruta === "/api/panel/sesion")
  );
}
