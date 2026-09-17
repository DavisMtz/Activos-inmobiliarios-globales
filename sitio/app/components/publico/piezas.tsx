import { useId, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes } from "react";
import { Link } from "react-router";
import { m2, precioMXN } from "../../../shared/formato";
import { rutaDeListado, type Filtros } from "../../../shared/filtros";
import type { Tarjeta } from "../../../server/db/propiedades";
import { IconoBano, IconoRecamara, IconoSuperficie } from "./iconos";

/** Piezas del sitio público. Nada de aquí se usa en el panel. */

// ─── Precio ───────────────────────────────────────────────────────

/**
 * Lo que se lee en la tarjeta y en la ficha. Una casa en venta y renta enseña
 * los dos precios, y la que no tiene ninguno lo dice en vez de callarlo: en el
 * catálogo hay 3 casas sin precio de venta y 5 sin el de renta.
 */
export function textoPrecio(item: Pick<Tarjeta, "operacion" | "precio" | "precioRenta">): {
  principal: string;
  segundo: string | null;
} {
  const venta = precioMXN(item.precio);
  const renta = precioMXN(item.precioRenta);

  if (item.operacion === "renta") {
    return { principal: renta ? `${renta}` : "Renta a consultar", segundo: renta ? "al mes" : null };
  }
  if (item.operacion === "venta_renta") {
    return {
      principal: venta ?? renta ?? "Precio a consultar",
      segundo: venta && renta ? `o ${renta} al mes` : venta ? "también en renta" : null,
    };
  }
  return { principal: venta ?? "Precio a consultar", segundo: null };
}

const ETIQUETA_ESTADO: Record<string, string> = {
  apartada: "Apartada",
  vendida: "Vendida",
  rentada: "Rentada",
};

export function EtiquetaEstado({ estado, operacion }: { estado: string; operacion: Tarjeta["operacion"] }) {
  const cerrada = ETIQUETA_ESTADO[estado];
  if (cerrada) {
    return (
      <span className="rounded-full bg-tinta px-3 py-1.5 text-xs font-bold tracking-wide text-white uppercase">
        {cerrada}
      </span>
    );
  }
  if (operacion === "renta" || operacion === "venta_renta") {
    return (
      <span className="rounded-full bg-marca px-3 py-1.5 text-xs font-bold tracking-wide text-white uppercase">
        {operacion === "renta" ? "En renta" : "Venta o renta"}
      </span>
    );
  }
  return null;
}

// ─── Tarjeta de una casa ──────────────────────────────────────────

function Dato({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-texto-suave">{icono}</span>
      <span className="tabular-nums">{children}</span>
    </span>
  );
}

/**
 * `prioridad` solo para las primeras de la primera pantalla: son el LCP y
 * tienen que empezar a bajar de inmediato. Las demás van en diferido, que es
 * además lo que evita generar derivados de Cloudinary de fotos que nadie ve.
 */
export function TarjetaPropiedad({ item, prioridad = false }: { item: Tarjeta; prioridad?: boolean }) {
  const precio = textoPrecio(item);
  const superficie = m2(item.m2Construccion) ?? m2(item.m2Terreno);

  return (
    <article className="group h-full">
      <Link
        to={`/propiedades/${item.slug}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-linea bg-superficie shadow-tarjeta transition-shadow hover:shadow-alzada"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-marca-suave">
          {item.foto ? (
            <img
              src={item.foto.src}
              srcSet={item.foto.srcset ?? undefined}
              sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
              alt={item.foto.alt}
              width={640}
              height={480}
              loading={prioridad ? "eager" : "lazy"}
              fetchPriority={prioridad ? "high" : undefined}
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : null}
          <div className="absolute top-3 left-3">
            <EtiquetaEstado estado={item.estado} operacion={item.operacion} />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <div>
            <p className="text-precio text-tinta tabular-nums">{precio.principal}</p>
            {precio.segundo ? <p className="text-sm text-texto-suave">{precio.segundo}</p> : null}
          </div>

          <div>
            <h3 className="font-display text-lg leading-snug font-semibold text-tinta">{item.titulo}</h3>
            {item.zona ? <p className="mt-1 text-sm text-texto-suave">{item.zona}</p> : null}
          </div>

          {/* La clave va SIEMPRE: 27 fichas comparten título con otra («Casa en
              El Prado» son cuatro), así que sin ella dos tarjetas seguidas se
              leen iguales. Además es lo que el equipo dice por teléfono. */}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-linea pt-3 text-sm">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-texto">
              {item.recamaras ? (
                <Dato icono={<IconoRecamara className="h-[1.15rem] w-[1.15rem]" />}>
                  {item.recamaras} <span className="sr-only">recámaras</span>
                </Dato>
              ) : null}
              {item.banos ? (
                <Dato icono={<IconoBano className="h-[1.15rem] w-[1.15rem]" />}>
                  {item.banos} <span className="sr-only">baños</span>
                </Dato>
              ) : null}
              {superficie ? (
                <Dato icono={<IconoSuperficie className="h-[1.15rem] w-[1.15rem]" />}>{superficie}</Dato>
              ) : null}
            </p>
            <span className="text-texto-suave tabular-nums">{item.clave}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}

// ─── Controles de formulario ──────────────────────────────────────

export function CampoTexto({ etiqueta, ...props }: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-tinta">
        {etiqueta}
      </label>
      <input
        id={id}
        className="h-12 w-full rounded-xl border border-linea bg-superficie px-4 text-base text-tinta transition-colors outline-none placeholder:text-texto-suave/70 focus:border-marca"
        {...props}
      />
    </div>
  );
}

export function CampoSelect({
  etiqueta,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-tinta">
        {etiqueta}
      </label>
      <select
        id={id}
        className="h-12 w-full rounded-xl border border-linea bg-superficie px-3 text-base text-tinta transition-colors outline-none focus:border-marca"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

// ─── Paginación ───────────────────────────────────────────────────

export function Paginacion({ filtros, paginas }: { filtros: Filtros; paginas: number }) {
  if (paginas <= 1) return null;
  const actual = Math.min(filtros.pagina, paginas);

  const estilo =
    "flex h-12 items-center rounded-xl border border-linea bg-superficie px-5 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca";

  return (
    <nav aria-label="Páginas de resultados" className="mt-10 flex items-center justify-between gap-4">
      {actual > 1 ? (
        <Link to={rutaDeListado({ ...filtros, pagina: actual - 1 })} rel="prev" className={estilo}>
          Anterior
        </Link>
      ) : (
        <span />
      )}

      <p className="text-sm text-texto-suave tabular-nums">
        Página {actual} de {paginas}
      </p>

      {actual < paginas ? (
        <Link to={rutaDeListado({ ...filtros, pagina: actual + 1 })} rel="next" className={estilo}>
          Siguiente
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
