/**
 * Movimiento del sitio público (PLAN §10.4, D13: «que se vea premium»).
 *
 * Las cinco reglas que NO se negocian, y por qué:
 *
 * 1. **Nada nace oculto en el HTML del servidor.** Todo se ve sin JavaScript;
 *    GSAP parte del estado visible con `fromTo` y solo esconde piezas mientras
 *    dura la entrada. Si GSAP no carga nunca, la página está completa.
 * 2. **Todo dentro de `prefers-reduced-motion: no-preference`.** Quien pide
 *    menos movimiento ve la página quieta, no una versión rota.
 * 3. **Red de seguridad:** con la pestaña en segundo plano el navegador congela
 *    `requestAnimationFrame` y una entrada se quedaría a medias, dejando medio
 *    logotipo invisible. Aquí ni siquiera arranca: se deja el estado final.
 * 4. **Nunca `transition-all`** en lo que anime GSAP (pelea con sus escrituras
 *    en línea y en Safari deja el elemento en cero).
 * 5. **GSAP entra con `import()` después de hidratar**, así no cuenta en la
 *    carga inicial: React 19 y React Router ya pesan ~113 KB gzip y el tope
 *    del sitio público es 150 KB.
 *
 * Las tres primeras ya dejaron contenido invisible en otros proyectos del
 * usuario (memoria `gsap-contenido-invisible`): esto no es precaución teórica.
 *
 * La coreografía del isotipo sale del README de `DavisMtz/AIG-recursos`, que
 * describe pieza por pieza qué movimiento le toca a cada forma.
 */

type Limpieza = () => void;

const SIN_MOVIMIENTO: Limpieza = () => {};

/** Coordenadas del SVG, no porcentajes: son las cumbres de cada cinta. */
const ORIGEN_CINTA_EXTERIOR = "860.7 272";
const ORIGEN_CINTA_INTERIOR = "820.5 340.5";

export async function animarSitioPublico(raiz: HTMLElement): Promise<Limpieza> {
  if (typeof window === "undefined") return SIN_MOVIMIENTO;

  // Regla 2 y 3, antes de bajar un solo byte de GSAP.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return SIN_MOVIMIENTO;
  if (document.hidden) return SIN_MOVIMIENTO;

  const [{ gsap }, { ScrollTrigger }] = await Promise.all([
    import("gsap"),
    import("gsap/ScrollTrigger"),
  ]);
  gsap.registerPlugin(ScrollTrigger);

  const mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    const buscar = <T extends Element>(selector: string): T[] =>
      Array.from(raiz.querySelectorAll<T>(selector));

    // ─── El isotipo, pieza por pieza ─────────────────────────────
    for (const isotipo of buscar<SVGGElement>(".aig-isotipo")) {
      const dentro = <T extends Element>(selector: string): T[] =>
        Array.from(isotipo.querySelectorAll<T>(selector));

      const linea = gsap.timeline({
        defaults: { ease: "power3.out" },
        scrollTrigger: { trigger: isotipo, start: "top 92%", once: true },
      });

      // Las estelas se estiran hacia la izquierda, escalonadas de arriba abajo.
      // Las «pegadas» terminan escondidas detrás de la pierna, así que van
      // juntas: si la pierna llegara después, se verían sus puntas.
      linea.fromTo(
        dentro(".aig-estela"),
        { scaleX: 0, transformOrigin: "100% 50%" },
        { scaleX: 1, duration: 0.55, stagger: 0.07 },
        0,
      );

      // La pierna entra siguiendo su propia diagonal, desde su pie.
      linea.fromTo(
        dentro(".aig-pierna"),
        { yPercent: 14, xPercent: -6, opacity: 0, transformOrigin: "0% 100%" },
        { yPercent: 0, xPercent: 0, opacity: 1, duration: 0.6 },
        0.1,
      );

      // Las cintas se desenrollan desde la cumbre: cada una tiene la suya, y va
      // en coordenadas del SVG (`svgOrigin`), no en porcentajes.
      linea.fromTo(
        dentro(".aig-franja-exterior"),
        { scaleY: 0, svgOrigin: ORIGEN_CINTA_EXTERIOR },
        { scaleY: 1, duration: 0.5 },
        0.2,
      );
      linea.fromTo(
        dentro(".aig-franja-interior"),
        { scaleY: 0, svgOrigin: ORIGEN_CINTA_INTERIOR },
        { scaleY: 1, duration: 0.5 },
        0.28,
      );

      // El canto es la cara lateral: aparece al final, como si la pieza girara
      // y enseñara su grosor.
      linea.fromTo(dentro(".aig-canto"), { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.55);

      // La ventana se «enciende».
      linea.fromTo(
        dentro(".aig-ventana"),
        { scale: 0, transformOrigin: "50% 50%" },
        { scale: 1, duration: 0.45, ease: "back.out(2.2)" },
        0.6,
      );
    }

    // ─── Entradas de sección ─────────────────────────────────────
    // Solo lo marcado a mano con `data-animar`: una entrada idéntica en cada
    // sección cansa y no dice nada.
    for (const elemento of buscar<HTMLElement>("[data-animar]")) {
      gsap.fromTo(
        elemento,
        { y: 26, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: { trigger: elemento, start: "top 88%", once: true },
        },
      );
    }

    // ─── Tarjetas, en tanda ──────────────────────────────────────
    const tarjetas = buscar<HTMLElement>("[data-animar-lista] > li");
    if (tarjetas.length) {
      ScrollTrigger.batch(tarjetas, {
        start: "top 90%",
        once: true,
        onEnter: (lote) =>
          gsap.fromTo(
            lote,
            { y: 24, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6, ease: "power3.out", stagger: 0.08, overwrite: true },
          ),
      });
    }
  });

  /**
   * Si la pestaña se esconde a media entrada, se fuerza el final: más vale la
   * página quieta y completa que media portada en blanco.
   */
  const alEsconderse = () => {
    if (document.hidden) {
      gsap.globalTimeline.progress(1);
      ScrollTrigger.getAll().forEach((disparador) => disparador.refresh());
    }
  };
  document.addEventListener("visibilitychange", alEsconderse);

  return () => {
    document.removeEventListener("visibilitychange", alEsconderse);
    // `revert` devuelve los estilos en línea que escribió GSAP: al cambiar de
    // página en el cliente, la siguiente no hereda un `opacity` a medias.
    mm.revert();
  };
}
