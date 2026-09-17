/**
 * Métricas propias, sin datos personales (PLAN §7, tabla `eventos`).
 *
 * Existen para que el equipo sepa qué casas se ven y cuáles mueven el teléfono,
 * sin depender de Google Analytics (que en la propuesta va apagado, `GA4_ID`
 * vacío, para no ensuciar la analítica real del sitio vivo).
 *
 * No se guarda IP, ni agente, ni nada que identifique a una persona: solo qué
 * pasó, sobre qué casa y cuándo.
 */

export const TIPOS_EVENTO = ["ficha_vista", "whatsapp_click", "telefono_click", "compartir"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const esTipoEvento = (valor: unknown): valor is TipoEvento =>
  typeof valor === "string" && (TIPOS_EVENTO as readonly string[]).includes(valor);

export async function guardarEvento(
  db: D1Database,
  tipo: TipoEvento,
  propiedadId: number | null,
): Promise<void> {
  await db
    .prepare("INSERT INTO eventos (tipo, propiedad_id, creado_en) VALUES (?, ?, ?)")
    .bind(tipo, propiedadId, new Date().toISOString())
    .run();
}
