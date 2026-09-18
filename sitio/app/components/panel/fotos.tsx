import { useCallback, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import type { FotoDelPanel } from "../../../server/db/panel/propiedades";
import { IconoAdelante, IconoAtencion, IconoAtras, IconoMas, IconoPortada } from "./iconos";
import { Aviso, Bloque, Boton, Etiqueta, Vacio } from "./piezas";

/**
 * Fotos de una casa (PLAN §13.2). **El archivo no pasa por el Worker**: el
 * navegador pide una firma, sube directo a Cloudinary y después registra el
 * resultado, que el servidor comprueba contra la firma que Cloudinary devuelve.
 *
 * Antes de subir, la foto se reduce aquí a 2,000 px. Una foto de teléfono son
 * 4 o 5 MB y en la ficha se ve a 1,600: subir el original costaría minutos de
 * espera en una conexión de celular y almacenamiento que nadie va a ver.
 *
 * De tres en tres, y cada archivo con sus propios reintentos: si una falla, las
 * demás siguen y no se repite ninguna que ya haya subido.
 */

const MAXIMO_LADO = 2000;
const CALIDAD = 0.85;
const A_LA_VEZ = 3;
const INTENTOS = 3;
/** Menos de esto es casi siempre una foto reenviada por WhatsApp. */
const ANCHO_POBRE = 1000;

type EnMarcha = {
  id: string;
  nombre: string;
  estado: "esperando" | "preparando" | "subiendo" | "lista" | "error";
  mensaje?: string;
};

type Firma = {
  url: string;
  cloudName: string;
  apiKey: string;
  timestamp: string;
  folder: string;
  publicId: string;
  signature: string;
};

/**
 * Reduce la foto sin perder la orientación ni reventar la memoria del teléfono.
 * Si el navegador no sabe decodificarla (HEIC en Chrome), se sube tal cual:
 * Cloudinary sí lo entiende.
 */
async function prepararArchivo(archivo: File): Promise<Blob> {
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

async function pedirJson(ruta: string, cuerpo: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(ruta, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(typeof datos.mensaje === "string" ? datos.mensaje : `Error ${r.status}`);
  return datos;
}

export function FotosDeLaCasa({
  propiedadId,
  fotos,
  cloudinaryListo,
  puedeEditar,
}: {
  propiedadId: number;
  fotos: FotoDelPanel[];
  cloudinaryListo: boolean;
  puedeEditar: boolean;
}) {
  const revalidador = useRevalidator();
  const entrada = useRef<HTMLInputElement>(null);
  const [enMarcha, setEnMarcha] = useState<EnMarcha[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cambiar = (id: string, cambios: Partial<EnMarcha>) =>
    setEnMarcha((lista) => lista.map((archivo) => (archivo.id === id ? { ...archivo, ...cambios } : archivo)));

  const subirUna = useCallback(
    async (item: EnMarcha, archivo: File) => {
      for (let intento = 1; intento <= INTENTOS; intento++) {
        try {
          cambiar(item.id, { estado: "preparando" });
          const listo = await prepararArchivo(archivo);

          cambiar(item.id, { estado: "subiendo" });
          const firma = (await pedirJson("/api/panel/fotos/firma", { propiedad_id: propiedadId })) as unknown as Firma;

          // Solo los parámetros firmados, y con el mismo valor: uno de más y
          // Cloudinary rechaza la firma.
          const cuerpo = new FormData();
          cuerpo.append("file", listo, archivo.name);
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

          await pedirJson(`/api/panel/propiedades/${propiedadId}/fotos`, {
            public_id: subida.public_id,
            version: subida.version,
            signature: subida.signature,
            width: subida.width,
            height: subida.height,
            alt: "",
          });

          const ancho = Number(subida.width ?? 0);
          cambiar(item.id, {
            estado: "lista",
            mensaje: ancho && ancho < ANCHO_POBRE ? "Se ve pequeña; si tienes la original se verá mejor." : undefined,
          });
          return;
        } catch (fallo) {
          if (intento === INTENTOS) {
            cambiar(item.id, { estado: "error", mensaje: fallo instanceof Error ? fallo.message : "No se pudo subir." });
            return;
          }
          await new Promise((espera) => setTimeout(espera, 1500 * intento));
        }
      }
    },
    [propiedadId],
  );

  const subir = useCallback(
    async (archivos: File[]) => {
      if (!archivos.length) return;
      setError(null);
      setOcupado(true);

      const items: EnMarcha[] = archivos.map((archivo, i) => ({
        id: `${Date.now()}-${i}`,
        nombre: archivo.name,
        estado: "esperando",
      }));
      setEnMarcha(items);

      let siguiente = 0;
      const trabajador = async () => {
        while (siguiente < archivos.length) {
          const indice = siguiente++;
          await subirUna(items[indice], archivos[indice]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, archivos.length) }, trabajador));

      setOcupado(false);
      revalidador.revalidate();
      // Las que quedaron con error se quedan a la vista; las buenas ya están
      // en la galería de abajo.
      setEnMarcha((lista) => lista.filter((archivo) => archivo.estado === "error" || archivo.mensaje));
      if (entrada.current) entrada.current.value = "";
    },
    [revalidador, subirUna],
  );

  const acomodar = useCallback(
    async (cambios: { fotos?: { id: number; orden?: number; alt?: string }[]; portada_id?: number }) => {
      try {
        setError(null);
        await fetch(`/api/panel/propiedades/${propiedadId}/fotos`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cambios),
        });
        revalidador.revalidate();
      } catch {
        setError("No pudimos guardar el cambio. Intenta de nuevo.");
      }
    },
    [propiedadId, revalidador],
  );

  const borrar = useCallback(
    async (foto: FotoDelPanel) => {
      setError(null);
      const r = await fetch(`/api/panel/fotos/${foto.id}`, { method: "DELETE" });
      if (!r.ok) {
        setError("No pudimos quitar la foto.");
        return;
      }
      revalidador.revalidate();
    },
    [revalidador],
  );

  const mover = (indice: number, hacia: -1 | 1) => {
    const otro = indice + hacia;
    if (otro < 0 || otro >= fotos.length) return;
    // Solo las dos que se intercambian: el resto conserva su lugar.
    void acomodar({
      fotos: [
        { id: fotos[indice].id, orden: fotos[otro].orden },
        { id: fotos[otro].id, orden: fotos[indice].orden },
      ],
    });
  };

  return (
    <Bloque
      titulo="Fotos"
      descripcion={
        fotos.length
          ? "La primera es la portada: es la que se ve en el listado y la que se manda por WhatsApp."
          : "Sin fotos la casa no se puede publicar."
      }
      acciones={
        puedeEditar && cloudinaryListo ? (
          <Boton type="button" tono="secundario" onClick={() => entrada.current?.click()} ocupado={ocupado}>
            <IconoMas className="h-5 w-5" />
            {ocupado ? "Subiendo…" : "Agregar fotos"}
          </Boton>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {!cloudinaryListo ? (
          <Aviso tono="info">
            Configura Cloudinary para subir fotos. Lo demás de esta pantalla funciona igual.
          </Aviso>
        ) : null}
        {error ? <Aviso>{error}</Aviso> : null}

        {puedeEditar && cloudinaryListo ? (
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(evento) => void subir([...(evento.target.files ?? [])])}
          />
        ) : null}

        {enMarcha.length ? (
          <ul className="flex flex-col gap-2">
            {enMarcha.map((archivo) => (
              <li
                key={archivo.id}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                  archivo.estado === "error" ? "border-marca/30 bg-marca-suave" : "border-linea bg-fondo"
                }`}
              >
                {archivo.estado === "error" ? (
                  <IconoAtencion className="h-5 w-5 shrink-0 text-marca" />
                ) : null}
                <span className="min-w-0 flex-1 truncate font-semibold text-tinta">{archivo.nombre}</span>
                <span className={archivo.estado === "error" ? "text-marca-oscuro" : "text-texto-suave"}>
                  {archivo.mensaje ??
                    { esperando: "En la fila", preparando: "Preparando", subiendo: "Subiendo", lista: "Lista", error: "Falló" }[
                      archivo.estado
                    ]}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {fotos.length === 0 ? (
          <Vacio
            titulo="Todavía no tiene fotos"
            accion={
              puedeEditar && cloudinaryListo ? (
                <Boton type="button" onClick={() => entrada.current?.click()}>
                  <IconoMas className="h-5 w-5" />
                  Agregar fotos
                </Boton>
              ) : undefined
            }
          >
            Las fotos se reducen solas antes de subir, así que puedes mandarlas tal como salen del teléfono.
          </Vacio>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {fotos.map((foto, indice) => (
              <li key={foto.id} className="flex flex-col gap-2 rounded-xl border border-linea bg-fondo p-2">
                <span className="relative block overflow-hidden rounded-lg bg-linea">
                  {foto.vista ? (
                    <img
                      src={foto.vista.src}
                      alt={foto.alt || "Foto de la casa"}
                      width={640}
                      height={480}
                      loading="lazy"
                      decoding="async"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <span className="flex aspect-[4/3] w-full items-center justify-center text-sm text-texto-suave">
                      sin vista previa
                    </span>
                  )}
                  {foto.esPortada ? (
                    <span className="absolute top-2 left-2">
                      <Etiqueta tono="tinta">Portada</Etiqueta>
                    </span>
                  ) : null}
                  {foto.ancho !== null && foto.ancho < ANCHO_POBRE ? (
                    <span className="absolute right-2 bottom-2">
                      <Etiqueta tono="aviso">Chica</Etiqueta>
                    </span>
                  ) : null}
                </span>

                {puedeEditar ? (
                  <>
                    <input
                      defaultValue={foto.alt}
                      placeholder="Describe la foto"
                      aria-label="Texto alternativo de la foto"
                      onBlur={(evento) => {
                        if (evento.target.value !== foto.alt) {
                          void acomodar({ fotos: [{ id: foto.id, alt: evento.target.value }] });
                        }
                      }}
                      className="h-10 w-full rounded-lg border border-linea bg-superficie px-3 text-sm text-tinta outline-none focus:border-marca"
                    />
                    {/* Un solo renglón, para que todas las fichas midan igual:
                        al envolverse, «Quitar» caía a otra línea en unas sí y
                        en otras no, y la rejilla se veía desparejada. */}
                    <div className="flex items-center gap-0.5">
                      {!foto.esPortada ? (
                        <button
                          type="button"
                          onClick={() => void acomodar({ portada_id: foto.id })}
                          aria-label="Hacer portada"
                          title="Hacer portada"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-tinta transition-colors hover:bg-marca-suave hover:text-marca"
                        >
                          <IconoPortada className="h-4 w-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => mover(indice, -1)}
                        disabled={indice === 0}
                        aria-label="Mover antes"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-tinta transition-colors hover:bg-marca-suave disabled:opacity-40"
                      >
                        <IconoAtras className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => mover(indice, 1)}
                        disabled={indice === fotos.length - 1}
                        aria-label="Mover después"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-tinta transition-colors hover:bg-marca-suave disabled:opacity-40"
                      >
                        <IconoAdelante className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void borrar(foto)}
                        className="ml-auto h-8 shrink-0 rounded-lg px-2 text-xs font-bold text-marca transition-colors hover:bg-marca-suave"
                      >
                        Quitar
                      </button>
                    </div>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Bloque>
  );
}
