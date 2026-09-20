import type { ReactNode, SVGProps } from "react";
import type { ClaveDeDibujo } from "../../../shared/servicios";

/**
 * Los dibujos de la página de Servicios (pedido del 19/09/2026: «más visual»,
 * sin perder la lista editorial, que al dueño le gusta). La primera mano eran
 * iconos de 6rem y él pidió más: «más detalle o algo más compuesto y que estén
 * animados». Por eso son ESCENAS chicas, con dos grosores de línea y relleno de
 * papel, y cada una tiene un gesto propio que se repite.
 *
 * Son UNA familia, y lo que las hace de esta marca y no de cualquier
 * inmobiliaria sale del isotipo (`isotipo.tsx`):
 *
 * - **El suelo inclinado** lleva el ángulo de la pierna de la «A»: 61°, o sea
 *   0.554 de corrimiento por unidad de alto. Es un CAMPO de color y no un
 *   borde, que es como esta marca usa el rojo (`app.css`).
 * - **Las píldoras** son las estelas del logotipo (`rx` = media altura). Salen
 *   solo donde significan algo: las monedas del financiamiento, la voz del
 *   megáfono y las estelas de la casa de reserva.
 * - **La ventana cuadrada** del isotipo es la de todas las casas.
 * - **Tinta en línea y UNA pieza roja maciza** por dibujo, que es además la
 *   que cuenta la historia y la que se mueve: el letrero, el llavero, la
 *   moneda que llega, el sello, la respuesta, la voz.
 *
 * Todas comparten lienzo (200×150) y grosores, así los títulos de las tres
 * columnas quedan a la misma altura.
 *
 * **Cuatro capas, de atrás hacia delante:** el suelo, los rellenos de papel
 * (sin ellos el rosa se transparentaba a través de las casas y de la
 * escritura, y el objeto no se separaba del fondo), la tinta y la pieza roja.
 *
 * **Movimiento:** solo CSS (`.dibujo-*` y `vida-*` en `app.css`), porque van
 * sobre el pliegue: en la pantalla del dueño caben las seis, y GSAP llega 1-2 s
 * tarde y las volvería a esconder delante de quien ya las veía.
 * - Cada trazo lleva `pathLength={1}` para que un solo `@keyframes` dibuje
 *   cualquiera, mida lo que mida. Son todos `<path>` y no `<rect>`/`<circle>`:
 *   `pathLength` en las formas básicas es de SVG 2 y un teléfono viejo lo
 *   ignora.
 * - La pieza roja va en DOS grupos anidados: el de fuera (`dibujo-acento`) se
 *   posa una vez al entrar; el de dentro (`dibujo-vivo`) repite el gesto. Dos
 *   animaciones sobre el mismo `transform` del mismo elemento se pisarían.
 *
 * **Nada nace oculto:** el estado natural es el dibujo entero. La entrada solo
 * pone el estado inicial mientras corre (`backwards`), así que sin CSS, sin
 * JavaScript o con «menos movimiento» el dibujo simplemente está.
 *
 * Son decoración: el título de al lado ya dice qué servicio es, así que van
 * con `aria-hidden` y un lector de pantalla no los anuncia.
 */

const BLANCO = "#ffffff";
const ROJO = "var(--color-marca)";
const PAPEL = "var(--color-superficie)";

/** Un trazo de tinta: estructura en `trazos`, detalle en `finos`. */
const T = (props: SVGProps<SVGPathElement>) => <path pathLength={1} {...props} />;

/** Una píldora (la estela del isotipo): extremos de medio círculo. */
const pildora = (x: number, y: number, ancho: number, alto = 9): string => {
  const r = alto / 2;
  return `M${x + r} ${y}H${x + ancho - r}A${r} ${r} 0 0 1 ${x + ancho - r} ${y + alto}H${x + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
};

/** El canto estriado de una moneda vista de lado. */
const estrias = (x: number, y: number): string =>
  [11, 17, 23].map((dx) => `M${x + dx} ${y + 2.5}v4`).join("");

/**
 * Las monedas se apilan COMPARTIENDO canto (paso = alto): con un hueco menor
 * que el grosor del trazo, las dos líneas se montaban y salían bandas negras.
 */
const PILA_CHICA = [121, 112];
const PILA_GRANDE = [121, 112, 103, 94];
/** La que llega se posa justo encima del trazo de la última: 94 − 1.125 − 9. */
const MONEDA_QUE_LLEGA = 83.9;

/** 86 de alto × 0.554 = 47.6 de corrimiento: el ángulo del isotipo. */
const SUELO = "M24 130H150L198 44H72Z";
const PISO = "M14 130H186";

type Piezas = {
  /** El cuerpo de los objetos, en papel, para que se separen del suelo. */
  rellenos: string[];
  /** La estructura, en el orden en que se dibuja: primero lo grande. */
  trazos: ReactNode;
  /** El detalle fino: entra después, cuando la estructura ya se entiende. */
  finos: ReactNode;
  /** La pieza roja, ya con su gesto dentro. */
  acento: ReactNode;
};

const fino = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const DIBUJOS: Record<ClaveDeDibujo, Piezas> = {
  // La casa, con su chimenea y su jardín, y el letrero que se mece: «se vende».
  venta: {
    rellenos: ["M38 72L78 40L118 72V130H38Z", "M100 57.6V44H111V66.4Z"],
    trazos: (
      <>
        <T d={PISO} />
        <T d="M28 80L78 40L128 80" />
        <T d="M100 57.6V44H111V66.4" />
        <T d="M38 72V130" />
        <T d="M118 72V130" />
        <T d="M68 130V98H88V130" />
        <T d="M96 96H110V110H96Z" />
        <T d="M46 96H60V110H46Z" />
        <T d="M73 58H83V68H73Z" />
        <T d="M164 130V50" />
        <T d="M164 60H136" />
      </>
    ),
    finos: (
      <>
        <T d="M103 96V110M96 103H110" />
        <T d="M53 96V110M46 103H60" />
        <T d="M72 103H84V113H72Z" />
        <T d="M72 117H84V126H72Z" />
        <T d="M105.5 38c-3.5 -4 3.5 -7 0 -12" />
        <T d="M159 50H169" />
        <T d="M124 130A8 8 0 0 1 140 130" />
        <T d="M137 130A6 6 0 0 1 149 130" />
        <T d="M16 130A7 7 0 0 1 30 130" />
      </>
    ),
    acento: (
      <g className="dibujo-vivo">
        <path d="M141 60V67M153 60V67" {...fino} />
        <rect x="135" y="67" width="24" height="32" rx="2" fill={ROJO} />
        <path d="M140 76H154M140 83H154M140 90H149" fill="none" stroke={BLANCO} strokeWidth="2" strokeLinecap="round" />
      </g>
    ),
  },

  // La llave, camino de la puerta, y de llavero una casita que oscila.
  renta: {
    rellenos: ["M120 32H180V130H120Z", "M70 60A18 18 0 1 1 34 60A18 18 0 1 1 70 60Z"],
    trazos: (
      <>
        <T d={PISO} />
        <T d="M120 130V32H180V130" />
        <T d="M127 130V39H173V130" />
        <T d="M70 60A18 18 0 1 1 34 60A18 18 0 1 1 70 60Z" />
        <T d="M47.2 63.7A4.5 4.5 0 1 1 38.2 63.7A4.5 4.5 0 1 1 47.2 63.7Z" />
        <T d="M68.7 53.3L111.3 36" />
        <T d="M92.8 43.5L96.9 53.7" />
        <T d="M102.1 39.8L107.7 53.7" />
        <T d="M111.3 36L114.7 44.3" />
      </>
    ),
    finos: (
      <>
        <T d="M136 50H164V80H136Z" />
        <T d="M136 90H164V120H136Z" />
        <T d="M133.5 86a2 2 0 1 1 -4 0a2 2 0 1 1 4 0Z" />
        <T d="M131.5 91.5v3.5" />
      </>
    ),
    acento: (
      <g className="dibujo-vivo">
        <path d="M42.7 68C41 78 47 82 48 90" {...fino} />
        <path d="M48 88L64 101V126H32V101Z" fill={ROJO} />
        <rect x="43" y="106" width="10" height="10" fill={BLANCO} />
      </g>
    ),
  },

  // Monedas que suben, escalón por escalón, hasta la casa. La última, llega.
  financiamiento: {
    rellenos: [
      "M117 70L146 44L175 70V130H117Z",
      ...PILA_CHICA.map((y) => pildora(20, y, 34)),
      ...PILA_GRANDE.map((y) => pildora(62, y, 34)),
    ],
    trazos: (
      <>
        <T d={PISO} />
        {PILA_CHICA.map((y) => (
          <T key={`a${y}`} d={pildora(20, y, 34)} />
        ))}
        {PILA_GRANDE.map((y) => (
          <T key={`b${y}`} d={pildora(62, y, 34)} />
        ))}
        <T d="M108 78L146 44L184 78" />
        <T d="M117 70V130" />
        <T d="M175 70V130" />
        <T d="M138 130V100H154V130" />
        <T d="M16 62L40 50L58 56L96 30" />
        <T d="M84 30H96V42" />
      </>
    ),
    finos: (
      <>
        {PILA_CHICA.map((y) => (
          <T key={`a${y}`} d={estrias(20, y)} />
        ))}
        {PILA_GRANDE.map((y) => (
          <T key={`b${y}`} d={estrias(62, y)} />
        ))}
        <T d="M141 60H151V70H141Z" />
        <T d="M160 98H170V108H160Z" />
        <T d="M124 98H134V108H124Z" />
      </>
    ),
    acento: (
      <g className="dibujo-vivo">
        <path d={pildora(62, MONEDA_QUE_LLEGA, 34)} fill={ROJO} />
        <path d={estrias(62, MONEDA_QUE_LLEGA)} fill="none" stroke={BLANCO} strokeWidth="1.5" strokeLinecap="round" />
      </g>
    ),
  },

  // La escritura: sujeta con su clip, firmada, y el sello que la estampa.
  tramites: {
    // La hoja de atrás solo asoma por la derecha y por abajo: su relleno es
    // esa «L» y nada más, o sale un rectángulo blanco junto a la esquina doblada.
    rellenos: ["M134 50H142V138H60V130H134Z", "M52 20H110L134 44V130H52Z"],
    trazos: (
      <>
        <T d="M134 50H142V138H60V130" />
        <T d="M52 20H110L134 44V130H52Z" />
        <T d="M110 20V44H134" />
        <T d="M64 38H98" />
      </>
    ),
    finos: (
      <>
        <T d="M64 56H122" />
        <T d="M64 66H122" />
        <T d="M64 76H122" />
        <T d="M64 86H104" />
        <T d="M64 116H104" />
        <T d="M66 112q4 -11 8 -2t8 0t8 -3t8 2" />
        <T d="M60 12V30a4 4 0 0 0 8 0V16a2.5 2.5 0 0 0 -5 0V28" />
      </>
    ),
    acento: (
      <g className="dibujo-vivo">
        <circle className="dibujo-anillo" cx="130" cy="108" r="21" fill="none" stroke={ROJO} strokeWidth="1.75" />
        <circle cx="130" cy="108" r="16" fill={ROJO} />
        <path d="M122 108l6 6l10 -12" fill="none" stroke={BLANCO} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  },

  // El cliente pregunta; el asesor, con su diadema, ya le está contestando.
  asesoria: {
    rellenos: [
      "M104 16H172A12 12 0 0 1 184 28V50A12 12 0 0 1 172 62H166L168 76L152 62H104A12 12 0 0 1 92 50V28A12 12 0 0 1 104 16Z",
      "M48 94A10 10 0 1 1 28 94A10 10 0 1 1 48 94Z",
      "M16 130C16 114 26 109 38 109C50 109 60 114 60 130Z",
      "M173 98A9 9 0 1 1 155 98A9 9 0 1 1 173 98Z",
      "M144 130C144 116 153 111 164 111C175 111 184 116 184 130Z",
    ],
    trazos: (
      <>
        <T d={PISO} />
        <T d="M48 94A10 10 0 1 1 28 94A10 10 0 1 1 48 94Z" />
        <T d="M16 130C16 114 26 109 38 109C50 109 60 114 60 130" />
        <T d="M173 98A9 9 0 1 1 155 98A9 9 0 1 1 173 98Z" />
        <T d="M144 130C144 116 153 111 164 111C175 111 184 116 184 130" />
        <T d="M104 16H172A12 12 0 0 1 184 28V50A12 12 0 0 1 172 62H166L168 76L152 62H104A12 12 0 0 1 92 50V28A12 12 0 0 1 104 16Z" />
      </>
    ),
    finos: (
      <>
        <T d="M106 32H170" />
        <T d="M106 44H150" />
        <T d="M26.5 94A11.5 11.5 0 0 1 49.5 94" />
        <T d="M49.5 95q2 9 -8 9" />
      </>
    ),
    acento: (
      <g className="dibujo-vivo">
        <path
          d="M68 56H112A12 12 0 0 1 124 68V82A12 12 0 0 1 112 94H82L58 108L68 94A12 12 0 0 1 56 82V68A12 12 0 0 1 68 56Z"
          fill={ROJO}
        />
        <circle className="dibujo-punto" cx="78" cy="75" r="3.2" fill={BLANCO} />
        <circle className="dibujo-punto" cx="90" cy="75" r="3.2" fill={BLANCO} />
        <circle className="dibujo-punto" cx="102" cy="75" r="3.2" fill={BLANCO} />
      </g>
    ),
  },

  // El megáfono, y de voz las estelas del logotipo, que salen una tras otra.
  promocion: {
    rellenos: [
      "M30 64H50L112 36A6 43 0 0 1 112 122L50 94H30A3 3 0 0 1 27 91V67A3 3 0 0 1 30 64Z",
      "M36 94V114H46V94Z",
    ],
    trazos: (
      <>
        <T d="M30 64H50V94H30A3 3 0 0 1 27 91V67A3 3 0 0 1 30 64Z" />
        <T d="M50 64L112 36" />
        <T d="M50 94L112 122" />
        <T d="M112 36A6 43 0 0 1 112 122A6 43 0 0 1 112 36Z" />
        <T d="M36 94V114H46V94" />
      </>
    ),
    finos: (
      <>
        <T d="M33 72H47" />
        <T d="M33 79H47" />
        <T d="M33 86H47" />
        <T d="M60 64.5V93.5" />
        <T d="M152 28v9M147.5 32.5h9" />
        <T d="M172 116v7M168.5 119.5h7" />
      </>
    ),
    acento: (
      <g className="dibujo-vivo dibujo-ondas">
        <g>
          <path d={pildora(126, 52, 34)} fill={ROJO} />
        </g>
        <g>
          <path d={pildora(126, 74, 48)} fill={ROJO} />
        </g>
        <g>
          <path d={pildora(126, 96, 26)} fill={ROJO} />
        </g>
      </g>
    ),
  },

  // La de reserva: la casa del isotipo, con sus estelas y su ventana encendida.
  casa: {
    rellenos: ["M74 72.1L112 42L150 72.1V130H74Z", "M132 57.8V46H143V66.5Z"],
    trazos: (
      <>
        <T d={PISO} />
        <T d="M64 80L112 42L160 80" />
        <T d="M132 57.8V46H143V66.5" />
        <T d="M74 72.1V130" />
        <T d="M150 72.1V130" />
        <T d="M86 130V98H106V130" />
        <T d={pildora(14, 70, 44)} />
        <T d={pildora(32, 88, 28)} />
        <T d={pildora(20, 106, 40)} />
      </>
    ),
    finos: (
      <>
        <T d="M90 103H102V113H90Z" />
        <T d="M90 117H102V126H90Z" />
        <T d="M107 60H117V70H107Z" />
        <T d="M137.5 40c-3.5 -4 3.5 -7 0 -12" />
        <T d="M156 130A8 8 0 0 1 172 130" />
      </>
    ),
    acento: (
      <g className="dibujo-vivo">
        <rect x="118" y="92" width="20" height="20" fill={ROJO} />
        <path d="M128 92V112M118 102H138" fill="none" stroke={BLANCO} strokeWidth="1.5" />
      </g>
    ),
  },
};

export function DibujoDeServicio({ clave, className }: { clave: ClaveDeDibujo; className?: string }) {
  const { rellenos, trazos, finos, acento } = DIBUJOS[clave];
  return (
    <svg
      viewBox="0 0 200 150"
      aria-hidden="true"
      focusable="false"
      data-dibujo={clave}
      className={`dibujo-servicio text-tinta ${className ?? ""}`}
    >
      <path className="dibujo-suelo" d={SUELO} fill="var(--color-marca-suave)" />
      <g className="dibujo-rellenos" fill={PAPEL}>
        {rellenos.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g className="dibujo-trazos" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
        {trazos}
      </g>
      <g className="dibujo-trazos dibujo-finos" {...fino}>
        {finos}
      </g>
      <g className="dibujo-acento">{acento}</g>
    </svg>
  );
}
