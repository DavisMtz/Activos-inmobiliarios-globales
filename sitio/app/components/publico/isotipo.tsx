import { useId } from "react";

/**
 * El isotipo de la marca en línea, pieza por pieza (repo `DavisMtz/AIG-recursos`,
 * 16/09/2026). Va en línea y no en un `<img>` porque desde una imagen no se
 * puede tocar ninguna forma: así GSAP puede animar las estelas, la pierna, las
 * cintas y la ventana por separado (F2, paso del movimiento).
 *
 * Pesa 1.2 KB comprimido, así que cabe de sobra en el tope de la página.
 *
 * Dos cuidados que documenta el README de ese repo:
 * - Los degradados llevan `id`, y dos isotipos en la misma página chocarían:
 *   por eso el `id` sale de `useId()` y no del archivo.
 * - Las estelas «pegadas» terminan escondidas detrás de la pierna. Si la
 *   pierna se mueve sola, asoman sus puntas: se animan juntas.
 *
 * El símbolo es rojo sobre transparente, así que se lee igual sobre papel y
 * sobre los campos oscuros. El NOMBRE del logotipo sí es negro: sobre oscuro
 * va en tipografía, nunca el PNG ni el SVG completo invertido.
 */
/**
 * `quieto`: sin la coreografía de GSAP. Para el que está sobre el pliegue,
 * que ya entra con CSS: GSAP llega después del primer pintado y lo volvería a
 * esconder y a armar delante de quien ya lo estaba viendo.
 */
export function Isotipo({ className, quieto = false }: { className?: string; quieto?: boolean }) {
  // `useId` trae dos puntos; en un selector de CSS habría que escaparlos.
  const unico = useId().replace(/:/g, "");
  const cuerpo = `aig-cuerpo-${unico}`;
  const cintas = `aig-cintas-${unico}`;

  return (
    <svg
      viewBox="55 270 1089 659"
      className={className}
      role="img"
      aria-label="Activos Inmobiliarios Globales"
    >
      <defs>
        <linearGradient id={cuerpo} gradientUnits="userSpaceOnUse" x1="0" y1="272" x2="0" y2="927">
          <stop offset="0" stopColor="#F5515F" />
          <stop offset="1" stopColor="#A0051C" />
        </linearGradient>
        <linearGradient id={cintas} gradientUnits="userSpaceOnUse" x1="0" y1="272" x2="0" y2="776.33">
          <stop offset="0" stopColor="#F5515F" />
          <stop offset="1" stopColor="#A0051C" />
        </linearGradient>
      </defs>

      <g className="aig-isotipo" data-quieto={quieto || undefined}>
        {/* Cintas del techo: nacen en la cumbre y bajan. */}
        <g className="aig-cintas">
          <g className="aig-cinta aig-cinta-exterior">
            <path
              className="aig-franja aig-franja-exterior"
              fill={`url(#${cintas})`}
              d="M858.74 272H862.59L1141.61 775.99H1096.76L838.15 308.88Z"
            />
            <path
              className="aig-canto aig-canto-exterior"
              fill="#000000"
              d="M858.74 272H862.59L885.21 312.85L862.69 353.2L838.15 308.88Z"
            />
          </g>
          <g className="aig-cinta aig-cinta-interior">
            <path
              className="aig-franja aig-franja-interior"
              fill={`url(#${cintas})`}
              d="M820.49 340.52L1061.95 776.66H1015.45C914.88 776.66 879.72 728.45 859.47 691.87L742.4 480.41Z"
            />
            <path
              className="aig-canto aig-canto-interior"
              fill="#000000"
              d="M820.49 340.52L844.86 384.55L766.77 524.44L742.4 480.41Z"
            />
          </g>
        </g>

        {/* Estelas de velocidad, de arriba abajo. */}
        <g className="aig-estelas">
          <rect className="aig-estela aig-estela-pegada" data-banda="1" fill={`url(#${cuerpo})`} x="222.82" y="272" width="377.18" height="64.05" rx="32" />
          <rect className="aig-estela aig-estela-suelta" data-banda="3" fill={`url(#${cuerpo})`} x="57" y="399.5" width="231.94" height="64" rx="32" />
          <rect className="aig-estela aig-estela-pegada" data-banda="3" fill={`url(#${cuerpo})`} x="323.05" y="400.1" width="156.95" height="64.05" rx="32" />
          <rect className="aig-estela aig-estela-suelta" data-banda="5" fill={`url(#${cuerpo})`} x="123.07" y="526.12" width="124.62" height="64" rx="32" />
          <rect className="aig-estela aig-estela-pegada" data-banda="5" fill={`url(#${cuerpo})`} x="281.07" y="528.2" width="198.93" height="64.05" rx="32" />
        </g>

        {/* Pierna izquierda de la A, con las estelas recortadas en negativo. */}
        <path
          className="aig-pierna"
          fill={`url(#${cuerpo})`}
          fillRule="evenodd"
          d="M500.29 272H860.24L578.56 776.6C543.58 839.26 473.33 927 319.3 927H185.64A29.86 29.86 0 0 1 159.57 882.37L285.76 656.3H468.06A32 32 0 0 0 468.06 592.25H321.52L357.27 528.2H405.42A32 32 0 0 0 405.42 464.15H393.03L428.78 400.1H547.82A32 32 0 0 0 547.82 336.05H464.54ZM525.03 462.91H634.54A32 32 0 0 1 634.54 526.91H525.03A32 32 0 0 1 525.03 462.91Z"
        />

        {/* Ventana. */}
        <rect className="aig-ventana" fill="#000000" x="689.22" y="664.97" width="107.61" height="106.11" />
      </g>
    </svg>
  );
}
