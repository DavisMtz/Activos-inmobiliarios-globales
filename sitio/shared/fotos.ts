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
  // `q_auto:eco` y no `q_auto` a secas: en una tarjeta de ~360 px la
  // diferencia no se ve y pesa bastante menos. Medido en F2: el listado movía
  // 456 KB de fotos y su LCP era justo la primera tarjeta.
  tarjeta: "c_fill,g_auto,w_640,h_480,f_auto,q_auto:eco",
  galeria: "c_limit,w_1600,f_auto,q_auto",
  miniatura: "c_fill,g_auto,w_160,h_120,f_auto,q_auto",
  // JPG a propósito: WhatsApp y Facebook no leen bien AVIF en la vista previa.
  og: "c_fill,g_auto,w_1200,h_630,f_jpg,q_auto",
  redes: "c_fill,g_auto,w_1080,h_1350,f_jpg,q_auto",
};

/**
 * Anchos de cada variante para el `srcset`. **Pocos a propósito** (PLAN §13.5):
 * Cloudinary cobra un derivado por cada ancho y formato que alguien llegue a
 * pedir, así que cada ancho de más multiplica el costo de ver el catálogo. Dos
 * bastan: el tamaño normal y el del mismo hueco en una pantalla de doble
 * densidad. Las miniaturas y el `og` van con uno solo.
 */
const ANCHOS: Record<Variante, number[]> = {
  tarjeta: [640, 960],
  galeria: [800, 1600],
  miniatura: [160],
  og: [1200],
  redes: [1080],
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

/**
 * La misma transformación con otro ancho: `w_640` → `w_960`. Si recorta a una
 * proporción fija (`h_480`), el alto se escala igual o la foto sale deformada.
 */
function conAncho(transformacion: string, ancho: number): string {
  const base = Number(transformacion.match(/\bw_(\d+)/)?.[1] ?? 0);
  return transformacion
    .replace(/\bw_\d+/, `w_${ancho}`)
    .replace(/\bh_(\d+)/, (_, alto: string) =>
      base ? `h_${Math.round((Number(alto) * ancho) / base)}` : `h_${alto}`,
    );
}

export type FotoVista = {
  src: string;
  /** Null cuando la foto todavía sale de WordPress: ahí no hay tamaños que pedir. */
  srcset: string | null;
  alt: string;
  ancho: number | null;
  alto: number | null;
};

/**
 * Lo que necesita un `<img>`, ya resuelto en el servidor. Los componentes no
 * ven `public_id` ni `url_origen`: así la hidratación no manda columnas que no
 * se pintan (pendiente heredado de F1) y cambiar de nube no toca ninguna vista.
 */
export function fotoVista(
  foto: (FotoFuente & { alt?: string | null; ancho?: number | null; alto?: number | null }) | null,
  variante: Variante,
  cloudName: string,
  alternativo: string,
): FotoVista | null {
  if (!foto) return null;
  const src = urlFoto(foto, variante, cloudName);
  if (!src) return null;

  const anchos = ANCHOS[variante];
  const hayVarios = Boolean(foto.public_id && cloudName && anchos.length > 1);
  const id = foto.public_id ? foto.public_id.split("/").map(encodeURIComponent).join("/") : "";

  return {
    src,
    srcset: hayVarios
      ? anchos
          .map((a) => `https://res.cloudinary.com/${cloudName}/image/upload/${conAncho(TRANSFORMACIONES[variante], a)}/${id} ${a}w`)
          .join(", ")
      : null,
    alt: (foto.alt ?? "").trim() || alternativo,
    ancho: foto.ancho ?? null,
    alto: foto.alto ?? null,
  };
}
