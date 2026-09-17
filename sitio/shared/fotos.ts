/**
 * Todas las URL de fotos salen de aquí (PLAN §13.3 y §13.4). Mudar las fotos
 * de WordPress a Cloudinary, o de una cuenta de Cloudinary a otra, no toca
 * ningún componente.
 */

export type Variante = "tarjeta" | "galeria" | "miniatura" | "og" | "redes";

export type FotoFuente = {
  public_id: string | null;
  /** URL de WordPress: el puente mientras la foto no esté en Cloudinary. */
  url_origen: string | null;
};

const TRANSFORMACIONES: Record<Variante, string> = {
  tarjeta: "c_fill,g_auto,w_640,h_480,f_auto,q_auto",
  galeria: "c_limit,w_1600,f_auto,q_auto",
  miniatura: "c_fill,g_auto,w_160,h_120,f_auto,q_auto",
  // JPG a propósito: WhatsApp y Facebook no leen bien AVIF en la vista previa.
  og: "c_fill,g_auto,w_1200,h_630,f_jpg,q_auto",
  redes: "c_fill,g_auto,w_1080,h_1350,f_jpg,q_auto",
};

/**
 * `cloudName` vacío = Cloudinary sin configurar: se usa la URL de origen.
 * Devuelve null si la foto no tiene ninguna de las dos.
 */
export function urlFoto(foto: FotoFuente, variante: Variante, cloudName: string): string | null {
  if (foto.public_id && cloudName) {
    const id = foto.public_id.split("/").map(encodeURIComponent).join("/");
    return `https://res.cloudinary.com/${cloudName}/image/upload/${TRANSFORMACIONES[variante]}/${id}`;
  }
  return foto.url_origen ?? null;
}
