import { ahora } from "./fechas";

export type Entidad = "propiedad" | "foto" | "configuracion" | "contenido" | "usuario" | "prospecto" | "sistema" | "entrega";

/**
 * De dónde sale el id de la entidad: un texto, o una consulta cuando el id
 * todavía no existe (una casa que se está creando en este mismo batch).
 */
export type IdDeEntidad = string | { sql: string; valores: unknown[] };

export type EntradaBitacora = {
  /** Quien actuó. NULL si no hay sesión (un acceso fallido) o fue un script. */
  usuarioId: string | null;
  entidad: Entidad;
  entidadId: IdDeEntidad;
  accion: string;
  /** {campo: [antes, después]} u otros datos del suceso. NUNCA claves ni hashes. */
  cambios?: Record<string, unknown>;
};

/** Precondición compartida con el cambio que se registra (ver abajo). */
export type Condicion = { sql: string; valores: unknown[] };

/**
 * Devuelve la sentencia en vez de ejecutarla: la bitácora se escribe en el
 * MISMO `db.batch()` que el cambio que registra (PLAN §11.4), así no puede
 * quedar un cambio sin rastro ni un rastro sin cambio.
 *
 * Con `condicion` la fila solo se escribe si esa consulta encuentra algo. Sirve
 * para que el rastro y el cambio dependan de la MISMA precondición: los cambios
 * del panel van con un `UPDATE … WHERE` condicional (D1 no tiene transacciones
 * interactivas, PLAN §17), y si la casa cambió debajo, ni se actualiza ni se
 * anota. La bitácora va primero en el batch: las dos sentencias miran el mismo
 * estado.
 */
export function sentenciaBitacora(
  db: D1Database,
  entrada: EntradaBitacora,
  condicion?: Condicion,
): D1PreparedStatement {
  const id = entrada.entidadId;
  const idSql = typeof id === "string" ? "?" : `(${id.sql})`;
  const valores: unknown[] = [
    entrada.usuarioId,
    entrada.entidad,
    ...(typeof id === "string" ? [id.slice(0, 254)] : id.valores),
    entrada.accion,
    entrada.cambios ? JSON.stringify(entrada.cambios) : null,
    ahora(),
  ];

  const columnas = "(usuario_id, entidad, entidad_id, accion, cambios, creado_en)";
  const sql = condicion
    ? `INSERT INTO bitacora ${columnas} SELECT ?, ?, ${idSql}, ?, ?, ? WHERE EXISTS (${condicion.sql})`
    : `INSERT INTO bitacora ${columnas} VALUES (?, ?, ${idSql}, ?, ?, ?)`;

  return db.prepare(sql).bind(...valores, ...(condicion?.valores ?? []));
}

/**
 * Diferencias campo por campo para la bitácora (PLAN §11.4). Solo lo que
 * cambió, y los textos largos recortados: una descripción entera por cada
 * edición llenaría la tabla y no ayuda a nadie a entender qué pasó.
 */
export function diferencias<T extends Record<string, unknown>>(antes: T, despues: T): Record<string, [unknown, unknown]> {
  const cambios: Record<string, [unknown, unknown]> = {};
  for (const campo of Object.keys(despues) as (keyof T & string)[]) {
    const a = antes[campo] ?? null;
    const b = despues[campo] ?? null;
    if (a === b) continue;
    cambios[campo] = [recortar(a), recortar(b)];
  }
  return cambios;
}

const LARGO_EN_BITACORA = 120;

const recortar = (valor: unknown): unknown =>
  typeof valor === "string" && valor.length > LARGO_EN_BITACORA
    ? `${valor.slice(0, LARGO_EN_BITACORA)}… (${valor.length} caracteres)`
    : valor;
