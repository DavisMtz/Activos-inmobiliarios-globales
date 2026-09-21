// La serif del titular del escenario se importa AQUI y no en el marco: la
// portada es la unica pagina que la usa, y asi las demas no bajan sus 38 KB.
import "@fontsource-variable/playfair-display/wght.css";
import fuenteTitular from "@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2?url";

import { Form, Link, useNavigation } from "react-router";
import { leerConfiguracion, leerPreguntas, leerServicios } from "../../../server/db/configuracion";
import { leerEntregasPublicas } from "../../../server/db/entregas";
import { casasDePortada, leerCatalogo } from "../../../server/db/propiedades";
import { ETIQUETA_TIPO_PLURAL, rutaDeListado } from "../../../shared/filtros";
import { precioMXN } from "../../../shared/formato";
import { enlaceWhatsApp } from "../../../shared/whatsapp";
import { IconoBuscar, IconoFlecha, IconoWhatsApp } from "../../components/publico/iconos";
import { Antetitulo, Preguntas, Testimonios } from "../../components/publico/contenido-portada";
import { EscenarioPortada } from "../../components/publico/escenario-portada";
import { MarcoEstelar } from "../../components/publico/marco-estelar";
import { CampoSelect, CampoTexto, TarjetaPropiedad, textoPrecio } from "../../components/publico/piezas";
import { CASAS_EN_VITRINA, Vitrina } from "../../components/publico/vitrina";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/inicio";

/**
 * Portada (PLAN §10.1). Manda el catálogo: buscador de verdad arriba, casas
 * reales enseguida y accesos por tipo con conteos reales.
 *
 * Lo que NO lleva, a propósito (PLAN §0.4): cifras de ventas, premios ni fotos
 * de equipo. Nada de eso existe. Los testimonios y las preguntas frecuentes
 * salen SOLO si el equipo los escribe en Panel › Contenido (los del sitio
 * anterior eran «Lorem ipsum» firmados por «James Oliver»). La foto grande es
 * la portada de una casa real del catálogo, no una imagen de banco.
 */

/** El titular cuando el equipo no escribió uno en el panel. */
const TITULAR_POR_OMISION = "Comercialización, renta y financiamiento de inmuebles";

export async function loader({ context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const { config, db } = servicios;

  const [catalogo, casas, configuracion, listaServicios, entregas, preguntas] = await Promise.all([
    leerCatalogo(db),
    // Las de la vitrina de arriba (van pasando de una en una) y seis para «Lo
    // más reciente»: ninguna casa sale dos veces en la portada.
    casasDePortada(db, config.cloudinary.cloudName, { vitrina: CASAS_EN_VITRINA, recientes: 6 }),
    leerConfiguracion(db),
    leerServicios(db),
    // Lo que dicen los clientes sale de las ENTREGAS, con el permiso de cada
    // uno, y ya no de testimonios escritos por el equipo (19/09/2026).
    leerEntregasPublicas(db, config.cloudinary.cloudName, 3),
    leerPreguntas(db),
  ]);

  return {
    catalogo,
    vitrina: casas.vitrina,
    recientes: casas.recientes,
    portada: configuracion.portada,
    servicios: listaServicios.slice(0, 6).map((s) => ({ id: s.id, titulo: s.titulo })),
    entregas,
    preguntas,
    whatsapp: enlaceWhatsApp(configuracion.whatsapp.numero, configuracion.whatsapp.plantillaGeneral),
    nombreNegocio: config.nombreNegocio,
    // Con el buscador que entiende frases encendido (PLAN §10.5), el campo lo
    // dice: «casa de 3 recámaras en Altozano…». Apagado, pide lo de siempre.
    entiendeFrases: configuracion.busquedaIA.activa && Boolean(servicios.ia),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const nombre = loaderData?.nombreNegocio ?? "Activos Inmobiliarios Globales";
  const total = loaderData?.catalogo.total ?? 0;
  // El titular que escribe el equipo, no una frase fija: la de antes decía
  // «en Morelia» y el negocio es para toda la República (18/09/2026).
  const titular = loaderData?.portada.titular || TITULAR_POR_OMISION;
  return [
    { title: `${nombre} · ${titular}` },
    {
      name: "description",
      content: `${total} casas, departamentos y terrenos en Morelia y Michoacán. Busca por colonia, precio o recámaras y pregunta por WhatsApp.`,
    },
  ];
}

export default function Inicio({ loaderData }: Route.ComponentProps) {
  const { catalogo, vitrina, recientes, portada, servicios, entregas, preguntas, whatsapp, entiendeFrases } = loaderData;
  const desde = precioMXN(catalogo.rangos.venta.min);
  const ciudades = catalogo.ciudades.length;
  // Entender una frase tarda un segundo: mientras dura, la orilla del buscador
  // lo dice sola (`marco-estelar.tsx`). Aqui no se queda encendida, porque la
  // respuesta se ve ya en la pagina siguiente.
  const navegacion = useNavigation();
  // La foto del escenario es la de la casa elegida en Panel › Contenido
  // («Casa de la foto principal») y, si no hay ninguna elegida, la de la más
  // reciente: es la misma que encabeza la vitrina. Sin catalogo con fotos no
  // hay escenario, y entonces el titular vuelve a su sitio de siempre.
  const casaDeLaFoto = vitrina[0] ?? null;
  const escenario = casaDeLaFoto?.fotoGrande ?? null;
  // La vitrina arranca en la SIGUIENTE, no en la del héroe: la misma casa y
  // la misma foto salían dos veces a 900 px de distancia (la pantalla de la
  // foto y la primera tarjeta de la vitrina). La del héroe no se va, pasa al
  // final del ciclo. Sin héroe (catálogo sin fotos) la vitrina no se rota:
  // entonces la primera casa no se ha enseñado todavía.
  const casasEnVitrina = escenario && vitrina.length > 1 ? [...vitrina.slice(1), vitrina[0]] : vitrina;
  const titular = portada.titular || TITULAR_POR_OMISION;
  const entendiendo =
    entiendeFrases && navegacion.state === "loading" && navegacion.location?.pathname === "/propiedades";
  const buscador = (
    <BuscadorPortada catalogo={catalogo} entiendeFrases={entiendeFrases} entendiendo={Boolean(entendiendo)} />
  );

  return (
    <div>
      {/* ─── La primera pantalla: la casa, el titular y el buscador ───────
          La foto llena la pantalla y TODO lo que vende va en su pie, sobre el
          degradado de tinta: titular, la casa con su precio, las tres cifras y
          el buscador. Elegido entre cuatro composiciones enseñadas en capturas
          (20/09/2026, tarde); antes la foto empezaba encuadrada y se abría al
          bajar, y el buscador quedaba a 1 400 px de scroll.

          Sobre tinta el rojo de la marca no contrasta (§19): el filete del
          antetítulo va en claro, y el rojo se queda donde manda, en el botón. */}
      {escenario ? (
        <EscenarioPortada foto={escenario}>
          <link rel="preload" as="font" type="font/woff2" href={fuenteTitular} crossOrigin="anonymous" />
          <div className="mx-auto w-full max-w-sitio px-5 pb-5 lg:px-10 lg:pb-7">
            <div className="lg:flex lg:items-end lg:justify-between lg:gap-12">
              <div className="min-w-0">
                {portada.saludo ? (
                  <p className="flex items-center gap-3 font-display text-xs font-semibold tracking-[0.26em] text-white uppercase sm:text-sm motion-safe:animate-entrada motion-safe:[animation-delay:var(--rb,0s)]">
                    <span aria-hidden="true" className="h-px w-7 shrink-0 bg-white/70" />
                    {portada.saludo}
                  </p>
                ) : null}
                <h1
                  className={`max-w-[16ch] font-titular text-portada-pie text-white motion-safe:animate-entrada-titular motion-safe:[animation-delay:calc(var(--rb,0s)_+_60ms)] ${portada.saludo ? "mt-4" : ""}`}
                >
                  {titular}
                </h1>
                {portada.lema ? (
                  <p className="mt-4 max-w-[52ch] text-sobre-oscuro motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_120ms)]">
                    {portada.lema}
                  </p>
                ) : null}
                {casaDeLaFoto ? <FichaDeLaFoto casa={casaDeLaFoto} /> : null}
              </div>

              {/* Tres cifras que salen de la base, no de un texto de venta: si
                  el catálogo cambia, cambian solas.

                  En el teléfono van en TRES columnas, como las de la portada
                  de respaldo: en renglón suelto cabían dos y «precio desde»
                  caía sola en un tercer renglón, y ese renglón de más empujaba
                  el buscador a 20 px del borde de la pantalla. Desde `lg`
                  vuelven a ser un renglón pegado a la derecha. */}
              <dl className="mt-7 grid grid-cols-3 gap-x-4 gap-y-4 sm:gap-x-8 lg:mt-0 lg:flex lg:shrink-0 lg:justify-end">
                <CifraClara orden={0} valor={String(catalogo.total)} etiqueta="propiedades publicadas" />
                <CifraClara
                  orden={1}
                  valor={String(ciudades)}
                  etiqueta={ciudades === 1 ? "ciudad de Michoacán" : "ciudades de Michoacán"}
                />
                {desde ? <CifraClara orden={2} valor={desde} etiqueta="precio desde" /> : null}
              </dl>
            </div>

            {buscador}
          </div>
        </EscenarioPortada>
      ) : null}

      {/* ─── Segunda pantalla: por dónde entrar al catálogo, y la vitrina ───
          El buscador y las cifras viven ahora en el pie de la foto, así que
          aquí quedan los accesos por tipo con sus conteos de verdad y la
          vitrina, que sigue pasando sus cinco casas de una en una.

          Sin foto que enseñar (un catálogo recién puesto) no hay primera
          pantalla: entonces esta sección vuelve a ser la portada entera —el
          titular, el buscador y las cifras— para que la página nunca se quede
          sin `<h1>` ni sin su acción principal. */}
      {/* El aire es el de TODAS las secciones (`py-14 sm:py-20`): era la única
          con uno propio (40/48 y 64/48) y por eso se leía como una franja
          metida a la fuerza entre la foto y las casas.

          `lg:items-stretch`: la columna de la izquierda comparte los DOS
          bordes con la vitrina —el rótulo a la altura del techo de la tarjeta
          y el enlace a la de su pie (`lg:mt-auto`)—. Centrada dejaba 260 px
          de campo vacío arriba y 230 abajo, y se veía suelta. */}
      <section className="mx-auto max-w-sitio px-5 py-14 sm:py-20 lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-stretch lg:gap-14 lg:px-10 3xl:gap-20">
        <div className="flex max-w-xl flex-col 3xl:max-w-none">
          {escenario ? (
            <h2 className="font-display text-seccion text-tinta motion-safe:animate-entrada">Encuentra tu propiedad</h2>
          ) : (
            <>
              {/* Encima del titular, solo el «Saludo» del panel, si el equipo
                  lo escribió; vacío, no sale nada. El logotipo ya va siempre
                  en la cabecera, y «Casas en venta y renta en Morelia» se
                  quitó a pedido del usuario (18/09/2026): el negocio es para
                  toda la República. */}
              {portada.saludo ? (
                <Antetitulo className="motion-safe:animate-entrada motion-safe:[animation-delay:var(--rb,0s)]">
                  {portada.saludo}
                </Antetitulo>
              ) : null}
              <h1
                className={`font-display text-display text-tinta 3xl:text-[5rem] motion-safe:animate-entrada-titular motion-safe:[animation-delay:calc(var(--rb,0s)_+_60ms)] ${portada.saludo ? "mt-5" : ""}`}
              >
                {titular}
              </h1>
              {portada.lema ? <p className="mt-4 text-guia text-texto-suave">{portada.lema}</p> : null}
              {buscador}
              <dl className="mt-7 grid grid-cols-3 gap-4 sm:gap-6">
                <Cifra orden={0} valor={String(catalogo.total)} etiqueta="propiedades publicadas" />
                <Cifra
                  orden={1}
                  valor={String(ciudades)}
                  etiqueta={ciudades === 1 ? "ciudad de Michoacán" : "ciudades de Michoacán"}
                />
                {desde ? <Cifra orden={2} valor={desde} etiqueta="precio desde" /> : null}
              </dl>
            </>
          )}

          {/* Accesos por tipo, con los conteos de verdad. Van como un ÍNDICE
              en renglones —filete y la cuenta a la derecha, el mismo patrón
              de la franja de Servicios— y ya no como píldoras sueltas: en dos
              renglones de píldoras la columna no llegaba ni a la mitad de la
              vitrina y dejaba 430 px de campo vacío debajo. Además se leen en
              orden y las cuentas quedan alineadas, que es lo que se compara. */}
          {catalogo.tipos.length ? (
            <nav aria-label="Por tipo de propiedad" className="mt-7">
              <ul className="flex flex-col border-b border-linea">
                {catalogo.tipos.map((t) => (
                  <li key={t.tipo} className="border-t border-linea">
                    <Link
                      to={rutaDeListado({ tipo: t.tipo })}
                      className="flex items-center justify-between gap-4 py-3 font-bold text-tinta transition-colors hover:text-marca"
                    >
                      {ETIQUETA_TIPO_PLURAL[t.tipo]}
                      <span className="font-semibold text-texto-suave tabular-nums">{t.n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {/* Las colonias que de verdad tienen varias casas: las mismas cinco
              que ya ofrece el listado (`listado.tsx`, decisión de zonas del
              PLAN §15; las otras 93 tienen una sola y se alcanzan
              escribiendo su nombre). Aquí cierran la columna a la altura del
              pie de la vitrina y suman una puerta más al catálogo. */}
          {catalogo.zonas.length ? (
            <nav aria-label="Colonias con más propiedades" className="mt-7">
              <p className="text-xs font-bold tracking-[0.18em] text-texto-suave uppercase">Colonias con más casas</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {catalogo.zonas.slice(0, 5).map((z) => (
                  <li key={z.slug}>
                    <Link
                      to={rutaDeListado({ zona: z.slug })}
                      className="flex items-center gap-2 rounded-full border border-linea bg-superficie px-4 py-2 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
                    >
                      {z.colonia}
                      <span className="text-texto-suave tabular-nums">{z.n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {/* Al pie de la columna, a la altura del pie de la vitrina. El
              texto ya no repite el del botón del buscador, que dice «Ver las
              188 propiedades» una pantalla más arriba. */}
          <Link
            to="/propiedades"
            className="mt-6 inline-flex w-fit items-center gap-2 font-bold text-marca underline underline-offset-4 lg:mt-auto lg:pt-8"
          >
            Ver todo el catálogo
            <IconoFlecha className="h-4 w-4" />
          </Link>
        </div>

        {/* La llave: si cambian las casas (el loader se vuelve a correr), la
            vitrina arranca de cero en vez de heredar a medias el ciclo viejo. */}
        {casasEnVitrina.length ? (
          <Vitrina key={casasEnVitrina.map((casa) => casa.clave).join(" ")} casas={casasEnVitrina} />
        ) : null}
      </section>

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
            {/* «Antes de los servicios» (Panel › Contenido): también arriba de
                la página de Servicios. */}
            {portada.introServicios ? (
              <p className="mt-4 max-w-2xl text-guia text-sobre-oscuro-suave">{portada.introServicios}</p>
            ) : null}

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

      {/* ─── Lo que dicen los clientes (Entregas) y las preguntas ─── */}
      {/* Cada una existe solo si hay algo publicado: nada vacío. */}
      <Testimonios entregas={entregas} />
      <Preguntas preguntas={preguntas} whatsapp={whatsapp} />

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
            {/* El mismo tope que el rótulo: con `max-w-xl` dentro del flex la
                última línea quedaba en «una a / la medida». */}
            <p className="mx-auto mt-3 max-w-2xl text-sobre-vino-suave lg:mx-0">
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

/**
 * El buscador: la acción principal de la portada. Va en su propio panel para
 * que se lea como una herramienta y no como texto suelto, y el mismo panel
 * sirve en el pie de la foto (en un renglón, desde `lg`) y en la portada de
 * respaldo, cuando no hay ninguna foto que enseñar.
 *
 * En el pie los tres campos y el botón van en un renglón: el envoltorio de
 * los dos selects pasa a `contents` desde `lg` para que sus DOS hijos sean
 * celdas de la misma retícula. En el teléfono vuelve a ser un bloque, con los
 * selects a dos columnas.
 */
function BuscadorPortada({
  catalogo,
  entiendeFrases,
  entendiendo,
}: {
  catalogo: Route.ComponentProps["loaderData"]["catalogo"];
  entiendeFrases: boolean;
  entendiendo: boolean;
}) {
  return (
    <MarcoEstelar
      activo={entendiendo}
      marco="mt-6 shadow-alzada motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_200ms)]"
      className="rounded-2xl border border-linea bg-superficie p-4 sm:p-5"
    >
      <Form
        method="get"
        action="/propiedades"
        className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end lg:gap-4"
      >
        <CampoTexto
          etiqueta={entiendeFrases ? "¿Qué estás buscando?" : "¿Qué colonia te interesa?"}
          name="q"
          type="search"
          placeholder={entiendeFrases ? "Casa de 3 recámaras en Altozano…" : "Altozano, Tres Marías, El Prado…"}
          autoComplete="off"
          maxLength={160}
        />
        <div className="grid grid-cols-2 gap-3 lg:contents">
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
          className="mt-1 flex h-13 items-center justify-center gap-2 rounded-xl bg-marca px-6 py-3.5 text-base font-extrabold text-white transition-colors hover:bg-marca-oscuro lg:mt-0 lg:whitespace-nowrap"
        >
          <IconoBuscar />
          Ver las {catalogo.total} propiedades
        </button>
      </Form>
    </MarcoEstelar>
  );
}

/** Una casa que ya no está libre se anuncia por su estado, no por su operación. */
const ESTADO_DE_LA_FOTO: Record<string, string> = {
  apartada: "apartada",
  vendida: "vendida",
  rentada: "rentada",
};

/** `ETIQUETA_OPERACION` es la de los filtros y no contempla «venta o renta». */
const OPERACION_DE_LA_FOTO: Record<"venta" | "renta" | "venta_renta", string> = {
  venta: "en venta",
  renta: "en renta",
  venta_renta: "en venta o renta",
};

/**
 * La casa de la foto, con su precio y un enlace a su página. Sin esto, la
 * primera pantalla enseña una casa preciosa que nadie sabe cuánto cuesta ni
 * cómo abrir.
 */
function FichaDeLaFoto({ casa }: { casa: Route.ComponentProps["loaderData"]["vitrina"][number] }) {
  const precio = textoPrecio(casa);
  // Su operación, salvo que la casa ya no esté libre: entonces manda el
  // estado, que es lo que le importa a quien la está viendo.
  const situacion = ESTADO_DE_LA_FOTO[casa.estado] ?? OPERACION_DE_LA_FOTO[casa.operacion];
  return (
    <Link
      to={`/propiedades/${casa.slug}`}
      className="escenario-ficha mt-6 motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_160ms)]"
    >
      <span className="font-display text-base font-extrabold whitespace-nowrap tabular-nums sm:text-lg">
        {precio.principal}
      </span>
      {/* En un teléfono de 390 px no caben el precio, el nombre y la
          operación: la operación es lo que menos falta, y en la página de la
          casa está toda. */}
      <span className="min-w-0 truncate text-sm text-sobre-oscuro-suave">
        {casa.titulo}
        <span className="hidden sm:inline"> · {situacion}</span>
      </span>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-marca text-white"
      >
        <IconoFlecha className="h-4 w-4" />
      </span>
    </Link>
  );
}

/** Clases enteras y no un número suelto: Tailwind solo genera las que lee escritas. */
const RETRASO_CIFRA = [
  "motion-safe:[animation-delay:calc(var(--rb,0s)_+_300ms)]",
  "motion-safe:[animation-delay:calc(var(--rb,0s)_+_370ms)]",
  "motion-safe:[animation-delay:calc(var(--rb,0s)_+_440ms)]",
];

/**
 * Las mismas cifras, pero sobre la foto: sin el filete rojo, que sobre el
 * velo de tinta se apaga (§19), y con la etiqueta en el claro que se usa
 * sobre campos oscuros.
 */
function CifraClara({ valor, etiqueta, orden }: { valor: string; etiqueta: string; orden: number }) {
  return (
    <div
      className={`flex flex-col-reverse justify-end motion-safe:animate-entrada ${RETRASO_CIFRA[orden] ?? ""}`}
    >
      <dt className="mt-0.5 text-xs leading-snug text-sobre-oscuro-suave sm:text-sm">{etiqueta}</dt>
      <dd className="font-display text-xl leading-none font-extrabold text-white sm:text-2xl">{valor}</dd>
    </div>
  );
}

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
