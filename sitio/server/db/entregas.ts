/**
 * Entregas del lado público (F5): lo que se enseña en el sitio y lo que hace
 * el cliente desde su enlace personal. Lo del equipo vive en
 * `server/db/panel/entregas.ts`.
 *
 * Tres reglas que sostienen todo:
 * 1. **Al sitio solo sale lo aprobado**, y de ahí solo `nombre_publico`
 *    («Laura M.»), nunca `nombre`: esa columna es para el equipo.
 * 2. **Cada permiso manda sobre lo suyo**: sin `acepta_texto` no sale el
 *    comentario y sin `acepta_fotos` no sale ninguna foto, aunque existan.
 * 3. **El enlace se busca por su huella** (SHA-256): la base nunca guarda el
 *    enlace en claro.
 */

import {
  DIAS_DEL_ENLACE,
  FOTOS_DEL_CLIENTE,
  VERSION_CONSENTIMIENTO,
  type RespuestaDelCliente,
} from "../../shared/entrega";
import { fotoVista, type FotoVista } from "../../shared/fotos";
import { huella } from "../auth/sesion";
import {
  borrarDeCloudinary,
  carpetaDeEntrega,
  firmaDeRespuestaValida,
  firmaParaCarpeta,
  publicIdEnEntrega,
  type FirmaDeSubida,
  type NubeDeFotos,
} from "../cloudinary";
import { ahora } from "../fechas";
import { exito, fallo, type Resultado } from "../resultado";

export { DIAS_DEL_ENLACE };

// ─── Lo que se ve en el sitio ─────────────────────────────────────

export type EntregaPublica = {
  id: number;
  nombre: string;
  comentario: string | null;
  fecha: string;
  fotos: FotoVista[];
};

type FilaPublica = { id: number; nombre_publico: string; texto: string; acepta_texto: number; aprobado_en: string };

/**
 * Las entregas aprobadas, la más reciente primero, con sus fotos en UNA sola
 * consulta para toda la página (una por entrega es lo que tumbó la cuenta en
 * F1.5). `limite` para la portada; sin él, todas.
 */
export async function leerEntregasPublicas(db: D1Database, cloudName: string, limite?: number): Promise<EntregaPublica[]> {
  const { results: filas } = await db
    .prepare(
      `SELECT id, nombre_publico, texto, acepta_texto, aprobado_en
         FROM testimonios INDEXED BY idx_testimonios_estado
        WHERE estado = 'aprobado'
        ORDER BY aprobado_en DESC
        LIMIT ?`,
    )
    .bind(limite ?? 200)
    .all<FilaPublica>();
  if (!filas.length) return [];

  const ids = filas.map((f) => f.id);
  const { results: fotos } = await db
    .prepare(
      `SELECT f.testimonio_id, f.public_id, f.ancho, f.alto
         FROM fotos_entrega f JOIN testimonios t ON t.id = f.testimonio_id
        WHERE f.testimonio_id IN (${ids.map(() => "?").join(", ")})
          AND f.visible = 1 AND t.acepta_fotos = 1
        ORDER BY f.testimonio_id, f.orden, f.id`,
    )
    .bind(...ids)
    .all<{ testimonio_id: number; public_id: string; ancho: number | null; alto: number | null }>();

  return filas.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre_publico,
    comentario: fila.acepta_texto === 1 && fila.texto.trim() ? fila.texto : null,
    fecha: fila.aprobado_en,
    fotos: fotos
      .filter((foto) => foto.testimonio_id === fila.id)
      .map((foto) =>
        fotoVista(
          { public_id: foto.public_id, url_origen: null, ancho: foto.ancho, alto: foto.alto },
          "tarjeta",
          cloudName,
          `Entrega de casa a ${fila.nombre_publico}`,
        ),
      )
      .filter((foto): foto is FotoVista => foto !== null),
  }));
}

/** Si hay alguna publicada: sin ninguna, la sección y el menú no se enseñan. */
export async function hayEntregasPublicas(db: D1Database): Promise<boolean> {
  const fila = await db
    .prepare("SELECT 1 AS si FROM testimonios INDEXED BY idx_testimonios_estado WHERE estado = 'aprobado' LIMIT 1")
    .first<{ si: number }>();
  return Boolean(fila);
}

// ─── El enlace del cliente ────────────────────────────────────────

export type EntregaDelEnlace = {
  id: number;
  /** El nombre que puso el equipo: para saludar, nunca se publica. */
  nombre: string;
  enviada: boolean;
  fotosDelEquipo: FotoVista[];
  fotosDelCliente: (FotoVista & { id: number })[];
};

type FilaDelEnlace = {
  id: number;
  nombre: string;
  carpeta: string;
  enviado_en: string | null;
  token_expira: string | null;
};

/**
 * La entrega de ese enlace, o null si no existe o ya caducó. Caducado y falso
 * contestan lo mismo (404): no se le confirma a nadie que un enlace existió.
 * El que ya se contestó SÍ se devuelve, para darle las gracias en vez de un
 * error.
 */
async function filaDelEnlace(db: D1Database, token: string): Promise<FilaDelEnlace | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const fila = await db
    .prepare("SELECT id, nombre, carpeta, enviado_en, token_expira FROM testimonios WHERE token_hash = ?")
    .bind(await huella(token))
    .first<FilaDelEnlace>();
  if (!fila) return null;
  if (!fila.enviado_en && (!fila.token_expira || fila.token_expira < ahora() || !fila.carpeta)) return null;
  return fila;
}

export async function leerEntregaDelEnlace(
  db: D1Database,
  cloudName: string,
  token: string,
): Promise<EntregaDelEnlace | null> {
  const fila = await filaDelEnlace(db, token);
  if (!fila) return null;

  const { results } = await db
    .prepare(
      `SELECT id, public_id, ancho, alto, subida_por FROM fotos_entrega INDEXED BY idx_fotos_entrega
        WHERE testimonio_id = ? ORDER BY orden, id`,
    )
    .bind(fila.id)
    .all<{ id: number; public_id: string; ancho: number | null; alto: number | null; subida_por: string }>();

  const vista = (foto: (typeof results)[number]) =>
    fotoVista({ public_id: foto.public_id, url_origen: null, ancho: foto.ancho, alto: foto.alto }, "tarjeta", cloudName, "Foto de tu entrega");

  return {
    id: fila.id,
    nombre: fila.nombre,
    enviada: Boolean(fila.enviado_en),
    fotosDelEquipo: results.filter((f) => f.subida_por === "equipo").map(vista).filter((f): f is FotoVista => f !== null),
    fotosDelCliente: results
      .filter((f) => f.subida_por === "cliente")
      .flatMap((f) => {
        const v = vista(f);
        return v ? [{ ...v, id: f.id }] : [];
      }),
  };
}

/** El enlace vivo y sin contestar: la condición para tocar cualquier cosa. */
async function enlaceAbierto(db: D1Database, token: string): Promise<Resultado<FilaDelEnlace>> {
  const fila = await filaDelEnlace(db, token);
  if (!fila) return fallo(404, "no_encontrado", "Este enlace ya no está disponible.");
  if (fila.enviado_en) return fallo(409, "ya_enviada", "Ya recibimos tu respuesta. ¡Gracias!");
  return exito(fila);
}

const contarFotosDelCliente = async (db: D1Database, id: number): Promise<number> =>
  (
    await db
      .prepare("SELECT COUNT(*) AS n FROM fotos_entrega WHERE testimonio_id = ? AND subida_por = 'cliente'")
      .bind(id)
      .first<{ n: number }>()
  )?.n ?? 0;

/**
 * La firma para que el cliente suba UNA foto. El enlace ES el freno: vivo,
 * sin contestar y con menos de `FOTOS_DEL_CLIENTE` fotos suyas. Por eso estas
 * peticiones no pasan por el límite por IP de los formularios (8 por minuto):
 * cuatro fotos son ocho peticiones.
 */
export async function firmaParaElCliente(
  db: D1Database,
  nube: NubeDeFotos,
  token: string,
): Promise<Resultado<FirmaDeSubida>> {
  const enlace = await enlaceAbierto(db, token);
  if (!enlace.ok) return enlace;
  if ((await contarFotosDelCliente(db, enlace.valor.id)) >= FOTOS_DEL_CLIENTE) {
    return fallo(400, "tope_de_fotos", `Puedes agregar hasta ${FOTOS_DEL_CLIENTE} fotos.`);
  }
  const firma = await firmaParaCarpeta(nube, carpetaDeEntrega(nube, enlace.valor.carpeta));
  return firma ? exito(firma) : fallo(400, "sin_cloudinary", "Por ahora no se pueden subir fotos.");
}

export type FotoRecibida = { publicId: unknown; version: unknown; signature: unknown; ancho: unknown; alto: unknown };

const entero = (valor: unknown): number | null => {
  const n = typeof valor === "string" ? Number(valor) : valor;
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n < 100_000 ? n : null;
};

/**
 * Anota una foto ya subida a Cloudinary. Comprueba la carpeta y la firma que
 * devuelve Cloudinary, igual que las fotos de las casas: sin eso cualquiera
 * podría anotar una foto que no subió, o una de otra entrega.
 */
export async function registrarFotoDeEntrega(
  db: D1Database,
  nube: NubeDeFotos,
  entrega: { id: number; carpeta: string },
  subidaPor: "equipo" | "cliente",
  datos: FotoRecibida,
): Promise<Resultado<{ id: number }>> {
  const entregaId = entrega.id;
  const publicId = typeof datos.publicId === "string" ? datos.publicId.trim() : "";
  const version = String(datos.version ?? "").trim();
  const signature = typeof datos.signature === "string" ? datos.signature : "";

  if (!publicIdEnEntrega(nube, entrega.carpeta, publicId)) {
    return fallo(400, "foto_ajena", "Esa foto no está en la carpeta de esta entrega.");
  }
  if (!/^\d{1,20}$/.test(version) || !(await firmaDeRespuestaValida(nube, { publicId, version, signature }))) {
    return fallo(400, "firma_invalida", "No pudimos comprobar que esa foto venga de Cloudinary.");
  }

  try {
    const insercion = await db
      .prepare(
        `INSERT INTO fotos_entrega (testimonio_id, public_id, ancho, alto, subida_por, orden, creada_en)
         SELECT ?, ?, ?, ?, ?, COALESCE(MAX(orden), -1) + 1, ?
           FROM fotos_entrega INDEXED BY idx_fotos_entrega WHERE testimonio_id = ?`,
      )
      .bind(entregaId, publicId, entero(datos.ancho), entero(datos.alto), subidaPor, ahora(), entregaId)
      .run();
    return exito({ id: Number(insercion.meta.last_row_id) });
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      return fallo(409, "foto_repetida", "Esa foto ya estaba registrada.");
    }
    throw error;
  }
}

export async function registrarFotoDelCliente(
  db: D1Database,
  nube: NubeDeFotos,
  token: string,
  datos: FotoRecibida,
  esperar: (promesa: Promise<unknown>) => void,
): Promise<Resultado<{ id: number }>> {
  const enlace = await enlaceAbierto(db, token);
  if (!enlace.ok) return enlace;
  const id = enlace.valor.id;
  if ((await contarFotosDelCliente(db, id)) >= FOTOS_DEL_CLIENTE) {
    // La foto ya subió a la nube y no se va a usar: se borra, pero SOLO si
    // está en la carpeta de ESTA entrega y no la tiene registrada nadie. Sin
    // esas dos condiciones, el enlace serviría para borrar fotos ajenas.
    const publicId = typeof datos.publicId === "string" ? datos.publicId.trim() : "";
    if (publicIdEnEntrega(nube, enlace.valor.carpeta, publicId)) {
      const registrada = await db.prepare("SELECT 1 AS si FROM fotos_entrega WHERE public_id = ?").bind(publicId).first();
      if (!registrada) esperar(borrarDeCloudinary(nube, publicId));
    }
    return fallo(400, "tope_de_fotos", `Puedes agregar hasta ${FOTOS_DEL_CLIENTE} fotos.`);
  }
  return registrarFotoDeEntrega(db, nube, enlace.valor, "cliente", datos);
}

/** El cliente quita una foto SUYA antes de enviar. Las del equipo no. */
export async function quitarFotoDelCliente(
  db: D1Database,
  token: string,
  fotoId: number,
): Promise<Resultado<{ publicId: string }>> {
  const enlace = await enlaceAbierto(db, token);
  if (!enlace.ok) return enlace;
  const foto = await db
    .prepare("DELETE FROM fotos_entrega WHERE id = ? AND testimonio_id = ? AND subida_por = 'cliente' RETURNING public_id")
    .bind(fotoId, enlace.valor.id)
    .first<{ public_id: string }>();
  return foto ? exito({ publicId: foto.public_id }) : fallo(404, "no_encontrado", "Esa foto ya no está.");
}

/**
 * Guarda la respuesta y cierra el enlace. Si el cliente NO autorizó las fotos,
 * las que subió él se borran (base y nube): lo que no se va a publicar no se
 * guarda. Las del equipo se quedan, pero nunca salen al sitio sin su permiso.
 *
 * El `UPDATE … WHERE enviado_en IS NULL` es lo que hace el enlace de un solo
 * uso aunque lleguen dos envíos a la vez (doble toque en el celular).
 */
export async function guardarRespuesta(
  db: D1Database,
  nube: NubeDeFotos,
  token: string,
  respuesta: RespuestaDelCliente,
  esperar: (promesa: Promise<unknown>) => void,
): Promise<Resultado<null>> {
  const enlace = await enlaceAbierto(db, token);
  if (!enlace.ok) return enlace;
  const id = enlace.valor.id;
  const momento = ahora();

  const cambio = await db
    .prepare(
      `UPDATE testimonios
          SET texto = ?, nombre_publico = ?, acepta_texto = ?, acepta_fotos = ?,
              aceptado_en = ?, consentimiento_version = ?, enviado_en = ?, estado = 'respondido'
        WHERE id = ? AND enviado_en IS NULL`,
    )
    .bind(
      respuesta.comentario,
      respuesta.nombrePublico,
      respuesta.aceptaTexto ? 1 : 0,
      respuesta.aceptaFotos ? 1 : 0,
      momento,
      VERSION_CONSENTIMIENTO,
      momento,
      id,
    )
    .run();
  if (cambio.meta.changes !== 1) return fallo(409, "ya_enviada", "Ya recibimos tu respuesta. ¡Gracias!");

  if (!respuesta.aceptaFotos) {
    const { results } = await db
      .prepare("DELETE FROM fotos_entrega WHERE testimonio_id = ? AND subida_por = 'cliente' RETURNING public_id")
      .bind(id)
      .all<{ public_id: string }>();
    for (const foto of results) esperar(borrarDeCloudinary(nube, foto.public_id));
  }
  return exito(null);
}
