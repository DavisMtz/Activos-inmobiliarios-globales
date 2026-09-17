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

import { correoValido, normalizarCorreo } from "../../shared/validacion";

export const TIPOS_PROSPECTO = ["general", "propiedad", "vender", "credito"] as const;
export type TipoProspecto = (typeof TIPOS_PROSPECTO)[number];

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

/** Diez cifras es un celular mexicano; con clave de país llega a doce. */
const telefonoValido = (telefono: string): boolean => telefono.replace(/\D+/g, "").length >= 10;

/**
 * Revisa lo que llegó del formulario. `trampa` es el campo oculto: si trae
 * algo, lo llenó un programa. No se distingue en la respuesta, para no
 * enseñarle al que lo llenó cómo evitarlo la próxima vez.
 */
export function revisarProspecto(
  formulario: FormData,
  { tipo, propiedadId, origen }: { tipo: TipoProspecto; propiedadId?: number | null; origen?: string },
): Revision {
  const nombre = texto(formulario, "nombre", 80);
  const telefono = texto(formulario, "telefono", 30);
  const correo = normalizarCorreo(texto(formulario, "correo", 254));
  const mensaje = texto(formulario, "mensaje", 1000);
  const acepto = formulario.get("acepto");

  if (nombre.length < 2) return { ok: false, campo: "nombre", mensaje: "Escribe tu nombre." };

  // En «Me interesa» el teléfono es obligatorio: es por donde contestan.
  if (tipo === "propiedad" && !telefonoValido(telefono)) {
    return { ok: false, campo: "telefono", mensaje: "Escribe un teléfono de 10 dígitos para poder contestarte." };
  }
  if (telefono && !telefonoValido(telefono)) {
    return { ok: false, campo: "telefono", mensaje: "Ese teléfono no parece completo." };
  }
  if (correo && !correoValido(correo)) {
    return { ok: false, campo: "correo", mensaje: "Revisa el correo." };
  }
  if (!acepto) {
    return { ok: false, campo: "acepto", mensaje: "Necesitamos que aceptes el aviso de privacidad." };
  }

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
