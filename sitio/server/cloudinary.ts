/**
 * Cloudinary desde el Worker (PLAN §13.2): firmar una subida, comprobar que la
 * respuesta que devuelve el navegador es de verdad de Cloudinary, y borrar.
 *
 * El archivo NUNCA pasa por el Worker: el navegador sube directo a Cloudinary
 * con una firma que hace el servidor. La firma cubre `folder`, `public_id` y
 * `timestamp`, así que **el destino lo decide el servidor** y quien tenga la
 * firma no puede escribir en la carpeta de otra casa.
 *
 * La misma receta de firma (SHA-1 de los parámetros ordenados + el secreto) ya
 * está probada en `scripts/migrar-fotos-a-cloudinary.mjs`, que subió las 3,241
 * fotos de F1.5.
 *
 * Recibe las credenciales, no la configuración entera: así este archivo no
 * depende de `server/config.ts` (que usa tipos del Worker) y las pruebas pueden
 * importarlo desde Node.
 */

/** Lo que `server/config.ts` arma en `config.cloudinary`. */
export type NubeDeFotos = {
  cloudName: string;
  carpeta: string;
  apiKey: string;
  apiSecret: string;
  /** Las tres credenciales presentes: se puede firmar una subida. */
  configurado: boolean;
};

/** Cloudinary firma con SHA-1; no es una decisión nuestra. */
async function sha1Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** `a=1&b=2`: los parámetros firmados, en orden alfabético y sin el secreto. */
export const cadenaParaFirmar = (parametros: Record<string, string>): string =>
  Object.keys(parametros)
    .sort()
    .map((nombre) => `${nombre}=${parametros[nombre]}`)
    .join("&");

export const firmar = (parametros: Record<string, string>, apiSecret: string): Promise<string> =>
  sha1Hex(cadenaParaFirmar(parametros) + apiSecret);

/** `aig/propiedades/AIG-0001`: una carpeta por casa (PLAN §13.1). */
export const carpetaDePropiedad = (nube: NubeDeFotos, clave: string): string =>
  `${nube.carpeta}/propiedades/${clave}`;

/** 8 caracteres al azar: lo que sube el panel no tiene `url_origen` del que derivar un nombre. */
export function nombreAlAzar(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type FirmaDeSubida = {
  url: string;
  cloudName: string;
  apiKey: string;
  timestamp: string;
  folder: string;
  publicId: string;
  signature: string;
};

/**
 * Lo que el navegador necesita para subir UNA foto a la carpeta de esa casa.
 * Null si faltan credenciales: el panel enseña «Configura Cloudinary» y el
 * resto del formulario sigue funcionando (PLAN §13.2, punto 6).
 */
export const firmaDeSubida = (nube: NubeDeFotos, clave: string): Promise<FirmaDeSubida | null> =>
  firmaParaCarpeta(nube, carpetaDePropiedad(nube, clave));

/**
 * `aig/entregas/3f9c…`: una carpeta por entrega, aparte de las casas. El nombre
 * es al azar y vive en `testimonios.carpeta`: con el id, la base local y la de
 * producción (que comparten nube) escribían en las mismas carpetas.
 */
export const carpetaDeEntrega = (nube: NubeDeFotos, carpeta: string): string => `${nube.carpeta}/entregas/${carpeta}`;

/** Lo mismo que `publicIdEnCarpeta`, para la carpeta de una entrega. */
export const publicIdEnEntrega = (nube: NubeDeFotos, carpeta: string, publicId: string): boolean =>
  /^[0-9a-f]{16}$/.test(carpeta) && publicId.startsWith(`${carpetaDeEntrega(nube, carpeta)}/`) && publicId.length < 200;

/** Firma una subida a una carpeta que ya decidió el servidor. */
export async function firmaParaCarpeta(nube: NubeDeFotos, folder: string): Promise<FirmaDeSubida | null> {
  if (!nube.configurado) return null;
  const publicId = nombreAlAzar();
  const timestamp = String(Math.floor(Date.now() / 1000));
  // `overwrite=false` no va firmado a propósito: el nombre es nuevo cada vez.
  const firmados = { folder, public_id: publicId, timestamp };
  return {
    url: `https://api.cloudinary.com/v1_1/${nube.cloudName}/image/upload`,
    cloudName: nube.cloudName,
    apiKey: nube.apiKey,
    timestamp,
    folder,
    publicId,
    signature: await firmar(firmados, nube.apiSecret),
  };
}

/**
 * Cloudinary firma su respuesta con `public_id` y `version` (PLAN §13.2, punto
 * 4). Comprobarla es lo que impide que alguien registre en la base una foto que
 * nunca subió, o una de otra cuenta.
 */
export async function firmaDeRespuestaValida(
  nube: NubeDeFotos,
  datos: { publicId: string; version: string; signature: string },
): Promise<boolean> {
  if (!nube.configurado) return false;
  const esperada = await firmar({ public_id: datos.publicId, version: datos.version }, nube.apiSecret);
  return esperada === datos.signature.trim().toLowerCase();
}

export type ResultadoDeBorrado = { ok: boolean; resultado: string };

/**
 * Borra la foto de Cloudinary. Se llama DESPUÉS de borrar la fila de D1 (y con
 * `waitUntil`): si esto falla queda una huérfana, que `fotos:migrar --verificar`
 * encuentra, mientras que al revés quedaría un `<img>` roto en el sitio.
 *
 * Va por el endpoint firmado de subida (`/image/destroy`) y no por la Admin
 * API, que tiene un tope de 500 llamadas por hora (PLAN §13.5).
 */
export async function borrarDeCloudinary(nube: NubeDeFotos, publicId: string): Promise<ResultadoDeBorrado> {
  if (!nube.configurado) return { ok: false, resultado: "sin_credenciales" };
  const timestamp = String(Math.floor(Date.now() / 1000));
  const firmados = { public_id: publicId, timestamp };
  const cuerpo = new URLSearchParams({
    ...firmados,
    api_key: nube.apiKey,
    signature: await firmar(firmados, nube.apiSecret),
  });

  try {
    const respuesta = await fetch(`https://api.cloudinary.com/v1_1/${nube.cloudName}/image/destroy`, {
      method: "POST",
      body: cuerpo,
      signal: AbortSignal.timeout(20_000),
    });
    const datos = (await respuesta.json().catch(() => ({}))) as { result?: string };
    const resultado = datos.result ?? `http_${respuesta.status}`;
    // «not found» cuenta como bien: la foto ya no está, que es lo que se pedía.
    return { ok: resultado === "ok" || resultado === "not found", resultado };
  } catch (error) {
    return { ok: false, resultado: error instanceof Error ? error.message : "sin_respuesta" };
  }
}

/**
 * Que el `public_id` que devolvió el navegador esté dentro de la carpeta de esa
 * casa. En esta nube las carpetas son dinámicas: `folder` queda como carpeta Y
 * como prefijo del `public_id` (medido en F1.5, PLAN §13.1).
 */
export const publicIdEnCarpeta = (nube: NubeDeFotos, clave: string, publicId: string): boolean =>
  publicId.startsWith(`${carpetaDePropiedad(nube, clave)}/`) && publicId.length < 200;
