import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router";
import type { Tarjeta } from "../../../server/db/propiedades";
import { IconoFlecha, IconoPausa, IconoReproducir } from "./iconos";
import { textoPrecio } from "./piezas";
import type { Ciclo, Sentido } from "./vitrina-movimiento";

/**
 * La vitrina de la portada: las casas destacadas (o, si no hay, las más
 * recientes), UNA A LA VEZ, contadas como lo que son: una casa con precio,
 * nombre y colonia, no una foto suelta. Cada una se queda unos segundos y
 * entra la siguiente (pedido del 18/09/2026). El bloque vino de atrás da la
 * profundidad con un color de la marca y sin filtros: las sombras de
 * `feDropShadow` y el `backdrop-filter` ya costaron Lighthouse (PLAN §17).
 * Sigue en 4:3 porque es la variante `tarjeta` de Cloudinary; otra proporción
 * sería otro derivado por casa (§13.5).
 *
 * Cómo se sostiene:
 *
 * - **El servidor pinta solo la primera casa**, igual que antes: sin
 *   JavaScript la portada es la de siempre y nada compite con el primer
 *   pintado. Las demás se montan en el cliente, UNA POR DELANTE (la siguiente
 *   baja mientras se ve la actual) y solo con la vitrina a la vista; no se
 *   cambia a una casa hasta que su foto está decodificada.
 * - **El ciclo arranca tarde a propósito:** después de `load`, con el
 *   navegador libre y cuando el héroe terminó su entrada. GSAP llega entonces
 *   con `import()` (el mismo trozo que usa `movimiento.ts`).
 * - **Se detiene sola** con el puntero encima, con el foco del teclado dentro,
 *   con la pestaña oculta y con la vitrina fuera de la pantalla. El botón de
 *   pausa la detiene hasta que se reanude (WCAG 2.2.2: todo lo que se mueve
 *   solo más de 5 s se tiene que poder detener), y elegir una casa o deslizar
 *   con el dedo también: quien eligió una casa quiere verla.
 * - **Con «menos movimiento» no pasa sola:** se puede elegir casa y cambia
 *   sin animación. Ni siquiera se baja GSAP.
 * - **Accesibilidad:** el patrón «carrusel» de la APG del W3C: la región se
 *   anuncia como carrusel, cada casa como «diapositiva, 2 de 5», y la zona
 *   viva calla (`aria-live="off"`) mientras las casas pasan solas, para no
 *   anunciar una cada 7 segundos.
 *
 * El movimiento en sí (la cortina, los renglones, la barra) vive en
 * `vitrina-movimiento.ts`.
 */

/** Cuántas casas pasan por la vitrina. El loader pide estas más las 6 de «Lo más reciente». */
export const CASAS_EN_VITRINA = 5;

/** Segundos de cada casa, desde que empieza a entrar hasta que entra la siguiente. */
const PERMANENCIA = 7;
/** La primera ya lleva unos segundos a la vista cuando arranca el ciclo. */
const PERMANENCIA_PRIMERA = 5;

type Motor = typeof import("./vitrina-movimiento");

/** Lo que los controles le piden al ciclo, que vive dentro del efecto. */
type Control = {
  elegir(indice: number): void;
  paso(sentido: Sentido): void;
  alternar(): void;
  puntero(encima: boolean): void;
  foco(dentro: boolean): void;
};

export function Vitrina({ casas }: { casas: Tarjeta[] }) {
  const total = casas.length;
  const rota = total > 1;
  const idMarco = useId();

  const [activa, setActiva] = useState(0);
  const [montadas, setMontadas] = useState<readonly number[]>([0]);
  // Los controles salen cuando el ciclo ya puede arrancar: antes serían botones muertos.
  const [listo, setListo] = useState(false);
  // GSAP llegó y nadie pidió «menos movimiento».
  const [conMovimiento, setConMovimiento] = useState(false);
  // La detuvo alguien: con el botón, eligiendo una casa o deslizando.
  const [detenida, setDetenida] = useState(false);
  // No está pasando sola en este momento (por cualquier razón).
  const [quieta, setQuieta] = useState(true);

  const raiz = useRef<HTMLElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const diapositivas = useRef<(HTMLDivElement | null)[]>([]);
  const rellenos = useRef<(HTMLSpanElement | null)[]>([]);
  const control = useRef<Control | null>(null);
  const toque = useRef<{ x: number; y: number; id: number } | null>(null);
  const deslizo = useRef(0);

  useEffect(() => {
    const nodo = raiz.current;
    const vista = marco.current;
    if (!rota || !nodo || !vista) return;
    // Con su tipo ya estrecho: las funciones declaradas aquí abajo no heredan
    // el estrechamiento de `nodo`.
    const seccion: HTMLElement = nodo;

    let vivo = true;
    let motor: Motor | null = null;
    let ciclo: Ciclo | null = null;
    // Cada cambio pedido saca turno: si llega otro mientras baja una foto, gana el último.
    let turno = 0;
    let primera = true;
    let ocioso: number | undefined;
    let reloj: number | undefined;
    const yaMontadas = new Set<number>([0]);
    // Lo que decide, fuera de React: lo leen los avisos de GSAP y del navegador.
    const e = { activa: 0, listo: false, detenida: false, puntero: false, foco: false, enVista: false, cerca: false };
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)");

    const hayMovimiento = () => motor !== null && !reducido.matches;
    const enPausa = () => e.detenida || e.puntero || e.foco || !e.enVista || document.hidden;

    function montar(indice: number) {
      if (yaMontadas.has(indice)) return;
      yaMontadas.add(indice);
      const lista = [...yaMontadas];
      flushSync(() => setMontadas(lista));
    }

    // Una por delante, y solo si la vitrina está a la vista: si nadie la va a
    // ver cambiar, no se gasta una foto.
    function precargar() {
      if (e.listo && e.cerca) montar((e.activa + 1) % total);
    }

    /** Corre o se detiene según todo lo que la puede pausar. */
    function aplicar() {
      if (!vivo || !e.listo) return;
      // Red de seguridad: con la pestaña oculta el navegador congela los
      // cuadros, y una cortina a medias se quedaría así. Se termina ya.
      if (document.hidden) ciclo?.asentar();
      const pausa = enPausa();
      if (motor && hayMovimiento()) {
        const entra = diapositivas.current[e.activa];
        if (!ciclo && !pausa && entra) {
          ciclo = motor.crearCiclo({
            sale: null,
            entra,
            sentido: 1,
            relleno: rellenos.current[e.activa] ?? null,
            rellenoAnterior: null,
            permanencia: primera ? PERMANENCIA_PRIMERA : PERMANENCIA,
            alTerminar: avanzar,
          });
          primera = false;
        }
        if (ciclo) {
          if (pausa) ciclo.pausar();
          else ciclo.reanudar();
        }
      }
      setQuieta(!hayMovimiento() || pausa);
    }

    function avanzar() {
      ciclo = null;
      if (vivo && !document.hidden) void irA((e.activa + 1) % total, 1, false);
    }

    async function irA(destino: number, sentido: Sentido, manual: boolean) {
      if (!vivo) return;
      // Quien elige una casa quiere verla: el paso solo se detiene, también
      // si tocó la barra de la que ya se ve.
      if (manual && !e.detenida) {
        e.detenida = true;
        setDetenida(true);
        aplicar();
      }
      if (destino === e.activa) return;
      const mio = ++turno;
      montar(destino);
      await fotoLista(diapositivas.current[destino]);
      if (!vivo || mio !== turno) return;

      const anterior = e.activa;
      ciclo?.matar();
      ciclo = null;
      e.activa = destino;
      // Síncrono: las clases de React (cuál se ve, cuál es inerte) tienen que
      // estar puestas antes de que GSAP escriba el punto de partida.
      flushSync(() => setActiva(destino));

      const sale = diapositivas.current[anterior];
      const entra = diapositivas.current[destino];
      if (motor && hayMovimiento() && sale && entra) {
        const conReloj = !e.detenida;
        ciclo = motor.crearCiclo({
          sale,
          entra,
          sentido,
          relleno: conReloj ? (rellenos.current[destino] ?? null) : null,
          rellenoAnterior: rellenos.current[anterior] ?? null,
          permanencia: conReloj ? PERMANENCIA : 0,
          alTerminar: conReloj
            ? avanzar
            : () => {
                ciclo = null;
              },
        });
      }
      aplicar();
      precargar();
    }

    function alternar() {
      e.detenida = !e.detenida;
      setDetenida(e.detenida);
      aplicar();
    }

    async function cargarMotor() {
      if (motor) return;
      try {
        motor = await import("./vitrina-movimiento");
      } catch {
        // Sin GSAP la vitrina sigue sirviendo: se elige casa y cambia sin animación.
        motor = null;
      }
    }

    async function arrancar() {
      await entradaTerminada(seccion);
      if (!reducido.matches) await cargarMotor();
      if (!vivo) return;
      e.listo = true;
      flushSync(() => {
        setListo(true);
        setConMovimiento(hayMovimiento());
      });
      precargar();
      aplicar();
    }

    control.current = {
      elegir: (indice) => void irA(indice, indice > e.activa ? 1 : -1, true),
      paso: (s) => void irA((e.activa + s + total) % total, s, true),
      alternar,
      puntero: (encima) => {
        e.puntero = encima;
        aplicar();
      },
      foco: (dentro) => {
        e.foco = dentro;
        aplicar();
      },
    };

    const alVerse = new IntersectionObserver(
      ([entrada]) => {
        e.cerca = entrada.isIntersecting;
        e.enVista = entrada.intersectionRatio >= 0.35;
        precargar();
        aplicar();
      },
      { threshold: [0, 0.35] },
    );
    alVerse.observe(vista);

    const alCambiarVisibilidad = () => aplicar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    // Si alguien activa «menos movimiento» con la página abierta, la vitrina
    // se queda quieta y entera; si lo quita, vuelve a pasar sola.
    const alCambiarPreferencia = () => {
      if (reducido.matches) {
        ciclo?.matar();
        ciclo = null;
        motor?.limpiar(nodo);
        setConMovimiento(false);
        aplicar();
        return;
      }
      void cargarMotor().then(() => {
        if (!vivo) return;
        setConMovimiento(hayMovimiento());
        aplicar();
      });
    };
    reducido.addEventListener("change", alCambiarPreferencia);

    // Igual que GSAP en el marco (PLAN §19): después de `load` y con el
    // navegador libre, para no competir con el primer pintado.
    const cuandoQuieto = () => {
      if (typeof window.requestIdleCallback === "function") {
        ocioso = window.requestIdleCallback(() => void arrancar(), { timeout: 2500 });
      } else {
        reloj = window.setTimeout(() => void arrancar(), 300);
      }
    };
    if (document.readyState === "complete") cuandoQuieto();
    else window.addEventListener("load", cuandoQuieto, { once: true });

    return () => {
      vivo = false;
      control.current = null;
      window.removeEventListener("load", cuandoQuieto);
      if (ocioso !== undefined) window.cancelIdleCallback(ocioso);
      if (reloj !== undefined) window.clearTimeout(reloj);
      alVerse.disconnect();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      reducido.removeEventListener("change", alCambiarPreferencia);
      ciclo?.matar();
      motor?.limpiar(nodo);
    };
  }, [rota, total]);

  return (
    <section
      ref={raiz}
      aria-roledescription={rota ? "carrusel" : undefined}
      aria-label={rota ? "Casas destacadas" : undefined}
      className="mt-12 lg:mt-0"
      onPointerEnter={(evento) => {
        if (evento.pointerType === "mouse") control.current?.puntero(true);
      }}
      onPointerLeave={(evento) => {
        if (evento.pointerType === "mouse") control.current?.puntero(false);
      }}
      onFocus={(evento) => control.current?.foco(focoDeTeclado(evento.target))}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) control.current?.foco(false);
      }}
    >
      <div className="relative mr-3 mb-3 sm:mr-5 sm:mb-5">
        <div
          aria-hidden="true"
          className="absolute inset-0 translate-x-3 translate-y-3 rounded-3xl bg-marca-oscuro motion-safe:animate-entrada-bloque motion-safe:[animation-delay:calc(var(--rb,0s)_+_380ms)] sm:translate-x-5 sm:translate-y-5"
        />
        {/* El marco lleva la proporción y recorta; las casas van apiladas
            dentro. Desde 1920 px pasa a 16:10: un 4:3 a ese ancho no cabría
            en la pantalla (y la foto se pide de la galería, ver abajo). */}
        <div
          ref={marco}
          id={idMarco}
          aria-live={rota ? (quieta ? "polite" : "off") : undefined}
          className={`relative aspect-[4/3] overflow-hidden rounded-3xl bg-marca-suave shadow-alzada 3xl:aspect-[16/10] motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_120ms)] ${rota ? "touch-pan-y" : ""}`}
          onPointerDown={(evento) => {
            if (rota && evento.pointerType !== "mouse") {
              toque.current = { x: evento.clientX, y: evento.clientY, id: evento.pointerId };
            }
          }}
          onPointerUp={(evento) => {
            const inicio = toque.current;
            toque.current = null;
            if (!inicio || inicio.id !== evento.pointerId) return;
            const dx = evento.clientX - inicio.x;
            const dy = evento.clientY - inicio.y;
            if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
            deslizo.current = performance.now();
            control.current?.paso(dx < 0 ? 1 : -1);
          }}
          onPointerCancel={() => {
            toque.current = null;
          }}
          onClickCapture={(evento) => {
            // Deslizar no es tocar: que el dedo al soltarse no abra la casa.
            if (performance.now() - deslizo.current < 500) {
              evento.preventDefault();
              evento.stopPropagation();
            }
          }}
        >
          {casas.map((casa, indice) =>
            montadas.includes(indice) ? (
              <Diapositiva
                key={casa.clave}
                casa={casa}
                indice={indice}
                total={total}
                activa={indice === activa}
                nodo={(elemento) => {
                  diapositivas.current[indice] = elemento;
                }}
              />
            ) : null,
          )}
        </div>
      </div>

      {rota ? (
        // El lugar de los controles viene reservado desde el servidor (sin él,
        // al salir empujarían la página): hasta que el ciclo puede arrancar,
        // están ahí pero invisibles.
        <div
          className={`mt-4 mr-3 flex items-center gap-3 sm:mt-5 sm:mr-5 ${listo ? "motion-safe:animate-entrada" : "invisible"}`}
        >
          {conMovimiento ? (
            <button
              type="button"
              data-rotacion
              aria-controls={idMarco}
              aria-label={detenida ? "Reanudar el cambio automático de casas" : "Pausar el cambio automático de casas"}
              onClick={() => control.current?.alternar()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-linea bg-superficie text-tinta shadow-tarjeta transition-[border-color,scale] duration-200 hover:border-tinta/40 active:scale-95"
            >
              {detenida ? <IconoReproducir className="h-3.5 w-3.5" /> : <IconoPausa className="h-3.5 w-3.5" />}
            </button>
          ) : null}

          {/* Una barra por casa: la de la casa a la vista se llena con su
              tiempo. Cada una es un botón de 40 px de alto aunque la raya
              mida 3 (WCAG 2.5.8). Con tope de ancho: a lo ancho de la
              vitrina, su final quedaba debajo del botón flotante de WhatsApp
              (1366×768, medido). */}
          <div role="group" aria-label="Elegir una casa" className="flex max-w-sm min-w-0 flex-1 items-center gap-1.5">
            {casas.map((casa, indice) => (
              <button
                key={casa.clave}
                type="button"
                aria-controls={idMarco}
                aria-label={`Ver la casa ${indice + 1} de ${total}: ${casa.titulo}`}
                aria-current={indice === activa ? "true" : undefined}
                onClick={() => control.current?.elegir(indice)}
                className="group/barra flex h-10 min-w-0 flex-1 cursor-pointer items-center"
              >
                <span className="relative block h-[3px] w-full overflow-hidden rounded-full bg-tinta/15 transition-colors duration-300 group-hover/barra:bg-tinta/30">
                  {/* `[transform:…]` y no `scale-x-*`: GSAP escribe `transform`
                      y en Tailwind 4 `scale-x-*` es otra propiedad que se
                      multiplicaría con la suya. Llena cuando nadie la llena
                      con el tiempo: la eligió alguien o no hay movimiento. */}
                  <span
                    ref={(elemento) => {
                      rellenos.current[indice] = elemento;
                    }}
                    data-relleno
                    aria-hidden="true"
                    className={`absolute inset-0 origin-left rounded-full bg-marca ${
                      indice === activa && (!conMovimiento || detenida) ? "[transform:scaleX(1)]" : "[transform:scaleX(0)]"
                    }`}
                  />
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─── Una casa ─────────────────────────────────────────────────────

const OPERACION_VITRINA: Record<Tarjeta["operacion"], string> = {
  venta: "En venta",
  renta: "En renta",
  venta_renta: "Venta o renta",
};

/**
 * Solo la primera casa trae la entrada del héroe: la sirve el servidor y se ve
 * desde el primer pintado. Las demás se montan después, escondidas; con estas
 * clases, su `@keyframes … both` correría al insertarlas.
 */
const ENTRADA = {
  foto: "motion-safe:animate-entrada-foto motion-safe:[animation-delay:calc(var(--rb,0s)_+_120ms)]",
  insignia: "motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_640ms)]",
  texto: "motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_560ms)]",
};

function Diapositiva({
  casa,
  indice,
  total,
  activa,
  nodo,
}: {
  casa: Tarjeta;
  indice: number;
  total: number;
  activa: boolean;
  nodo: (elemento: HTMLDivElement | null) => void;
}) {
  const foto = casa.foto;
  if (!foto) return null;
  const precio = textoPrecio(casa);
  const lugar = [casa.zona, casa.clave].filter(Boolean).join(" · ");
  const apartada = casa.estado === "apartada";
  const primera = indice === 0;
  const entrada = primera ? ENTRADA : null;
  const varias = total > 1;

  return (
    <div
      ref={nodo}
      data-diapositiva={indice}
      role={varias ? "group" : undefined}
      aria-roledescription={varias ? "diapositiva" : undefined}
      aria-label={varias ? `${indice + 1} de ${total}` : undefined}
      // Las que no se ven: ni foco ni clic, aunque GSAP las deje a la vista
      // mientras corre la cortina.
      inert={!activa}
      className={`absolute inset-0 ${activa ? "z-[1]" : "invisible"}`}
    >
      {/* El contorno del foco va por dentro: el marco recorta lo que sale. */}
      <Link
        to={`/propiedades/${casa.slug}`}
        draggable={false}
        className="group relative block h-full rounded-3xl focus-visible:outline-offset-[-6px]"
      >
        <div data-foto className="h-full">
          {/* Desde 1920 px la vitrina mide 1000-1600 px: pide la foto de la
              galería (1600, ya existe) en vez de la de 960. */}
          <picture className="block h-full">
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
              // Solo la primera compite por llegar pronto; las demás bajan
              // después de `load`, una por delante.
              fetchPriority={primera ? "high" : "low"}
              decoding="async"
              draggable={false}
              className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03] ${entrada?.foto ?? ""}`}
            />
          </picture>
        </div>
        {/* Velo de tinta de abajo arriba: el texto blanco se lee sobre
            cualquier foto sin tapar la casa. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-tinta/90 via-tinta/45 to-transparent"
        />
        <p
          className={`absolute top-4 left-4 flex items-center gap-2 rounded-full bg-superficie px-3 py-1.5 text-xs font-bold tracking-wide text-tinta uppercase shadow-tarjeta ${entrada?.insignia ?? ""}`}
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${apartada ? "bg-tinta" : "bg-marca"}`} />
          {/* Una casa apartada sale en el listado; decir «En venta» sería falso. */}
          {apartada ? "Apartada" : OPERACION_VITRINA[casa.operacion]}
        </p>
        <div
          className={`absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-7 ${entrada?.texto ?? ""}`}
        >
          {/* Cada renglón es su propia máscara: al cambiar de casa, el texto
              sube desde abajo de su línea (`data-linea`). El precio lleva
              relleno arriba y abajo, compensado con margen, para que la
              máscara no le corte el «$» ni la coma. */}
          <div className="min-w-0 text-white">
            <p className="-my-[0.1em] overflow-hidden py-[0.1em] text-precio tabular-nums">
              <span data-linea className="block">
                {precio.principal}
                {precio.segundo ? (
                  <span className="ml-2 text-base font-semibold text-sobre-oscuro-suave">{precio.segundo}</span>
                ) : null}
              </span>
            </p>
            <p className="mt-1.5 overflow-hidden font-display text-xl font-semibold sm:text-2xl">
              <span data-linea className="block truncate">
                {casa.titulo}
              </span>
            </p>
            {lugar ? (
              <p className="mt-1 overflow-hidden text-sm text-sobre-oscuro">
                <span data-linea className="block truncate">
                  {lugar}
                </span>
              </p>
            ) : null}
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

// ─── Ayudas ───────────────────────────────────────────────────────

/**
 * Pausa el foco del TECLADO (`:focus-visible`), no el que deja un clic, y
 * nunca el del botón de pausa: si no, «Reanudar» no reanudaría mientras el
 * foco siga sobre él.
 */
function focoDeTeclado(objetivo: EventTarget | null): boolean {
  if (!(objetivo instanceof HTMLElement) || objetivo.hasAttribute("data-rotacion")) return false;
  try {
    return objetivo.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** Resuelve cuando la foto de esa casa ya se puede pintar entera (o no llegará). */
async function fotoLista(diapositiva: HTMLElement | null | undefined): Promise<void> {
  const img = diapositiva?.querySelector("img");
  if (!img) return;
  if (!img.complete) {
    await new Promise<void>((resolver) => {
      img.addEventListener("load", () => resolver(), { once: true });
      img.addEventListener("error", () => resolver(), { once: true });
      // Con la red muy lenta, mejor cambiar a una casa sin foto que quedarse trabada.
      window.setTimeout(resolver, 8000);
    });
  }
  if (img.naturalWidth > 0) await img.decode().catch(() => undefined);
}

/** Espera a que terminen las entradas en CSS del héroe (o 4 s, lo que pase antes). */
async function entradaTerminada(nodo: HTMLElement): Promise<void> {
  if (typeof nodo.getAnimations !== "function") return;
  const corriendo = nodo.getAnimations({ subtree: true }).map((animacion) => animacion.finished.catch(() => undefined));
  await Promise.race([Promise.all(corriendo), new Promise((resolver) => window.setTimeout(resolver, 4000))]);
}
