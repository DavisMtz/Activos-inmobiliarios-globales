import { useEffect, useRef, type ReactNode } from "react";

/**
 * El escenario de la portada: la foto de una casa LLENA la primera pantalla y
 * en su pie van el titular, la casa con su precio, las cifras y el buscador
 * (elegido entre cuatro composiciones enseñadas en capturas, 20/09/2026).
 *
 * Lo que cambió respecto de la versión anterior, y por qué:
 * - **La foto ya no se abre al bajar.** Empezaba encuadrada en el centro con
 *   el titular MONTADO encima, y para que el texto se leyera había que lavar
 *   la foto: ni se leía limpio ni se veía la casa. Ahora empieza abierta y
 *   solo se aleja despacio al bajar. Con eso se va también el riel de 1.9
 *   pantallas: el buscador estaba a 1 400 px de scroll y ahora está a la
 *   vista desde el primer segundo.
 * - **El texto va SIEMPRE en el pie**, sobre el degradado de tinta —el mismo
 *   que ya usan las tarjetas de casa—, así que se lee sea cual sea la foto.
 *   La de El Prado tiene fachada blanca: con el velo claro de antes, un
 *   titular blanco encima desaparecía (medido el 20/09).
 * - **El velo ya no anima su opacidad:** el texto no se va, así que el
 *   degradado es constante.
 *
 * La foto es la de la **casa elegida en Panel › Contenido** («Casa de la foto
 * principal») y, si no hay ninguna elegida, la de la más reciente: es la misma
 * que encabeza la vitrina (`casasDePortada`), en su variante `galeria` de 1600
 * px, que ya existe porque la pide la ficha (no es un derivado nuevo, §13.5).
 *
 * El movimiento es un desplazamiento (`translate`), no un acercamiento: la
 * foto mide un 112 % del alto y se mueve dentro de ese sobrante, así que
 * nunca descubre sus orillas. Con «menos movimiento» se queda quieta.
 */

const entre = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** La curva de siempre: arranca y acaba despacio, sin rebote. */
const suave = (borde0: number, borde1: number, x: number) => {
  const t = entre((x - borde0) / (borde1 - borde0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Cuánto se queda atrás la foto, en % de su propio alto. El sobrante es del
 * 12 % (6 % arriba y 6 % abajo): más que esto descubre una orilla.
 */
const REZAGO = 5.5;
/** Inercia del seguimiento (segundos hasta alcanzar el destino). */
const INERCIA = 0.1;

export function EscenarioPortada({
  foto,
  children,
}: {
  /** La foto grande de la casa. Sin foto, el escenario no se dibuja. */
  foto: { src: string; srcset?: string | null; alt: string };
  /** El pie: titular, casa con precio, cifras y buscador. */
  children: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const imagen = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const elRaiz = raiz.current;
    if (!elRaiz) return;

    const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cuadro = 0;
    let actual = 0;
    let destino = 0;
    let alto = 0;
    let corriendo = false;

    const aplicar = (p: number) => {
      const elImagen = imagen.current;
      if (elImagen) elImagen.style.transform = `translate3d(0, ${REZAGO * suave(0, 1, p)}%, 0)`;
      // Mientras el héroe manda, el botón flotante de WhatsApp sobra: en la
      // primera pantalla ya están el buscador y el «Escríbenos» de la
      // cabecera, y su esquina se encimaba con el botón de buscar. Lo lee
      // `routes/publico/marco.tsx`. Sin JavaScript el botón se ve siempre.
      const dentro = p < 0.85;
      const raizHtml = document.documentElement;
      if ((raizHtml.dataset.heroe === "dentro") !== dentro) {
        raizHtml.dataset.heroe = dentro ? "dentro" : "fuera";
      }
    };

    const medir = () => {
      alto = elRaiz.clientHeight || window.innerHeight;
    };

    const leer = () => entre(-elRaiz.getBoundingClientRect().top / (alto || 1), 0, 1);

    const paso = () => {
      const k = 1 - Math.exp(-1 / (60 * INERCIA));
      actual += (destino - actual) * k;
      if (Math.abs(destino - actual) < 0.0004) {
        actual = destino;
        corriendo = false;
      }
      aplicar(actual);
      cuadro = corriendo ? requestAnimationFrame(paso) : 0;
    };

    const alBajar = () => {
      destino = leer();
      if (menosMovimiento) {
        actual = destino;
        aplicar(actual);
        return;
      }
      if (corriendo) return;
      corriendo = true;
      if (!cuadro) cuadro = requestAnimationFrame(paso);
    };

    const alCambiarDeTamano = () => {
      medir();
      destino = leer();
      actual = destino;
      aplicar(actual);
    };

    alCambiarDeTamano();
    window.addEventListener("scroll", alBajar, { passive: true });
    window.addEventListener("resize", alCambiarDeTamano);
    const observador = new ResizeObserver(alCambiarDeTamano);
    observador.observe(elRaiz);

    return () => {
      if (cuadro) cancelAnimationFrame(cuadro);
      window.removeEventListener("scroll", alBajar);
      window.removeEventListener("resize", alCambiarDeTamano);
      observador.disconnect();
      delete document.documentElement.dataset.heroe;
    };
  }, []);

  return (
    <div ref={raiz} className="escenario">
      {/* Es el LCP de la portada: baja de inmediato y con prioridad. No lleva
          `width`/`height`: va posicionada a las cuatro orillas con
          `object-fit: cover`, así que no reserva sitio ni puede mover nada al
          llegar, y la variante `galeria` limita el ancho a 1600 pero cada foto
          trae el alto que trae. */}
      <img
        ref={imagen}
        className="escenario-foto"
        src={foto.src}
        srcSet={foto.srcset ?? undefined}
        sizes="100vw"
        alt={foto.alt}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        draggable={false}
      />
      {/* El velo de tinta va dentro del pie (`app.css`): así se adapta a lo
          que mida el pie en cada pantalla y el texto nunca queda sobre un
          tramo claro de la foto. */}
      <div className="escenario-pie">{children}</div>
    </div>
  );
}
