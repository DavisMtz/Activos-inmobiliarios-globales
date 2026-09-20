import { useEffect, useRef, type ReactNode } from "react";

/**
 * El escenario de la portada: la foto de una casa empieza encuadrada en el
 * centro de un campo oscuro, con el titular encima, y al bajar se abre hasta
 * llenar la pantalla mientras el titular se va. Debajo quedan el buscador y la
 * vitrina (pedido del 20/09/2026).
 *
 * Adaptado del `ScrollExpand` de React Bits (variante JS + CSS, sin ninguna
 * dependencia). Lo que cambió del original, y por qué:
 * - **El titular es un `<h1>` de verdad**, no un `div`: es el titular de la
 *   página, lo leen Google y `meta()`. Por eso el rótulo entra como contenido
 *   y no como texto en una propiedad.
 * - **Sin JavaScript el original no se ve**: el alto de la escena y del riel
 *   se los pone el guion. Aquí los trae el CSS (`app.css`) y el guion solo los
 *   afina, así que la portada existe aunque el JavaScript no llegue.
 * - **El encuadre se mide por ancho de pantalla**: el 42 % del original, en un
 *   teléfono de 390 px, es una estampilla de 164 px.
 * - Sus colores y su tipografía (negrita apretada) no son de esta marca: el
 *   campo es `--color-tinta` y el titular usa la escala de aquí.
 *
 * La foto es la de la **casa elegida en Panel › Contenido** («Casa de la foto
 * principal») y, si no hay ninguna elegida, la de la más reciente: es la misma
 * que encabeza la vitrina (`casasDePortada`), en su variante `galeria` de 1600
 * px, que ya existe porque la pide la ficha (no es un derivado nuevo, §13.5).
 *
 * Con «menos movimiento» no hay suavizado: la foto sigue al dedo sin inercia.
 */

const entre = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** La curva del original: arranca y acaba despacio, sin rebote. */
const suave = (borde0: number, borde1: number, x: number) => {
  const t = entre((x - borde0) / (borde1 - borde0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

/** El encuadre de partida, por ancho de pantalla: en un teléfono casi no sobra papel. */
function encuadre(ancho: number): { ancho: number; alto: number; radio: number } {
  if (ancho < 640) return { ancho: 86, alto: 56, radio: 22 };
  if (ancho < 1024) return { ancho: 64, alto: 58, radio: 24 };
  return { ancho: 42, alto: 58, radio: 24 };
}

/** Cuánto se acerca la foto al empezar; al abrirse vuelve a su tamaño. */
const ACERCAMIENTO = 1.3;
/** Pantallas de desplazamiento que tarda en abrirse, y las que se queda abierta. */
const RECORRIDO = 0.8;
const SOSTENIDO = 0.1;
/** Inercia del seguimiento (segundos hasta alcanzar el destino). */
const INERCIA = 0.1;

export function EscenarioPortada({
  foto,
  pista,
  children,
}: {
  /** La foto grande de la casa. Sin foto, el escenario no se dibuja. */
  foto: { src: string; srcset?: string | null; alt: string };
  /** La seña de «baja» del pie. */
  pista?: string;
  /** El titular, con lo que lo acompaña. */
  children: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const riel = useRef<HTMLDivElement>(null);
  const escena = useRef<HTMLDivElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const imagen = useRef<HTMLImageElement>(null);
  const titulo = useRef<HTMLDivElement>(null);
  const velo = useRef<HTMLDivElement>(null);
  const seña = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elRaiz = raiz.current;
    const elRiel = riel.current;
    const elEscena = escena.current;
    if (!elRaiz || !elRiel || !elEscena) return;

    const menosMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cuadro = 0;
    let actual = 0;
    let destino = 0;
    let altoEscena = 0;
    let corriendo = false;

    const aplicar = (p: number) => {
      const elMarco = marco.current;
      const elImagen = imagen.current;
      if (!elMarco || !elImagen) return;
      const e = suave(0, 1, p);
      const inicio = encuadre(elRaiz.clientWidth || window.innerWidth);

      const ancho = inicio.ancho + (100 - inicio.ancho) * e;
      const alto = inicio.alto + (100 - inicio.alto) * e;
      const x = Math.max(0, (100 - ancho) / 2);
      const y = Math.max(0, (100 - alto) / 2);
      elMarco.style.clipPath = `inset(${y}% ${x}% ${y}% ${x}% round ${inicio.radio * (1 - e)}px)`;
      elImagen.style.transform = `scale(${ACERCAMIENTO + (1 - ACERCAMIENTO) * e})`;

      // El velo va al revés que en el original: fuerte al principio, porque es
      // cuando hay un titular blanco encima de una foto que puede ser clara
      // (medido: sobre la fachada blanca no se leía nada), y se aclara al
      // abrirse, cuando el texto ya se fue y lo que importa es la casa.
      if (velo.current) velo.current.style.opacity = `${1 - 0.55 * e}`;

      if (titulo.current) {
        const se_va = suave(0.4, 0.88, p);
        titulo.current.style.opacity = `${1 - se_va}`;
        titulo.current.style.transform = `translate3d(0, ${-28 * se_va}px, 0) scale(${1 + 0.06 * se_va})`;
      }
      if (seña.current) {
        const se_fue = suave(0, 0.12, p);
        seña.current.style.opacity = `${1 - se_fue}`;
        seña.current.style.transform = `translate3d(0, ${8 * se_fue}px, 0)`;
      }
    };

    const medir = () => {
      altoEscena = window.innerHeight;
      if (altoEscena <= 0) return;
      elEscena.style.height = `${altoEscena}px`;
      elRiel.style.height = `${altoEscena * (1 + RECORRIDO + SOSTENIDO)}px`;
    };

    const leer = () => entre(-elRiel.getBoundingClientRect().top / (altoEscena * RECORRIDO), 0, 1);

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
    };
  }, []);

  return (
    <div ref={raiz} className="escenario">
      <div ref={riel} className="escenario-riel">
        <div ref={escena} className="escenario-escena">
          <div ref={marco} className="escenario-marco">
            {/* Es el LCP de la portada: baja de inmediato y con prioridad. El
                tamaño se declara para que no salte el diseño al llegar. */}
            <img
              ref={imagen}
              className="escenario-foto"
              src={foto.src}
              srcSet={foto.srcset ?? undefined}
              sizes="100vw"
              alt={foto.alt}
              width={1600}
              height={1067}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              draggable={false}
            />
            <div ref={velo} aria-hidden className="escenario-velo" />
          </div>
          <div ref={titulo} className="escenario-titulo">
            {children}
          </div>
          {pista ? (
            <div ref={seña} aria-hidden className="escenario-sena">
              {pista}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
