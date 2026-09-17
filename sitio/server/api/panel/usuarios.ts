/**
 * Cuentas del equipo (PLAN §12). La contraseña temporal se devuelve en claro
 * UNA vez, al crear la cuenta o al generar una nueva: es lo que el director le
 * manda por WhatsApp a quien entra. No se guarda en ningún otro lado, ni en la
 * bitácora (PLAN §8.2).
 */

import { Hono } from "hono";
import { puede } from "../../../shared/permisos";
import {
  cambiarActivo,
  cambiarRol,
  crearUsuario,
  editarDatos,
  generarTemporal,
  listarUsuarios,
} from "../../db/panel/usuarios";
import type { EntornoHono } from "../tipos";
import { actorDe, cuerpo, noEncontrado, noPermitido, responder } from "./comun";

export const apiUsuarios = new Hono<EntornoHono>();

const idDeCuenta = (c: { req: { param: (n: string) => string | undefined } }): string | null => {
  const id = c.req.param("id") ?? "";
  return /^[0-9a-fA-F-]{10,40}$/.test(id) ? id : null;
};

apiUsuarios.get("/", async (c) => {
  const actor = actorDe(c);
  if (!puede(actor, "usuarios.gestionar")) return noPermitido(c);
  return c.json({ items: await listarUsuarios(c.var.servicios.db, actor) });
});

apiUsuarios.post("/", async (c) => {
  const r = await crearUsuario(c.var.servicios.db, actorDe(c), await cuerpo(c));
  // La clave temporal viaja una sola vez, aquí.
  return responder(c, r, ({ usuario, clave, expira }) => ({ ok: true, usuario, clave, expira }));
});

apiUsuarios.post("/:id/clave-temporal", async (c) => {
  const id = idDeCuenta(c);
  if (!id) return noEncontrado(c, "Esa cuenta no existe.");
  const r = await generarTemporal(c.var.servicios.db, actorDe(c), id);
  return responder(c, r, ({ usuario, clave, expira }) => ({ ok: true, usuario, clave, expira }));
});

/**
 * Un solo endpoint para los tres cambios que admite una cuenta: sus datos, su
 * rol o si está activa. Cada uno tiene sus reglas duras en la capa de datos
 * (nadie se degrada a sí mismo, siempre queda un maestro activo).
 */
apiUsuarios.patch("/:id", async (c) => {
  const id = idDeCuenta(c);
  if (!id) return noEncontrado(c, "Esa cuenta no existe.");
  const actor = actorDe(c);
  const datos = await cuerpo(c);
  const db = c.var.servicios.db;

  if (datos.rol !== undefined) return responder(c, await cambiarRol(db, actor, id, datos.rol));
  if (datos.activo !== undefined) {
    const activo = datos.activo === true || datos.activo === 1 || datos.activo === "1" || datos.activo === "true";
    return responder(c, await cambiarActivo(db, actor, id, activo));
  }
  return responder(c, await editarDatos(db, actor, id, datos), (usuario) => ({ ok: true, usuario }));
});
