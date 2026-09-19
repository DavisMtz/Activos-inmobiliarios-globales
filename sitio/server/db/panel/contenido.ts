/**
 * Servicios y preguntas (PLAN §11.2, pantalla «Contenido»). Las
 * dos se editan igual: una lista de fichas con orden y un interruptor de
 * «se ve / no se ve». Por eso hay UNA implementación y una tabla que dice en
 * qué se diferencian. Los testimonios eran la tercera lista; desde el
 * 19/09/2026 son las «Entregas» (`server/db/panel/entregas.ts`), porque llevan
 * fotos y el permiso del cliente.
 *
 * Los nombres de tabla y de columna salen SOLO de esa tabla de aquí abajo:
 * nunca de lo que mande el navegador.
 */

import { puede, type Actor } from "../../../shared/permisos";
import { sentenciaBitacora } from "../../bitacora";
import { ahora } from "../../fechas";
import { exito, fallo, type Resultado } from "../../resultado";

export const TIPOS_DE_CONTENIDO = ["servicio", "pregunta"] as const;
export type TipoDeContenido = (typeof TIPOS_DE_CONTENIDO)[number];

type Especificacion = {
  tabla: string;
  /** Columnas de texto con su tope de caracteres; las dos primeras son obligatorias. */
  campos: [string, number][];
  conOrden: boolean;
  conFecha: boolean;
  etiqueta: string;
};

const ESPECIFICACION: Record<TipoDeContenido, Especificacion> = {
  servicio: {
    tabla: "servicios",
    campos: [
      ["titulo", 80],
      ["descripcion", 600],
      ["icono", 40],
    ],
    conOrden: true,
    conFecha: false,
    etiqueta: "servicio",
  },
  pregunta: {
    tabla: "preguntas",
    campos: [
      ["pregunta", 200],
      ["respuesta", 1200],
    ],
    conOrden: true,
    conFecha: false,
    etiqueta: "pregunta",
  },
};

export type Elemento = { id: number; visible: boolean; orden: number } & Record<string, unknown>;

export const esTipoDeContenido = (valor: unknown): valor is TipoDeContenido =>
  typeof valor === "string" && (TIPOS_DE_CONTENIDO as readonly string[]).includes(valor);

const columnas = (spec: Especificacion): string[] => [
  "id",
  ...spec.campos.map(([campo]) => campo),
  ...(spec.conOrden ? ["orden"] : []),
  "visible",
];

export async function leerElementos(db: D1Database, tipo: TipoDeContenido): Promise<Elemento[]> {
  const spec = ESPECIFICACION[tipo];
  const { results } = await db
    .prepare(
      `SELECT ${columnas(spec).join(", ")} FROM ${spec.tabla} ORDER BY ${spec.conOrden ? "orden, id" : "id DESC"}`,
    )
    .all<Record<string, unknown>>();
  return results.map((fila) => ({
    ...fila,
    id: Number(fila.id),
    orden: Number(fila.orden ?? 0),
    visible: fila.visible === 1,
  })) as Elemento[];
}

/** Las tres listas de una vez: la pantalla de contenido las enseña juntas. */
export async function leerTodoElContenido(
  db: D1Database,
): Promise<Record<TipoDeContenido, Elemento[]>> {
  const [servicios, preguntas] = await Promise.all(TIPOS_DE_CONTENIDO.map((tipo) => leerElementos(db, tipo)));
  return { servicio: servicios, pregunta: preguntas };
}

const SIN_PERMISO = "No tienes permiso para cambiar los textos del sitio.";

const limpiar = (valor: unknown, tope: number): string =>
  typeof valor === "string" ? valor.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, tope) : "";

export async function guardarElemento(
  db: D1Database,
  actor: Actor,
  tipo: TipoDeContenido,
  id: number | null,
  datos: Record<string, unknown>,
): Promise<Resultado<{ id: number }>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const spec = ESPECIFICACION[tipo];

  const valores = spec.campos.map(([campo, tope]) => limpiar(datos[campo], tope));
  for (const [i, [campo]] of spec.campos.entries()) {
    // El tercer campo (el icono de un servicio) es opcional.
    if (i < 2 && valores[i].length < 2) {
      return fallo(400, "datos_incompletos", `Falta ${campo === "texto" ? "el texto" : `«${campo}»`}.`);
    }
  }

  const nombres = spec.campos.map(([campo]) => campo);
  const visible = datos.visible === undefined ? 1 : datos.visible === true || datos.visible === "1" || datos.visible === "on" ? 1 : 0;

  if (id === null) {
    const extra = [
      ...(spec.conOrden ? ["orden"] : []),
      "visible",
      ...(spec.conFecha ? ["creado_en"] : []),
    ];
    const extraValores: unknown[] = [
      ...(spec.conOrden ? [Number(datos.orden) || 999] : []),
      visible,
      ...(spec.conFecha ? [ahora()] : []),
    ];
    const [insercion] = await db.batch([
      db
        .prepare(
          `INSERT INTO ${spec.tabla} (${[...nombres, ...extra].join(", ")})
           VALUES (${[...nombres, ...extra].map(() => "?").join(", ")})`,
        )
        .bind(...valores, ...extraValores),
      sentenciaBitacora(db, {
        usuarioId: actor.id,
        entidad: "contenido",
        entidadId: `${tipo}:nuevo`,
        accion: "crear",
        cambios: { tipo, [nombres[0]]: valores[0] },
      }),
    ]);
    return exito({ id: Number(insercion.meta.last_row_id) });
  }

  const [, actualizacion] = await db.batch([
    sentenciaBitacora(
      db,
      {
        usuarioId: actor.id,
        entidad: "contenido",
        entidadId: `${tipo}:${id}`,
        accion: "editar",
        cambios: { tipo, [nombres[0]]: valores[0], visible: visible === 1 },
      },
      { sql: `SELECT 1 FROM ${spec.tabla} WHERE id = ?`, valores: [id] },
    ),
    db
      .prepare(
        `UPDATE ${spec.tabla} SET ${nombres.map((n) => `${n} = ?`).join(", ")}, visible = ?
          ${spec.conOrden && datos.orden !== undefined ? ", orden = ?" : ""}
          WHERE id = ?`,
      )
      .bind(...valores, visible, ...(spec.conOrden && datos.orden !== undefined ? [Number(datos.orden) || 0] : []), id),
  ]);

  if (actualizacion.meta.changes !== 1) return fallo(404, "no_encontrado", "Eso ya no existe.");
  return exito({ id });
}

export async function borrarElemento(
  db: D1Database,
  actor: Actor,
  tipo: TipoDeContenido,
  id: number,
): Promise<Resultado<null>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const spec = ESPECIFICACION[tipo];

  const [, borrado] = await db.batch([
    sentenciaBitacora(
      db,
      { usuarioId: actor.id, entidad: "contenido", entidadId: `${tipo}:${id}`, accion: "borrar", cambios: { tipo } },
      { sql: `SELECT 1 FROM ${spec.tabla} WHERE id = ?`, valores: [id] },
    ),
    db.prepare(`DELETE FROM ${spec.tabla} WHERE id = ?`).bind(id),
  ]);

  if (borrado.meta.changes !== 1) return fallo(404, "no_encontrado", "Eso ya no existe.");
  return exito(null);
}

/** El orden que quedó al arrastrar: la posición de cada id, en una sola ida. */
export async function ordenarElementos(
  db: D1Database,
  actor: Actor,
  tipo: TipoDeContenido,
  ids: number[],
): Promise<Resultado<null>> {
  if (!puede(actor, "contenido.editar")) return fallo(403, "sin_permiso", SIN_PERMISO);
  const spec = ESPECIFICACION[tipo];
  if (!spec.conOrden) return fallo(400, "sin_orden", "Esta lista no se ordena.");

  const limpios = ids.filter((id) => Number.isInteger(id)).slice(0, 200);
  if (!limpios.length) return exito(null);

  await db.batch([
    ...limpios.map((id, posicion) =>
      db.prepare(`UPDATE ${spec.tabla} SET orden = ? WHERE id = ?`).bind(posicion + 1, id),
    ),
    sentenciaBitacora(db, {
      usuarioId: actor.id,
      entidad: "contenido",
      entidadId: `${tipo}:orden`,
      accion: "ordenar",
      cambios: { tipo, cuantos: limpios.length },
    }),
  ]);
  return exito(null);
}
