/**
 * Prospectos: lo que deja quien pregunta por una casa (PLAN §10.2).
 *
 * En la propuesta **no se manda ningún correo** (D11, `MODO_DEMO`): el
 * prospecto queda guardado y se ve en el panel. Por eso el formulario no
 * depende de que Brevo funcione, que es lo que hoy nadie sabe del sitio actual
 * («no se sabe adónde llegan los mensajes»).
 *
 * Antispam de la propuesta: campo trampa + límite por IP. Turnstile entra en F6
 * cuando exista `TURNSTILE_SITE_KEY`.
 */

import { TIPOS_PROSPECTO, type TipoProspecto } from "../../shared/prospecto";
import { CAMPOS_DE_PROSPECTO, normalizarCorreo, problemasDeProspecto } from "../../shared/validacion";

// La lista vive en `shared/prospecto.ts`, donde también la lee la bandeja del
// panel (F4); se reexporta para no cambiarle la puerta al sitio público.
export { TIPOS_PROSPECTO, type TipoProspecto };

export type Prospecto = {
  tipo: TipoProspecto;
  propiedadId: number | null;
  nombre: string;
  telefono: string;
  correo: string;
  mensaje: string;
  aceptoAviso: boolean;
  origen: string;
};

export type Revision =
  | { ok: true; valor: Prospecto; trampa: boolean }
  | { ok: false; campo: string; mensaje: string };

const texto = (formulario: FormData, campo: string, tope: number): string =>
  String(formulario.get(campo) ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, tope);

/**
 * Revisa lo que llegó del formulario. `trampa` es el campo oculto: si trae
 * algo, lo llenó un programa. No se distingue en la respuesta, para no
 * enseñarle al que lo llenó cómo evitarlo la próxima vez.
 *
 * Las reglas viven en `shared/validacion.ts` (`problemasDeProspecto`), que es
 * también lo que corre el navegador: aquí se devuelve el primero, en el orden
 * de los campos.
 */
export function revisarProspecto(
  formulario: FormData,
  { tipo, propiedadId, origen }: { tipo: TipoProspecto; propiedadId?: number | null; origen?: string },
): Revision {
  const nombre = texto(formulario, "nombre", 80);
  const telefono = texto(formulario, "telefono", 30);
  const correo = normalizarCorreo(texto(formulario, "correo", 254));
  const mensaje = texto(formulario, "mensaje", 1000);
  const acepto = Boolean(formulario.get("acepto"));

  // En «Me interesa» el teléfono es obligatorio: es por donde contestan.
  const problemas = problemasDeProspecto(
    { nombre, telefono, correo, acepto },
    { telefonoObligatorio: tipo === "propiedad" },
  );
  const campo = CAMPOS_DE_PROSPECTO.find((c) => problemas[c]);
  if (campo) return { ok: false, campo, mensaje: problemas[campo] ?? "" };

  return {
    ok: true,
    trampa: Boolean(texto(formulario, "empresa", 80)),
    valor: {
      tipo,
      propiedadId: propiedadId ?? null,
      nombre,
      telefono,
      correo,
      mensaje,
      aceptoAviso: true,
      origen: (origen ?? "").slice(0, 120),
    },
  };
}

export async function guardarProspecto(db: D1Database, prospecto: Prospecto): Promise<void> {
  await db
    .prepare(
      `INSERT INTO prospectos (tipo, propiedad_id, nombre, telefono, correo, mensaje, acepto_aviso, origen, estado, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', ?)`,
    )
    .bind(
      prospecto.tipo,
      prospecto.propiedadId,
      prospecto.nombre,
      prospecto.telefono || null,
      prospecto.correo || null,
      prospecto.mensaje || null,
      prospecto.aceptoAviso ? 1 : 0,
      prospecto.origen || null,
      new Date().toISOString(),
    )
    .run();
}
