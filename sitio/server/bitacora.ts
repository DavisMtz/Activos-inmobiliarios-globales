import { ahora } from "./fechas";

export type Entidad = "propiedad" | "foto" | "configuracion" | "contenido" | "usuario" | "prospecto" | "sistema";

export type EntradaBitacora = {
  /** Quien actuó. NULL si no hay sesión (un acceso fallido) o fue un script. */
  usuarioId: string | null;
  entidad: Entidad;
  entidadId: string;
  accion: string;
  /** {campo: [antes, después]} u otros datos del suceso. NUNCA claves ni hashes. */
  cambios?: Record<string, unknown>;
};

/**
 * Devuelve la sentencia en vez de ejecutarla: la bitácora se escribe en el
 * MISMO `db.batch()` que el cambio que registra (PLAN §11.4), así no puede
 * quedar un cambio sin rastro ni un rastro sin cambio.
 */
export function sentenciaBitacora(db: D1Database, entrada: EntradaBitacora): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO bitacora (usuario_id, entidad, entidad_id, accion, cambios, creado_en) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      entrada.usuarioId,
      entrada.entidad,
      entrada.entidadId.slice(0, 254),
      entrada.accion,
      entrada.cambios ? JSON.stringify(entrada.cambios) : null,
      ahora(),
    );
}
