import type { ReactNode } from "react";
import type { Pregunta, Testimonio } from "../../../server/db/configuracion";
import { IconoMas } from "./iconos";

/**
 * Lo que el equipo escribe en Panel › Contenido y se lee en la portada
 * (pedido del 18/09/2026: «añadí una pregunta frecuente y un testimonio y no
 * los veo en la portada»). Todo sale de la base: si no hay testimonios o
 * preguntas marcados «Se ve en el sitio», la sección no existe, ni su título
 * (PLAN §0.4: nada inventado, nada vacío).
 *
 * Mismo lenguaje que el resto de la portada: Jost en los títulos, Nunito en el
 * texto, el vino y el rojo como acento y rayas finas en lugar de cajas. Las
 * entradas las anima `movimiento.ts` (`data-animar`, `data-animar-lista`), que
 * nunca deja nada escondido sin JavaScript ni con «menos movimiento».
 */

/** El renglón chico que va arriba de un título: raya vino y letra espaciada. */
export function Antetitulo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`flex items-center gap-3 font-display text-xs font-medium tracking-[0.28em] text-marca uppercase sm:text-sm ${className}`}
    >
      <span aria-hidden="true" className="h-px w-8 shrink-0 bg-marca" />
      {children}
    </p>
  );
}

// ─── Testimonios ──────────────────────────────────────────────────

export function Testimonios({ testimonios }: { testimonios: Testimonio[] }) {
  if (!testimonios.length) return null;

  return (
    <section aria-labelledby="titulo-testimonios" className="mx-auto max-w-sitio px-5 py-16 sm:py-24 lg:px-10">
      {/* A la izquierda el título; a la derecha las citas, como en una revista:
          letra grande y ligera, sin cajas. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 3xl:gap-24">
        <header data-animar>
          <Antetitulo>Testimonios</Antetitulo>
          <h2 id="titulo-testimonios" className="mt-4 font-display text-seccion text-tinta">
            Lo que dicen de nosotros
          </h2>
        </header>

        <ul data-animar-lista className="mt-10 flex flex-col lg:mt-0">
          {testimonios.map((testimonio) => (
            <li key={testimonio.id} className="border-t border-linea py-10 first:border-t-0 first:pt-0 last:pb-0">
              <figure>
                {/* La comilla, en la serif del sistema: la de Jost es recta y
                    grande se leía como «//». */}
                <span aria-hidden="true" className="block h-11 font-serif text-[5.5rem] leading-[0.9] text-marca">
                  “
                </span>
                <blockquote className="mt-3">
                  <p className="font-display text-[clamp(1.35rem,1.05rem+1.2vw,2.1rem)] leading-[1.3] font-light whitespace-pre-line text-tinta">
                    {testimonio.texto}
                  </p>
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 text-sm font-bold tracking-wide text-tinta">
                  <span aria-hidden="true" className="h-px w-8 shrink-0 bg-marca" />
                  {testimonio.nombre}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── Preguntas frecuentes ─────────────────────────────────────────

/**
 * Un `<details>` por pregunta: abre sin JavaScript, y con el mismo `name` se
 * abre una a la vez (lo resuelve el navegador). La apertura suave es CSS
 * (`.pregunta` en app.css): donde el navegador no sabe animar hasta `auto`,
 * abre al instante, que también está bien.
 */
export function Preguntas({ preguntas, whatsapp }: { preguntas: Pregunta[]; whatsapp: string | null }) {
  if (!preguntas.length) return null;

  return (
    <section aria-labelledby="titulo-preguntas" className="bg-superficie">
      <div className="mx-auto max-w-sitio px-5 py-16 sm:py-24 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 lg:px-10 3xl:gap-24">
        {/* En escritorio el título se queda a la vista mientras se leen las respuestas. */}
        <header data-animar className="lg:sticky lg:top-28 lg:self-start">
          <Antetitulo>Preguntas frecuentes</Antetitulo>
          <h2 id="titulo-preguntas" className="mt-4 font-display text-seccion text-tinta">
            Lo que más nos preguntan
          </h2>
          {whatsapp ? (
            <p className="mt-4 max-w-sm text-texto-suave">
              ¿No está la tuya?{" "}
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-marca underline underline-offset-4"
              >
                Escríbenos por WhatsApp
              </a>
            </p>
          ) : null}
        </header>

        <ul data-animar-lista className="mt-10 border-t border-linea lg:mt-0">
          {preguntas.map((pregunta) => (
            <li key={pregunta.id} className="border-b border-linea">
              <details name="preguntas" className="pregunta group/pregunta">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 [&::-webkit-details-marker]:hidden">
                  <span className="font-display text-lg leading-snug font-medium text-tinta transition-colors duration-300 group-hover/pregunta:text-marca sm:text-xl">
                    {pregunta.pregunta}
                  </span>
                  {/* El «+» gira a «×» y se llena de rojo al abrir. */}
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-linea text-tinta transition-[rotate,background-color,border-color,color] duration-500 ease-[var(--ease-entrada)] group-open/pregunta:rotate-45 group-open/pregunta:border-marca group-open/pregunta:bg-marca group-open/pregunta:text-white"
                  >
                    <IconoMas className="h-4 w-4" />
                  </span>
                </summary>
                <p className="max-w-[65ch] pb-7 leading-relaxed whitespace-pre-line text-texto-suave sm:pr-16">
                  {pregunta.respuesta}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
