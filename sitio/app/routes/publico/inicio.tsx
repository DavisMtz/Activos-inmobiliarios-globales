import { Form, Link } from "react-router";
import { leerConfiguracion, leerServicios } from "../../../server/db/configuracion";
import { destacadas, leerCatalogo } from "../../../server/db/propiedades";
import { ETIQUETA_TIPO_PLURAL, rutaDeListado } from "../../../shared/filtros";
import { precioMXN } from "../../../shared/formato";
import { enlaceWhatsApp } from "../../../shared/whatsapp";
import { IconoBuscar, IconoFlecha, IconoWhatsApp } from "../../components/publico/iconos";
import { Isotipo } from "../../components/publico/isotipo";
import { CampoSelect, CampoTexto, TarjetaPropiedad } from "../../components/publico/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/inicio";

/**
 * Portada (PLAN §10.1). Manda el catálogo: buscador de verdad arriba, casas
 * reales enseguida y accesos por tipo con conteos reales.
 *
 * Lo que NO lleva, a propósito (PLAN §0.4): testimonios (los del sitio actual
 * son «Lorem ipsum» firmados por «James Oliver»), cifras de ventas, premios ni
 * fotos de equipo. Nada de eso existe. La foto grande es la portada de una
 * casa real del catálogo, no una imagen de banco como la de hoy.
 */

export async function loader({ context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const { config, db } = servicios;

  const [catalogo, casas, configuracion, listaServicios] = await Promise.all([
    leerCatalogo(db),
    destacadas(db, config.cloudinary.cloudName, 6),
    leerConfiguracion(db),
    leerServicios(db),
  ]);

  return {
    catalogo,
    casas,
    portada: configuracion.portada,
    servicios: listaServicios.slice(0, 6).map((s) => ({ id: s.id, titulo: s.titulo })),
    whatsapp: enlaceWhatsApp(configuracion.whatsapp.numero, configuracion.whatsapp.plantillaGeneral),
    nombreNegocio: config.nombreNegocio,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const nombre = loaderData?.nombreNegocio ?? "Activos Inmobiliarios Globales";
  const total = loaderData?.catalogo.total ?? 0;
  return [
    { title: `${nombre} · Casas en venta y renta en Morelia` },
    {
      name: "description",
      content: `${total} casas, departamentos y terrenos en Morelia y Michoacán. Busca por colonia, precio o recámaras y pregunta por WhatsApp.`,
    },
  ];
}

export default function Inicio({ loaderData }: Route.ComponentProps) {
  const { catalogo, casas, portada, servicios, whatsapp } = loaderData;
  const principal = casas[0];
  const desde = precioMXN(catalogo.rangos.venta.min);
  const ciudades = catalogo.ciudades.length;

  return (
    <div>
      {/* ─── Primera pantalla: el titular, el buscador y una casa real ─── */}
      {/* «financiamiento» mide 8.4 veces el cuerpo del titular: a 1024 px son
          513 px y la mitad de la pantalla da 444, así que se salía. Hasta 1280
          el texto se lleva 3/5; desde ahí nunca baja de 36rem y la foto crece
          con lo que sobra. Medido con el titular real, no con uno de ejemplo. */}
      <section className="mx-auto max-w-sitio px-5 lg:px-10 pt-10 pb-12 sm:pt-14 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center lg:gap-14 lg:pt-16 xl:grid-cols-[minmax(36rem,1fr)_minmax(0,1.2fr)]">
        <div className="max-w-xl">
          <Isotipo className="h-12 w-auto" />

          <h1 className="mt-6 font-display text-display text-tinta">
            {portada.titular || "Comercialización, renta y financiamiento de inmuebles"}
          </h1>

          {portada.lema ? <p className="mt-4 text-guia text-texto-suave">{portada.lema}</p> : null}

          <Form method="get" action="/propiedades" className="mt-8 flex flex-col gap-3">
            <CampoTexto
              etiqueta="¿Qué colonia te interesa?"
              name="q"
              type="search"
              placeholder="Altozano, Tres Marías, El Prado…"
              autoComplete="off"
            />
            <div className="grid grid-cols-2 gap-3">
              <CampoSelect etiqueta="Operación" name="operacion" defaultValue="">
                <option value="">Cualquiera</option>
                <option value="venta">En venta ({catalogo.operaciones.venta})</option>
                <option value="renta">En renta ({catalogo.operaciones.renta})</option>
              </CampoSelect>
              <CampoSelect etiqueta="Tipo" name="tipo" defaultValue="">
                <option value="">Todos</option>
                {catalogo.tipos.map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {ETIQUETA_TIPO_PLURAL[t.tipo]} ({t.n})
                  </option>
                ))}
              </CampoSelect>
            </div>
            <button
              type="submit"
              className="flex h-13 items-center justify-center gap-2 rounded-xl bg-marca px-6 py-3.5 text-base font-extrabold text-white transition-colors hover:bg-marca-oscuro"
            >
              <IconoBuscar />
              Ver las {catalogo.total} propiedades
            </button>
          </Form>

          {/* Datos reales, en una frase: ni cifras inventadas ni contadores. */}
          <p className="mt-4 text-sm text-texto-suave">
            En Morelia y {ciudades - 1} ciudades más de Michoacán
            {desde ? `, desde ${desde}` : ""}.
          </p>
        </div>

        {principal?.foto ? (
          <Link
            to={`/propiedades/${principal.slug}`}
            className="group mt-10 block overflow-hidden rounded-3xl lg:mt-0"
          >
            <img
              src={principal.foto.src}
              srcSet={principal.foto.srcset ?? undefined}
              sizes="(min-width: 1280px) 45rem, (min-width: 1024px) 28rem, 92vw"
              alt={principal.foto.alt}
              width={960}
              height={720}
              fetchPriority="high"
              decoding="async"
              className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
          </Link>
        ) : null}
      </section>

      {/* ─── Accesos por tipo, con los conteos de verdad ─── */}
      {catalogo.tipos.length ? (
        <nav aria-label="Por tipo de propiedad" className="mx-auto max-w-sitio px-5 lg:px-10">
          <ul className="flex flex-wrap gap-2">
            {catalogo.tipos.map((t) => (
              <li key={t.tipo}>
                <Link
                  to={rutaDeListado({ tipo: t.tipo })}
                  className="flex items-center gap-2 rounded-full border border-linea bg-superficie px-4 py-2.5 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
                >
                  {ETIQUETA_TIPO_PLURAL[t.tipo]}
                  <span className="text-texto-suave tabular-nums">{t.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {/* ─── Las casas ─── */}
      {casas.length ? (
        <section className="mx-auto max-w-sitio px-5 lg:px-10 py-14 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-seccion text-tinta">Lo más reciente</h2>
            <Link
              to="/propiedades"
              className="flex items-center gap-2 font-bold text-marca underline underline-offset-4"
            >
              Ver todas
              <IconoFlecha className="h-4 w-4" />
            </Link>
          </div>

          <ul data-animar-lista className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {casas.map((casa, i) => (
              <li key={casa.clave}>
                <TarjetaPropiedad item={casa} prioridad={i < 1} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ─── Servicios, en corto ─── */}
      {servicios.length ? (
        <section className="campo-oscuro bg-tinta text-sobre-oscuro">
          <div className="mx-auto max-w-sitio px-5 lg:px-10 py-14 sm:py-20">
            <h2 className="max-w-xl font-display text-seccion text-white">
              {portada.presentacion || "Qué hacemos"}
            </h2>

            <ul className="mt-10 grid gap-x-12 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {servicios.map((servicio) => (
                <li key={servicio.id} className="border-t border-white/15 pt-4">
                  <Link
                    to="/servicios"
                    className="font-display text-xl font-semibold text-white hover:text-sobre-vino-suave"
                  >
                    {servicio.titulo}
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              to="/servicios"
              className="mt-10 inline-flex items-center gap-2 font-bold text-white underline underline-offset-4"
            >
              Ver los servicios
              <IconoFlecha className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ) : null}

      {/* ─── Cierre ─── */}
      <section className="mx-auto max-w-sitio px-5 lg:px-10 py-14 sm:py-20">
        {/* Centrado y angosto en el celular; en escritorio, el texto a la
            izquierda y los botones a la derecha, a lo ancho de la franja. */}
        <div
          data-animar
          className="rounded-3xl bg-marca-oscuro px-6 py-12 text-center sm:px-12 campo-oscuro lg:flex lg:items-center lg:justify-between lg:gap-12 lg:px-14 lg:text-left"
        >
          <div>
            <h2 className="mx-auto max-w-2xl font-display text-seccion text-white lg:mx-0">
              ¿Buscas algo que no está en la lista? Dinos qué necesitas.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sobre-vino-suave lg:mx-0">
              Tenemos propiedades que aún no publicamos y podemos buscarte una a la medida.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-4 lg:mt-0 lg:shrink-0 lg:justify-end">
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-13 items-center gap-2 rounded-xl bg-white px-6 py-3.5 font-extrabold text-marca-oscuro transition-colors hover:bg-sobre-oscuro"
              >
                <IconoWhatsApp />
                Escribir por WhatsApp
              </a>
            ) : null}
            <Link
              to="/contacto"
              className="inline-flex h-13 items-center rounded-xl border border-white/40 px-6 py-3.5 font-bold text-white transition-colors hover:bg-white/10"
            >
              Dejar mis datos
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
