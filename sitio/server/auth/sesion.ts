import type { Rol } from "../../shared/permisos";
import { ahora, enDias, enMinutos } from "../fechas";

/**
 * Sesiones en D1 (PLAN §8.3).
 *
 * La cookie lleva un token de 32 bytes al azar; en la base solo queda su
 * SHA-256. Una copia robada de la base no sirve para entrar, y cerrar sesión
 * es borrar la fila de verdad (una cookie firmada sin estado no lo permite).
 *
 * `__Host-`: el navegador se niega a guardarla sin `Secure`, `Path=/` y sin
 * `Domain`, así que ningún otro subdominio (p. ej. otro *.workers.dev de la
 * misma cuenta) puede plantarla.
 */

export const COOKIE_SESION = "__Host-aig_sesion";
const DIAS_SESION = 7;
/** La sesión que solo sirve para cambiar la temporal no necesita más. */
const MINUTOS_SOLO_CAMBIO = 60;
/** Cuánto vale haber confirmado la contraseña actual en «Mi cuenta» (F3). */
export const MINUTOS_CONFIRMACION = 5;

export type UsuarioSesion = {
  id: string;
  correo: string;
  nombre: string;
  rol: Rol;
  telefono: string | null;
  whatsapp: string | null;
};

export type SesionActiva = {
  idHash: string;
  /** La clave es temporal: solo puede cambiarla o salir (PLAN §8.2). */
  soloCambioClave: boolean;
  huellaTemporal: string | null;
  /** Huella de la contraseña actual, si acaba de confirmarla (ver abajo). */
  huellaClaveActual: string | null;
  claveConfirmadaHasta: string | null;
  usuario: UsuarioSesion;
};

export function nuevoToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** SHA-256 en hexadecimal. Sin PBKDF2: el token no tiene diccionario que probar. */
export async function huella(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Huella de una contraseña atada al token de ESA sesión. Sirve para dos cosas
 * sin volver a derivar con PBKDF2 (dos en una petición revientan el CPU del
 * Worker, PLAN §17): comprobar que la clave nueva no repite la temporal, y
 * recordar que quien pide el cambio ya confirmó su contraseña actual.
 *
 * Sin el token, que solo vive en la cookie, la huella guardada no le sirve a
 * nadie: no se puede probar contraseñas contra ella desde una copia de la base.
 */
export const huellaDeClave = (token: string, clave: string): Promise<string> => huella(`${token}:${clave}`);

export function sentenciaCrearSesion(
  db: D1Database,
  datos: { idHash: string; usuarioId: string; soloCambioClave: boolean; huellaTemporal: string | null; agente: string | null },
): D1PreparedStatement {
  const expira = datos.soloCambioClave ? enMinutos(MINUTOS_SOLO_CAMBIO) : enDias(DIAS_SESION);
  return db
    .prepare(
      `INSERT INTO sesiones (id_hash, usuario_id, solo_cambio_clave, huella_temporal, expira_en, agente, creada_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      datos.idHash,
      datos.usuarioId,
      datos.soloCambioClave ? 1 : 0,
      datos.huellaTemporal,
      expira,
      datos.agente?.slice(0, 200) ?? null,
      ahora(),
    );
}

/** Primer paso del cambio de clave desde «Mi cuenta»: queda confirmada 5 minutos. */
export const sentenciaConfirmarClave = (
  db: D1Database,
  idHash: string,
  huellaClave: string,
): D1PreparedStatement =>
  db
    .prepare("UPDATE sesiones SET huella_clave_actual = ?, clave_confirmada_hasta = ? WHERE id_hash = ?")
    .bind(huellaClave, enMinutos(MINUTOS_CONFIRMACION), idHash);

/** Todas las sesiones de alguien: al desactivarlo, cambiarle el rol o la clave. */
export const sentenciaBorrarSesionesDe = (db: D1Database, usuarioId: string): D1PreparedStatement =>
  db.prepare("DELETE FROM sesiones WHERE usuario_id = ?").bind(usuarioId);

/** Limpieza de paso: las vencidas de esa persona no sirven para nada. */
export const sentenciaBorrarVencidasDe = (db: D1Database, usuarioId: string): D1PreparedStatement =>
  db.prepare("DELETE FROM sesiones WHERE usuario_id = ? AND expira_en <= ?").bind(usuarioId, ahora());

export async function leerSesion(db: D1Database, token: string | null): Promise<SesionActiva | null> {
  if (!token || token.length > 100) return null;
  const idHash = await huella(token);
  // `activo = 1` en la misma consulta: desactivar a alguien lo saca en su
  // siguiente petición aunque todavía tenga la cookie.
  const fila = await db
    .prepare(
      `SELECT s.solo_cambio_clave, s.huella_temporal, s.huella_clave_actual, s.clave_confirmada_hasta,
              u.id, u.correo, u.nombre, u.rol, u.telefono, u.whatsapp
         FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.id_hash = ? AND s.expira_en > ? AND u.activo = 1`,
    )
    .bind(idHash, ahora())
    .first<{
      solo_cambio_clave: number;
      huella_temporal: string | null;
      huella_clave_actual: string | null;
      clave_confirmada_hasta: string | null;
      id: string;
      correo: string;
      nombre: string;
      rol: Rol;
      telefono: string | null;
      whatsapp: string | null;
    }>();
  if (!fila) return null;
  return {
    idHash,
    soloCambioClave: fila.solo_cambio_clave === 1,
    huellaTemporal: fila.huella_temporal,
    huellaClaveActual: fila.huella_clave_actual,
    claveConfirmadaHasta: fila.clave_confirmada_hasta,
    usuario: {
      id: fila.id,
      correo: fila.correo,
      nombre: fila.nombre,
      rol: fila.rol,
      telefono: fila.telefono,
      whatsapp: fila.whatsapp,
    },
  };
}

export function tokenDeCookie(request: Request): string | null {
  const cabecera = request.headers.get("Cookie");
  if (!cabecera) return null;
  for (const parte of cabecera.split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === COOKIE_SESION) return parte.slice(i + 1).trim() || null;
  }
  return null;
}

export function cookieSesion(token: string, soloCambioClave: boolean): string {
  const segundos = soloCambioClave ? MINUTOS_SOLO_CAMBIO * 60 : DIAS_SESION * 86_400;
  return `${COOKIE_SESION}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${segundos}`;
}

export const cookieBorrada = (): string => `${COOKIE_SESION}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
