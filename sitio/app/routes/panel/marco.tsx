import { useRef } from "react";
import { Form, NavLink, Outlet, redirect, useLocation } from "react-router";
import { NOMBRE_ROL } from "../../../shared/permisos";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { prospectosSinAtender } from "../../../server/db/panel/inicio";
import { IconoPuntos, IconoSalir } from "../../components/panel/iconos";
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
 * FORMA: menú lateral en escritorio; en el celular, una barra fija abajo con
 * las cuatro secciones de todos los días y «Más» para el resto (elegida el
 * 23/09/2026 entre cuatro maquetas; antes era un menú plegable arriba, y todo
 * quedaba a dos toques y fuera del alcance del pulgar). Primero 390 px, que es
 * donde la hermana va a subir casas desde el teléfono.
 *
 * Sin movimiento de lucimiento: transiciones de 150 ms para los estados y
 * nada más. GSAP no entra aquí (PLAN §10.4).
 */

/**
 * Marco de todas las pantallas con sesión del panel. La guardia vive en su
 * loader: sin sesión → /panel/entrar; con clave temporal → /panel/cambiar-clave.
 * Los loaders de las pantallas hijas vuelven a comprobar el permiso que les toca.
 *
 * Trae también cuántas personas esperan respuesta, para el número junto a
 * «Prospectos»: la misma cuenta del aviso de Inicio. Como es el loader del
 * marco, se vuelve a pedir después de cada acción, así que el número baja en
 * cuanto alguien marca «contactado».
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
    sinAtender: await prospectosSinAtender(servicios.db, usuario),
  };
}

/** La sección que lleva el número de «sin atender». */
const RUTA_PROSPECTOS = "/panel/prospectos";

export default function Marco({ loaderData }: Route.ComponentProps) {
  const { usuario, modoDemo, sinAtender } = loaderData;
  const { pathname } = useLocation();
  const secciones = seccionesDe(usuario);
  const cuentaDe = (seccion: Seccion) => (seccion.ruta === RUTA_PROSPECTOS ? sinAtender : 0);

  return (
    // `--alto-barra` es lo que mide la barra de abajo del celular (0 desde
    // `lg`, donde no existe): con ella se reserva su espacio al final de la
    // página y se levanta lo que va pegado abajo (el «Guardar» de una casa).
    <div className="min-h-dvh bg-fondo [--alto-barra:calc(4.3125rem+env(safe-area-inset-bottom))] lg:[--alto-barra:0px]">
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
        {/* ── Celular: cabecera (el menú está en la barra de abajo) ─── */}
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
            <Form method="post" action="/panel/salir">
              <button
                type="submit"
                aria-label="Salir"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-linea text-tinta transition-colors hover:border-marca hover:text-marca"
              >
                <IconoSalir />
              </button>
            </Form>
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
                <EnlaceDeSeccion key={seccion.ruta} seccion={seccion} ruta={pathname} cuenta={cuentaDe(seccion)} oscuro />
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
          <main
            id="contenido"
            className="px-4 pt-6 pb-[calc(var(--alto-barra)+1.5rem)] sm:px-6 lg:px-8 lg:py-10"
          >
            <Outlet />
          </main>
        </div>
      </div>

      <BarraInferior secciones={secciones} ruta={pathname} cuentaDe={cuentaDe} usuario={usuario} />
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

// ─── Celular: la barra de abajo ───────────────────────────────────

/** Cuántas secciones van a la vista antes de mandar el resto a «Más». */
const EN_LA_BARRA = 4;

/**
 * Las secciones de todos los días, al alcance del pulgar. El orden es el del
 * menú (`secciones.tsx`), ya filtrado por permisos: al maestro le tocan
 * Inicio, Casas, Prospectos y Métricas, y a la persona de contenido —que no ve
 * prospectos— Inicio, Casas, Métricas y Contenido. Si todas caben (el asesor
 * tiene cinco), no hay «Más».
 */
function BarraInferior({
  secciones,
  ruta,
  cuentaDe,
  usuario,
}: {
  secciones: Seccion[];
  ruta: string;
  cuentaDe: (seccion: Seccion) => number;
  usuario: { nombre: string; rol: keyof typeof NOMBRE_ROL };
}) {
  const caben = secciones.length <= EN_LA_BARRA + 1;
  const aLaVista = caben ? secciones : secciones.slice(0, EN_LA_BARRA);
  const resto = caben ? [] : secciones.slice(EN_LA_BARRA);
  const columnas = aLaVista.length + (resto.length ? 1 : 0);

  return (
    <nav
      aria-label="Secciones del panel"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-linea bg-superficie pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid gap-1 px-1.5 py-1.5" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
        {aLaVista.map((seccion) => (
          <li key={seccion.ruta}>
            <EnlaceDeBarra seccion={seccion} ruta={ruta} cuenta={cuentaDe(seccion)} />
          </li>
        ))}
        {resto.length ? (
          <li>
            {/* `key` con la ruta: al navegar se vuelve a montar, o sea que se
                cierra solo. Un <details> que sigue abierto tras tocar una
                sección tapa la pantalla a la que se llegó. */}
            <Mas key={ruta} resto={resto} ruta={ruta} cuentaDe={cuentaDe} usuario={usuario} />
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

const ESTILO_DE_BARRA =
  "relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold transition-colors";

function EnlaceDeBarra({ seccion, ruta, cuenta }: { seccion: Seccion; ruta: string; cuenta: number }) {
  const activa = esSeccionActiva(seccion, ruta);
  const { Icono } = seccion;
  return (
    <NavLink
      to={seccion.ruta}
      end={!seccion.raiz}
      aria-current={activa ? "page" : undefined}
      className={`${ESTILO_DE_BARRA} ${activa ? "bg-marca-suave text-marca-oscuro" : "text-tinta hover:bg-fondo"}`}
    >
      <span className="relative">
        <Icono className="h-6 w-6" />
        <Cuenta cuenta={cuenta} className="absolute -top-1.5 left-3.5 ring-2 ring-superficie" />
      </span>
      <span className="max-w-full truncate px-0.5">{seccion.titulo}</span>
      <CuentaParaLeer cuenta={cuenta} />
    </NavLink>
  );
}

/**
 * «Más»: el resto de las secciones en una hoja que sube desde la barra. Es un
 * `<details>`, así que abre sin JavaScript; con él, tocar fuera o `Esc` la
 * cierran. Se marca como activo cuando la pantalla de ahora vive ahí dentro,
 * para que la barra diga siempre dónde estás.
 */
function Mas({
  resto,
  ruta,
  cuentaDe,
  usuario,
}: {
  resto: Seccion[];
  ruta: string;
  cuentaDe: (seccion: Seccion) => number;
  usuario: { nombre: string; rol: keyof typeof NOMBRE_ROL };
}) {
  const hoja = useRef<HTMLDetailsElement>(null);
  const cerrar = () => {
    if (hoja.current) hoja.current.open = false;
  };
  const activo = resto.some((seccion) => esSeccionActiva(seccion, ruta));
  const pendientes = resto.reduce((suma, seccion) => suma + cuentaDe(seccion), 0);

  return (
    <details
      ref={hoja}
      className="group"
      onKeyDown={(evento) => {
        if (evento.key === "Escape") cerrar();
      }}
    >
      <summary
        className={`${ESTILO_DE_BARRA} cursor-pointer list-none [&::-webkit-details-marker]:hidden ${
          activo ? "bg-marca-suave text-marca-oscuro" : "text-tinta hover:bg-fondo group-open:bg-fondo"
        }`}
      >
        <span className="relative">
          <IconoPuntos className="h-6 w-6" />
          <Cuenta cuenta={pendientes} className="absolute -top-1.5 left-3.5 ring-2 ring-superficie" />
        </span>
        Más
        <CuentaParaLeer cuenta={pendientes} />
      </summary>

      {/* El velo: tocarlo cierra la hoja. Solo con JavaScript; sin él, se
          cierra tocando «Más» otra vez. */}
      <div aria-hidden="true" onClick={cerrar} className="fixed inset-x-0 top-0 bottom-(--alto-barra) bg-tinta/30" />
      <div className="fixed inset-x-0 bottom-(--alto-barra) max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-linea bg-superficie px-2 pt-3 pb-2 shadow-alzada">
        <p className="px-3 pb-2 text-sm leading-tight">
          <span className="block font-bold text-tinta">{usuario.nombre}</span>
          <span className="text-texto-suave">{NOMBRE_ROL[usuario.rol]}</span>
        </p>
        <ul className="flex flex-col gap-1">
          {resto.map((seccion) => (
            <li key={seccion.ruta}>
              <EnlaceDeSeccion seccion={seccion} ruta={ruta} cuenta={cuentaDe(seccion)} oscuro={false} />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

// ─── Piezas comunes ───────────────────────────────────────────────

/**
 * El número de «sin atender», como píldora. Solo se VE: lo que se lee es
 * `CuentaParaLeer`, que va después del nombre de la sección para que el lector
 * de pantalla diga «Prospectos, 3 sin atender» y no «3 sin atender, Prospectos»
 * (en la barra de abajo la píldora va encima del icono, antes del nombre).
 */
function Cuenta({ cuenta, className = "" }: { cuenta: number; className?: string }) {
  if (cuenta <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-marca px-1 text-[0.6875rem] leading-none font-extrabold text-white tabular-nums ${className}`}
    >
      {cuenta > 99 ? "99+" : cuenta}
    </span>
  );
}

function CuentaParaLeer({ cuenta }: { cuenta: number }) {
  return cuenta > 0 ? <span className="sr-only">, {cuenta} sin atender</span> : null;
}

function EnlaceDeSeccion({
  seccion,
  ruta,
  cuenta,
  oscuro,
}: {
  seccion: Seccion;
  ruta: string;
  cuenta: number;
  oscuro: boolean;
}) {
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
      {/* Sobre la sección activa (campo rojo) la píldora roja se perdería:
          ahí va en blanco. */}
      <Cuenta cuenta={cuenta} className={`ml-auto ${oscuro && activa ? "bg-white! text-marca-oscuro!" : ""}`} />
      <CuentaParaLeer cuenta={cuenta} />
    </NavLink>
  );
}
