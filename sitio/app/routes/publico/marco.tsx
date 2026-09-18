import "@fontsource-variable/fraunces/wght.css";
// Las dos fuentes, por su URL con hash, para precargarlas (ver más abajo).
import fuenteFraunces from "@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2?url";
import fuenteNunito from "@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url";

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { leerConfigDelSitio } from "../../../server/db/configuracion";
import { enlaceWhatsApp } from "../../../shared/whatsapp";
import {
  IconoCorreo,
  IconoFacebook,
  IconoFlecha,
  IconoInstagram,
  IconoTelefono,
  IconoUbicacion,
  IconoWhatsApp,
} from "../../components/publico/iconos";
import { Bienvenida } from "../../components/publico/bienvenida";
import { Isotipo } from "../../components/publico/isotipo";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/marco";

/*
 * ─── Contrato de dirección del sitio público (F2) ──────────────────
 *
 * TESIS: el catálogo manda. La casa se enseña grande y con sus cifras
 * completas desde el primer momento; se rechaza la portada-plantilla de foto
 * de catálogo con buscador encima que trae el sitio actual.
 * MUNDO: papel cálido (#f7f5f3) y tinta (#111) como CAMPOS enteros, no como
 * bordes; el rojo #A0051C y el vino #760415 mandan en la portada, los cierres
 * y el pie. Títulos en serif editorial (Fraunces, elegida por el usuario el
 * 17/09/2026), cifras y texto en Nunito con cifras de ancho fijo.
 * HISTORIA: quien llega entiende en un vistazo que son 188 casas reales de
 * Morelia, filtra a las suyas y escribe por WhatsApp sabiendo cuál pregunta.
 * PRIMERA PANTALLA: titular en serif a ancho completo sobre papel, buscador
 * real debajo (operación, zona, tipo, precio) y la primera casa asomando.
 * FORMA: catálogo editorial. La firma es la tarjeta, no un adorno.
 *
 * CIERRE: sin verificar no está listo. Esta fase termina con los 9 «listo
 * cuando» de PLAN §15 medidos contra la app corriendo y anotados en §19.
 *
 * El logotipo lleva la palabra en NEGRO y no hay versión clara ni vector
 * (PLAN §6.4): sobre los campos oscuros el nombre va en tipografía, nunca el
 * PNG invertido, que volvería gris el isotipo rojo.
 */

const NAVEGACION = [
  { a: "/propiedades", texto: "Propiedades" },
  { a: "/servicios", texto: "Servicios" },
  { a: "/nosotros", texto: "Nosotros" },
  { a: "/contacto", texto: "Contacto" },
];

export async function loader({ context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const { contacto, whatsapp, redes } = await leerConfigDelSitio(servicios.db);

  return {
    nombreNegocio: servicios.config.nombreNegocio,
    contacto,
    redes,
    // El enlace ya armado: la plantilla y el número no tienen por qué viajar.
    whatsapp: enlaceWhatsApp(whatsapp.numero, whatsapp.plantillaGeneral),
    anio: new Date().getUTCFullYear(),
  };
}

export default function MarcoPublico({ loaderData }: Route.ComponentProps) {
  const { nombreNegocio, contacto, redes, whatsapp, anio } = loaderData;
  const { pathname } = useLocation();
  // En la ficha el botón flotante estorba: ahí WhatsApp vive en la barra de
  // acciones, pegada abajo, que es la que no tapa el precio.
  const enFicha = /^\/propiedades\/[^/]+$/.test(pathname);
  const contenedor = useRef<HTMLDivElement>(null);
  // Solo si la PRIMERA página que se abre es la portada: el inicializador corre
  // una vez, igual en el servidor y al hidratar, y el marco no se vuelve a
  // montar al navegar, así que regresar a `/` no repite la bienvenida.
  const [conBienvenida] = useState(() => pathname === "/");

  /**
   * El movimiento entra DESPUÉS de hidratar y con `import()`, así que GSAP cae
   * en su propio trozo y no cuenta en la carga inicial del sitio público
   * (PLAN §10.4, tope de 150 KB gzip). Vive aquí, en el marco público, y nunca
   * en `root.tsx`: el panel no debe descargar ni un byte de esto.
   *
   * Se rearma en cada página porque al navegar en el cliente el contenido
   * cambia sin recargar, y se limpia siempre: si no, la página siguiente
   * heredaría los estilos en línea que dejó la anterior a medias.
   */
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;

    let vivo = true;
    let limpiar: (() => void) | null = null;
    let ocioso: number | undefined;
    let reloj: number | undefined;

    const arrancar = () => {
      if (!vivo) return;
      void import("../../components/publico/movimiento")
        .then(({ animarSitioPublico }) => animarSitioPublico(nodo))
        .then((fin) => {
          // Si la página ya cambió mientras bajaba GSAP, se deshace enseguida.
          if (vivo) limpiar = fin;
          else fin();
        })
        .catch(() => {
          // Sin animación la página está completa igual: no se avisa de nada.
        });
    };

    // GSAP espera a que la página termine de cargar y el navegador quede
    // libre. Medido el 17/09/2026: bajándolo al hidratar, sus 111 KB caían
    // antes del titular en cuanto el primer pintado se retrasaba 150 ms, y
    // Lighthouse los sumaba al LCP (portada de 77 a 69). Nada sobre el
    // pliegue depende de GSAP: ahí la entrada es CSS.
    const cuandoQuieto = () => {
      if (typeof window.requestIdleCallback === "function") ocioso = window.requestIdleCallback(arrancar, { timeout: 2500 });
      else reloj = window.setTimeout(arrancar, 300);
    };
    if (document.readyState === "complete") cuandoQuieto();
    else window.addEventListener("load", cuandoQuieto, { once: true });

    return () => {
      vivo = false;
      window.removeEventListener("load", cuandoQuieto);
      if (ocioso !== undefined) window.cancelIdleCallback(ocioso);
      if (reloj !== undefined) window.clearTimeout(reloj);
      limpiar?.();
    };
  }, [pathname]);

  return (
    <div ref={contenedor} className="flex min-h-dvh flex-col bg-fondo">
      {conBienvenida ? <Bienvenida nombreNegocio={nombreNegocio} /> : null}
      {/* Medido en F2: el LCP de la portada NO es una foto, es el titular, con
          el primer dibujado en 3.8 s. El navegador no descubre las fuentes
          hasta parsear el CSS, así que se piden desde el principio. React 19
          sube estos enlaces al <head> solo. Van aquí, en el marco público, y
          no en `root.tsx`: el panel no tiene por qué bajar la serif. */}
      <link rel="preload" as="font" type="font/woff2" href={fuenteFraunces} crossOrigin="anonymous" />
      <link rel="preload" as="font" type="font/woff2" href={fuenteNunito} crossOrigin="anonymous" />
      {/* En la ficha, sin el WhatsApp general: ahí el que cuenta es el de la
          casa (tarjeta y barra de abajo), con su título y su clave. */}
      <Cabecera nombreNegocio={nombreNegocio} whatsapp={enFicha ? null : whatsapp} />

      <main id="contenido" className="flex-1">
        <Outlet />
      </main>

      <Pie nombreNegocio={nombreNegocio} contacto={contacto} redes={redes} anio={anio} />

      {whatsapp && !enFicha ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Escríbenos por WhatsApp"
          className="fixed right-4 bottom-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-marca text-white shadow-flotante transition-colors hover:bg-marca-oscuro focus-visible:outline-offset-4"
        >
          <IconoWhatsApp className="h-7 w-7" />
        </a>
      ) : null}
    </div>
  );
}

// ─── Cabecera ─────────────────────────────────────────────────────

/**
 * La cabecera es una **isla**: una cápsula blanca que flota a unos píxeles
 * del borde, con la página pasando por detrás (segunda versión del
 * 18/09/2026; la franja con barra de lectura «no gustó»: se pidió algo más
 * premium). Lo que la sostiene y no se ve:
 *
 * - **La caja del `<header>` nunca cambia de alto.** Es `sticky` y está en el
 *   flujo: si se encogiera, empujaría el contenido y la tarjeta de la ficha,
 *   que se pega a 96 px. Al bajar solo cambian el ANCHO de la cápsula (se
 *   recoge hacia el centro) y su sombra; el alto sigue igual.
 * - **Todo el movimiento es CSS.** Se ve desde el primer pintado y GSAP llega
 *   1-2 s tarde: animar lo que ya se ve parpadea (PLAN §19). JavaScript solo
 *   dice si ya se bajó, dónde va la píldora del menú y cierra el menú. Sin
 *   vidrio esmerilado: ya costó Lighthouse; la cápsula es blanca y sólida.
 * - **El menú del celular es un `<details>`**: sin JavaScript también abre.
 *   Con JavaScript se cierra al navegar (antes se quedaba abierto en la
 *   página siguiente), con Esc y al tocar fuera.
 */
function Cabecera({ nombreNegocio, whatsapp }: { nombreNegocio: string; whatsapp: string | null }) {
  const { pathname } = useLocation();
  const cabecera = useRef<HTMLElement>(null);
  const sentinela = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const navegacion = useRef<HTMLElement>(null);
  const pildora = useRef<HTMLSpanElement>(null);
  // El enlace sobre el que está la píldora: el que tiene el puntero encima
  // o, si no hay ninguno, el de la sección en la que se está.
  const [resaltado, setResaltado] = useState<string | null>(null);
  // Hasta que la píldora está puesta (sin JavaScript, o antes de hidratar),
  // el enlace activo va en rojo: en blanco no se vería sobre el carril claro.
  const [pildoraLista, setPildoraLista] = useState(false);
  const activo = NAVEGACION.find((enlace) => pathname === enlace.a || pathname.startsWith(`${enlace.a}/`))?.a ?? null;
  const bajo = resaltado ?? activo;

  // Al navegar, el marco no se vuelve a montar y `<details open>` persistía.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
    setResaltado(null);
  }, [pathname]);

  // «Bajado»: en cuanto la línea de arriba de la página deja de verse. Sin
  // escuchar el scroll: lo resuelve el navegador.
  useEffect(() => {
    const nodo = sentinela.current;
    const encabezado = cabecera.current;
    if (!nodo || !encabezado || typeof IntersectionObserver !== "function") return;
    const observador = new IntersectionObserver(([entrada]) => {
      encabezado.dataset.bajado = entrada.isIntersecting ? "no" : "si";
    });
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  // La píldora se mide contra el enlace que le toca y viaja con `translate`
  // y `width`. Se vuelve a medir al cambiar de ancho la ventana y cuando la
  // cápsula termina de recogerse (su ancho cambia al bajar).
  useEffect(() => {
    const lista = navegacion.current;
    const marca = pildora.current;
    if (!lista || !marca) return;
    const colocar = () => {
      const destino = bajo ? lista.querySelector<HTMLElement>(`a[href="${bajo}"]`) : null;
      if (!destino) {
        marca.style.opacity = "0";
        return;
      }
      marca.style.width = `${destino.offsetWidth}px`;
      marca.style.translate = `${destino.offsetLeft}px 0`;
      marca.style.opacity = "1";
      setPildoraLista(true);
    };
    colocar();
    const observador = typeof ResizeObserver === "function" ? new ResizeObserver(colocar) : null;
    observador?.observe(lista);
    return () => observador?.disconnect();
  }, [bajo]);

  // Menú abierto: Esc y tocar fuera lo cierran, y la página de atrás no se
  // desplaza mientras tanto.
  useEffect(() => {
    const detalle = menu.current;
    if (!detalle) return;
    const raiz = document.documentElement;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape" || !detalle.open) return;
      detalle.open = false;
      detalle.querySelector("summary")?.focus();
    };
    const alTocar = (evento: PointerEvent) => {
      if (!detalle.open) return;
      const dentro = (evento.target as Element | null)?.closest("[data-menu-panel], summary");
      if (!dentro) detalle.open = false;
    };
    const alCambiar = () => {
      raiz.style.overflow = detalle.open ? "hidden" : "";
    };
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("pointerdown", alTocar);
    detalle.addEventListener("toggle", alCambiar);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("pointerdown", alTocar);
      detalle.removeEventListener("toggle", alCambiar);
      raiz.style.overflow = "";
    };
  }, []);

  return (
    <>
      {/* La línea que dice si ya se bajó: arriba de todo, sin ocupar lugar. */}
      <div ref={sentinela} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 h-2 w-px" />

      {/* El <header> es transparente: lo que se ve es la cápsula de dentro, y
          la página pasa por detrás de sus orillas. */}
      <header
        ref={cabecera}
        data-bajado="no"
        className="group/cabecera pointer-events-none sticky top-0 z-30 px-3 pt-3 has-[details[open]]:z-50 sm:px-5 lg:px-6"
      >
        <a
          href="#contenido"
          className="pointer-events-auto sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-tinta focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
        >
          Saltar al contenido
        </a>

        <div className="pointer-events-auto relative mx-auto flex h-16 max-w-sitio items-center justify-between gap-4 rounded-full border border-linea/80 bg-superficie pr-2 pl-5 shadow-tarjeta transition-[max-width,box-shadow,border-color] duration-500 ease-[var(--ease-entrada)] group-data-[bajado=si]/cabecera:max-w-[76rem] group-data-[bajado=si]/cabecera:border-linea group-data-[bajado=si]/cabecera:shadow-alzada lg:pl-7">
          <Link to="/" className="shrink-0 transition-opacity duration-200 hover:opacity-75" aria-label={`${nombreNegocio}, ir al inicio`}>
            {/* El SVG de `DavisMtz/AIG-recursos` (11.6 KB comprimido), no el PNG
                de 512 px: se ve nítido a cualquier tamaño y en cualquier pantalla. */}
            <img src="/marca/aig-logo-horizontal.svg" alt={nombreNegocio} width={4801} height={675} className="h-auto w-40 sm:w-52" />
          </Link>

          {/* Escritorio: los enlaces en su propio carril, con una píldora de
              tinta que viaja al que tiene el puntero y vuelve al activo. */}
          <nav
            ref={navegacion}
            aria-label="Principal"
            onMouseLeave={() => setResaltado(null)}
            className="relative hidden items-center rounded-full bg-fondo p-1 md:flex"
          >
            <span
              ref={pildora}
              aria-hidden="true"
              className="absolute top-1 bottom-1 left-0 rounded-full bg-tinta opacity-0 shadow-tarjeta transition-[translate,width,opacity] duration-500 ease-[var(--ease-entrada)] motion-reduce:transition-none"
            />
            {NAVEGACION.map((enlace) => (
              <NavLink
                key={enlace.a}
                to={enlace.a}
                onMouseEnter={() => setResaltado(enlace.a)}
                onFocus={() => setResaltado(enlace.a)}
                onBlur={() => setResaltado(null)}
                className={`relative z-10 rounded-full px-4 py-2 text-sm font-bold transition-colors duration-300 lg:px-5 ${
                  pildoraLista && bajo === enlace.a
                    ? "text-white"
                    : activo === enlace.a
                      ? "text-marca"
                      : "text-texto-suave hover:text-tinta"
                }`}
              >
                {enlace.texto}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="group/cta hidden h-12 items-center gap-3 rounded-full bg-marca pr-1.5 pl-5 text-sm font-extrabold text-white transition-[background-color,box-shadow] duration-300 hover:bg-marca-oscuro hover:shadow-flotante active:scale-[0.98] lg:inline-flex"
              >
                Escríbenos
                <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white text-marca">
                  {/* La flecha sale por la derecha y entra otra por la izquierda. */}
                  <span className="relative block h-4 w-4">
                    <IconoFlecha className="absolute inset-0 h-4 w-4 transition-transform duration-500 ease-[var(--ease-entrada)] group-hover/cta:translate-x-6" />
                    <IconoFlecha className="absolute inset-0 h-4 w-4 -translate-x-6 transition-transform duration-500 ease-[var(--ease-entrada)] group-hover/cta:translate-x-0" />
                  </span>
                </span>
              </a>
            ) : null}

            {/* Sin JavaScript también abre: es un <details>, no un menú hidratado. */}
            <details ref={menu} className="group/menu md:hidden">
              <summary
                aria-label="Menú"
                className="flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-full bg-tinta text-white transition-transform duration-200 active:scale-95 [&::-webkit-details-marker]:hidden"
              >
                {/* Dos rayas que se cruzan en una X. */}
                <span aria-hidden="true" className="relative block h-3 w-5">
                  <span className="absolute top-0 left-0 h-0.5 w-5 rounded-full bg-current transition-[translate,rotate] duration-500 ease-[var(--ease-entrada)] group-open/menu:translate-y-[5px] group-open/menu:rotate-45" />
                  <span className="absolute bottom-0 left-0 h-0.5 w-3 rounded-full bg-current transition-[translate,rotate,width] duration-500 ease-[var(--ease-entrada)] group-open/menu:w-5 group-open/menu:-translate-y-[5px] group-open/menu:-rotate-45" />
                </span>
              </summary>

              {/* Velo y panel llevan `hidden` + `group-open:block`: Chrome
                  esconde lo de un <details> cerrado con `content-visibility`,
                  que conserva sus medidas, y el panel cerrado «se salía» del
                  ancho a 390 px. Tocar el velo cierra el menú. */}
              <div aria-hidden="true" className="pointer-events-auto fixed inset-0 -z-10 hidden bg-tinta/30 group-open/menu:block motion-safe:animate-velo" />
              <nav
                aria-label="Principal"
                data-menu-panel
                className="absolute inset-x-0 top-full mt-2 hidden origin-top rounded-[2rem] bg-tinta p-3 text-white shadow-flotante group-open/menu:block motion-safe:animate-menu"
              >
                <ul className="flex flex-col">
                  {NAVEGACION.map((enlace, i) => (
                    <li key={enlace.a} className="motion-safe:animate-entrada" style={{ animationDelay: `${80 + i * 50}ms` }}>
                      <NavLink
                        to={enlace.a}
                        className={({ isActive }) =>
                          `flex items-center justify-between rounded-2xl px-4 py-3.5 font-display text-2xl font-semibold transition-colors active:bg-white/10 ${
                            isActive ? "bg-white/10 text-white" : "text-sobre-oscuro"
                          }`
                        }
                      >
                        {enlace.texto}
                        <IconoFlecha className="h-5 w-5 text-sobre-oscuro-suave" />
                      </NavLink>
                    </li>
                  ))}
                </ul>
                {whatsapp ? (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex h-14 items-center justify-center gap-2 rounded-2xl bg-marca px-6 font-extrabold text-white transition-colors active:bg-marca-oscuro motion-safe:animate-entrada"
                    style={{ animationDelay: `${80 + NAVEGACION.length * 50}ms` }}
                  >
                    <IconoWhatsApp className="h-5 w-5" />
                    Escríbenos por WhatsApp
                  </a>
                ) : null}
              </nav>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}

// ─── Pie ──────────────────────────────────────────────────────────

type Contacto = { telefono: string; correo: string; direccion: string; horario: string };
type Redes = { facebook: string; instagram: string };

function Pie({
  nombreNegocio,
  contacto,
  redes,
  anio,
}: {
  nombreNegocio: string;
  contacto: Contacto;
  redes: Redes;
  anio: number;
}) {
  // El sitio actual enseña un número y su enlace marca OTRO. Aquí el href sale
  // del mismo texto que se lee, así que no pueden separarse.
  const telefonoHref = `tel:${contacto.telefono.replace(/[^\d+]/g, "")}`;
  // Lo que no existe no se enseña vacío (PLAN §0.4): sin ningún dato de
  // contacto capturado, la columna era un título sobre nada.
  const hayContacto = Boolean(contacto.telefono || contacto.correo || contacto.direccion || contacto.horario);
  const hayRedes = Boolean(redes.facebook || redes.instagram);
  const columnas = 1 + (hayContacto ? 1 : 0) + (hayRedes ? 1 : 0);

  return (
    <footer className="campo-oscuro bg-tinta text-sobre-oscuro">
      <div className="mx-auto max-w-sitio px-5 lg:px-10 py-14 sm:py-20">
        {/* Desde 1280 px la marca y las columnas comparten renglón. */}
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] xl:gap-16">
          {/* Sobre el campo oscuro va el isotipo (que es rojo y se lee) más el
              nombre en tipografía: el logotipo completo lleva la palabra en negro
              y no existe versión clara (PLAN §6.4). */}
          <div>
            <div className="flex items-center gap-4">
              <Isotipo className="h-10 w-auto shrink-0" />
              <p className="font-display text-seccion text-white">{nombreNegocio}</p>
            </div>
            <p className="mt-3 max-w-md text-sobre-oscuro-suave">Donde cada propiedad cuenta una historia</p>
          </div>

          <div className={`mt-12 grid gap-10 sm:grid-cols-2 xl:mt-0 ${columnas === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
            {hayContacto ? (
              <section>
                <h2 className="text-sm font-bold tracking-widest text-sobre-oscuro-suave uppercase">Contacto</h2>
                <ul className="mt-4 flex flex-col gap-3 text-sobre-oscuro">
                  {contacto.telefono ? (
                    <li>
                      <a href={telefonoHref} className="flex items-center gap-3 hover:underline">
                        <IconoTelefono className="h-5 w-5 shrink-0 text-sobre-oscuro-suave" />
                        <span className="tabular-nums">{contacto.telefono}</span>
                      </a>
                    </li>
                  ) : null}
                  {contacto.correo ? (
                    <li>
                      <a href={`mailto:${contacto.correo}`} className="flex items-center gap-3 break-all hover:underline">
                        <IconoCorreo className="h-5 w-5 shrink-0 text-sobre-oscuro-suave" />
                        <span>{contacto.correo}</span>
                      </a>
                    </li>
                  ) : null}
                  {contacto.direccion ? (
                    <li className="flex items-start gap-3">
                      <IconoUbicacion className="mt-0.5 h-5 w-5 shrink-0 text-sobre-oscuro-suave" />
                      <span>{contacto.direccion}</span>
                    </li>
                  ) : null}
                  {/* El horario se oculta mientras nadie lo confirme (PLAN §6.3). */}
                  {contacto.horario ? <li className="pl-8">{contacto.horario}</li> : null}
                </ul>
              </section>
            ) : null}

            <section>
              <h2 className="text-sm font-bold tracking-widest text-sobre-oscuro-suave uppercase">Sitio</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {NAVEGACION.map((enlace) => (
                  <li key={enlace.a}>
                    <Link to={enlace.a} className="hover:underline">
                      {enlace.texto}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link to="/aviso-de-privacidad" className="hover:underline">
                    Aviso de privacidad
                  </Link>
                </li>
              </ul>
            </section>

            {hayRedes ? (
              <section>
                <h2 className="text-sm font-bold tracking-widest text-sobre-oscuro-suave uppercase">Redes</h2>
                <ul className="mt-4 flex gap-3">
                  {redes.facebook ? (
                    <li>
                      <a
                        href={redes.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Facebook"
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 transition-colors hover:border-white/60 hover:bg-white/10"
                      >
                        <IconoFacebook />
                      </a>
                    </li>
                  ) : null}
                  {redes.instagram ? (
                    <li>
                      <a
                        href={redes.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Instagram"
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 transition-colors hover:border-white/60 hover:bg-white/10"
                      >
                        <IconoInstagram />
                      </a>
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}
          </div>
        </div>

        <p className="mt-14 border-t border-white/15 pt-6 text-sm text-sobre-oscuro-suave">
          © {anio} {nombreNegocio}
        </p>
      </div>
    </footer>
  );
}
