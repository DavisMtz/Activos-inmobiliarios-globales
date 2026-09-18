import { Isotipo } from "./isotipo";

/**
 * Bienvenida de la portada: un telón de tinta donde el isotipo se arma pieza
 * por pieza, y que luego se levanta. La coreografía vive en `app.css`
 * (`.bienvenida`), en CSS y no en GSAP, por las mismas razones que la entrada
 * del héroe: corre desde el primer pintado y sin JavaScript.
 *
 * Lo que la hace barata, medido en la portada:
 * - **La página ya está pintada debajo.** El titular es el LCP y Chrome no
 *   descuenta lo tapado, solo lo transparente: el telón no lo retrasa.
 * - **El telón no recibe clics** (`pointer-events: none`) y dura ~1.6 s.
 * - **Una vez por sesión.** El guion de adentro corre al leerse el HTML, antes
 *   del primer pintado: si esta pestaña ya la vio, marca el telón con
 *   `data-vista` y el CSS no lo enseña. Sin JavaScript sale siempre, y con
 *   «menos movimiento», nunca.
 *
 * Se monta desde el marco solo cuando la primera página que se abre es la
 * portada; volver a `/` navegando dentro del sitio no la repite.
 */
const MARCAR_SI_YA_SE_VIO = `(function(){var t=document.currentScript&&document.currentScript.parentElement;if(!t)return;try{if(sessionStorage.getItem("aig:bienvenida")){t.setAttribute("data-vista","")}else{sessionStorage.setItem("aig:bienvenida","1")}}catch(e){}})();`;

export function Bienvenida({ nombreNegocio }: { nombreNegocio: string }) {
  return (
    <div
      aria-hidden="true"
      // El guion de adentro le pone `data-vista` antes de hidratar.
      suppressHydrationWarning
      className="bienvenida campo-oscuro pointer-events-none fixed inset-0 z-[60] flex-col items-center justify-center bg-tinta"
    >
      <script dangerouslySetInnerHTML={{ __html: MARCAR_SI_YA_SE_VIO }} />
      <div className="bienvenida-contenido flex flex-col items-center gap-5 px-6 text-center">
        <Isotipo quieto className="h-20 w-auto sm:h-24" />
        <div className="bienvenida-nombre">
          <p className="font-display text-seccion text-white">{nombreNegocio}</p>
          <p className="mt-2 text-sobre-oscuro-suave">Donde cada propiedad cuenta una historia</p>
        </div>
      </div>
      {/* El filo del telón, en el rojo de la marca: se ve pasar al levantarse. */}
      <span className="absolute inset-x-0 bottom-0 h-1 bg-marca" />
    </div>
  );
}
