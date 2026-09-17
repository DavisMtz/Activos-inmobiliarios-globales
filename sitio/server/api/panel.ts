import { Hono, type Context } from "hono";
import { puede } from "../../shared/permisos";
import { cambiarClave, cerrarSesion, iniciarSesion } from "../auth/acceso";
import { permitidoConClaveTemporal, sesionDePeticion } from "../auth/guardia";
import { cookieBorrada, tokenDeCookie } from "../auth/sesion";
import { contextoDePeticion } from "../http";
import type { Fallo } from "../resultado";
import type { EntornoHono } from "./tipos";

/** API del panel: todo con sesión, `Origin` (en server/app.ts) y permiso. */
export const apiPanel = new Hono<EntornoHono>();

const responderFallo = (c: Context<EntornoHono>, f: Fallo) =>
  c.json({ error: f.error, mensaje: f.mensaje }, f.estado);

const noPermitido = (c: Context<EntornoHono>) =>
  c.json({ error: "sin_permiso", mensaje: "No tienes permiso para hacer esto." }, 403);

async function cuerpoJson(c: Context<EntornoHono>): Promise<Record<string, unknown>> {
  try {
    const cuerpo = await c.req.json();
    return cuerpo && typeof cuerpo === "object" ? (cuerpo as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ─── Sin sesión todavía ────────────────────────────────────────────

apiPanel.post("/sesion", async (c) => {
  const datos = await cuerpoJson(c);
  const r = await iniciarSesion(
    c.var.servicios,
    { correo: datos.correo, clave: datos.clave },
    contextoDePeticion(c.req.raw),
  );
  if (!r.ok) return responderFallo(c, r);
  c.header("Set-Cookie", r.valor.cookie);
  return c.json({ ok: true, debe_cambiar_clave: r.valor.soloCambioClave });
});

apiPanel.delete("/sesion", async (c) => {
  await cerrarSesion(c.var.servicios, tokenDeCookie(c.req.raw));
  c.header("Set-Cookie", cookieBorrada());
  return c.json({ ok: true });
});

// ─── Guardia: de aquí para abajo, sesión obligatoria ───────────────

apiPanel.use("*", async (c, next) => {
  const encontrada = await sesionDePeticion(c.var.servicios, c.req.raw);
  if (!encontrada) {
    return c.json({ error: "sin_sesion", mensaje: "Tu sesión terminó. Vuelve a entrar." }, 401);
  }
  if (encontrada.sesion.soloCambioClave && !permitidoConClaveTemporal(c.req.method, c.req.path)) {
    return c.json(
      { error: "debe_cambiar_clave", mensaje: "Primero cambia tu contraseña temporal." },
      403,
    );
  }
  c.set("sesion", encontrada.sesion);
  c.set("token", encontrada.token);
  await next();
});

apiPanel.get("/mi-cuenta", (c) => {
  const { usuario, soloCambioClave } = c.var.sesion;
  return c.json({ usuario, debe_cambiar_clave: soloCambioClave });
});

apiPanel.post("/mi-cuenta/clave", async (c) => {
  const datos = await cuerpoJson(c);
  const r = await cambiarClave(
    c.var.servicios,
    c.var.sesion,
    c.var.token,
    { actual: datos.actual, nueva: datos.nueva, confirmacion: datos.confirmacion },
    contextoDePeticion(c.req.raw),
  );
  if (!r.ok) return responderFallo(c, r);
  c.header("Set-Cookie", r.valor.cookie);
  return c.json({ ok: true });
});

apiPanel.get("/propiedades", async (c) => {
  const { usuario } = c.var.sesion;
  if (!puede(usuario, "propiedades.ver")) return noPermitido(c);
  const { results } = await c.var.servicios.db
    .prepare(
      `SELECT id, clave, titulo, estado, operacion, tipo, precio, precio_renta, asesor_id, actualizada_en
         FROM propiedades WHERE eliminada_en IS NULL
        ORDER BY actualizada_en DESC LIMIT 50`,
    )
    .all();
  return c.json({ items: results });
});

apiPanel.all("*", (c) => c.json({ error: "no_encontrado", mensaje: "No existe esa operación." }, 404));
