import { Form, Link, useLocation, useSubmit } from "react-router";
import { leerCatalogo, listar } from "../../../server/db/propiedades";
import {
  ETIQUETA_ORDEN,
  ETIQUETA_TIPO_PLURAL,
  ORDENES,
  cuantosFiltros,
  leerFiltros,
  rutaDeListado,
} from "../../../shared/filtros";
import { precioMXN } from "../../../shared/formato";
import { CampoSelect, CampoTexto } from "../../components/publico/piezas";
import { IconoBuscar } from "../../components/publico/iconos";
import { ListaInfinita } from "../../components/publico/lista-infinita";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/listado";

/**
 * Listado con los filtros EN LA URL (PLAN §10.1): así un enlace con filtros se
 * puede mandar por WhatsApp y Google lo puede leer. Todo el formulario es un
 * `GET` normal, o sea que funciona sin JavaScript; con JavaScript, React
 * Router vuelve a correr el loader sin recargar la página.
 *
 * Lo que arregla del sitio actual: el deslizador de precio tenía `max=1000000`
 * cuando 181 de 188 casas cuestan más, y las 30 amenidades del filtro no están
 * capturadas en ninguna ficha, así que filtrar por ellas devolvía vacío. Aquí
 * el rango sale de los datos y no hay ningún filtro que no tenga datos detrás.
 *
 * En el celular manda el catálogo: el buscador ocupa tres renglones y lo demás
 * va plegado, para que la primera casa se vea sin bajar mucho.
 */

export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const filtros = leerFiltros(new URL(request.url).searchParams);
  const catalogo = await leerCatalogo(servicios.db);
  const pagina = await listar(servicios.db, filtros, catalogo, servicios.config.cloudinary.cloudName);
  return { filtros, catalogo, pagina };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const total = loaderData?.pagina.total ?? 0;
  const f = loaderData?.filtros;
  const que = f?.tipo ? ETIQUETA_TIPO_PLURAL[f.tipo] : "Propiedades";
  const como = f?.operacion === "renta" ? " en renta" : f?.operacion === "venta" ? " en venta" : "";
  return [
    { title: `${que}${como} en Morelia · ${total} disponibles | Activos Inmobiliarios Globales` },
    {
      name: "description",
      content: `${total} propiedades disponibles. Filtra por zona, tipo, precio y recámaras, y pregunta por la que te interese por WhatsApp.`,
    },
  ];
}

const CHIP =
  "flex items-center gap-2 rounded-full border border-linea bg-superficie px-4 py-2 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca";

export default function Listado({ loaderData }: Route.ComponentProps) {
  const { filtros, catalogo, pagina } = loaderData;
  const enviar = useSubmit();
  // Otra búsqueda u otro orden = otra lista, desde cero. Por la búsqueda y no
  // por la llave de la entrada del historial: un salto a un ancla (`#…`) crea
  // entrada nueva y reiniciaría la lista sin que nada cambiara.
  const { search } = useLocation();
  const puestos = cuantosFiltros(filtros);
  const rango = filtros.operacion === "renta" ? catalogo.rangos.renta : catalogo.rangos.venta;

  return (
    <div className="mx-auto max-w-sitio px-5 lg:px-10 py-8 sm:py-12">
      <header className="lg:flex lg:items-end lg:justify-between lg:gap-12">
        <div className="max-w-lg">
          <h1 className="font-display text-titulo text-tinta">Propiedades en Morelia y Michoacán</h1>
          <p className="mt-3 text-guia text-texto-suave">
            {catalogo.total} propiedades reales, con su precio, sus metros y sus fotos.
          </p>
        </div>

        {/* El hueco de la derecha con algo que sirve: las colonias que de
            verdad tienen varias casas. Las otras 93 tienen una sola y se
            alcanzan escribiendo su nombre (PLAN §15, decisión de zonas). */}
        {catalogo.zonas.length ? (
          <nav aria-label="Colonias con más propiedades" className="hidden lg:block">
            <p className="text-sm font-bold tracking-widest text-texto-suave uppercase">Colonias con más casas</p>
            <ul className="mt-3 flex max-w-md flex-wrap justify-end gap-2">
              {catalogo.zonas.slice(0, 5).map((z) => (
                <li key={z.slug}>
                  <Link to={rutaDeListado({ zona: z.slug })} className={CHIP}>
                    {z.colonia}
                    <span className="text-texto-suave tabular-nums">{z.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      {/* `scroll-mt`: al volver desde el final de la lista («Volver a los
          filtros»), que la cabecera fija no tape el buscador. */}
      <Form id="filtros" method="get" className="mt-7 scroll-mt-28">
        <div className="rounded-2xl border border-linea bg-superficie p-4 shadow-tarjeta sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_auto]">
            <CampoTexto
              etiqueta="Colonia, fraccionamiento o clave"
              name="q"
              type="search"
              defaultValue={filtros.q ?? ""}
              placeholder="Altozano, Tres Marías, AIG-0042…"
              autoComplete="off"
            />

            {/* `lg:contents` deshace esta caja en pantallas anchas: los dos
                campos pasan a ser columnas de la reja de arriba, sin repetir
                los controles (dos copias mandarían el filtro dos veces). */}
            <div className="grid grid-cols-2 gap-3 lg:contents">
              <CampoSelect etiqueta="Operación" name="operacion" defaultValue={filtros.operacion ?? ""}>
                <option value="">Cualquiera</option>
                <option value="venta">En venta ({catalogo.operaciones.venta})</option>
                <option value="renta">En renta ({catalogo.operaciones.renta})</option>
              </CampoSelect>

              <CampoSelect etiqueta="Tipo" name="tipo" defaultValue={filtros.tipo ?? ""}>
                <option value="">Todos</option>
                {catalogo.tipos.map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {ETIQUETA_TIPO_PLURAL[t.tipo]} ({t.n})
                  </option>
                ))}
              </CampoSelect>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-marca px-6 text-base font-extrabold text-white transition-colors hover:bg-marca-oscuro lg:w-auto"
              >
                <IconoBuscar />
                Buscar
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          {/* Plegado y angosto: es un control, no una tarjeta vacía. */}
          <details className="group" open={puestos > 2}>
            <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-linea bg-superficie px-4 text-sm font-bold text-tinta transition-colors hover:border-marca [&::-webkit-details-marker]:hidden">
              Más filtros
              {puestos > 0 ? (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-marca px-1.5 text-xs font-extrabold text-white tabular-nums">
                  {puestos}
                </span>
              ) : null}
              <span aria-hidden className="text-texto-suave transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>

            <div className="mt-3 grid w-full gap-3 rounded-2xl border border-linea bg-superficie p-4 sm:grid-cols-2 lg:grid-cols-3">
              <CampoSelect etiqueta="Ciudad" name="ciudad" defaultValue={filtros.ciudad ?? ""}>
                <option value="">Todas</option>
                {catalogo.ciudades.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.ciudad} ({c.n})
                  </option>
                ))}
              </CampoSelect>

              <CampoSelect etiqueta="Colonia" name="zona" defaultValue={filtros.zona ?? ""}>
                <option value="">Todas</option>
                {catalogo.zonas.map((z) => (
                  <option key={z.slug} value={z.slug}>
                    {z.colonia} ({z.n})
                  </option>
                ))}
              </CampoSelect>

              <CampoSelect etiqueta="Recámaras (mínimo)" name="recamaras" defaultValue={filtros.recamaras ?? ""}>
                <option value="">Cualquiera</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} o más
                  </option>
                ))}
              </CampoSelect>

              <CampoTexto
                etiqueta="Precio desde"
                name="precio_min"
                type="text"
                inputMode="numeric"
                defaultValue={filtros.precioMin ?? ""}
                placeholder={rango.min ? precioMXN(rango.min)! : "Sin mínimo"}
              />

              <CampoTexto
                etiqueta="Precio hasta"
                name="precio_max"
                type="text"
                inputMode="numeric"
                defaultValue={filtros.precioMax ?? ""}
                placeholder={rango.max ? precioMXN(rango.max)! : "Sin máximo"}
              />

              <CampoSelect etiqueta="Baños (mínimo)" name="banos" defaultValue={filtros.banos ?? ""}>
                <option value="">Cualquiera</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} o más
                  </option>
                ))}
              </CampoSelect>
            </div>
          </details>

          <label className="ml-auto flex items-center gap-2 text-sm text-texto-suave">
            <span className="hidden sm:inline">Ordenar</span>
            <select
              name="orden"
              aria-label="Ordenar resultados"
              defaultValue={filtros.orden}
              // Con JavaScript se aplica solo; sin él, lo aplica «Buscar».
              onChange={(evento) => enviar(evento.currentTarget.form, { replace: true })}
              className="h-11 rounded-xl border border-linea bg-superficie px-3 text-sm font-bold text-tinta outline-none focus:border-marca"
            >
              {ORDENES.map((o) => (
                <option key={o} value={o}>
                  {ETIQUETA_ORDEN[o]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Form>

      <p className="mt-6 text-tinta">
        <strong className="text-lg font-extrabold tabular-nums">{pagina.total}</strong>{" "}
        {pagina.total === 1 ? "propiedad" : "propiedades"}
        {puestos > 0 ? (
          <>
            {" · "}
            <Link to="/propiedades" className="font-bold text-marca underline underline-offset-4">
              quitar filtros
            </Link>
          </>
        ) : null}
      </p>

      {pagina.items.length ? (
        // Sigue cargando al bajar; sin JavaScript, la paginación de siempre.
        <ListaInfinita key={search} filtros={filtros} inicial={pagina} />
      ) : (
        <div className="mt-6 rounded-2xl border border-linea bg-superficie p-10 text-center">
          <p className="font-display text-seccion text-tinta">No encontramos propiedades así</p>
          <p className="mx-auto mt-3 max-w-md text-texto-suave">
            Prueba con menos filtros, o escribe solo la colonia que te interesa.
          </p>
          <Link
            to="/propiedades"
            className="mt-6 inline-flex h-12 items-center rounded-xl bg-marca px-6 font-extrabold text-white transition-colors hover:bg-marca-oscuro"
          >
            Ver las {catalogo.total} propiedades
          </Link>
        </div>
      )}
    </div>
  );
}
