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
 * La cabecera (rediseñada el 18/09/2026: «más moderna, animada, con
 * microinteracciones»). Tres reglas que no se ven y la sostienen:
 *
 * - **Su caja nunca cambia de alto.** Es `sticky` y está en el flujo: si se
 *   encogiera al bajar, empujaría el contenido y la tarjeta de la ficha, que
 *   se pega a 96 px. Al bajar cambian el fondo, el borde, la sombra y la
 *   escala del logotipo (transform); al seguir bajando se esconde con
 *   `translate`, que tampoco mueve nada.
 * - **Todo es CSS.** Se ve desde el primer pintado y GSAP llega 1-2 s tarde:
 *   animar lo que ya se ve parpadea (PLAN §19). JavaScript solo pone dos
 *   atributos y cierra el menú. Sin vidrio esmerilado: ya costó Lighthouse.
 * - **El menú del celular sigue siendo un `<details>`**: sin JavaScript
 *   también abre. Con JavaScript, además, se cierra al navegar (antes se
 *   quedaba abierto en la página siguiente), con Esc y al tocar fuera.
 */
function Cabecera({ nombreNegocio, whatsapp }: { nombreNegocio: string; whatsapp: string | null }) {
  const { pathname } = useLocation();
  const cabecera = useRef<HTMLElement>(null);
  const sentinela = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);

  // Al navegar, el marco no se vuelve a montar y `<details open>` persistía.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);

  // «Bajado»: en cuanto la línea de arriba de la página deja de verse. Sin
  // escuchar el scroll para esto: lo resuelve el navegador.
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

  // Se esconde al bajar (lejos de arriba) y vuelve en cuanto se sube. Nunca
  // con el menú abierto ni con el foco dentro: esconder lo que se está usando
  // es perderlo.
  useEffect(() => {
    const encabezado = cabecera.current;
    if (!encabezado) return;
    let anterior = window.scrollY;
    let pendiente = false;
    const revisar = () => {
      pendiente = false;
      const y = window.scrollY;
      const delta = y - anterior;
      if (Math.abs(delta) < 6) return;
      const ocupada = menu.current?.open || encabezado.contains(document.activeElement);
      encabezado.dataset.oculta = delta > 0 && y > 480 && !ocupada ? "si" : "no";
      anterior = y;
    };
    const alDesplazar = () => {
      if (pendiente) return;
      pendiente = true;
      window.requestAnimationFrame(revisar);
    };
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => window.removeEventListener("scroll", alDesplazar);
  }, []);

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
      if (detalle.open && cabecera.current) cabecera.current.dataset.oculta = "no";
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

      <header
        ref={cabecera}
        data-bajado="no"
        data-oculta="no"
        className="group/cabecera sticky top-0 z-30 border-b has-[details[open]]:z-50 border-transparent bg-fondo transition-[border-color,box-shadow,translate] duration-300 ease-[var(--ease-entrada)] data-[bajado=si]:border-linea data-[bajado=si]:shadow-tarjeta data-[oculta=si]:-translate-y-full"
      >
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-tinta focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
        >
          Saltar al contenido
        </a>

        <div className="mx-auto flex max-w-sitio items-center justify-between gap-4 px-5 lg:px-10 py-3.5">
          <Link to="/" className="group/logo shrink-0" aria-label={`${nombreNegocio}, ir al inicio`}>
            {/* El SVG de `DavisMtz/AIG-recursos` (11.6 KB comprimido), no el PNG
                de 512 px: se ve nítido a cualquier tamaño y en cualquier pantalla.
                Al bajar se encoge por `scale`: la caja no cambia de alto. */}
            <img
              src="/marca/aig-logo-horizontal.svg"
              alt={nombreNegocio}
              width={4801}
              height={675}
              className="h-auto w-44 origin-left transition-[scale,opacity] duration-300 ease-[var(--ease-entrada)] group-hover/logo:opacity-80 group-data-[bajado=si]/cabecera:scale-[0.92] sm:w-56"
            />
          </Link>

          <div className="hidden items-center gap-2 md:flex lg:gap-4">
            <nav aria-label="Principal" className="flex items-center gap-1">
              {NAVEGACION.map((enlace) => (
                <NavLink key={enlace.a} to={enlace.a} className={claseEnlace}>
                  {enlace.texto}
                </NavLink>
              ))}
            </nav>

            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="group/wa hidden h-11 items-center gap-2 rounded-full bg-tinta pr-5 pl-4 text-sm font-extrabold text-white transition-[background-color,translate,box-shadow] duration-200 ease-[var(--ease-entrada)] hover:-translate-y-0.5 hover:bg-marca hover:shadow-alzada active:translate-y-0 active:scale-[0.97] lg:inline-flex"
              >
                <IconoWhatsApp className="h-5 w-5 origin-bottom motion-safe:group-hover/wa:animate-saludo" />
                Escríbenos
              </a>
            ) : null}
          </div>

          {/* Sin JavaScript también abre: es un <details>, no un menú hidratado. */}
          <details ref={menu} className="group/menu md:hidden">
            <summary
              aria-label="Menú"
              className="relative flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-linea bg-superficie text-tinta transition-[background-color,border-color,scale] duration-200 active:scale-95 group-open/menu:border-tinta group-open/menu:bg-tinta group-open/menu:text-white [&::-webkit-details-marker]:hidden"
            >
              {/* Tres rayas que se vuelven una X: las de fuera giran hacia el
                  centro y la de en medio se recoge. */}
              <span aria-hidden="true" className="relative block h-3.5 w-5">
                <span className="absolute top-0 left-0 h-0.5 w-5 rounded-full bg-current transition-[translate,rotate] duration-300 ease-[var(--ease-entrada)] group-open/menu:translate-y-1.5 group-open/menu:rotate-45" />
                <span className="absolute top-1.5 left-0 h-0.5 w-5 origin-right rounded-full bg-current transition-[scale,opacity] duration-200 group-open/menu:scale-x-0 group-open/menu:opacity-0" />
                <span className="absolute top-3 left-0 h-0.5 w-3.5 rounded-full bg-current transition-[translate,rotate,width] duration-300 ease-[var(--ease-entrada)] group-open/menu:w-5 group-open/menu:-translate-y-1.5 group-open/menu:-rotate-45" />
              </span>
            </summary>

            {/* El velo cubre la página de atrás; tocarlo cierra el menú. Velo y
                panel llevan `hidden` + `group-open:block`: Chrome esconde lo de
                un <details> cerrado con `content-visibility`, que conserva sus
                medidas, y el panel cerrado «se salía» del ancho a 390 px. */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-full hidden h-[calc(100dvh-100%)] bg-tinta/40 group-open/menu:block motion-safe:animate-velo"
            />
            <nav
              aria-label="Principal"
              data-menu-panel
              className="absolute inset-x-0 top-full hidden border-b border-linea bg-fondo px-5 pt-4 pb-6 shadow-alzada group-open/menu:block motion-safe:animate-menu"
            >
              <ul className="flex flex-col">
                {NAVEGACION.map((enlace, i) => (
                  <li
                    key={enlace.a}
                    className="border-b border-linea motion-safe:animate-entrada"
                    style={{ animationDelay: `${60 + i * 50}ms` }}
                  >
                    <NavLink
                      to={enlace.a}
                      className={({ isActive }) =>
                        `group/enlace flex items-center justify-between py-4 font-display text-2xl font-semibold transition-colors ${
                          isActive ? "text-marca" : "text-tinta"
                        }`
                      }
                    >
                      <span className="flex items-baseline gap-3">
                        <span className="font-sans text-xs font-bold text-texto-suave tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {enlace.texto}
                      </span>
                      <IconoFlecha className="h-5 w-5 transition-transform duration-200 group-hover/enlace:translate-x-1 group-active/enlace:translate-x-1" />
                    </NavLink>
                  </li>
                ))}
              </ul>
              {whatsapp ? (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 flex h-13 items-center justify-center gap-2 rounded-xl bg-marca px-6 font-extrabold text-white transition-colors active:bg-marca-oscuro motion-safe:animate-entrada"
                  style={{ animationDelay: `${60 + NAVEGACION.length * 50}ms` }}
                >
                  <IconoWhatsApp className="h-5 w-5" />
                  Escríbenos por WhatsApp
                </a>
              ) : null}
            </nav>
          </details>
        </div>

        {/* Lo que va leído de la página, en una línea roja. Solo CSS
            (`animation-timeline: scroll()`); donde no hay soporte, no sale. */}
        <span aria-hidden="true" className="barra-lectura absolute inset-x-0 bottom-[-1px] h-0.5 origin-left bg-marca" />
      </header>
    </>
  );
}

/**
 * Enlace de escritorio: una píldora que aparece al pasar por encima (crece
 * desde el 85 %) y un punto rojo debajo del que está activo.
 */
const claseEnlace = ({ isActive }: { isActive: boolean }) =>
  `relative isolate rounded-full px-4 py-2 text-sm font-bold transition-colors duration-200 ${
    isActive ? "text-marca" : "text-tinta hover:text-marca-oscuro"
  } before:absolute before:inset-0 before:-z-10 before:scale-[0.85] before:rounded-full before:bg-marca-suave before:opacity-0 before:transition-[scale,opacity] before:duration-200 before:ease-[var(--ease-entrada)] hover:before:scale-100 hover:before:opacity-100 after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-marca after:transition-[scale] after:duration-300 after:ease-[var(--ease-entrada)] ${
    isActive ? "after:scale-100" : "after:scale-0"
  }`;

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
