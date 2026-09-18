import { Form, Link } from "react-router";
import { leerConfiguracion, leerServicios } from "../../../server/db/configuracion";
import { destacadas, leerCatalogo, type Tarjeta } from "../../../server/db/propiedades";
import { ETIQUETA_TIPO_PLURAL, rutaDeListado } from "../../../shared/filtros";
import { precioMXN } from "../../../shared/formato";
import { enlaceWhatsApp } from "../../../shared/whatsapp";
import { IconoBuscar, IconoFlecha, IconoWhatsApp } from "../../components/publico/iconos";
import { Isotipo } from "../../components/publico/isotipo";
import { CampoSelect, CampoTexto, TarjetaPropiedad, textoPrecio } from "../../components/publico/piezas";
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
    // 7 y no 6: la primera va a la vitrina de arriba y las otras seis a «Lo
    // más reciente», para no enseñar la misma casa dos veces seguidas.
    destacadas(db, config.cloudinary.cloudName, 7),
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
  const principal = casas[0]?.foto ? casas[0] : null;
  const recientes = (principal ? casas.slice(1) : casas).slice(0, 6);
  const desde = precioMXN(catalogo.rangos.venta.min);
  const ciudades = catalogo.ciudades.length;

  return (
    <div>
      {/* ─── Primera pantalla: el titular, el buscador y una casa real ─── */}
      {/* «financiamiento» mide 8.4 veces el cuerpo del titular: a 1024 px son
          513 px y la mitad de la pantalla da 444, así que se salía. Hasta 1280
          el texto se lleva 3/5; desde ahí nunca baja de 36rem y la foto crece
          con lo que sobra. Medido con el titular real, no con uno de ejemplo.
          Desde 1920 (`3xl`) el texto tiene columna fija de 44rem y el titular
          sube a 5rem: «financiamiento» mide 42rem y cabe; la vitrina se queda
          con todo lo demás, sin la columna del texto medio vacía. */}
      <section className="mx-auto max-w-sitio px-5 pt-8 pb-12 sm:pt-12 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center lg:gap-14 lg:px-10 lg:pt-14 xl:grid-cols-[minmax(36rem,1fr)_minmax(0,1.2fr)] 3xl:grid-cols-[44rem_minmax(0,1fr)] 3xl:gap-20">
        <div className="max-w-xl 3xl:max-w-none">
          {/* El isotipo ya no va suelto encima del titular (la cabecera trae el
              logotipo completo): encabeza la frase que dice dónde y qué, la
              misma del título de la página. */}
          <p className="flex items-center gap-3 text-xs font-bold tracking-[0.14em] text-marca uppercase motion-safe:animate-entrada motion-safe:[animation-delay:var(--rb,0s)] sm:text-sm sm:tracking-widest">
            <Isotipo quieto className="h-7 w-auto shrink-0 sm:h-8" />
            Casas en venta y renta en Morelia
          </p>

          <h1 className="mt-5 font-display text-display text-tinta 3xl:text-[5rem] motion-safe:animate-entrada-titular motion-safe:[animation-delay:calc(var(--rb,0s)_+_60ms)]">
            {portada.titular || "Comercialización, renta y financiamiento de inmuebles"}
          </h1>

          {portada.lema ? <p className="mt-4 text-guia text-texto-suave">{portada.lema}</p> : null}

          {/* El buscador es la acción principal: va en su propio panel para
              que se lea como una herramienta y no como texto suelto. */}
          <Form
            method="get"
            action="/propiedades"
            className="mt-8 flex flex-col gap-3 rounded-2xl border border-linea bg-superficie p-4 shadow-alzada motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_160ms)] sm:p-5"
          >
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
              className="mt-1 flex h-13 items-center justify-center gap-2 rounded-xl bg-marca px-6 py-3.5 text-base font-extrabold text-white transition-colors hover:bg-marca-oscuro"
            >
              <IconoBuscar />
              Ver las {catalogo.total} propiedades
            </button>
          </Form>

          {/* Tres cifras que salen de la base, no de un texto de venta: si el
              catálogo cambia, cambian solas. */}
          <dl className="mt-7 grid grid-cols-3 gap-4 sm:gap-6">
            <Cifra orden={0} valor={String(catalogo.total)} etiqueta="propiedades publicadas" />
            <Cifra orden={1} valor={String(ciudades)} etiqueta={ciudades === 1 ? "ciudad de Michoacán" : "ciudades de Michoacán"} />
            {desde ? <Cifra orden={2} valor={desde} etiqueta="precio desde" /> : null}
          </dl>
        </div>

        {principal ? <Vitrina casa={principal} /> : null}
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
      {recientes.length ? (
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

          {/* Seis casas: 3 columnas y, desde 2400 px, las seis en un renglón
              (cada tarjeta mide lo mismo que a 1366 en tres). */}
          <ul data-animar-lista className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 4xl:grid-cols-6">
            {recientes.map((casa) => (
              <li key={casa.clave}>
                {/* Sin prioridad: la foto que pide ir primero es la de la vitrina.
                    Antes la primera tarjeta era esa misma casa y bajaba la misma
                    foto; ahora es otra, y en el celular queda bajo el pliegue. */}
                <TarjetaPropiedad item={casa} />
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

// ─── Piezas de la primera pantalla ────────────────────────────────

/** Clases enteras y no un número suelto: Tailwind solo genera las que lee escritas. */
const RETRASO_CIFRA = [
  "motion-safe:[animation-delay:calc(var(--rb,0s)_+_300ms)]",
  "motion-safe:[animation-delay:calc(var(--rb,0s)_+_370ms)]",
  "motion-safe:[animation-delay:calc(var(--rb,0s)_+_440ms)]",
];

/** Valor arriba y etiqueta abajo, pero en el orden que lee un lector de pantalla: etiqueta y valor. */
function Cifra({ valor, etiqueta, orden }: { valor: string; etiqueta: string; orden: number }) {
  return (
    <div
      className={`flex flex-col-reverse justify-end border-l-2 border-marca pl-3 motion-safe:animate-entrada sm:pl-4 ${RETRASO_CIFRA[orden] ?? ""}`}
    >
      <dt className="mt-1 text-xs leading-snug text-texto-suave sm:text-sm">{etiqueta}</dt>
      <dd className="font-display text-[clamp(1.1rem,4.6vw,1.875rem)] leading-none font-bold text-tinta">{valor}</dd>
    </div>
  );
}

const OPERACION_VITRINA: Record<Tarjeta["operacion"], string> = {
  venta: "En venta",
  renta: "En renta",
  venta_renta: "Venta o renta",
};

/**
 * La casa de la primera pantalla, contada como lo que es: una casa con precio,
 * nombre y colonia, no una foto suelta. El bloque vino de atrás da la
 * profundidad con un color de la marca y sin filtros: las sombras de
 * `feDropShadow` y el `backdrop-filter` ya costaron Lighthouse (PLAN §17).
 * Sigue en 4:3 porque es la variante `tarjeta` de Cloudinary; otra
 * proporción sería otro derivado por casa (§13.5).
 */
function Vitrina({ casa }: { casa: Tarjeta }) {
  const foto = casa.foto;
  if (!foto) return null;
  const precio = textoPrecio(casa);
  const lugar = [casa.zona, casa.clave].filter(Boolean).join(" · ");

  return (
    <div className="relative mt-12 mr-3 mb-3 sm:mr-5 sm:mb-5 lg:mt-0">
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-3 translate-y-3 rounded-3xl bg-marca-oscuro motion-safe:animate-entrada-bloque motion-safe:[animation-delay:calc(var(--rb,0s)_+_380ms)] sm:translate-x-5 sm:translate-y-5"
      />
      <Link
        to={`/propiedades/${casa.slug}`}
        className="group relative block overflow-hidden rounded-3xl bg-marca-suave shadow-alzada motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_120ms)]"
      >
        {/* Desde 1920 px la vitrina mide 1000-1600 px: pide la foto de la
            galería (1600, ya existe) y pasa a 16:10, porque un 4:3 a ese ancho
            no cabría en la pantalla. Debajo, lo mismo de siempre. */}
        <picture>
          {casa.fotoGrande?.srcset ? (
            <source media="(min-width: 120rem)" srcSet={casa.fotoGrande.srcset} sizes="60vw" />
          ) : null}
          <img
            src={foto.src}
            srcSet={foto.srcset ?? undefined}
            sizes="(min-width: 1280px) 45rem, (min-width: 1024px) 28rem, 92vw"
            alt={foto.alt}
            width={960}
            height={720}
            fetchPriority="high"
            decoding="async"
            className="aspect-[4/3] w-full object-cover 3xl:aspect-[16/10] transition-transform duration-700 group-hover:scale-[1.03] motion-safe:animate-entrada-foto motion-safe:[animation-delay:calc(var(--rb,0s)_+_120ms)]"
          />
        </picture>
        {/* Velo de tinta de abajo arriba: el texto blanco se lee sobre
            cualquier foto sin tapar la casa. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-tinta/90 via-tinta/45 to-transparent"
        />
        <p className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-superficie px-3 py-1.5 text-xs font-bold tracking-wide text-tinta uppercase shadow-tarjeta motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_640ms)]">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-marca" />
          {OPERACION_VITRINA[casa.operacion]}
        </p>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_560ms)] sm:p-7">
          <div className="min-w-0 text-white">
            <p className="text-precio tabular-nums">
              {precio.principal}
              {precio.segundo ? (
                <span className="ml-2 text-base font-semibold text-sobre-oscuro-suave">{precio.segundo}</span>
              ) : null}
            </p>
            <p className="mt-1.5 truncate font-display text-xl font-semibold sm:text-2xl">{casa.titulo}</p>
            {lugar ? <p className="mt-1 truncate text-sm text-sobre-oscuro">{lugar}</p> : null}
          </div>
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-superficie text-marca-oscuro transition-transform duration-300 group-hover:translate-x-1"
          >
            <IconoFlecha className="h-5 w-5" />
          </span>
        </div>
      </Link>
    </div>
  );
}
