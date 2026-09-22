import { useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  DIAS_CORTOS,
  DIAS_LARGOS,
  cifra,
  marcaDeEje,
  nombreDePunto,
  porcentaje,
  textoDeCambio,
  textoPorcentaje,
  topeBonito,
  type Cubeta,
} from "./cifras";

export { cifra, fechaCorta, type Cubeta } from "./cifras";

/**
 * Las gráficas del panel (Métricas, 21/09/2026). Hechas a mano y sin
 * biblioteca: son unas cuantas barras y una línea, y cualquier biblioteca de
 * dibujo pesaría más que la pantalla entera.
 *
 * - **Se pintan en el servidor** y se leen sin JavaScript: las marcas son HTML
 *   y SVG con sus medidas en porcentaje, cada gráfica trae su tabla en un
 *   `<details>` y cada marca su `title`. El JavaScript solo agrega el globo con
 *   las cifras al pasar el dedo o el ratón (y las flechas del teclado).
 * - **Color con oficio, no con gusto** (skill `dataviz`, validado con su
 *   `validate_palette.js` contra el blanco de las tarjetas): la TINTA cuenta lo
 *   que se ve, el ROJO de la marca lo que se convierte en contacto, el gris es
 *   contexto (el catálogo, lo que no cuenta) y los pasos de un proceso van en
 *   una rampa de un solo tono. El rojo claro de la rampa da 2.46:1, por encima
 *   del 2:1 que se exige a una marca ordinal.
 * - **Marcas delgadas:** barras de 12 px con la punta redonda (4 px) y la base
 *   recta, línea de 2 px, rejilla de un pelo. Los números van en tinta, nunca
 *   del color del dato.
 * - Nada se mueve al entrar (el panel no lleva movimiento de lucimiento,
 *   `routes/panel/marco.tsx`); solo el cambio de 150 ms al señalar una marca.
 *
 * Como todo lo del panel, aquí no entra nada de `components/publico`
 * (criterio 8 de F3).
 */

// ─── Color ────────────────────────────────────────────────────────

export const COLOR = {
  tinta: "#111111",
  rojo: "#a0051c",
  /** El catálogo, lo de antes: lo que se compara pero no es la noticia. */
  contexto: "#cdc3bb",
  /** Una celda sin nada: el papel del panel. */
  vacio: "#f1ede9",
  guia: "#e6e0dc",
} as const;

/** Del prospecto nuevo al cerrado. Un solo tono, de claro a oscuro (validado como rampa ordinal). */
export const RAMPA_ROJA = ["#e38d98", "#c9384d", "#a0051c", "#6b0413"] as const;

/** Mapa de calor: de casi papel a casi tinta. Secuencial: el paso más claro puede fundirse con el fondo. */
export const RAMPA_TINTA = ["#e3dcd6", "#c2b6ad", "#978a81", "#6a5e57", "#3f3632"] as const;

// ─── Tabla gemela ─────────────────────────────────────────────────

/**
 * La misma información en una tabla, plegada. Es la versión accesible de cada
 * gráfica (y la que se lee sin JavaScript con los números exactos).
 */
export function TablaGemela({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="group mt-4 border-t border-linea pt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg py-1 text-sm font-bold text-texto-suave transition-colors hover:text-marca [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90">
          <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Ver los números
        <span className="sr-only">: {titulo}</span>
      </summary>
      <div className="mt-3 max-h-96 overflow-auto">{children}</div>
    </details>
  );
}

const CELDA = "px-2 py-1.5 text-right tabular-nums";
const CABEZA = "px-2 py-1.5 text-right font-bold";

// ─── El globo ─────────────────────────────────────────────────────

/** Mide 12rem; se pega a la orilla en vez de salirse de la tarjeta. */
function Globo({ x, arriba = "0.5rem", children }: { x: number; arriba?: string; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 w-48 rounded-xl border border-linea bg-superficie px-3 py-2 text-sm shadow-alzada"
      style={{ left: `clamp(0px, calc(${x}% - 6rem), calc(100% - 12rem))`, top: arriba }}
    >
      {children}
    </div>
  );
}

/** Un renglón del globo: primero la cifra, luego el nombre (el que mira ya sabe qué serie es). */
function RenglonDeGlobo({ color, nombre, valor }: { color: string; nombre: string; valor: ReactNode }) {
  return (
    <p className="flex items-center gap-2 leading-snug">
      <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-extrabold text-tinta tabular-nums">{valor}</span>
      <span className="text-texto-suave">{nombre}</span>
    </p>
  );
}

// ─── Chispa (la tendencia dentro de una tarjeta) ──────────────────

export function Chispa({ valores, color = COLOR.tinta }: { valores: number[]; color?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (valores.length < 2) return null;
  const tope = Math.max(...valores, 1);
  const n = valores.length;
  const y = (v: number) => 28 - (v / tope) * 26;
  const linea = valores.map((v, i) => `${i === 0 ? "M" : "L"}${i} ${y(v).toFixed(2)}`).join(" ");
  const ultimo = valores[n - 1];
  return (
    <div aria-hidden className="relative mt-3 h-8">
      <svg viewBox={`0 0 ${n - 1} 30`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`chispa-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.14} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`${linea} L${n - 1} 30 L0 30 Z`} fill={`url(#chispa-${id})`} />
        <path d={linea} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.55} />
      </svg>
      {/* El punto de hoy, en HTML: dentro de un SVG estirado saldría ovalado. */}
      <span
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-superficie"
        style={{ left: "100%", top: `${(y(ultimo) / 30) * 100}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Tarjeta de cifra ─────────────────────────────────────────────

function Cambio({ valor, anterior, periodo }: { valor: number; anterior: number; periodo: string }) {
  const { texto, sentido } = textoDeCambio(valor, anterior);
  const estilo = sentido === "sube" ? "text-exito" : sentido === "baja" ? "text-aviso" : "text-texto-suave";
  return (
    <p className={`mt-1 flex items-start gap-1 text-sm font-semibold ${estilo}`}>
      {sentido === "igual" ? null : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${sentido === "baja" ? "rotate-180" : ""}`}>
          <path d="M12 19V5m-6 6 6-6 6 6" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span>
        {texto} {periodo}
      </span>
    </p>
  );
}

export function Tarjeta({
  titulo,
  valor,
  anterior,
  periodo,
  serie,
  nota,
  color = COLOR.tinta,
  destacada,
}: {
  titulo: string;
  valor: number;
  /** Lo mismo en el periodo anterior; sin él no se dice nada del cambio. */
  anterior?: number | null;
  /** «los 30 días anteriores». */
  periodo?: string;
  serie?: number[];
  nota?: ReactNode;
  color?: string;
  destacada?: boolean;
}) {
  return (
    <div className={`flex flex-col rounded-2xl border p-4 sm:p-5 ${destacada ? "border-marca/30 bg-marca-suave" : "border-linea bg-superficie"}`}>
      <p className={`text-sm font-bold ${destacada ? "text-marca-oscuro" : "text-texto-suave"}`}>{titulo}</p>
      {/* Cifra grande en figuras proporcionales: `tabular-nums` separa los dígitos de más. */}
      <p className={`mt-1 text-4xl leading-none font-extrabold ${destacada ? "text-marca-oscuro" : "text-tinta"}`}>{cifra(valor)}</p>
      {anterior !== undefined && anterior !== null && periodo ? (
        <Cambio valor={valor} anterior={anterior} periodo={periodo} />
      ) : null}
      {nota ? <p className={`mt-1 text-sm ${destacada ? "text-marca-oscuro" : "text-texto-suave"}`}>{nota}</p> : null}
      {serie ? (
        <div className="mt-auto">
          <Chispa valores={serie} color={color} />
        </div>
      ) : null}
    </div>
  );
}

/** Una parte contra su total, en una pista del mismo tono: «31 de 188». */
export function Medidor({ valor, total, color = COLOR.tinta }: { valor: number; total: number; color?: string }) {
  const lleno = Math.min(100, porcentaje(valor, total));
  return (
    <div aria-hidden className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: COLOR.vacio }}>
      <div className="h-full rounded-full" style={{ width: `${lleno}%`, backgroundColor: color, minWidth: valor > 0 ? "0.5rem" : 0 }} />
    </div>
  );
}

// ─── La serie en el tiempo ────────────────────────────────────────

export type PuntoDeSerie = {
  desde: string;
  hasta: string;
  vistas: number;
  whatsapp: number;
  telefono: number;
  prospectos: number;
};

const contactosDe = (p: PuntoDeSerie) => p.whatsapp + p.telefono + p.prospectos;

/** Cómo se llama en el eje el último punto, que siempre está a medias. */
const EN_CURSO: Record<Cubeta, string> = { dia: "Hoy", semana: "Esta semana", mes: "Este mes" };

/**
 * Vistas arriba (área de tinta) y contactos abajo (columnas rojas), con el
 * mismo eje de fechas y UN solo eje de cantidad cada una: son escalas que no
 * se parecen (cientos contra unos cuantos) y dos ejes en una misma gráfica
 * inventan una relación que no está en los datos.
 *
 * Un solo globo para las dos: al señalar un día salen sus vistas y sus
 * contactos, se esté encima de la línea o no.
 */
export function SerieEnElTiempo({
  puntos,
  cubeta,
  comercial,
  conTelefono,
}: {
  puntos: PuntoDeSerie[];
  cubeta: Cubeta;
  /** Sin permiso comercial (contenido) no hay renglón de contactos. */
  comercial: boolean;
  conTelefono: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [activo, setActivo] = useState<number | null>(null);
  const n = puntos.length;
  if (n === 0) return null;

  const topeVistas = topeBonito(Math.max(...puntos.map((p) => p.vistas)));
  const topeContactos = topeBonito(Math.max(...puntos.map(contactosDe)));
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const yVistas = (v: number) => 100 - (v / topeVistas) * 100;

  const vertice = (p: PuntoDeSerie, i: number) => `${(i + 0.5).toFixed(2)} ${yVistas(p.vistas).toFixed(2)}`;
  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${vertice(p, i)}`).join(" ");
  const area = `M0.5 100 ${linea.replace(/^M/, "L")} L${(n - 0.5).toFixed(2)} 100 Z`;
  // El último punto siempre va a medias (hoy, esta semana, este mes): su tramo
  // va punteado, que es como se lee «todavía no termina». Entero, la última
  // semana de «Todo» se desplomaba como si el sitio se hubiera caído.
  const lineaCerrada = puntos.slice(0, -1).map((p, i) => `${i === 0 ? "M" : "L"}${vertice(p, i)}`).join(" ");
  const tramoEnCurso = n > 1 ? `M${vertice(puntos[n - 2], n - 2)} L${vertice(puntos[n - 1], n - 1)}` : "";

  const totalVistas = puntos.reduce((suma, p) => suma + p.vistas, 0);
  const pico = puntos.reduce((mejor, p, i) => (p.vistas > puntos[mejor].vistas ? i : mejor), 0);

  // Marcas del eje: todas si caben, si no unas cinco repartidas (primera y última siempre).
  const cuantasMarcas = n <= 8 ? n : 5;
  const marcas = [...new Set(Array.from({ length: cuantasMarcas }, (_, k) => Math.round((k * (n - 1)) / Math.max(1, cuantasMarcas - 1))))];

  const elegir = (evento: PointerEvent<HTMLDivElement>) => {
    const caja = evento.currentTarget.getBoundingClientRect();
    const i = Math.floor(((evento.clientX - caja.left) / caja.width) * n);
    setActivo(Math.max(0, Math.min(n - 1, i)));
  };
  const conTeclas = (evento: KeyboardEvent<HTMLDivElement>) => {
    const actual = activo ?? n - 1;
    const saltos: Record<string, number> = { ArrowLeft: actual - 1, ArrowRight: actual + 1, Home: 0, End: n - 1 };
    const siguiente = saltos[evento.key];
    if (siguiente === undefined) return;
    evento.preventDefault();
    setActivo(Math.max(0, Math.min(n - 1, siguiente)));
  };

  const marcado = activo === null ? null : puntos[activo];
  const resumen = `Fichas vistas ${cubeta === "dia" ? "por día" : cubeta === "semana" ? "por semana" : "por mes"}: ${cifra(totalVistas)} en total${
    totalVistas > 0 ? `; lo más alto fue ${nombreDePunto(puntos[pico], cubeta)}, con ${cifra(puntos[pico].vistas)}` : ""
  }.`;

  return (
    <figure className="m-0">
      <div
        role="group"
        aria-label={resumen}
        tabIndex={0}
        onPointerMove={elegir}
        onPointerDown={elegir}
        onPointerLeave={() => setActivo(null)}
        onFocus={() => setActivo((previo) => previo ?? n - 1)}
        onBlur={() => setActivo(null)}
        onKeyDown={conTeclas}
        className="relative ml-8 touch-pan-y rounded-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-marca focus-visible:ring-offset-4"
      >
        {/* Las cifras del eje van en un margen propio (`ml-8`), fuera del área:
            dentro, la línea pasaba por encima del «50» (visto a 390 px). */}
        {/* ── Vistas ── */}
        <div className="relative h-44 sm:h-56">
          {[1, 0.5, 0].map((parte) => (
            <div key={parte} className="absolute inset-x-0 border-t" style={{ top: `${(1 - parte) * 100}%`, borderColor: COLOR.guia }}>
              <span aria-hidden className="absolute right-full mr-2 -translate-y-1/2 text-xs text-texto-suave tabular-nums">
                {Number.isInteger(topeVistas * parte) ? cifra(topeVistas * parte) : ""}
              </span>
            </div>
          ))}
          <svg viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={COLOR.tinta} stopOpacity={0.16} />
                <stop offset="1" stopColor={COLOR.tinta} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {n > 1 ? (
              <>
                <path d={area} fill={`url(#area-${id})`} />
                {n > 2 ? (
                  <path d={lineaCerrada} fill="none" stroke={COLOR.tinta} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                ) : null}
                <path d={tramoEnCurso} fill="none" stroke={COLOR.tinta} strokeWidth={2} strokeLinecap="round" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
              </>
            ) : null}
          </svg>
          {/* El día marcado: la guía vertical y el punto, en HTML (dentro del SVG estirado saldría ovalado). */}
          {marcado ? (
            <div aria-hidden className="absolute inset-y-0 w-px bg-tinta/25" style={{ left: `${x(activo!)}%` }} />
          ) : null}
          {(marcado ? [activo!] : n === 1 || totalVistas > 0 ? [pico] : []).map((i) => (
            <span
              key={i}
              aria-hidden
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-tinta ring-2 ring-superficie"
              style={{ left: `${x(i)}%`, top: `${yVistas(puntos[i].vistas)}%` }}
            />
          ))}
          {/* El pico lleva su cifra: es el único punto con etiqueta (el resto, en el globo y la tabla). */}
          {!marcado && totalVistas > 0 ? (
            <span
              aria-hidden
              className="absolute pb-2 text-xs font-extrabold whitespace-nowrap text-tinta tabular-nums"
              style={{
                left: `${x(pico)}%`,
                top: `${yVistas(puntos[pico].vistas)}%`,
                transform: `translate(${x(pico) > 85 ? "-100%" : x(pico) < 15 ? "0" : "-50%"}, -100%)`,
              }}
            >
              {cifra(puntos[pico].vistas)}
            </span>
          ) : null}
        </div>

        {/* ── Contactos ── */}
        {comercial ? (
          <div className="mt-4">
            <p className="mb-1 flex items-center gap-2 text-xs font-bold text-texto-suave">
              <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: COLOR.rojo }} />
              Contactos
            </p>
            <div className="relative h-14 border-b" style={{ borderColor: COLOR.guia }}>
              <span aria-hidden className="absolute top-0 right-full mr-2 -translate-y-1/2 text-xs text-texto-suave tabular-nums">
                {cifra(topeContactos)}
              </span>
              <div aria-hidden className="absolute inset-x-0 top-0 border-t" style={{ borderColor: COLOR.guia }} />
              <div className="absolute inset-0 flex items-end">
                {puntos.map((p, i) => {
                  const valor = contactosDe(p);
                  return (
                    <div key={p.desde} className="flex h-full flex-1 items-end justify-center px-px">
                      {valor > 0 ? (
                        <div
                          className={`w-full max-w-6 rounded-t-[4px] transition-opacity duration-150 ${
                            activo !== null && activo !== i ? "opacity-40" : i === n - 1 && activo === null ? "opacity-55" : ""
                          }`}
                          style={{ height: `${Math.max(8, (valor / topeContactos) * 100)}%`, backgroundColor: COLOR.rojo }}
                          title={`${nombreDePunto(p, cubeta)}: ${cifra(valor)} ${valor === 1 ? "contacto" : "contactos"}`}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {marcado ? <div aria-hidden className="absolute inset-y-0 w-px bg-tinta/25" style={{ left: `${x(activo!)}%` }} /> : null}
            </div>
          </div>
        ) : null}

        {/* ── Fechas ── */}
        <div aria-hidden className="relative mt-2 h-5 text-xs text-texto-suave">
          {/* La primera se ancla a la orilla izquierda y la última a la derecha:
              centradas en su punto, a 390 px se salían de la tarjeta. */}
          {marcas.map((i) => (
            <span
              key={i}
              className="absolute top-0 whitespace-nowrap tabular-nums"
              style={
                n > 1 && i === 0
                  ? { left: 0 }
                  : n > 1 && i === n - 1
                    ? { right: 0 }
                    : { left: `${x(i)}%`, transform: "translateX(-50%)" }
              }
            >
              {i === n - 1 && n > 1 ? EN_CURSO[cubeta] : marcaDeEje(puntos[i], cubeta)}
            </span>
          ))}
        </div>

        {marcado ? (
          <Globo x={x(activo!)}>
            <p className="mb-1 font-bold text-tinta first-letter:uppercase">
              {nombreDePunto(marcado, cubeta)}
              {activo === n - 1 ? <span className="font-semibold text-texto-suave"> · en curso</span> : null}
            </p>
            <RenglonDeGlobo color={COLOR.tinta} nombre={marcado.vistas === 1 ? "vista" : "vistas"} valor={cifra(marcado.vistas)} />
            {comercial ? (
              <>
                <RenglonDeGlobo color={COLOR.rojo} nombre="por WhatsApp" valor={cifra(marcado.whatsapp)} />
                {conTelefono ? <RenglonDeGlobo color={COLOR.rojo} nombre="por teléfono" valor={cifra(marcado.telefono)} /> : null}
                <RenglonDeGlobo color={COLOR.rojo} nombre={marcado.prospectos === 1 ? "formulario" : "formularios"} valor={cifra(marcado.prospectos)} />
              </>
            ) : null}
          </Globo>
        ) : null}
        <p aria-live="polite" className="sr-only">
          {marcado
            ? `${nombreDePunto(marcado, cubeta)}: ${cifra(marcado.vistas)} vistas${
                comercial ? `, ${cifra(contactosDe(marcado))} contactos` : ""
              }`
            : ""}
        </p>
      </div>

      <TablaGemela titulo="la serie en el tiempo">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-texto-suave">
              <th scope="col" className="py-1.5 pr-2 text-left font-bold">
                {cubeta === "dia" ? "Día" : cubeta === "semana" ? "Semana" : "Mes"}
              </th>
              <th scope="col" className={CABEZA}>
                Vistas
              </th>
              {comercial ? (
                <>
                  <th scope="col" className={CABEZA}>
                    WhatsApp
                  </th>
                  {conTelefono ? (
                    <th scope="col" className={CABEZA}>
                      Teléfono
                    </th>
                  ) : null}
                  <th scope="col" className={CABEZA}>
                    Formularios
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {[...puntos].reverse().map((p) => (
              <tr key={p.desde}>
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-texto first-letter:uppercase">
                  {nombreDePunto(p, cubeta)}
                </th>
                <td className={`${CELDA} font-bold text-tinta`}>{cifra(p.vistas)}</td>
                {comercial ? (
                  <>
                    <td className={CELDA}>{cifra(p.whatsapp)}</td>
                    {conTelefono ? <td className={CELDA}>{cifra(p.telefono)}</td> : null}
                    <td className={CELDA}>{cifra(p.prospectos)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </TablaGemela>
    </figure>
  );
}

// ─── Lo que hay contra lo que se ve ───────────────────────────────

export type FilaDeComparacion = { clave: string; etiqueta: string; catalogo: number; vistas: number };

/**
 * Dos barras por renglón, las dos en PORCENTAJE de su propio total: la parte
 * del catálogo que es de ese grupo (gris) contra la parte de las vistas que se
 * llevó (tinta). Así «terrenos: 3 % del catálogo, 9 % de las vistas» se lee de
 * un vistazo, y mezclar casas con vistas en un solo eje no tendría sentido.
 *
 * La señal «se busca más de lo que hay» solo sale con vistas suficientes (30 en
 * el periodo y 5 en el grupo): con menos, cualquier casa vista dos veces
 * parecería una tendencia.
 */
export function Comparacion({
  filas,
  totalCatalogo,
  totalVistas,
}: {
  filas: FilaDeComparacion[];
  /** Los totales van aparte: incluyen lo que se juntó en «Otras», que no se dibuja. */
  totalCatalogo: number;
  totalVistas: number;
}) {
  const tope = Math.max(...filas.map((fila) => Math.max(porcentaje(fila.catalogo, totalCatalogo), porcentaje(fila.vistas, totalVistas))), 1);
  const hayMuestra = totalVistas >= 30;

  return (
    <ul className="flex flex-col gap-3.5">
      {filas.map((fila) => {
        const pCatalogo = porcentaje(fila.catalogo, totalCatalogo);
        const pVistas = porcentaje(fila.vistas, totalVistas);
        const buscada = hayMuestra && fila.vistas >= 5 && pVistas >= pCatalogo * 1.5;
        return (
          <li key={fila.clave}>
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-bold text-tinta">{fila.etiqueta}</span>
              {buscada ? <span className="text-xs font-bold text-exito">Se busca más de lo que hay</span> : null}
            </p>
            <div className="mt-1 flex flex-col gap-1">
              <BarraDelgada valor={pVistas} tope={tope} color={COLOR.tinta} texto={`${textoPorcentaje(pVistas)} de las vistas`} />
              <BarraDelgada valor={pCatalogo} tope={tope} color={COLOR.contexto} texto={`${textoPorcentaje(pCatalogo)} del catálogo`} suave />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function BarraDelgada({ valor, tope, color, texto, suave }: { valor: number; tope: number; color: string; texto: string; suave?: boolean }) {
  return (
    <div className="flex items-center gap-2" title={texto}>
      <div className="h-2 min-w-0 flex-1">
        <div className="h-full rounded-r-[3px]" style={{ width: `${porcentaje(valor, tope)}%`, minWidth: valor > 0 ? "3px" : 0, backgroundColor: color }} />
      </div>
      <span className={`w-36 shrink-0 text-xs whitespace-nowrap tabular-nums ${suave ? "text-texto-suave" : "font-bold text-tinta"}`}>{texto}</span>
    </div>
  );
}

export function LeyendaDeComparacion() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-texto-suave">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: COLOR.tinta }} />
        Parte de las vistas
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: COLOR.contexto }} />
        Parte del catálogo en el sitio
      </span>
    </p>
  );
}

// ─── Una barra partida (el todo y sus partes) ─────────────────────

export type Parte = { clave: string; nombre: string; valor: number; color: string; explicacion?: string };

/**
 * El todo en una barra, con 2 px de papel entre las partes, y la leyenda con
 * las cifras debajo: dentro de un tramo angosto el número no cabe, y cortarlo
 * es peor que no ponerlo.
 */
export function BarraPartida({ partes, unidad }: { partes: Parte[]; unidad: [string, string] }) {
  const total = partes.reduce((suma, parte) => suma + parte.valor, 0);
  const visibles = partes.filter((parte) => parte.valor > 0);
  return (
    <div>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-[4px]" style={{ backgroundColor: total ? undefined : COLOR.vacio }}>
        {visibles.map((parte) => (
          <div
            key={parte.clave}
            className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ flexGrow: parte.valor, flexBasis: 0, minWidth: "4px", backgroundColor: parte.color }}
            title={`${parte.nombre}: ${cifra(parte.valor)} ${parte.valor === 1 ? unidad[0] : unidad[1]}`}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {partes.map((parte) => (
          <li key={parte.clave} className="flex items-start gap-2.5 text-sm">
            <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: parte.color }} />
            <span className="min-w-0">
              <span className="font-extrabold text-tinta tabular-nums">{cifra(parte.valor)}</span>{" "}
              <span className="font-semibold text-texto">{parte.nombre}</span>
              {total > 0 ? <span className="text-texto-suave"> · {textoPorcentaje(porcentaje(parte.valor, total))}</span> : null}
              {parte.explicacion ? <span className="block text-texto-suave">{parte.explicacion}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── A qué hora ───────────────────────────────────────────────────

const pasoDeCalor = (valor: number, maximo: number): string => {
  if (valor <= 0 || maximo <= 0) return COLOR.vacio;
  const paso = Math.min(RAMPA_TINTA.length - 1, Math.ceil((valor / maximo) * RAMPA_TINTA.length) - 1);
  return RAMPA_TINTA[Math.max(0, paso)];
};

const franja = (hora: number): string => `de ${hora} a ${hora + 1} h`;

/**
 * Siete renglones (lunes a domingo) por 24 horas, en la hora de Morelia. Sirve
 * para decidir cuándo publicar en Facebook y a qué hora conviene tener a
 * alguien pendiente del WhatsApp.
 */
export function MapaDeHoras({ horas }: { horas: number[][] }) {
  const [activo, setActivo] = useState<{ dia: number; hora: number } | null>(null);
  const maximo = Math.max(...horas.flat(), 0);
  const total = horas.flat().reduce((suma, n) => suma + n, 0);

  let mejor = { dia: 0, hora: 0, n: 0 };
  horas.forEach((fila, dia) =>
    fila.forEach((n, hora) => {
      if (n > mejor.n) mejor = { dia, hora, n };
    }),
  );
  const porDia = horas.map((fila) => fila.reduce((suma, n) => suma + n, 0));
  const diaFuerte = porDia.indexOf(Math.max(...porDia));

  const marcado = activo ? horas[activo.dia][activo.hora] : null;

  return (
    <figure className="m-0">
      {total > 0 ? (
        <p className="mb-4 text-sm text-texto">
          Lo más visto: <strong className="font-extrabold text-tinta">{DIAS_LARGOS[mejor.dia]} {franja(mejor.hora)}</strong> (
          {cifra(mejor.n)} {mejor.n === 1 ? "vista" : "vistas"}). El día más fuerte es el{" "}
          <strong className="font-extrabold text-tinta">{DIAS_LARGOS[diaFuerte]}</strong>.
        </p>
      ) : null}

      <div className="relative" onPointerLeave={() => setActivo(null)}>
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-y-0.5">
          {horas.map((fila, dia) => (
            <div key={dia} className="contents">
              <span className="text-xs text-texto-suave">{DIAS_CORTOS[dia]}</span>
              <div className="grid grid-cols-24 gap-0.5">
                {fila.map((n, hora) => (
                  <span
                    key={hora}
                    onPointerEnter={() => setActivo({ dia, hora })}
                    className={`h-5 rounded-[2px] transition-shadow duration-150 sm:h-6 ${
                      activo?.dia === dia && activo.hora === hora ? "ring-2 ring-tinta ring-offset-1" : ""
                    }`}
                    style={{ backgroundColor: pasoDeCalor(n, maximo) }}
                    title={`${DIAS_LARGOS[dia]} ${franja(hora)}: ${cifra(n)} ${n === 1 ? "vista" : "vistas"}`}
                  />
                ))}
              </div>
            </div>
          ))}
          <span />
          <div aria-hidden className="relative mt-1 h-4 text-xs text-texto-suave tabular-nums">
            {[0, 6, 12, 18].map((hora) => (
              <span key={hora} className="absolute top-0" style={{ left: `${(hora / 24) * 100}%` }}>
                {hora} h
              </span>
            ))}
          </div>
        </div>

        {activo && marcado !== null ? (
          <Globo x={((activo.hora + 0.5) / 24) * 100} arriba={`calc(${((activo.dia + 1) / 7) * 100}% - 5.5rem)`}>
            <p className="font-bold text-tinta first-letter:uppercase">
              {DIAS_LARGOS[activo.dia]} {franja(activo.hora)}
            </p>
            <RenglonDeGlobo color={COLOR.tinta} nombre={marcado === 1 ? "vista" : "vistas"} valor={cifra(marcado)} />
          </Globo>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-texto-suave" aria-hidden>
        Menos
        {[COLOR.vacio, ...RAMPA_TINTA].map((color) => (
          <span key={color} className="h-3 w-4 rounded-[2px]" style={{ backgroundColor: color }} />
        ))}
        Más
      </div>

      <TablaGemela titulo="vistas por día de la semana y hora">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-linea text-texto-suave">
              <th scope="col" className="py-1.5 pr-2 text-left font-bold">
                Hora
              </th>
              {DIAS_CORTOS.map((dia) => (
                <th key={dia} scope="col" className={CABEZA}>
                  {dia}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {Array.from({ length: 24 }, (_, hora) => (
              <tr key={hora}>
                <th scope="row" className="py-1 pr-2 text-left font-normal whitespace-nowrap text-texto">
                  {hora}:00
                </th>
                {horas.map((fila, dia) => (
                  <td key={dia} className={`${CELDA} ${fila[hora] ? "font-bold text-tinta" : "text-texto-suave"}`}>
                    {fila[hora]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TablaGemela>
    </figure>
  );
}
