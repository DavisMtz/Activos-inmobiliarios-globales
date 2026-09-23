import { Form, NavLink, Outlet, redirect, useLocation } from "react-router";
import { NOMBRE_ROL } from "../../../shared/permisos";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { IconoMenuPanel, IconoSalir } from "../../components/panel/iconos";
import { esSeccionActiva, seccionesDe, type Seccion } from "../../components/panel/secciones";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/marco";

/*
 * ─── Contrato de dirección del panel (F3) ──────────────────────────
 *
 * TESIS: es una herramienta, no un folleto. Quien entra viene a hacer algo
 * concreto —subir una casa, corregir un precio, atender a alguien— y lo que
 * importa es que lo encuentre sin pensar y que nada se vea «casi bien».
 * MUNDO: el mismo papel y la misma tinta del sitio público, pero el menú vive
 * sobre un campo de tinta (como el pie y la pantalla de acceso) y el rojo se
 * guarda para la acción principal, lo seleccionado y los estados. Una sola
 * tipografía (Nunito) y escala fija: la serif editorial se queda en el sitio.
 * HISTORIA: al entrar se ve qué pide atención hoy, con su cuenta y un enlace
 * directo a esa lista; nunca una pantalla de bienvenida vacía.
 * FORMA: menú lateral en escritorio, plegable en celular (un <details>, que
 * abre sin JavaScript). Primero 390 px, que es donde la hermana va a subir
 * casas desde el teléfono.
 *
 * Sin movimiento de lucimiento: transiciones de 150 ms para los estados y
 * nada más. GSAP no entra aquí (PLAN §10.4).
 */

/**
 * Marco de todas las pantallas con sesión del panel. La guardia vive en su
 * loader: sin sesión → /panel/entrar; con clave temporal → /panel/cambiar-clave.
 * Los loaders de las pantallas hijas vuelven a comprobar el permiso que les toca.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  if (encontrada.sesion.soloCambioClave) throw redirect("/panel/cambiar-clave");
  const { usuario } = encontrada.sesion;
  return {
    usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
    modoDemo: servicios.config.modoDemo,
  };
}

export default function Marco({ loaderData }: Route.ComponentProps) {
  const { usuario, modoDemo } = loaderData;
  const { pathname } = useLocation();
  const secciones = seccionesDe(usuario);

  return (
    <div className="min-h-dvh bg-fondo">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-tinta focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Saltar al contenido
      </a>

      {/* En el celular, arriba de todo. En escritorio va DENTRO de la columna
          de contenido: arriba de todo empujaba 36 px el menú lateral, que mide
          `h-dvh`, y «Salir» quedaba cortado bajo el borde de la pantalla. */}
      {modoDemo ? <FranjaDemo className="lg:hidden" /> : null}

      {/* Sin tope de ancho: con `max-w-7xl` centrado, a 1920 px el menú oscuro
          flotaba como una isla con 320 px vacíos a cada lado. El menú va al
          borde y cada pantalla pone su propio tope a lo que se lee. */}
      <div className="flex w-full flex-col lg:flex-row">
        {/* ── Celular: cabecera con menú plegable ─────────────────── */}
        <header className="sticky top-0 z-30 border-b border-linea bg-superficie lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            {/* El logotipo completo trae el lema, que a 390 px no se lee: aquí
                va el isotipo, que sí, con la palabra que dice dónde estás. */}
            <p className="flex items-center gap-2.5">
              <img
                src="/marca/aig-isotipo.svg"
                alt="Activos Inmobiliarios Globales"
                width={270}
                height={270}
                className="h-9 w-auto"
              />
              <span className="text-base font-extrabold text-tinta">Panel</span>
            </p>
            <div className="flex items-center gap-2">
              <Form method="post" action="/panel/salir">
                <button
                  type="submit"
                  aria-label="Salir"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-linea text-tinta transition-colors hover:border-marca hover:text-marca"
                >
                  <IconoSalir />
                </button>
              </Form>
              {/* Sin JavaScript también abre: es un <details>, no un menú hidratado. */}
              <details className="relative">
                <summary className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-linea px-3 text-sm font-bold text-tinta [&::-webkit-details-marker]:hidden">
                  <IconoMenuPanel />
                  Menú
                </summary>
                <nav
                  aria-label="Secciones del panel"
                  className="absolute right-0 z-40 mt-2 flex w-60 flex-col gap-1 rounded-2xl border border-linea bg-superficie p-2 shadow-alzada"
                >
                  <p className="px-3 pt-1 pb-2 text-sm leading-tight">
                    <span className="block font-bold text-tinta">{usuario.nombre}</span>
                    <span className="text-texto-suave">{NOMBRE_ROL[usuario.rol]}</span>
                  </p>
                  {secciones.map((seccion) => (
                    <EnlaceDeSeccion key={seccion.ruta} seccion={seccion} ruta={pathname} oscuro={false} />
                  ))}
                </nav>
              </details>
            </div>
          </div>
        </header>

        {/* ── Escritorio: menú lateral sobre campo de tinta ───────── */}
        <div className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-0 flex h-dvh flex-col gap-6 bg-tinta px-4 py-6">
            <img
              src="/marca/aig-isotipo.svg"
              alt="Activos Inmobiliarios Globales"
              width={270}
              height={270}
              className="mx-1 h-11 w-auto"
            />

            <nav aria-label="Secciones del panel" className="flex flex-col gap-1">
              {secciones.map((seccion) => (
                <EnlaceDeSeccion key={seccion.ruta} seccion={seccion} ruta={pathname} oscuro />
              ))}
            </nav>

            <div className="mt-auto border-t border-white/15 pt-4">
              <p className="px-2 text-sm leading-tight">
                <span className="block font-bold text-white">{usuario.nombre}</span>
                <span className="text-sobre-oscuro-suave">{NOMBRE_ROL[usuario.rol]}</span>
              </p>
              <Form method="post" action="/panel/salir" className="mt-3">
                <button
                  type="submit"
                  className="flex h-11 w-full items-center gap-2 rounded-xl px-2 text-sm font-bold text-sobre-oscuro transition-colors hover:bg-white/10 hover:text-white"
                >
                  <IconoSalir />
                  Salir
                </button>
              </Form>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {modoDemo ? <FranjaDemo className="hidden lg:block" /> : null}
          <main id="contenido" className="px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function FranjaDemo({ className }: { className: string }) {
  return (
    <p className={`bg-tinta px-4 py-2 text-center text-sm font-semibold text-white ${className}`}>
      Modo propuesta: no aparece en Google y no se envían correos.
    </p>
  );
}

function EnlaceDeSeccion({ seccion, ruta, oscuro }: { seccion: Seccion; ruta: string; oscuro: boolean }) {
  const activa = esSeccionActiva(seccion, ruta);
  const { Icono } = seccion;

  // Lo seleccionado se marca con un campo de color, no con una línea de
  // acento: a 390 px una barrita de 3 px no se ve, un campo sí.
  const estilo = oscuro
    ? activa
      ? "bg-marca text-white"
      : "text-sobre-oscuro hover:bg-white/10 hover:text-white"
    : activa
      ? "bg-marca-suave text-marca-oscuro"
      : "text-tinta hover:bg-fondo";

  return (
    <NavLink
      to={seccion.ruta}
      end={!seccion.raiz}
      aria-current={activa ? "page" : undefined}
      className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors ${estilo}`}
    >
      <Icono className="h-5 w-5 shrink-0" />
      {seccion.titulo}
    </NavLink>
  );
}
