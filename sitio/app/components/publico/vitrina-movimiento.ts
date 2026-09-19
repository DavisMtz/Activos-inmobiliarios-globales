/**
 * Cómo pasa la vitrina de la portada de una casa a otra (PLAN §10.4, D13:
 * «que se vea premium»). Lo carga `vitrina.tsx` con `import()` cuando la
 * página ya cargó y el héroe terminó de entrar, y comparte con `movimiento.ts`
 * el mismo trozo de `gsap`: no se baja dos veces ni cuenta en la carga inicial.
 *
 * Personalidad «premium» (skill `motion-design`): sin rebote, la salida más
 * corta que la entrada, y una sola idea, la del TELÓN de la bienvenida, que
 * aquí se corre de lado:
 *
 * 1. Los renglones de la casa que se va suben y se esconden (salida: ease-in).
 * 2. La casa nueva se descubre con una cortina (`clip-path`) que avanza en el
 *    sentido del cambio, con la curva del telón: `power3.inOut` ≈
 *    cubic-bezier(0.76, 0, 0.24, 1). Su foto llega corrida y un poco grande y
 *    se asienta (paralaje); la que se va cede hacia el otro lado
 *    (contramovimiento, un tercio de lo que viaja la nueva).
 * 3. Precio, nombre y lugar suben uno tras otro, cada uno desde abajo de su
 *    propio renglón, con la curva de entrada de todo el sitio: `expo.out` ≈
 *    `--ease-entrada`, cubic-bezier(0.16, 1, 0.3, 1).
 * 4. Mientras la casa está a la vista, su foto termina de asentarse despacio
 *    (capa ambiental, que no pide atención) y su barra se llena, lineal, porque
 *    es tiempo y no movimiento.
 *
 * Lo que no se negocia, y por qué:
 *
 * - **La diapositiva nunca se traslada.** La cortina es un `clip-path`, que no
 *   mueve la caja. Solo la foto se corre y escala, y nunca más del 6 % entre
 *   las dos cosas: la sonda de `verificar:f2` mide cajas y no recortes, y a
 *   390 px la vitrina tiene 32 px hasta el borde de la pantalla.
 * - **GSAP solo manda mientras algo se mueve.** Al terminar cada cambio borra
 *   lo que escribió (`clearProps`) y vuelve a mandar React con sus clases (qué
 *   casa se ve, qué barra va llena). Detenerlo en cualquier momento deja la
 *   vitrina entera, nunca a media cortina.
 * - **Nada de utilidades `scale-*` ni `translate-*` de Tailwind en lo que anima
 *   GSAP:** en Tailwind 4 son las propiedades CSS `scale` y `translate`, que se
 *   COMPONEN con el `transform` que escribe GSAP. Una barra con `scale-x-0`
 *   seguiría en cero aunque GSAP la llenara.
 */
import { gsap } from "gsap";

/** 1: la casa nueva entra por la derecha (la siguiente); -1: por la izquierda. */
export type Sentido = 1 | -1;

export type OpcionesCiclo = {
  /** La casa que se va; `null` cuando solo corre el tiempo de la que ya se ve. */
  sale: HTMLElement | null;
  entra: HTMLElement;
  sentido: Sentido;
  /** La barra que se llena; `null` si la casa la eligió alguien (no hay reloj). */
  relleno: HTMLElement | null;
  /** La barra de la casa que se va: se apaga mientras corre la cortina. */
  rellenoAnterior: HTMLElement | null;
  /** Segundos que tarda en llenarse la barra, desde que empieza la cortina. */
  permanencia: number;
  alTerminar: () => void;
};

/** Lo que el componente puede pedirle a un ciclo, sin saber que existe GSAP. */
export type Ciclo = {
  /** A media cortina no se congela: la termina y se detiene al asentarse. */
  pausar(): void;
  reanudar(): void;
  /** Termina la cortina al instante: la red de seguridad al ocultarse la pestaña. */
  asentar(): void;
  /** Lo detiene para siempre, con la cortina terminada y sin llamar a `alTerminar`. */
  matar(): void;
};

const CURVA_TELON = "power3.inOut";
const CURVA_ENTRADA = "expo.out";
const CURVA_SALIDA = "power2.in";

/** En el celular todo dura un 15 % menos (motion-design: 0.8–0.9× en pantallas chicas). */
const factorDeTiempo = (): number => (window.matchMedia("(max-width: 39.99rem)").matches ? 0.85 : 1);

function piezas(diapositiva: HTMLElement) {
  return {
    foto: diapositiva.querySelector<HTMLElement>("[data-foto]"),
    lineas: Array.from(diapositiva.querySelectorAll<HTMLElement>("[data-linea]")),
  };
}

export function crearCiclo(o: OpcionesCiclo): Ciclo {
  const f = factorDeTiempo();
  const linea = gsap.timeline({ paused: true, onComplete: () => o.alTerminar() });
  const inicio = o.sale ? 0.15 * f : 0;
  // Hasta aquí dura el cambio; después solo corre el tiempo de la casa.
  let reposo = 0;
  let pausarAlReposar = false;

  if (o.sale) {
    const sale = piezas(o.sale);
    const entra = piezas(o.entra);
    const telon = 1.1 * f;
    const foto = 1.5 * f;
    const texto = { inicio: 0.85 * f, duracion: 0.8 * f, escalon: 0.07 * f };
    reposo = Math.max(
      inicio + foto,
      texto.inicio + texto.duracion + texto.escalon * Math.max(0, entra.lineas.length - 1),
    );

    // El punto de partida se aplica YA, en el mismo instante en que React
    // cambió las clases: si esperara al primer cuadro, se vería un cuadro con
    // la casa nueva entera o con la vieja escondida.
    gsap.set(o.sale, { visibility: "visible" });
    gsap.set(o.entra, {
      visibility: "visible",
      clipPath: o.sentido === 1 ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)",
    });
    gsap.set(entra.lineas, { yPercent: 115 });

    // 1. Salida.
    linea.to(sale.lineas, { yPercent: -115, duration: 0.4 * f, ease: CURVA_SALIDA, stagger: 0.05 * f }, 0);
    if (o.rellenoAnterior) linea.to(o.rellenoAnterior, { opacity: 0, duration: 0.3 * f, ease: "power1.out" }, 0);

    // 2. La cortina, la foto que llega y la que cede.
    linea.to(o.entra, { clipPath: "inset(0% 0% 0% 0%)", duration: telon, ease: CURVA_TELON }, inicio);
    if (entra.foto) {
      // 3 % de corrimiento con 6 % de escala: la foto siempre cubre su marco.
      linea.fromTo(entra.foto, { xPercent: 3 * o.sentido }, { xPercent: 0, duration: foto, ease: CURVA_TELON }, inicio);
      linea.fromTo(
        entra.foto,
        { scale: 1.06 },
        { scale: 1, duration: Math.max(o.permanencia, reposo - inicio), ease: "power1.out" },
        inicio,
      );
    }
    if (sale.foto) linea.to(sale.foto, { xPercent: -4 * o.sentido, duration: telon, ease: CURVA_TELON }, inicio);

    // 3. Los renglones de la casa nueva.
    linea.to(
      entra.lineas,
      { yPercent: 0, duration: texto.duracion, ease: CURVA_ENTRADA, stagger: texto.escalon },
      texto.inicio,
    );

    // Asentado: se borra todo lo escrito en línea y manda otra vez React.
    // La foto que llegó NO: sigue asentándose mientras la casa está a la vista.
    linea.add(() => {
      gsap.set([o.sale, sale.foto, ...sale.lineas, o.rellenoAnterior].filter((x) => x !== null), { clearProps: "all" });
      gsap.set([o.entra, ...entra.lineas], { clearProps: "all" });
      if (pausarAlReposar && linea.duration() > reposo + 0.01) linea.pause();
    }, reposo);
  }

  // 4. El tiempo de la casa.
  if (o.relleno && o.permanencia > 0) {
    linea.fromTo(o.relleno, { scaleX: 0 }, { scaleX: 1, duration: o.permanencia, ease: "none" }, inicio);
  }

  const enCambio = () => o.sale !== null && linea.time() < reposo;
  // Un milésimo después del asentado, para que su limpieza corra seguro.
  const irAlReposo = () => linea.seek(reposo + 0.001, false);

  return {
    pausar() {
      if (enCambio()) {
        pausarAlReposar = true;
        linea.play();
      } else {
        linea.pause();
      }
    },
    reanudar() {
      pausarAlReposar = false;
      linea.play();
    },
    asentar() {
      if (enCambio()) irAlReposo();
    },
    matar() {
      linea.eventCallback("onComplete", null);
      if (enCambio()) irAlReposo();
      linea.kill();
    },
  };
}

/** Todo como lo dejó React: sin nada en línea (al apagar el movimiento o desmontar). */
export function limpiar(raiz: HTMLElement): void {
  const animadas = raiz.querySelectorAll("[data-diapositiva], [data-foto], [data-linea], [data-relleno]");
  if (!animadas.length) return;
  gsap.killTweensOf(animadas);
  gsap.set(animadas, { clearProps: "all" });
}
