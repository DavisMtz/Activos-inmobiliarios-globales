import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import type { FotoVista } from "../../../shared/fotos";
import { pedirJson, prepararArchivo, subirACloudinary, type Firma } from "../comun/subida";

/**
 * Las fotos que agrega el cliente desde su enlace (F5). Van directo a
 * Cloudinary desde su teléfono con una firma que da el servidor, igual que las
 * del panel, y el enlace es la llave de cada petición.
 *
 * Solo se puede subir con el permiso de fotos marcado: así nada suyo llega a
 * la nube sin permiso. Si lo desmarca antes de enviar, el servidor borra las
 * que ya subió.
 *
 * De una en una y sin reintentos automáticos: son pocas, y en el celular es
 * más claro ver cuál falló y volver a elegirla.
 */
export function FotosDelCliente({
  token,
  fotos,
  habilitado,
  tope,
}: {
  token: string;
  fotos: (FotoVista & { id: number })[];
  habilitado: boolean;
  tope: number;
}) {
  const revalidador = useRevalidator();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sin JavaScript el botón no sirve: se enseña desactivado hasta hidratar.
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => setHidratado(true), []);

  const base = `/api/entregas/${encodeURIComponent(token)}`;
  const quedan = tope - fotos.length;

  const subir = async (archivos: File[]) => {
    setError(null);
    for (const [i, archivo] of archivos.slice(0, quedan).entries()) {
      try {
        setSubiendo(`Subiendo ${i + 1} de ${Math.min(archivos.length, quedan)}…`);
        const listo = await prepararArchivo(archivo);
        const firma = (await pedirJson(`${base}/firma`, {})) as unknown as Firma;
        const subida = await subirACloudinary(firma, listo, archivo.name);
        await pedirJson(`${base}/fotos`, {
          public_id: subida.public_id,
          version: subida.version,
          signature: subida.signature,
          width: subida.width,
          height: subida.height,
        });
      } catch (fallo) {
        setError(`«${archivo.name}» no se pudo subir: ${fallo instanceof Error ? fallo.message : "intenta de nuevo"}.`);
      }
    }
    if (archivos.length > quedan) setError(`Solo caben ${tope} fotos; las demás no se subieron.`);
    setSubiendo(null);
    if (entrada.current) entrada.current.value = "";
    revalidador.revalidate();
  };

  const quitar = async (id: number) => {
    setError(null);
    const r = await fetch(`${base}/fotos/${id}`, { method: "DELETE" });
    if (!r.ok) setError("No pudimos quitar esa foto.");
    revalidador.revalidate();
  };

  const activo = hidratado && habilitado && !subiendo && quedan > 0;

  return (
    <section aria-labelledby="titulo-tus-fotos" className="flex flex-col gap-3">
      <h2 id="titulo-tus-fotos" className="font-display text-seccion text-tinta">
        ¿Quieres agregar tus fotos?
      </h2>
      <p className="text-sm text-texto-suave">
        Opcional, hasta {tope}. {habilitado ? "Elige las que quieras compartir." : "Primero marca el permiso de las fotos."}
      </p>

      {fotos.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((foto) => (
            <li key={foto.id} className="relative overflow-hidden rounded-xl bg-marca-suave">
              <img src={foto.src} alt={foto.alt} width={320} height={240} className="aspect-[4/3] w-full object-cover" />
              <button
                type="button"
                onClick={() => void quitar(foto.id)}
                className="absolute right-1.5 bottom-1.5 rounded-lg bg-tinta/85 px-2.5 py-1 text-xs font-bold text-white hover:bg-tinta"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          id="fotos-del-cliente"
          disabled={!activo}
          onChange={(e) => void subir(Array.from(e.target.files ?? []))}
        />
        <label
          htmlFor="fotos-del-cliente"
          aria-disabled={!activo}
          className={`inline-flex h-12 items-center rounded-xl border px-5 font-bold transition-colors ${
            activo
              ? "cursor-pointer border-marca text-marca hover:bg-marca-suave"
              : "cursor-not-allowed border-linea text-texto-suave"
          }`}
        >
          {quedan > 0 ? "Elegir fotos" : "Ya no caben más"}
        </label>
        {subiendo ? (
          <span role="status" className="text-sm font-semibold text-tinta">
            {subiendo}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-marca-oscuro">
          {error}
        </p>
      ) : null}
    </section>
  );
}
