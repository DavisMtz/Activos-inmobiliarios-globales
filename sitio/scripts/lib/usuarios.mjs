/**
 * Altas y restablecimientos de cuentas desde scripts (PLAN §8.5).
 *
 * El hash sale de `server/auth/clave.ts` importado TAL CUAL: Node 24 quita los
 * tipos solo, y ese archivo no importa nada. Así el script y el Worker usan el
 * mismo código y los mismos parámetros, sin copias que se desincronicen.
 */
import { generarClaveTemporal, hashClave } from "../../server/auth/clave.ts";
import { HORAS_CLAVE_TEMPORAL, correoValido, normalizarCorreo } from "../../shared/validacion.ts";
import { consultar, ejecutarSql, texto } from "./d1.mjs";

export { correoValido, normalizarCorreo };

/** Una sola definición, compartida con el panel (`shared/validacion.ts`). */
export const HORAS_TEMPORAL = HORAS_CLAVE_TEMPORAL;
const ROLES = ["maestro", "director", "asesor", "contenido"];

/** Clave temporal nueva, su hash y cuándo vence. La clave en claro solo vive en memoria. */
export async function prepararTemporal() {
  const clave = generarClaveTemporal();
  return {
    clave,
    hash: await hashClave(clave),
    expira: new Date(Date.now() + HORAS_TEMPORAL * 3_600_000).toISOString(),
  };
}

export function buscarUsuario(correo, { remoto }) {
  const filas = consultar(`SELECT id, correo, nombre, rol, activo FROM usuarios WHERE correo = ${texto(correo)};`, {
    remoto,
  });
  return filas[0] ?? null;
}

/** Crea la cuenta con clave temporal. Devuelve `{ id, clave }`; la clave se muestra UNA vez. */
export async function crearUsuarioConTemporal({ correo, nombre, rol }, { remoto }) {
  if (!ROLES.includes(rol)) throw new Error(`Rol inválido: ${rol}`);
  const id = crypto.randomUUID();
  const ahora = new Date().toISOString();
  const temporal = await prepararTemporal();
  ejecutarSql(
    `INSERT INTO usuarios (id, correo, nombre, rol, clave_hash, debe_cambiar_clave, clave_temporal_expira, activo, creado_en)
     VALUES (${texto(id)}, ${texto(correo)}, ${texto(nombre)}, ${texto(rol)}, ${texto(temporal.hash)}, 1, ${texto(temporal.expira)}, 1, ${texto(ahora)});
     INSERT INTO bitacora (usuario_id, entidad, entidad_id, accion, cambios, creado_en)
     VALUES (NULL, 'usuario', ${texto(id)}, 'crear', ${texto(JSON.stringify({ rol, origen: "script" }))}, ${texto(ahora)});`,
    { remoto },
  );
  return { id, clave: temporal.clave, expira: temporal.expira };
}

/**
 * Temporal nueva para una cuenta que ya existe. Borra TODAS sus sesiones y la
 * reactiva: es también la vía para recuperar el acceso maestro.
 */
export async function restablecerConTemporal(id, { remoto }) {
  const ahora = new Date().toISOString();
  const temporal = await prepararTemporal();
  ejecutarSql(
    `UPDATE usuarios SET clave_hash = ${texto(temporal.hash)}, debe_cambiar_clave = 1,
            clave_temporal_expira = ${texto(temporal.expira)}, activo = 1
      WHERE id = ${texto(id)};
     DELETE FROM sesiones WHERE usuario_id = ${texto(id)};
     INSERT INTO bitacora (usuario_id, entidad, entidad_id, accion, cambios, creado_en)
     VALUES (NULL, 'usuario', ${texto(id)}, 'clave_temporal', ${texto(JSON.stringify({ origen: "script" }))}, ${texto(ahora)});`,
    { remoto },
  );
  return { id, clave: temporal.clave, expira: temporal.expira };
}

/**
 * Borra una cuenta de PRUEBA con todo su rastro, de las hojas a la raíz (D1
 * aplica las claves foráneas). No usar con cuentas reales: la bitácora de una
 * persona real no se borra.
 */
export function borrarUsuarioDePrueba(id, correo, { remoto }) {
  ejecutarSql(
    `DELETE FROM sesiones WHERE usuario_id = ${texto(id)};
     DELETE FROM bitacora WHERE usuario_id = ${texto(id)} OR entidad_id IN (${texto(id)}, ${texto(correo)});
     DELETE FROM usuarios WHERE id = ${texto(id)};`,
    { remoto },
  );
}
