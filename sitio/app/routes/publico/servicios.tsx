import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { leerConfiguracion, leerServicios } from "../../../server/db/configuracion";
import { dibujoDeServicio } from "../../../shared/servicios";
import { DibujoDeServicio } from "../../components/publico/dibujos-servicio";
import { IconoPausa, IconoReproducir } from "../../components/publico/iconos";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/servicios";

/**
 * Los 6 servicios reales del negocio, tal como los escribió (PLAN §6.3). Van
 * como lista editorial y no como seis tarjetas iguales: los textos tienen
 * largos muy distintos (uno trae una lista dentro) y en tarjetas de la misma
 * altura eso deja huecos.
 *
 * Cada uno lleva su dibujo (19/09/2026, «más visual»): entra en el hueco del
 * título y la lista sigue siendo lista, con sus filetes. Cuál le toca lo decide
 * `shared/servicios.ts`: el que se escogió en Panel › Contenido o, si no se ha
 * escogido ninguno, el que sugiere el título; por eso uno recién agregado ya
 * sale con dibujo.
 */

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoServidor).servicios;
  const [servicios, configuracion] = await Promise.all([leerServicios(db), leerConfiguracion(db)]);
  return {
    // La clave ya resuelta: al navegador no le hace falta la regla que elige.
    servicios: servicios.map((s) => ({
      id: s.id,
      titulo: s.titulo,
      descripcion: s.descripcion,
      dibujo: dibujoDeServicio(s),
    })),
    intro: configuracion.portada.introServicios,
  };
}

export function meta() {
  return [
    { title: "Servicios · Venta, renta y financiamiento | Activos Inmobiliarios Globales" },
    {
      name: "description",
      content:
        "Venta y renta de inmuebles, financiamiento, trámites, asesoría personalizada y promoción inmobiliaria en Morelia, Michoacán.",
    },
  ];
}

/**
 * Cuántos turnos tiene una vuelta (`vida-*` en `app.css`: 4.5 s, 1.5 s cada
 * gesto). Tres: con seis dibujos a la vista se mueven dos a la vez, que es el
 * tercio justo, y en el celular el que se ve cobra vida cada 4.5 s.
 */
const TURNOS = 3;

/** Quien pausó los dibujos los encuentra quietos al volver (skill `webapp-storage-cache`). */
const LLAVE_QUIETOS = "aig:v1:dibujos-quietos";

/**
 * `sin`: el servidor, la hidratación y quien pidió «menos movimiento»: no hay
 * gestos ni botón. Los gestos solo existen cuando también existe la pausa.
 */
type Vida = "sin" | "corriendo" | "pausada";

export default function Servicios({ loaderData }: Route.ComponentProps) {
  const { servicios, intro } = loaderData;
  const lista = useRef<HTMLDivElement>(null);
  const [vida, setVida] = useState<Vida>("sin");

  // Lo que se mueve solo más de 5 s tiene que poder detenerse (WCAG 2.2.2, la
  // regla que ya le puso pausa a la vitrina). Por eso los gestos no arrancan
  // desde el CSS: los enciende esto, que es lo mismo que pinta el botón.
  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const decidir = () => {
      if (!consulta.matches) return setVida("sin");
      let quietos = false;
      try {
        quietos = window.localStorage.getItem(LLAVE_QUIETOS) === "1";
      } catch {
        // Almacenamiento bloqueado: simplemente no se recuerda.
      }
      setVida(quietos ? "pausada" : "corriendo");
    };
    decidir();
    consulta.addEventListener("change", decidir);
    return () => consulta.removeEventListener("change", decidir);
  }, []);

  const alternar = () => {
    const siguiente: Vida = vida === "corriendo" ? "pausada" : "corriendo";
    setVida(siguiente);
    try {
      if (siguiente === "pausada") window.localStorage.setItem(LLAVE_QUIETOS, "1");
      else window.localStorage.removeItem(LLAVE_QUIETOS);
    } catch {
      // Sin almacenamiento, la pausa vale para esta visita.
    }
  };

  // Un gesto que nadie ve solo gasta batería: los dibujos que no están a la
  // vista esperan. Es una MEJORA: si esto no corre, los gestos siguen todos, y
  // la entrada no se toca nunca, que es la que deja el dibujo entero.
  useEffect(() => {
    const dibujos = lista.current?.querySelectorAll(".dibujo-servicio");
    if (!dibujos?.length || typeof IntersectionObserver !== "function") return;
    const vigia = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) entrada.target.toggleAttribute("data-fuera", !entrada.isIntersecting);
      },
      // Un poco antes de asomar ya se mueve: no arranca delante de quien llega.
      { rootMargin: "15% 0px" },
    );
    dibujos.forEach((dibujo) => vigia.observe(dibujo));
    return () => vigia.disconnect();
  }, [servicios.length]);

  return (
    <div className="mx-auto max-w-sitio px-5 lg:px-10 py-10 sm:py-14">
      <header className="flex items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="font-display text-titulo text-tinta">Servicios</h1>
          {intro ? <p className="mt-3 text-guia text-texto-suave">{intro}</p> : null}
        </div>

        {/* Su lugar viene reservado desde el servidor, para que al salir no
            empuje nada: hasta saber si hay gestos, está pero no se ve (y con
            `visibility: hidden` tampoco recibe el foco ni lo lee un lector). */}
        <div className={vida === "sin" ? "invisible" : "motion-safe:animate-entrada"}>
          <button
            type="button"
            data-vida-control
            // El nombre empieza por lo que se lee en el botón (WCAG 2.5.3).
            aria-label={vida === "pausada" ? "Reanudar el movimiento de los dibujos" : "Pausar el movimiento de los dibujos"}
            onClick={alternar}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-linea bg-superficie px-4 text-sm font-bold text-tinta transition-[border-color,scale] duration-200 hover:border-tinta/40 active:scale-95"
          >
            {vida === "pausada" ? <IconoReproducir className="h-3.5 w-3.5" /> : <IconoPausa className="h-3.5 w-3.5" />}
            {vida === "pausada" ? "Reanudar" : "Pausar"}
          </button>
        </div>
      </header>

      {/* Hasta 1024 px, una columna: dibujo, título y texto. De ahí a 1280,
          renglones de dibujo + título + texto, con el título y el primer
          renglón a la misma altura. Desde 1280, tres columnas con su filete
          arriba, que es donde la lista dejaba vacío el 40 % derecho. */}
      <div
        ref={lista}
        data-vida={vida === "corriendo" ? "corriendo" : undefined}
        className="mt-10 border-t border-linea xl:grid xl:grid-cols-3 xl:gap-x-12 xl:border-t-0"
      >
        {servicios.map((servicio, posicion) => (
          <section
            key={servicio.id}
            // `--i`: se arman uno tras otro, en el orden de lectura. `--turno`:
            // cuándo le toca su gesto; en tres columnas, el turno ES la columna.
            style={{ "--i": posicion, "--turno": posicion % TURNOS } as CSSProperties}
            className="grid gap-4 border-b border-linea py-8 lg:grid-cols-[11rem_17rem_minmax(0,1fr)] lg:gap-x-10 xl:grid-cols-1 xl:content-start xl:gap-5 xl:border-t xl:border-b-0"
          >
            {/* Con presencia: a 6rem de alto se leían como iconos, y se pidió
                una escena. En la fila de tres piezas (1024-1280) sube un poco
                para que su tinta arranque a la altura del título. */}
            <DibujoDeServicio
              clave={servicio.dibujo}
              className="aspect-[4/3] h-36 sm:h-40 lg:-mt-3 lg:h-auto lg:w-full xl:mt-0 xl:h-40 xl:w-auto 3xl:h-44 4xl:h-52"
            />
            <h2 className="font-display text-seccion text-tinta">{servicio.titulo}</h2>
            <p className="max-w-[68ch] leading-relaxed whitespace-pre-line text-texto">{servicio.descripcion}</p>
          </section>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          viewTransition
          to="/propiedades"
          className="inline-flex h-12 items-center rounded-xl bg-marca px-6 font-extrabold text-white transition-colors hover:bg-marca-oscuro"
        >
          Ver las propiedades
        </Link>
        <Link
          viewTransition
          to="/contacto"
          className="inline-flex h-12 items-center rounded-xl border border-linea bg-superficie px-6 font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
        >
          Hablar con un asesor
        </Link>
      </div>
    </div>
  );
}
