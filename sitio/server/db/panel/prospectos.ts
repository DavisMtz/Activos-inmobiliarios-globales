/**
 * Bandeja de prospectos (PLAN §11.2 y §9).
 *
 * Lo que decide quién ve qué es el ALCANCE del permiso, no la pantalla: un
 * asesor solo ve los que tiene asignados, y un prospecto sin dueño tampoco es
 * suyo (§9: «solo los asignados a él»). Por eso el filtro de la consulta se
 * arma aquí y no en el loader: la lista y el CSV no pueden separarse.
 *
 * Se ordena por `id` y no por `creado_en`, igual que la bitácora: el id es el
 * rowid, así que recorrerlo hacia atrás son 25 filas leídas y no la tabla
 * entera. Las filas leídas se pagan (PLAN §17).
 *
 * Nada de lo que se escribe aquí manda correos: en la propuesta `MODO_DEMO`
 * está encendido y el prospecto se atiende desde el panel (D11).
 */

import { patronBusqueda } from "../../../shared/busqueda";
import { armarCSV, fechaParaExcel, type ColumnaCSV } from "../../../shared/csv";
import { alcance, puede, type Actor } from "../../../shared/permisos";
import {
  ETIQUETA_ESTADO_PROSPECTO,
  ETIQUETA_TIPO_PROSPECTO,
  ESTADOS_ABIERTOS,
  esEstadoProspecto,
  type EstadoProspecto,
  type TipoProspecto,
} from "../../../shared/prospecto";
import { enlaceWhatsApp, numeroInternacionalMX } from "../../../shared/whatsapp";
import { sentenciaBitacora } from "../../bitacora";
import { ahora } from "../../fechas";
import { exito, fallo, type Resultado } from "../../resultado";

export const POR_PAGINA_PROSPECTOS = 25;

/** Tope del CSV: con más, el archivo deja de abrirse cómodo y nadie lo lee. */
const TOPE_CSV = 5_000;

/** Lo más largo que se guarda en una nota, para que la bandeja siga legible. */
const LARGO_NOTA = 1_000;

// ─── Filtros ──────────────────────────────────────────────────────

export type FiltrosProspectos = {
  q: string | null;
  estado: EstadoProspecto | null;
  /** Id del asesor, o `"nadie"` para los que no tienen dueño todavía. */
  asesor: string | null;
  /** Solo los que siguen vivos: nuevo, contactado y con cita. */
  abiertos: boolean;
  pagina: number;
};

export const FILTROS_PROSPECTOS_VACIOS: FiltrosProspectos = {
  q: null,
  estado: null,
  asesor: null,
  abiertos: false,
  pagina: 1,
};

/** Los filtros viven en la URL, como en el resto del panel: se comparten y se recargan. */
export function leerFiltrosProspectos(parametros: URLSearchParams): FiltrosProspectos {
  const estado = parametros.get("estado") ?? "";
  const asesor = (parametros.get("asesor") ?? "").trim();
  const pagina = Number(parametros.get("pagina") ?? 1);
  const q = (parametros.get("q") ?? "").trim();

  return {
    q: q && patronBusqueda(q) ? q.replace(/\s+/g, " ").slice(0, 80) : null,
    estado: esEstadoProspecto(estado) ? estado : null,
    asesor: asesor === "nadie" || /^[0-9a-fA-F-]{10,40}$/.test(asesor) ? asesor : null,
    abiertos: parametros.get("abiertos") === "1",
    pagina: Number.isInteger(pagina) && pagina > 0 && pagina < 10_000 ? pagina : 1,
  };
}

// ─── Lo que devuelve la bandeja ───────────────────────────────────

export type NotaProspecto = {
  id: number;
  texto: string;
  quien: string;
  cuando: string;
};

export type FilaProspecto = {
  id: number;
  tipo: TipoProspecto;
  estado: EstadoProspecto;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  mensaje: string | null;
  origen: string | null;
  creadoEn: string;
  asesorId: string | null;
  asesor: string | null;
  casa: { id: number; clave: string; titulo: string; slug: string } | null;
  /** Ya armado en el servidor: el panel no necesita saber de plantillas. */
  whatsapp: string | null;
  notas: NotaProspecto[];
};

export type PaginaProspectos = {
  items: FilaProspecto[];
  total: number;
  pagina: number;
  paginas: number;
  /** Cuántos siguen abiertos, con los mismos filtros quitando el de estado. */
  abiertos: number;
};

type FilaCruda = {
  id: number;
  tipo: TipoProspecto;
  estado: EstadoProspecto;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  mensaje: string | null;
  origen: string | null;
  creado_en: string;
  asesor_id: string | null;
  asesor: string | null;
  casa_id: number | null;
  clave: string | null;
  titulo: string | null;
  slug: string | null;
};

const DESDE = `FROM prospectos pr
       LEFT JOIN propiedades p ON p.id = pr.propiedad_id
       LEFT JOIN usuarios u ON u.id = pr.asesor_id`;

const BUSCABLE = "pr.nombre || ' ' || COALESCE(pr.telefono, '') || ' ' || COALESCE(pr.correo, '')";

/** «Solo los suyos» del asesor (§9). Uno sin asignar tampoco es suyo. */
const soloLosSuyos = (actor: Actor): boolean => alcance(actor, "prospectos.ver") === "propias";

function condiciones(actor: Actor, filtros: FiltrosProspectos): { sql: string; valores: unknown[] } {
  const partes: string[] = ["1 = 1"];
  const valores: unknown[] = [];

  // El alcance manda sobre el filtro: un asesor no puede pedir los de otro.
  if (soloLosSuyos(actor)) {
    partes.push("pr.asesor_id = ?");
    valores.push(actor.id);
  } else if (filtros.asesor === "nadie") {
    partes.push("pr.asesor_id IS NULL");
  } else if (filtros.asesor) {
    partes.push("pr.asesor_id = ?");
    valores.push(filtros.asesor);
  }

  if (filtros.estado) {
    partes.push("pr.estado = ?");
    valores.push(filtros.estado);
  } else if (filtros.abiertos) {
    partes.push(`pr.estado IN (${ESTADOS_ABIERTOS.map(() => "?").join(", ")})`);
    valores.push(...ESTADOS_ABIERTOS);
  }

  if (filtros.q) {
    const patron = patronBusqueda(filtros.q);
    if (patron) {
      partes.push(`(${BUSCABLE}) LIKE ?`);
      valores.push(patron);
    }
  }

  return { sql: partes.join(" AND "), valores };
}

/**
 * El mensaje con el que se contesta por WhatsApp. Se arma en el servidor con el
 * número ya internacional (`wa.me` no acepta diez cifras sueltas) y no dice
 * nada del negocio que no esté ya en la casa: quien escribe pone lo demás.
 */
function enlaceParaContestar(fila: FilaCruda): string | null {
  const numero = numeroInternacionalMX(fila.telefono ?? "");
  if (!numero) return null;
  const nombre = fila.nombre.split(" ")[0] ?? fila.nombre;
  const texto = fila.titulo && fila.clave
    ? `Hola ${nombre}, le escribo por su mensaje sobre ${fila.titulo} (${fila.clave}).`
    : `Hola ${nombre}, le escribo por el mensaje que nos dejó en el sitio.`;
  return enlaceWhatsApp(numero, texto);
}

export async function listarProspectos(
  db: D1Database,
  actor: Actor,
  filtros: FiltrosProspectos,
): Promise<PaginaProspectos> {
  const { sql, valores } = condiciones(actor, filtros);
  const desde = (filtros.pagina - 1) * POR_PAGINA_PROSPECTOS;
  // Los abiertos se cuentan con los mismos filtros pero sin el de estado: es la
  // cifra que dice «esto es lo que falta por atender», no «esto es lo que ves».
  const sinEstado = condiciones(actor, { ...filtros, estado: null, abiertos: false });

  const [cuenta, filas, abiertos] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n ${DESDE} WHERE ${sql}`).bind(...valores),
    db
      .prepare(
        `SELECT pr.id, pr.tipo, pr.estado, pr.nombre, pr.telefono, pr.correo, pr.mensaje, pr.origen, pr.creado_en,
                pr.asesor_id, u.nombre AS asesor,
                p.id AS casa_id, p.clave, p.titulo, p.slug
           ${DESDE}
          WHERE ${sql}
          ORDER BY pr.id DESC
          LIMIT ? OFFSET ?`,
      )
      .bind(...valores, POR_PAGINA_PROSPECTOS, desde),
    db
      .prepare(
        `SELECT COUNT(*) AS n ${DESDE}
          WHERE ${sinEstado.sql} AND pr.estado IN (${ESTADOS_ABIERTOS.map(() => "?").join(", ")})`,
      )
      .bind(...sinEstado.valores, ...ESTADOS_ABIERTOS),
  ]);

  const crudas = filas.results as FilaCruda[];
  const notas = await notasDe(db, crudas.map((fila) => fila.id));
  const total = Number((cuenta.results[0] as { n: number } | undefined)?.n ?? 0);

  return {
    items: crudas.map((fila) => aFilaProspecto(fila, notas.get(fila.id) ?? [])),
    total,
    pagina: filtros.pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA_PROSPECTOS)),
    abiertos: Number((abiertos.results[0] as { n: number } | undefined)?.n ?? 0),
  };
}

/**
 * Las notas de TODA la página en una sola consulta, no una por prospecto: 25
 * consultas para pintar una lista es justo lo que tumbó la cuenta en F1.5.
 */
async function notasDe(db: D1Database, ids: number[]): Promise<Map<number, NotaProspecto[]>> {
  const notas = new Map<number, NotaProspecto[]>();
  if (!ids.length) return notas;

  const { results } = await db
    .prepare(
      `SELECT n.id, n.prospecto_id, n.texto, n.creado_en, u.nombre AS quien
         FROM notas_prospecto n
         LEFT JOIN usuarios u ON u.id = n.usuario_id
        WHERE n.prospecto_id IN (${ids.map(() => "?").join(", ")})
        ORDER BY n.id ASC`,
    )
    .bind(...ids)
    .all<{ id: number; prospecto_id: number; texto: string; creado_en: string; quien: string | null }>();

  for (const fila of results) {
    const lista = notas.get(fila.prospecto_id) ?? [];
    lista.push({ id: fila.id, texto: fila.texto, quien: fila.quien ?? "—", cuando: fila.creado_en });
    notas.set(fila.prospecto_id, lista);
  }
  return notas;
}

const aFilaProspecto = (fila: FilaCruda, notas: NotaProspecto[]): FilaProspecto => ({
  id: fila.id,
  tipo: fila.tipo,
  estado: fila.estado,
  nombre: fila.nombre,
  telefono: fila.telefono,
  correo: fila.correo,
  mensaje: fila.mensaje,
  origen: fila.origen,
  creadoEn: fila.creado_en,
  asesorId: fila.asesor_id,
  asesor: fila.asesor,
  casa:
    fila.casa_id && fila.clave && fila.titulo && fila.slug
      ? { id: fila.casa_id, clave: fila.clave, titulo: fila.titulo, slug: fila.slug }
      : null,
  whatsapp: enlaceParaContestar(fila),
  notas,
});

/**
 * Uno solo, con sus notas (`GET /api/panel/prospectos/:id`). La bandeja no lo
 * usa: trae la página entera de una vez.
 *
 * Si no es suyo contesta 403 y no 404: decirle a un asesor que «no existe» un
 * prospecto que sí existe sería mentirle.
 */
export async function leerProspecto(db: D1Database, actor: Actor, id: number): Promise<Resultado<FilaProspecto>> {
  const fila = await db
    .prepare(
      `SELECT pr.id, pr.tipo, pr.estado, pr.nombre, pr.telefono, pr.correo, pr.mensaje, pr.origen, pr.creado_en,
              pr.asesor_id, u.nombre AS asesor, p.id AS casa_id, p.clave, p.titulo, p.slug
         ${DESDE}
        WHERE pr.id = ?`,
    )
    .bind(id)
    .first<FilaCruda>();

  if (!fila) return fallo(404, "no_encontrado", "Ese prospecto ya no está.");
  if (!puede(actor, "prospectos.ver", { asesor_id: fila.asesor_id })) {
    return fallo(403, "sin_permiso", "Ese prospecto no está asignado a ti.");
  }
  const notas = await notasDe(db, [fila.id]);
  return exito(aFilaProspecto(fila, notas.get(fila.id) ?? []));
}

// ─── Cambios ──────────────────────────────────────────────────────

type FilaParaCambiar = { id: number; estado: EstadoProspecto; asesor_id: string | null };

/**
 * Busca el prospecto y comprueba el permiso sobre ÉL, no en general: un asesor
 * recibe 403 por el ajeno (no 404, que le diría que no existe cuando sí).
 */
async function paraCambiar(
  db: D1Database,
  actor: Actor,
  id: number,
  permiso: "prospectos.gestionar" | "prospectos.asignar",
): Promise<Resultado<FilaParaCambiar>> {
  const fila = await db
    .prepare("SELECT id, estado, asesor_id FROM prospectos WHERE id = ?")
    .bind(id)
    .first<FilaParaCambiar>();
  if (!fila) return fallo(404, "no_encontrado", "Ese prospecto ya no está.");
  if (!puede(actor, permiso, { asesor_id: fila.asesor_id })) {
    return fallo(403, "sin_permiso", "No tienes permiso para atender este prospecto.");
  }
  return exito(fila);
}

/**
 * Cambia el estado. Se admite cualquiera de los cinco a propósito
 * (`shared/prospecto.ts`): marcar «contactado» por error y no poder volver
 * sería peor que un botón de más.
 *
 * El `UPDATE` es condicional y la bitácora lleva la MISMA guarda (PLAN §11.4):
 * D1 no tiene transacciones interactivas, así que si alguien lo movió mientras
 * tanto, ni se cambia ni se anota.
 */
export async function cambiarEstadoProspecto(
  db: D1Database,
  actor: Actor,
  id: number,
  nuevo: unknown,
): Promise<Resultado<{ estado: EstadoProspecto }>> {
  if (!esEstadoProspecto(nuevo)) return fallo(400, "datos_invalidos", "Ese estado no existe.");

  const encontrado = await paraCambiar(db, actor, id, "prospectos.gestionar");
  if (!encontrado.ok) return encontrado;
  const fila = encontrado.valor;
  if (fila.estado === nuevo) return exito({ estado: nuevo });

  const guarda = { sql: "SELECT 1 FROM prospectos WHERE id = ? AND estado = ?", valores: [id, fila.estado] };
  const [, actualizacion] = await db.batch([
    sentenciaBitacora(
      db,
      {
        usuarioId: actor.id,
        entidad: "prospecto",
        entidadId: String(id),
        accion: "estado",
        // Solo estados: en la bitácora nunca entran el nombre, el teléfono ni
        // el mensaje de una persona que escribió desde el sitio.
        cambios: { estado: [fila.estado, nuevo] },
      },
      guarda,
    ),
    db.prepare("UPDATE prospectos SET estado = ? WHERE id = ? AND estado = ?").bind(nuevo, id, fila.estado),
  ]);

  if (actualizacion.meta.changes !== 1) {
    return fallo(409, "cambio_en_conflicto", "Alguien más movió este prospecto. Vuelve a cargar la lista.");
  }
  return exito({ estado: nuevo });
}

/** Asignar es de maestro y director (§9); `null` lo devuelve a «sin asignar». */
export async function asignarProspecto(
  db: D1Database,
  actor: Actor,
  id: number,
  asesorId: unknown,
): Promise<Resultado<{ asesorId: string | null }>> {
  const crudo = typeof asesorId === "string" ? asesorId.trim() : "";
  const nuevo = crudo && /^[0-9a-fA-F-]{10,40}$/.test(crudo) ? crudo : null;
  if (crudo && !nuevo) return fallo(400, "datos_invalidos", "Esa cuenta no existe.");

  const encontrado = await paraCambiar(db, actor, id, "prospectos.asignar");
  if (!encontrado.ok) return encontrado;
  const fila = encontrado.valor;

  if (nuevo) {
    // Quien atiende tiene que poder entrar: una cuenta apagada no cuenta.
    const persona = await db
      .prepare("SELECT id FROM usuarios WHERE id = ? AND activo = 1")
      .bind(nuevo)
      .first<{ id: string }>();
    if (!persona) return fallo(400, "datos_invalidos", "Esa cuenta no existe o está desactivada.");
  }
  if (fila.asesor_id === nuevo) return exito({ asesorId: nuevo });

  const guarda = { sql: "SELECT 1 FROM prospectos WHERE id = ? AND asesor_id IS ?", valores: [id, fila.asesor_id] };
  const [, actualizacion] = await db.batch([
    sentenciaBitacora(
      db,
      {
        usuarioId: actor.id,
        entidad: "prospecto",
        entidadId: String(id),
        accion: "asignar",
        cambios: { asesor: [fila.asesor_id, nuevo] },
      },
      guarda,
    ),
    db.prepare("UPDATE prospectos SET asesor_id = ? WHERE id = ? AND asesor_id IS ?").bind(nuevo, id, fila.asesor_id),
  ]);

  if (actualizacion.meta.changes !== 1) {
    return fallo(409, "cambio_en_conflicto", "Alguien más lo asignó mientras tanto. Vuelve a cargar la lista.");
  }
  return exito({ asesorId: nuevo });
}

/** Una nota de seguimiento: «no contestó», «quedamos el jueves». */
export async function agregarNota(
  db: D1Database,
  actor: Actor,
  id: number,
  texto: unknown,
): Promise<Resultado<{ nota: NotaProspecto }>> {
  const limpio = String(texto ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, LARGO_NOTA);
  if (limpio.length < 2) return fallo(400, "datos_invalidos", "Escribe la nota antes de guardarla.");

  const encontrado = await paraCambiar(db, actor, id, "prospectos.gestionar");
  if (!encontrado.ok) return encontrado;

  const momento = ahora();
  const [insercion] = await db.batch([
    db
      .prepare("INSERT INTO notas_prospecto (prospecto_id, usuario_id, texto, creado_en) VALUES (?, ?, ?, ?)")
      .bind(id, actor.id, limpio, momento),
    sentenciaBitacora(db, {
      usuarioId: actor.id,
      entidad: "prospecto",
      entidadId: String(id),
      accion: "nota",
      // El texto de la nota NO entra en la bitácora: ya está en su tabla, y
      // repetirlo la llenaría de datos de personas.
      cambios: { caracteres: limpio.length },
    }),
  ]);

  return exito({
    nota: {
      id: Number(insercion.meta.last_row_id),
      texto: limpio,
      quien: "",
      cuando: momento,
    },
  });
}

// ─── Exportar a CSV ───────────────────────────────────────────────

const COLUMNAS_CSV: ColumnaCSV[] = [
  { titulo: "Id", literal: true },
  { titulo: "Fecha", literal: true },
  { titulo: "Estado", literal: true },
  { titulo: "De dónde", literal: true },
  { titulo: "Nombre" },
  { titulo: "Teléfono", literal: true },
  { titulo: "Correo" },
  { titulo: "Mensaje" },
  { titulo: "Casa", literal: true },
  { titulo: "Título de la casa" },
  { titulo: "Asesor" },
  { titulo: "Origen" },
  { titulo: "Notas", literal: true },
];

/**
 * El CSV para Excel (PLAN §15, F4). Respeta los filtros de la pantalla: se
 * exporta lo que se está viendo, no siempre todo.
 *
 * Solo lo piden maestro y director (`prospectos.exportar`), así que aquí no hay
 * recorte por alcance; aun así se arma con las MISMAS condiciones que la lista,
 * para que no puedan desfasarse.
 */
export async function prospectosEnCSV(
  db: D1Database,
  actor: Actor,
  filtros: FiltrosProspectos,
): Promise<Resultado<string>> {
  if (!puede(actor, "prospectos.exportar")) {
    return fallo(403, "sin_permiso", "No tienes permiso para exportar los prospectos.");
  }

  const { sql, valores } = condiciones(actor, filtros);
  const { results } = await db
    .prepare(
      `SELECT pr.id, pr.tipo, pr.estado, pr.nombre, pr.telefono, pr.correo, pr.mensaje, pr.origen, pr.creado_en,
              u.nombre AS asesor, p.clave, p.titulo,
              (SELECT COUNT(*) FROM notas_prospecto n WHERE n.prospecto_id = pr.id) AS notas
         ${DESDE}
        WHERE ${sql}
        ORDER BY pr.id DESC
        LIMIT ?`,
    )
    .bind(...valores, TOPE_CSV)
    .all<FilaCruda & { asesor: string | null; notas: number }>();

  const filas = results.map((fila) => [
    fila.id,
    fechaParaExcel(fila.creado_en),
    ETIQUETA_ESTADO_PROSPECTO[fila.estado] ?? fila.estado,
    ETIQUETA_TIPO_PROSPECTO[fila.tipo] ?? fila.tipo,
    fila.nombre,
    fila.telefono ?? "",
    fila.correo ?? "",
    fila.mensaje ?? "",
    fila.clave ?? "",
    fila.titulo ?? "",
    fila.asesor ?? "",
    fila.origen ?? "",
    fila.notas,
  ]);

  return exito(armarCSV(COLUMNAS_CSV, filas));
}

/** El nombre del archivo, con la fecha para que no se pisen en Descargas. */
export const nombreDelCSV = (): string => `prospectos-${ahora().slice(0, 10)}.csv`;
