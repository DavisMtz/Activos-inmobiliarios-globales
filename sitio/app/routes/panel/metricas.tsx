import { Link, redirect } from "react-router";
import { puede } from "../../../shared/permisos";
import { ETIQUETA_ESTADO_PROSPECTO, EXPLICACION_ESTADO_PROSPECTO, type EstadoProspecto } from "../../../shared/prospecto";
import { ESTADOS_PROPIEDAD, ETIQUETA_ESTADO } from "../../../shared/propiedad";
import { sesionDePeticion } from "../../../server/auth/guardia";
import {
  DIAS_DE_METRICAS,
  leerDiasDeMetricas,
  leerMetricas,
  type Metricas as DatosDeMetricas,
  type MetricasDeAsesor,
  type MetricasDeCasa,
} from "../../../server/db/panel/metricas";
import {
  BarraPartida,
  COLOR,
  Comparacion,
  LeyendaDeComparacion,
  MapaDeHoras,
  Medidor,
  RAMPA_ROJA,
  RAMPA_TINTA,
  SerieEnElTiempo,
  TablaGemela,
  Tarjeta,
  cifra,
  fechaCorta,
  type Parte,
} from "../../components/panel/graficas";
import { porcentaje as porcentajeDe, textoPorcentaje } from "../../components/panel/cifras";
import { IconoAdelante, IconoAtencion } from "../../components/panel/iconos";
import { Bloque, Vacio } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/metricas";

export function meta() {
  return [{ title: "Métricas | Panel" }];
}

/**
 * Cómo le va al sitio y a cada casa (PLAN §12 y §15, F4; tablero del
 * 21/09/2026).
 *
 * Son cifras propias, de la tabla `eventos` y de los prospectos: no hay Google
 * Analytics encendido en la propuesta (D11) y aquí no se guarda nada de quien
 * mira.
 *
 * Hasta el 21/09/2026 esto eran solo tablas, a propósito: el panel no cargaba
 * ninguna biblioteca de dibujo y una cifra al lado de su casa se lee mejor que
 * una barra sin eje. El dueño pidió gráficas «para poder ver el desempeño de
 * todo», y las gráficas se hicieron a mano (`components/panel/graficas.tsx`)
 * para seguir sin biblioteca: se pintan en el servidor, cada una trae su tabla
 * y las tablas de casas y asesores siguen aquí, ahora con su barra.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;
  if (!puede(usuario, "metricas.ver")) throw new Response("Sin permiso", { status: 403 });

  const dias = leerDiasDeMetricas(new URL(request.url).searchParams);
  return {
    metricas: await leerMetricas(servicios.db, usuario, dias),
    modoDemo: servicios.config.modoDemo,
    veProspectos: puede(usuario, "prospectos.ver"),
  };
}

const VENTANAS = [
  ...DIAS_DE_METRICAS.map((dias) => ({ valor: String(dias), titulo: `${dias} días` })),
  { valor: "todo", titulo: "Todo" },
];

/** Del prospecto nuevo al cerrado, en la rampa roja; los descartados, en gris: salieron del camino. */
const COLOR_DE_ESTADO: Record<EstadoProspecto, string> = {
  nuevo: RAMPA_ROJA[0],
  contactado: RAMPA_ROJA[1],
  cita: RAMPA_ROJA[2],
  cerrado: RAMPA_ROJA[3],
  descartado: COLOR.contexto,
};

/**
 * El inventario en una barra: la tinta es lo que está a la venta, el rojo lo
 * que ya tiene trato (apartada, vendida, rentada) y los grises lo que no se ve
 * en el sitio. Los nombres y las cifras van en la leyenda: el color nunca dice
 * nada solo.
 */
const COLOR_DE_ESTADO_DE_CASA: Record<(typeof ESTADOS_PROPIEDAD)[number], string> = {
  publicada: COLOR.tinta,
  apartada: RAMPA_ROJA[1],
  vendida: RAMPA_ROJA[2],
  rentada: RAMPA_ROJA[3],
  pausada: RAMPA_TINTA[2],
  revision: RAMPA_TINTA[1],
  borrador: RAMPA_TINTA[0],
};

/** «1 de cada 33 vistas»: con cifras chicas se lee mejor que «3.0 %». */
function unoDeCada(parte: number, total: number): string | null {
  if (parte <= 0 || total <= 0) return null;
  const cada = Math.round(total / parte);
  return cada <= 1 ? "Casi uno por vista" : `1 de cada ${cifra(cada)} vistas`;
}

function horasEnPalabras(horas: number): string {
  if (horas < 1) return "menos de una hora";
  if (horas < 24) return `${Math.round(horas)} ${Math.round(horas) === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return `${dias} ${dias === 1 ? "día" : "días"}`;
}

export default function Metricas({ loaderData }: Route.ComponentProps) {
  const { metricas, modoDemo, veProspectos } = loaderData;
  const { resumen, anterior, alcance, serie, cobertura } = metricas;
  const soloVistas = alcance === "vistas";
  const comercial = !soloVistas;
  const ventanaActual = metricas.dias === null ? "todo" : String(metricas.dias);
  const periodoAnterior = metricas.dias === null ? undefined : `los ${metricas.dias} días anteriores`;

  // Teléfono y «compartir» no los emite hoy ninguna página del sitio: se
  // enseñan en cuanto haya alguno, en vez de dos tarjetas en cero para siempre.
  const conTelefono = comercial && (resumen.telefono > 0 || (anterior?.telefono ?? 0) > 0);
  const conCompartir = comercial && (resumen.compartir > 0 || (anterior?.compartir ?? 0) > 0);
  const puntos = serie.puntos;
  const unidad = serie.cubeta === "dia" ? "Día a día" : serie.cubeta === "semana" ? "Semana a semana" : "Mes a mes";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Métricas</h1>
          <p className="mt-2 max-w-2xl text-texto-suave">
            {alcance === "propias"
              ? "Lo que pasa con las casas que tienes a tu nombre."
              : soloVistas
                ? "Qué casas se están viendo en el sitio, y cuándo."
                : "Cada ficha que alguien abre, cada clic en WhatsApp y cada formulario, contados por el propio sitio."}{" "}
            <span className="whitespace-nowrap">
              Del {fechaCorta(metricas.primerDia)} a hoy, {fechaCorta(metricas.hoy)}.
            </span>
          </p>
        </div>

        {/* Un enlace por ventana: sin JavaScript también cambia el periodo. */}
        <nav aria-label="Periodo" className="flex rounded-xl border border-linea bg-superficie p-1">
          {VENTANAS.map((ventana) => {
            const activa = ventana.valor === ventanaActual;
            return (
              <Link
                key={ventana.valor}
                to={`/panel/metricas?dias=${ventana.valor}`}
                aria-current={activa ? "page" : undefined}
                className={`flex h-10 items-center rounded-lg px-3 text-sm font-bold transition-colors ${
                  activa ? "bg-marca-suave text-marca-oscuro" : "text-texto-suave hover:text-marca"
                }`}
              >
                {ventana.titulo}
              </Link>
            );
          })}
        </nav>
      </header>

      {modoDemo ? (
        <p className="flex items-start gap-3 rounded-2xl border border-linea bg-superficie px-5 py-4 text-sm text-texto-suave">
          <IconoAtencion className="mt-0.5 h-5 w-5 shrink-0 text-aviso" />
          <span>
            En modo propuesta el sitio no aparece en Google, así que estas cifras son las de quien entre con el enlace
            (el equipo incluido). Al salir a producción empiezan a contar las visitas de verdad.
          </span>
        </p>
      ) : null}

      {/* ─── Las cifras del periodo ─────────────────────────────── */}
      <section
        aria-label="Resumen del periodo"
        className={`grid grid-cols-2 gap-3 sm:gap-4 ${comercial ? "xl:grid-cols-4" : "lg:grid-cols-2"} ${
          conTelefono || conCompartir ? "2xl:grid-cols-6" : ""
        }`}
      >
        <Tarjeta
          titulo="Fichas vistas"
          valor={resumen.vistas}
          anterior={anterior?.vistas}
          periodo={periodoAnterior}
          serie={puntos.map((p) => p.vistas)}
        />
        <div className="flex flex-col rounded-2xl border border-linea bg-superficie p-4 sm:p-5">
          <p className="text-sm font-bold text-texto-suave">Casas que se vieron</p>
          <p className="mt-1 text-4xl leading-none font-extrabold text-tinta">{cifra(cobertura.conVistas)}</p>
          <p className="mt-1 text-sm text-texto-suave">
            de {cifra(cobertura.enElSitio)} en el sitio
            {cobertura.enElSitio > cobertura.conVistas
              ? ` · ${cifra(cobertura.enElSitio - cobertura.conVistas)} sin ninguna visita`
              : ""}
          </p>
          <div className="mt-auto">
            <Medidor valor={cobertura.conVistas} total={cobertura.enElSitio} />
          </div>
        </div>
        {comercial ? (
          <>
            <Tarjeta
              titulo="Clics en WhatsApp"
              valor={resumen.whatsapp}
              anterior={anterior?.whatsapp}
              periodo={periodoAnterior}
              serie={puntos.map((p) => p.whatsapp)}
              color={COLOR.rojo}
              nota={unoDeCada(resumen.whatsapp, resumen.vistas) ?? undefined}
            />
            <Tarjeta
              titulo="Prospectos"
              valor={resumen.prospectos}
              anterior={anterior?.prospectos}
              periodo={periodoAnterior}
              serie={puntos.map((p) => p.prospectos)}
              color={COLOR.rojo}
              destacada
              nota={
                !metricas.prospectos?.total
                  ? "Formularios del sitio"
                  : metricas.prospectos.porEstado.nuevo > 0
                    ? `${cifra(metricas.prospectos.porEstado.nuevo)} sin atender`
                    : "Todos ya atendidos"
              }
            />
          </>
        ) : null}
        {conTelefono ? (
          <Tarjeta titulo="Clics en el teléfono" valor={resumen.telefono} anterior={anterior?.telefono} periodo={periodoAnterior} />
        ) : null}
        {conCompartir ? (
          <Tarjeta titulo="Veces compartida" valor={resumen.compartir} anterior={anterior?.compartir} periodo={periodoAnterior} />
        ) : null}
      </section>

      {/* ─── Día a día ─────────────────────────────────────────── */}
      <Bloque
        titulo={unidad}
        descripcion={
          comercial
            ? "Arriba, las fichas de casa que se abrieron; abajo, quién pidió informes: el botón de WhatsApp de una ficha y los formularios."
            : "Las fichas de casa que se abrieron."
        }
        acciones={
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-texto-suave" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-tinta" />
              Vistas
            </span>
            {comercial ? (
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: COLOR.rojo }} />
                Contactos
              </span>
            ) : null}
          </p>
        }
      >
        {resumen.vistas === 0 && resumen.prospectos === 0 && resumen.whatsapp === 0 ? (
          <Vacio titulo="Todavía no hay movimiento en este periodo">
            En cuanto alguien abra una ficha del sitio, aquí se va a dibujar día por día. Se cuenta una vista por persona y
            por casa, no una por recarga.
          </Vacio>
        ) : (
          <SerieEnElTiempo puntos={puntos} cubeta={serie.cubeta} comercial={comercial} conTelefono={conTelefono} />
        )}
      </Bloque>

      {/* ─── Prospectos ────────────────────────────────────────── */}
      {metricas.prospectos ? <BloqueDeProspectos datos={metricas} enlazar={veProspectos} /> : null}

      {/* ─── Las casas ─────────────────────────────────────────── */}
      <Bloque
        titulo="Las casas que más se ven"
        descripcion={
          metricas.casas.length
            ? `${metricas.casas.length === 25 ? "Las 25 con más movimiento" : `${metricas.casas.length} ${metricas.casas.length === 1 ? "casa" : "casas"} con movimiento`} en este periodo, de ${cifra(metricas.casasEnTotal)}.`
            : undefined
        }
      >
        {metricas.casas.length === 0 ? (
          <Vacio titulo="Todavía no hay movimiento">
            En cuanto alguien abra una ficha del sitio, aquí va a salir cuál y cuántas veces. Se cuenta una vista por persona
            y por casa, no una por recarga.
          </Vacio>
        ) : (
          <TablaDeCasas casas={metricas.casas} comercial={comercial} conTelefono={conTelefono} />
        )}
      </Bloque>

      {/* ─── Qué busca la gente ────────────────────────────────── */}
      <Bloque
        titulo="Qué busca la gente"
        descripcion="Qué parte de las vistas se llevó cada grupo, contra lo que ese grupo pesa en el catálogo. Si la barra negra es más larga que la gris, se busca más de lo que hay."
        acciones={<LeyendaDeComparacion />}
      >
        {resumen.vistas === 0 ? (
          <Vacio titulo="Sin vistas en este periodo">Con las primeras visitas se va a ver qué tipo de casa, qué precio y qué colonia interesan más.</Vacio>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
            <GrupoDeDemanda titulo="Por tipo" filas={metricas.demanda.porTipo} />
            <GrupoDeDemanda titulo="Por precio de venta" subtitulo="en millones de pesos" filas={metricas.demanda.porPrecio} />
            <GrupoDeDemanda titulo="Por colonia" filas={metricas.demanda.porColonia} />
          </div>
        )}
      </Bloque>

      {/* ─── Horas e inventario ────────────────────────────────── */}
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Bloque titulo="A qué hora miran" descripcion="Fichas vistas por día de la semana y hora, en la hora de Morelia.">
          {resumen.vistas === 0 ? (
            <Vacio titulo="Sin vistas en este periodo">Aquí se va a ver a qué hora entra la gente a ver casas.</Vacio>
          ) : (
            <MapaDeHoras horas={metricas.horas} />
          )}
        </Bloque>
        <BloqueDeInventario datos={metricas} />
      </div>

      {metricas.asesores ? (
        <Bloque
          titulo="Por asesor"
          descripcion="Casas a su nombre, lo que se movió en esas casas y los prospectos que tiene asignados."
        >
          <TablaDeAsesores asesores={metricas.asesores} />
        </Bloque>
      ) : null}
    </div>
  );
}

// ─── Prospectos ───────────────────────────────────────────────────

function BloqueDeProspectos({ datos, enlazar }: { datos: DatosDeMetricas; enlazar: boolean }) {
  const prospectos = datos.prospectos!;
  const partes: Parte[] = (["nuevo", "contactado", "cita", "cerrado", "descartado"] as const).map((estado) => ({
    clave: estado,
    nombre: ETIQUETA_ESTADO_PROSPECTO[estado],
    valor: prospectos.porEstado[estado],
    color: COLOR_DE_ESTADO[estado],
    explicacion: EXPLICACION_ESTADO_PROSPECTO[estado],
  }));
  const { medianaHoras, atendidos } = prospectos.atencion;

  return (
    <Bloque
      titulo="Cómo van los prospectos"
      descripcion={
        prospectos.total
          ? `${cifra(prospectos.total)} ${prospectos.total === 1 ? "llegó" : "llegaron"} en este periodo. Así están hoy.`
          : undefined
      }
      acciones={
        enlazar ? (
          <Link
            to="/panel/prospectos?abiertos=1"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-marca transition-colors hover:bg-marca-suave"
          >
            Ir a la bandeja
            <IconoAdelante className="h-4 w-4" />
          </Link>
        ) : null
      }
    >
      {prospectos.total === 0 ? (
        <Vacio titulo="Ningún prospecto en este periodo">
          Aquí se va a ver cuántos formularios llegan y en qué va cada uno: nuevo, contactado, con cita, cerrado o descartado.
        </Vacio>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <BarraPartida partes={partes} unidad={["prospecto", "prospectos"]} />
          <dl className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Dato
              titulo="Tiempo para atenderlos"
              valor={medianaHoras === null ? "—" : horasEnPalabras(medianaHoras)}
              nota={
                medianaHoras === null
                  ? "Nadie los ha movido todavía."
                  : `La mitad se atendió en menos de eso (${cifra(atendidos)} ${atendidos === 1 ? "atendido" : "atendidos"}). Cuenta desde que llegó hasta que alguien lo cambió de estado o le escribió una nota.`
              }
            />
            <Dato
              titulo="Sin asignar"
              valor={cifra(prospectos.sinAsignar)}
              nota={prospectos.sinAsignar ? "Siguen abiertos y no son de nadie." : "Todos los abiertos tienen quién los atienda."}
              aviso={prospectos.sinAsignar > 0}
              enlace={enlazar && prospectos.sinAsignar > 0 ? "/panel/prospectos?asesor=nadie&abiertos=1" : undefined}
            />
          </dl>
        </div>
      )}
    </Bloque>
  );
}

function Dato({
  titulo,
  valor,
  nota,
  aviso,
  enlace,
}: {
  titulo: string;
  valor: string;
  nota: string;
  aviso?: boolean;
  enlace?: string;
}) {
  return (
    <div className="rounded-xl bg-fondo px-4 py-3">
      <dt className="flex items-center gap-1.5 text-sm font-bold text-texto-suave">
        {aviso ? <IconoAtencion className="h-4 w-4 text-aviso" /> : null}
        {titulo}
      </dt>
      <dd className="mt-0.5 text-2xl font-extrabold text-tinta">
        {enlace ? (
          <Link to={enlace} className="underline decoration-linea underline-offset-4 hover:text-marca hover:decoration-marca">
            {valor}
          </Link>
        ) : (
          valor
        )}
      </dd>
      <dd className="mt-1 text-sm text-texto-suave">{nota}</dd>
    </div>
  );
}

// ─── Qué busca la gente ───────────────────────────────────────────

function GrupoDeDemanda({
  titulo,
  subtitulo,
  filas,
}: {
  titulo: string;
  subtitulo?: string;
  filas: DatosDeMetricas["demanda"]["porTipo"];
}) {
  const totalCatalogo = filas.reduce((suma, fila) => suma + fila.catalogo, 0);
  const totalVistas = filas.reduce((suma, fila) => suma + fila.vistas, 0);
  const nombradas = filas.filter((fila) => fila.clave !== "otras");
  const otras = filas.find((fila) => fila.clave === "otras");
  return (
    <section>
      <h3 className="mb-3 text-base font-extrabold text-tinta">
        {titulo} {subtitulo ? <span className="text-sm font-semibold text-texto-suave">· {subtitulo}</span> : null}
      </h3>
      {nombradas.length ? (
        <Comparacion filas={nombradas} totalCatalogo={totalCatalogo} totalVistas={totalVistas} />
      ) : (
        <p className="text-sm text-texto-suave">Sin datos.</p>
      )}
      {/* Lo que se juntó va en palabras y no en barra: con 116 colonias
          juntas, su barra era la más larga y se comía a las que sí se nombran. */}
      {otras ? (
        <p className="mt-3 text-sm text-texto-suave">
          {otras.etiqueta}: {textoPorcentaje(porcentajeDe(otras.vistas, totalVistas))} de las vistas y{" "}
          {textoPorcentaje(porcentajeDe(otras.catalogo, totalCatalogo))} del catálogo.
        </p>
      ) : null}
      <TablaGemela titulo={`qué busca la gente, ${titulo.toLowerCase()}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-texto-suave">
              <th scope="col" className="py-1.5 pr-2 text-left font-bold">
                {titulo.replace(/^Por /, "").replace(/^./, (letra) => letra.toUpperCase())}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-bold">
                Vistas
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-bold">
                En el sitio
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {filas.map((fila) => (
              <tr key={fila.clave}>
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-texto">
                  {fila.etiqueta}
                </th>
                <td className="px-2 py-1.5 text-right font-bold text-tinta tabular-nums">{cifra(fila.vistas)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{cifra(fila.catalogo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablaGemela>
    </section>
  );
}

// ─── Inventario ───────────────────────────────────────────────────

function BloqueDeInventario({ datos }: { datos: DatosDeMetricas }) {
  const { porEstado, movimientos } = datos.inventario;
  const partes: Parte[] = ESTADOS_PROPIEDAD.filter((estado) => porEstado[estado] > 0).map((estado) => ({
    clave: estado,
    nombre: ETIQUETA_ESTADO[estado],
    valor: porEstado[estado],
    color: COLOR_DE_ESTADO_DE_CASA[estado],
  }));
  const movidas = [
    { clave: "publicada", titulo: "Publicadas" },
    { clave: "apartada", titulo: "Apartadas" },
    { clave: "vendida", titulo: "Vendidas" },
    { clave: "rentada", titulo: "Rentadas" },
  ] as const;

  return (
    <Bloque titulo="El inventario" descripcion={`Cómo están hoy las ${cifra(datos.casasEnTotal)} casas${datos.alcance === "propias" ? " a tu nombre" : ""}.`}>
      {partes.length ? <BarraPartida partes={partes} unidad={["casa", "casas"]} /> : <p className="text-sm text-texto-suave">Sin casas.</p>}
      <h3 className="mt-6 text-sm font-bold text-texto-suave">Lo que se movió en este periodo</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-2">
        {movidas.map((movida) => (
          <div key={movida.clave} className="rounded-xl bg-fondo px-3 py-2.5">
            <dt className="text-xs font-bold text-texto-suave">{movida.titulo}</dt>
            <dd className="text-xl font-extrabold text-tinta">{cifra(movimientos[movida.clave])}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-texto-suave">Según lo que se marcó en el panel: las casas que llegaron de la página anterior no cuentan.</p>
    </Bloque>
  );
}

// ─── Tablas con barra ─────────────────────────────────────────────

/** La barra de vistas dentro del renglón: el largo compara, la cifra se lee. */
function BarraDeRenglon({ valor, tope }: { valor: number; tope: number }) {
  return (
    <span aria-hidden className="block h-2 w-full">
      <span
        className="block h-full rounded-r-[3px] bg-tinta"
        style={{ width: `${tope > 0 ? (valor / tope) * 100 : 0}%`, minWidth: valor > 0 ? "3px" : 0 }}
      />
    </span>
  );
}

/** Las que se ven de entrada; el resto (hasta 25) queda plegado debajo. */
const CASAS_A_LA_VISTA = 10;

/**
 * Las diez primeras a la vista y las demás plegadas: con las 25 abiertas, la
 * lista medía dos pantallas en escritorio y seis en el teléfono, y empujaba
 * todo lo de abajo fuera de la vista.
 */
function TablaDeCasas({ casas, comercial, conTelefono }: { casas: MetricasDeCasa[]; comercial: boolean; conTelefono: boolean }) {
  const tope = Math.max(...casas.map((casa) => casa.vistas), 1);
  const resto = casas.slice(CASAS_A_LA_VISTA);
  const comun = { tope, comercial, conTelefono };
  return (
    <>
      <ListaDeCasas casas={casas.slice(0, CASAS_A_LA_VISTA)} {...comun} />
      {resto.length ? (
        <details className="group mt-3 border-t border-linea pt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg py-1 text-sm font-bold text-marca transition-colors hover:text-marca-oscuro [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90">
              <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Ver {resto.length === 1 ? "la otra" : `las otras ${resto.length}`}
          </summary>
          <div className="mt-3">
            <ListaDeCasas casas={resto} {...comun} continuacion />
          </div>
        </details>
      ) : null}
    </>
  );
}

const plural = (n: number, una: string, varias: string): string => (n === 1 ? una : varias);

/**
 * En el celular, cada casa es un renglón con sus cifras debajo; en escritorio,
 * una tabla. No es la misma lista encogida: a 390 px una tabla de cinco
 * columnas obliga a desplazarse de lado, y eso ya se corrigió en F2.
 *
 * La tabla va con anchos fijos (`table-fixed`) para que la continuación
 * plegada quede alineada columna por columna con la de arriba.
 */
function ListaDeCasas({
  casas,
  tope,
  comercial,
  conTelefono,
  continuacion,
}: {
  casas: MetricasDeCasa[];
  tope: number;
  comercial: boolean;
  conTelefono: boolean;
  /** La parte plegada: sin encabezados a la vista (siguen ahí para el lector de pantalla). */
  continuacion?: boolean;
}) {
  const anchos = !comercial ? ["58%", "42%"] : conTelefono ? ["42%", "30%", "9%", "9%", "10%"] : ["44%", "32%", "11%", "13%"];
  return (
    <>
      <ul className="flex flex-col divide-y divide-linea md:hidden">
        {casas.map((casa) => (
          <li key={casa.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
            <Link to={`/panel/propiedades/${casa.id}`} className="font-bold text-tinta hover:text-marca">
              {casa.titulo}
            </Link>
            <p className="text-sm text-texto-suave">
              <span className="tabular-nums">{casa.clave}</span> · {ETIQUETA_ESTADO[casa.estado]}
            </p>
            <div className="flex items-center gap-3">
              <span className="w-2/3">
                <BarraDeRenglon valor={casa.vistas} tope={tope} />
              </span>
              <span className="text-sm">
                <span className="font-extrabold text-tinta tabular-nums">{cifra(casa.vistas)}</span>{" "}
                <span className="text-texto-suave">{plural(casa.vistas, "vista", "vistas")}</span>
              </span>
            </div>
            {comercial ? (
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto">
                <span>
                  <span className="font-bold tabular-nums">{casa.whatsapp}</span> WhatsApp
                </span>
                {conTelefono ? (
                  <span>
                    <span className="font-bold tabular-nums">{casa.telefono}</span> teléfono
                  </span>
                ) : null}
                <span>
                  <span className={`font-bold tabular-nums ${casa.prospectos ? "text-marca" : ""}`}>{casa.prospectos}</span>{" "}
                  {plural(casa.prospectos, "prospecto", "prospectos")}
                </span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">
            {continuacion ? "Las demás casas, ordenadas por fichas vistas" : "Casas ordenadas por fichas vistas"}
          </caption>
          <colgroup>
            {anchos.map((ancho, i) => (
              <col key={i} style={{ width: ancho }} />
            ))}
          </colgroup>
          <thead className={continuacion ? "sr-only" : undefined}>
            <tr className="border-b border-linea text-sm text-texto-suave">
              <th scope="col" className="py-2 pr-4 font-bold">
                Casa
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Vistas
              </th>
              {comercial ? (
                <>
                  <th scope="col" className="px-3 py-2 text-right font-bold">
                    WhatsApp
                  </th>
                  {conTelefono ? (
                    <th scope="col" className="px-3 py-2 text-right font-bold">
                      Teléfono
                    </th>
                  ) : null}
                  <th scope="col" className="py-2 pl-3 text-right font-bold">
                    Prospectos
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {casas.map((casa) => (
              <tr key={casa.id} className="group transition-colors hover:bg-fondo">
                <th scope="row" className="py-2.5 pr-4 font-normal">
                  <Link to={`/panel/propiedades/${casa.id}`} className="block">
                    <span className="block truncate font-bold text-tinta group-hover:text-marca">{casa.titulo}</span>
                    <span className="block truncate text-sm text-texto-suave">
                      <span className="tabular-nums">{casa.clave}</span>
                      {casa.asesor ? ` · ${casa.asesor}` : ""}
                    </span>
                  </Link>
                </th>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <BarraDeRenglon valor={casa.vistas} tope={tope} />
                    </span>
                    <span className="w-10 shrink-0 text-right font-bold text-tinta tabular-nums">{cifra(casa.vistas)}</span>
                  </span>
                </td>
                {comercial ? (
                  <>
                    <td className="px-3 py-2.5 text-right text-texto tabular-nums">{casa.whatsapp}</td>
                    {conTelefono ? <td className="px-3 py-2.5 text-right text-texto tabular-nums">{casa.telefono}</td> : null}
                    <td className={`py-2.5 pl-3 text-right font-bold tabular-nums ${casa.prospectos ? "text-marca" : "text-texto"}`}>
                      {casa.prospectos}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TablaDeAsesores({ asesores }: { asesores: MetricasDeAsesor[] }) {
  const tope = Math.max(...asesores.map((persona) => persona.vistas), 1);
  return (
    <ul className="flex flex-col divide-y divide-linea">
      {asesores.map((persona) => (
        <li
          key={persona.id}
          className="grid gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center"
        >
          <p className="font-bold text-tinta">
            {persona.nombre}
            <span className="block text-sm font-normal text-texto-suave">
              {cifra(persona.casas)} {persona.casas === 1 ? "casa" : "casas"}
            </span>
          </p>
          <div className="flex items-center gap-3" title={`${persona.nombre}: ${cifra(persona.vistas)} vistas de sus casas`}>
            <span className="min-w-0 flex-1">
              <BarraDeRenglon valor={persona.vistas} tope={tope} />
            </span>
            <span className="shrink-0 text-sm">
              <span className="font-extrabold text-tinta tabular-nums">{cifra(persona.vistas)}</span>{" "}
              <span className="text-texto-suave">vistas</span>
            </span>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto">
            <span>
              <span className="font-bold tabular-nums">{cifra(persona.whatsapp)}</span> WhatsApp
            </span>
            <span>
              <span className="font-bold tabular-nums">{cifra(persona.prospectos)}</span>{" "}
              {plural(persona.prospectos, "prospecto", "prospectos")} en el periodo
            </span>
            <span>
              <span className="font-bold tabular-nums">{cifra(persona.cerrados)}</span>{" "}
              {plural(persona.cerrados, "cerrado", "cerrados")}
            </span>
            {/* Los pendientes son de HOY, lleguen de cuando lleguen: por eso pueden
                ser más que los prospectos del periodo. */}
            {persona.abiertos > 0 ? (
              <span className="font-bold text-marca tabular-nums">
                {cifra(persona.abiertos)} {plural(persona.abiertos, "pendiente", "pendientes")} hoy
              </span>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}
