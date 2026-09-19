import { Hono, type Context } from "hono";
import { leerFicha, leerCatalogo, listar } from "../db/propiedades";
import { esTipoEvento, guardarEvento } from "../db/eventos";
import { guardarProspecto, revisarProspecto, TIPOS_PROSPECTO, type TipoProspecto } from "../db/prospectos";
import {
  firmaParaElCliente,
  quitarFotoDelCliente,
  registrarFotoDelCliente,
} from "../db/entregas";
import { borrarDeCloudinary } from "../cloudinary";
import { leerFiltros } from "../../shared/filtros";
import { contextoDePeticion } from "../http";
import type { EntornoHono } from "./tipos";

/**
 * API pública (PLAN §12). Usa las MISMAS funciones que los loaders de las
 * pantallas, así que no puede desfasarse del sitio: si el listado cuenta 38,
 * la API cuenta 38.
 *
 * Nada de aquí necesita sesión, pero todo lo que escribe pasa por el límite
 * por IP y por el campo trampa.
 */
export const apiPublica = new Hono<EntornoHono>();

const noEncontrado = (c: Context<EntornoHono>) =>
  c.json({ error: "no_encontrado", mensaje: "No existe esa propiedad." }, 404);

// ─── Catálogo ─────────────────────────────────────────────────────

apiPublica.get("/propiedades", async (c) => {
  const { db, config } = c.var.servicios;
  const filtros = leerFiltros(new URL(c.req.url).searchParams);
  const catalogo = await leerCatalogo(db);
  const pagina = await listar(db, filtros, catalogo, config.cloudinary.cloudName);

  return c.json({
    total: pagina.total,
    pagina: pagina.pagina,
    paginas: pagina.paginas,
    items: pagina.items,
    // Los rangos reales, para que quien consuma la API no invente un tope.
    rangos: catalogo.rangos,
  });
});

apiPublica.get("/propiedades/:slug", async (c) => {
  const { db, config } = c.var.servicios;
  const ficha = await leerFicha(db, c.req.param("slug"), config.cloudinary.cloudName);
  return ficha ? c.json(ficha) : noEncontrado(c);
});

// ─── Prospectos ───────────────────────────────────────────────────

apiPublica.post("/prospectos", async (c) => {
  const { servicios } = c.var;
  const peticion = contextoDePeticion(c.req.raw);

  let formulario: FormData;
  try {
    formulario = await c.req.formData();
  } catch {
    return c.json({ error: "datos_invalidos", mensaje: "No pudimos leer el formulario." }, 400);
  }

  const tipoPedido = String(formulario.get("tipo") ?? "general");
  const tipo: TipoProspecto = (TIPOS_PROSPECTO as readonly string[]).includes(tipoPedido)
    ? (tipoPedido as TipoProspecto)
    : "general";

  // La casa se resuelve por su slug, no por el id: el id es interno.
  const slug = String(formulario.get("propiedad") ?? "").trim();
  let propiedadId: number | null = null;
  if (slug) {
    const ficha = await leerFicha(servicios.db, slug, "");
    if (!ficha) return noEncontrado(c);
    propiedadId = ficha.id;
  }

  const revision = revisarProspecto(formulario, { tipo, propiedadId, origen: "api" });
  if (!revision.ok) {
    return c.json({ error: "datos_invalidos", campo: revision.campo, mensaje: revision.mensaje }, 400);
  }
  if (revision.trampa) return c.json({ ok: true });

  const permitido = await servicios.limites.formularios.limit({ key: `formulario:${peticion.ip}` });
  if (!permitido.success) {
    return c.json(
      { error: "demasiados_intentos", mensaje: "Recibimos varios mensajes desde aquí. Espera un minuto." },
      429,
    );
  }

  await guardarProspecto(servicios.db, revision.valor);
  return c.json({ ok: true });
});

// ─── Fotos del cliente en su entrega ──────────────────────────────

/**
 * Lo que hace el cliente desde su enlace personal (F5). El enlace ES la llave
 * y el freno: sin él, 404; con él, hasta `FOTOS_DEL_CLIENTE` fotos y solo
 * mientras no haya enviado su respuesta. Por eso no pasan por el límite por IP
 * de los formularios, que con cuatro fotos (ocho peticiones) ya saltaría.
 * La respuesta en sí (comentario y permisos) va por la acción de la página.
 */
const falloDeEntrega = (c: Context<EntornoHono>, r: { estado: number; error: string; mensaje: string }) =>
  c.json({ error: r.error, mensaje: r.mensaje }, r.estado as 400 | 404 | 409);

apiPublica.post("/entregas/:token/firma", async (c) => {
  const { db, config } = c.var.servicios;
  const r = await firmaParaElCliente(db, config.cloudinary, c.req.param("token"));
  return r.ok ? c.json({ ok: true, ...r.valor }) : falloDeEntrega(c, r);
});

apiPublica.post("/entregas/:token/fotos", async (c) => {
  const { db, config } = c.var.servicios;
  let datos: Record<string, unknown> = {};
  try {
    datos = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "datos_invalidos", mensaje: "No pudimos leer la foto." }, 400);
  }
  const r = await registrarFotoDelCliente(
    db,
    config.cloudinary,
    c.req.param("token"),
    { publicId: datos.public_id, version: datos.version, signature: datos.signature, ancho: datos.width, alto: datos.height },
    (promesa) => c.executionCtx.waitUntil(promesa),
  );
  return r.ok ? c.json({ ok: true, id: r.valor.id }) : falloDeEntrega(c, r);
});

apiPublica.delete("/entregas/:token/fotos/:id", async (c) => {
  const { db, config } = c.var.servicios;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "no_encontrado", mensaje: "Esa foto ya no está." }, 404);
  const r = await quitarFotoDelCliente(db, c.req.param("token"), id);
  if (!r.ok) return falloDeEntrega(c, r);
  c.executionCtx.waitUntil(borrarDeCloudinary(config.cloudinary, r.valor.publicId));
  return c.json({ ok: true });
});

// ─── Eventos ──────────────────────────────────────────────────────

/**
 * Lo manda el navegador con `sendBeacon`, o sea que la respuesta no le importa
 * y no debe hacerle esperar: se contesta de inmediato y la escritura se
 * termina después, con `waitUntil`.
 */
apiPublica.post("/eventos", async (c) => {
  const { db } = c.var.servicios;

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "datos_invalidos", mensaje: "Cuerpo ilegible." }, 400);
  }

  const tipo = cuerpo.tipo;
  if (!esTipoEvento(tipo)) return c.json({ error: "datos_invalidos", mensaje: "Evento desconocido." }, 400);

  const slug = typeof cuerpo.propiedad === "string" ? cuerpo.propiedad.trim() : "";
  if (!slug) {
    c.executionCtx.waitUntil(guardarEvento(db, tipo, null));
    return c.body(null, 204);
  }

  const ficha = await leerFicha(db, slug, "");
  if (!ficha) return noEncontrado(c);

  c.executionCtx.waitUntil(guardarEvento(db, tipo, ficha.id));
  return c.body(null, 204);
});
