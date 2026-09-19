import type { EntregaPublica } from "../../../server/db/entregas";

/**
 * Una entrega publicada: la foto del día (si el cliente la autorizó), su
 * comentario (si lo autorizó) y «Laura M.». Sale en la portada y en
 * `/entregas`. Nada de esto se inventa: solo existe lo que un cliente mandó y
 * el equipo aprobó, y sin ninguna la sección ni siquiera se pinta.
 */

const MES = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

export function TarjetaEntrega({ entrega, conTodas = false }: { entrega: EntregaPublica; conTodas?: boolean }) {
  const [principal, ...resto] = entrega.fotos;
  const extra = conTodas ? resto.slice(0, 3) : [];

  // Sin fotos autorizadas, la entrega es una cita: sobre el vino de la marca y
  // con la letra más grande. Como tarjeta blanca estirada a la altura de las
  // que traen foto quedaba como una caja vacía (medido en la primera captura).
  if (!principal) {
    return (
      <figure className="campo-oscuro flex flex-col gap-6 rounded-2xl bg-marca-oscuro p-6 text-white shadow-tarjeta sm:p-8">
        {entrega.comentario ? (
          <blockquote className="font-display text-xl leading-snug sm:text-2xl">
            <span aria-hidden="true" className="mr-1 text-sobre-vino-suave">
              «
            </span>
            {entrega.comentario}
            <span aria-hidden="true" className="ml-1 text-sobre-vino-suave">
              »
            </span>
          </blockquote>
        ) : null}
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-white/20 pt-3 text-sm">
          <span className="font-bold">{entrega.nombre}</span>
          <span className="text-white/75 first-letter:uppercase">{MES.format(new Date(entrega.fecha))}</span>
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="flex flex-col overflow-hidden rounded-2xl border border-linea bg-superficie shadow-tarjeta">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-marca-suave">
        <img
          src={principal.src}
          srcSet={principal.srcset ?? undefined}
          sizes="(min-width: 1024px) 28rem, (min-width: 640px) 45vw, 92vw"
          alt={principal.alt}
          width={640}
          height={480}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        {!conTodas && resto.length ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-tinta/80 px-3 py-1 text-xs font-bold text-white tabular-nums">
            +{resto.length} {resto.length === 1 ? "foto" : "fotos"}
          </span>
        ) : null}
      </div>

      {extra.length ? (
        <ul className="grid grid-cols-3 gap-1 p-1">
          {extra.map((foto) => (
            <li key={foto.src} className="overflow-hidden rounded-lg bg-marca-suave">
              <img
                src={foto.src}
                alt={foto.alt}
                width={320}
                height={240}
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}

      <figcaption className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        {entrega.comentario ? (
          <blockquote className="font-display text-lg leading-snug text-tinta">
            <span aria-hidden="true" className="mr-0.5 text-marca">
              «
            </span>
            {entrega.comentario}
            <span aria-hidden="true" className="ml-0.5 text-marca">
              »
            </span>
          </blockquote>
        ) : null}
        <p className="mt-auto flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-linea pt-3 text-sm">
          <span className="font-bold text-tinta">{entrega.nombre}</span>
          <span className="text-texto-suave first-letter:uppercase">{MES.format(new Date(entrega.fecha))}</span>
        </p>
      </figcaption>
    </figure>
  );
}
