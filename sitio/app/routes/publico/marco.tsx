import "@fontsource-variable/fraunces/wght.css";

import { Link, NavLink, Outlet, useLocation } from "react-router";
import { leerConfigDelSitio } from "../../../server/db/configuracion";
import { enlaceWhatsApp } from "../../../shared/whatsapp";
import {
  IconoCorreo,
  IconoFacebook,
  IconoInstagram,
  IconoTelefono,
  IconoUbicacion,
  IconoWhatsApp,
} from "../../components/publico/iconos";
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
  // En la ficha el botón flotante estorba: ahí WhatsApp vive en la barra de
  // acciones, pegada abajo, que es la que no tapa el precio.
  const enFicha = /^\/propiedades\/[^/]+$/.test(useLocation().pathname);

  return (
    <div className="flex min-h-dvh flex-col bg-fondo">
      <Cabecera nombreNegocio={nombreNegocio} />

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

function Cabecera({ nombreNegocio }: { nombreNegocio: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-linea bg-fondo">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-tinta focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Saltar al contenido
      </a>

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link to="/" className="shrink-0" aria-label={`${nombreNegocio}, ir al inicio`}>
          {/* El SVG de `DavisMtz/AIG-recursos` (11.6 KB comprimido), no el PNG
              de 512 px: se ve nítido a cualquier tamaño y en cualquier pantalla. */}
          <img
            src="/marca/aig-logo-horizontal.svg"
            alt={nombreNegocio}
            width={4801}
            height={675}
            className="h-auto w-44 sm:w-56"
          />
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {NAVEGACION.map((enlace) => (
            <NavLink
              key={enlace.a}
              to={enlace.a}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-bold transition-colors hover:text-marca ${
                  isActive ? "text-marca" : "text-tinta"
                }`
              }
            >
              {enlace.texto}
            </NavLink>
          ))}
        </nav>

        {/* Sin JavaScript también abre: es un <details>, no un menú hidratado. */}
        <details className="relative md:hidden">
          <summary className="flex h-11 cursor-pointer list-none items-center rounded-xl border border-linea px-4 text-sm font-bold text-tinta [&::-webkit-details-marker]:hidden">
            Menú
          </summary>
          <nav
            aria-label="Principal"
            className="absolute right-0 z-40 mt-2 flex w-56 flex-col rounded-2xl border border-linea bg-superficie p-2 shadow-alzada"
          >
            {NAVEGACION.map((enlace) => (
              <NavLink
                key={enlace.a}
                to={enlace.a}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-3 text-sm font-bold transition-colors hover:bg-marca-suave ${
                    isActive ? "text-marca" : "text-tinta"
                  }`
                }
              >
                {enlace.texto}
              </NavLink>
            ))}
          </nav>
        </details>
      </div>
    </header>
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

  return (
    <footer className="campo-oscuro bg-tinta text-sobre-oscuro">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        {/* Sobre el campo oscuro va el isotipo (que es rojo y se lee) más el
            nombre en tipografía: el logotipo completo lleva la palabra en negro
            y no existe versión clara (PLAN §6.4). */}
        <div className="flex items-center gap-4">
          <Isotipo className="h-10 w-auto shrink-0" />
          <p className="font-display text-seccion text-white">{nombreNegocio}</p>
        </div>
        <p className="mt-3 max-w-md text-sobre-oscuro-suave">Donde cada propiedad cuenta una historia</p>

        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
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

          {redes.facebook || redes.instagram ? (
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

        <p className="mt-14 border-t border-white/15 pt-6 text-sm text-sobre-oscuro-suave">
          © {anio} {nombreNegocio}
        </p>
      </div>
    </footer>
  );
}
