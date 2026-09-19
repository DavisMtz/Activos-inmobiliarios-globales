/**
 * Subir una foto a Cloudinary desde el navegador (PLAN §13.2). **El archivo no
 * pasa por el Worker**: se pide una firma al servidor, se sube directo a
 * Cloudinary y después se registra el resultado, que el servidor comprueba
 * contra la firma que Cloudinary devuelve.
 *
 * Vive en `comun/` y no en `panel/` porque la usan las dos caras: el panel
 * (fotos de las casas y de las entregas) y la página pública donde el cliente
 * sube las suyas. Si el sitio público importara de `panel/`, arrastraría
 * código del panel a sus trozos y rompería el criterio 8 de F3.
 */

const MAXIMO_LADO = 2000;
const CALIDAD = 0.85;

export type Firma = {
  url: string;
  cloudName: string;
  apiKey: string;
  timestamp: string;
  folder: string;
  publicId: string;
  signature: string;
};

export type Subida = {
  public_id: unknown;
  version: unknown;
  signature: unknown;
  width: unknown;
  height: unknown;
};

/**
 * Reduce la foto a 2,000 px sin perder la orientación ni reventar la memoria
 * del teléfono: una foto de celular son 4 o 5 MB y en el sitio se ve a 1,600.
 * Si el navegador no sabe decodificarla (HEIC en Chrome), se sube tal cual:
 * Cloudinary sí lo entiende.
 */
export async function prepararArchivo(archivo: File): Promise<Blob> {
  if (!archivo.type.startsWith("image/")) return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, MAXIMO_LADO / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && archivo.size < 3_000_000) {
      bitmap.close();
      return archivo;
    }
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const contexto = lienzo.getContext("2d");
    if (!contexto) {
      bitmap.close();
      return archivo;
    }
    contexto.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();
    const reducida = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, "image/jpeg", CALIDAD));
    return reducida && reducida.size < archivo.size ? reducida : archivo;
  } catch {
    return archivo;
  }
}

/** POST con JSON; si el servidor contesta error, lanza con SU mensaje. */
export async function pedirJson(ruta: string, cuerpo: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(ruta, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(typeof datos.mensaje === "string" ? datos.mensaje : `Error ${r.status}`);
  return datos;
}

/** Sube el archivo ya preparado con la firma que dio el servidor. */
export async function subirACloudinary(firma: Firma, archivo: Blob, nombre: string): Promise<Subida> {
  // Solo los parámetros firmados, y con el mismo valor: uno de más y
  // Cloudinary rechaza la firma.
  const cuerpo = new FormData();
  cuerpo.append("file", archivo, nombre);
  cuerpo.append("api_key", firma.apiKey);
  cuerpo.append("timestamp", firma.timestamp);
  cuerpo.append("folder", firma.folder);
  cuerpo.append("public_id", firma.publicId);
  cuerpo.append("signature", firma.signature);

  const respuesta = await fetch(firma.url, { method: "POST", body: cuerpo });
  const subida = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!respuesta.ok) {
    const detalle = (subida.error as { message?: string } | undefined)?.message;
    throw new Error(detalle ?? `Cloudinary respondió ${respuesta.status}`);
  }
  return subida as Subida;
}
