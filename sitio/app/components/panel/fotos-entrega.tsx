import { useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { pedirJson, prepararArchivo, subirACloudinary, type Firma } from "../comun/subida";

/**
 * Subir la foto que se tomó en la entrega (F5). Igual que las fotos de las
 * casas: directo a Cloudinary con firma del servidor, y el servidor comprueba
 * la respuesta. Solo mientras el cliente no conteste: él autoriza lo que ve.
 */

/** Menos de esto es casi siempre una foto reenviada por WhatsApp. */
const ANCHO_POBRE = 1000;

export function SubirFotosDeEntrega({ entregaId, tope, subidas }: { entregaId: number; tope: number; subidas: number }) {
  const revalidador = useRevalidator();
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const quedan = tope - subidas;

  const subir = async (archivos: File[]) => {
    setAviso(null);
    const pobres: string[] = [];
    for (const [i, archivo] of archivos.slice(0, quedan).entries()) {
      try {
        setEstado(`Subiendo ${i + 1} de ${Math.min(archivos.length, quedan)}…`);
        const listo = await prepararArchivo(archivo);
        const firma = (await pedirJson(`/api/panel/entregas/${entregaId}/firma`, {})) as unknown as Firma;
        const subida = await subirACloudinary(firma, listo, archivo.name);
        await pedirJson(`/api/panel/entregas/${entregaId}/fotos`, {
          public_id: subida.public_id,
          version: subida.version,
          signature: subida.signature,
          width: subida.width,
          height: subida.height,
        });
        if (Number(subida.width ?? 0) < ANCHO_POBRE) pobres.push(archivo.name);
      } catch (fallo) {
        setAviso(`«${archivo.name}» no se pudo subir: ${fallo instanceof Error ? fallo.message : "intenta de nuevo"}.`);
      }
    }
    if (pobres.length) {
      setAviso(`${pobres.join(", ")} se ve${pobres.length > 1 ? "n" : ""} pequeña${pobres.length > 1 ? "s" : ""}: si tienes la original, se verá mejor.`);
    }
    setEstado(null);
    if (entrada.current) entrada.current.value = "";
    revalidador.revalidate();
  };

  if (quedan <= 0) return <p className="text-sm text-texto-suave">Ya tiene las {tope} fotos que caben.</p>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={entrada}
          id={`fotos-entrega-${entregaId}`}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={Boolean(estado)}
          onChange={(e) => void subir(Array.from(e.target.files ?? []))}
        />
        <label
          htmlFor={`fotos-entrega-${entregaId}`}
          className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-linea bg-superficie px-3.5 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
        >
          {subidas ? "Agregar otra foto" : "Subir la foto de la entrega"}
        </label>
        {estado ? (
          <span role="status" className="text-sm font-semibold text-tinta">
            {estado}
          </span>
        ) : null}
      </div>
      {aviso ? <p className="text-sm font-semibold text-aviso">{aviso}</p> : null}
    </div>
  );
}
