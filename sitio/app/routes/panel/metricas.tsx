import { Link, redirect } from "react-router";
import { puede } from "../../../shared/permisos";
import { ETIQUETA_ESTADO } from "../../../shared/propiedad";
import { sesionDePeticion } from "../../../server/auth/guardia";
import {
  DIAS_DE_METRICAS,
  leerDiasDeMetricas,
  leerMetricas,
  type MetricasDeAsesor,
  type MetricasDeCasa,
} from "../../../server/db/panel/metricas";
import { IconoAtencion } from "../../components/panel/iconos";
import { Bloque, Vacio } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/metricas";

export function meta() {
  return [{ title: "Métricas | Panel" }];
}

/**
 * Qué casas se ven y cuáles mueven el teléfono (PLAN §12 y §15, F4).
 *
 * Son cifras propias, de la tabla `eventos`: no hay Google Analytics encendido
 * en la propuesta (D11) y aquí no se guarda nada de quien mira. Tablas y no
 * gráficas, a propósito: el panel no carga ni una biblioteca de dibujo, y una
 * cifra al lado de su casa se lee mejor que una barra sin eje.
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
  };
}

const VENTANAS = [
  ...DIAS_DE_METRICAS.map((dias) => ({ valor: String(dias), titulo: `${dias} días` })),
  { valor: "todo", titulo: "Todo" },
];

export default function Metricas({ loaderData }: Route.ComponentProps) {
  const { metricas, modoDemo } = loaderData;
  const { resumen, casas, asesores, alcance } = metricas;
  const soloVistas = alcance === "vistas";
  const ventanaActual = metricas.dias === null ? "todo" : String(metricas.dias);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Métricas</h1>
          <p className="mt-2 max-w-2xl text-texto-suave">
            {alcance === "propias"
              ? "Lo que pasa con las casas que tienes a tu nombre."
              : soloVistas
                ? "Qué casas se están viendo en el sitio."
                : "Cada ficha que alguien abre y cada clic en WhatsApp o en el teléfono, contados por el propio sitio."}
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
            En modo propuesta el sitio no aparece en Google, así que estas cifras son las de quien entre con el enlace.
            Al salir a producción empiezan a contar las visitas de verdad.
          </span>
        </p>
      ) : null}

      <section aria-label="Resumen del periodo" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Cifra titulo="Fichas vistas" valor={resumen.vistas} />
        {soloVistas ? null : (
          <>
            <Cifra titulo="Clics en WhatsApp" valor={resumen.whatsapp} />
            <Cifra titulo="Clics en el teléfono" valor={resumen.telefono} />
            <Cifra titulo="Veces compartida" valor={resumen.compartir} />
            <Cifra titulo="Prospectos" valor={resumen.prospectos} destacada />
          </>
        )}
      </section>

      <Bloque
        titulo="Las casas que más se ven"
        descripcion={
          casas.length
            ? `${casas.length} ${casas.length === 1 ? "casa" : "casas"} con movimiento en este periodo, de ${metricas.casasEnTotal}.`
            : undefined
        }
      >
        {casas.length === 0 ? (
          <Vacio titulo="Todavía no hay movimiento">
            En cuanto alguien abra una ficha del sitio, aquí va a salir cuál y cuántas veces. Se cuenta una vista por
            persona y por casa, no una por recarga.
          </Vacio>
        ) : (
          <TablaDeCasas casas={casas} soloVistas={soloVistas} />
        )}
      </Bloque>

      {asesores ? (
        <Bloque titulo="Por asesor" descripcion="Casas a su nombre, vistas de esas casas y prospectos asignados.">
          <TablaDeAsesores asesores={asesores} />
        </Bloque>
      ) : null}
    </div>
  );
}

function Cifra({ titulo, valor, destacada }: { titulo: string; valor: number; destacada?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${destacada ? "border-marca/30 bg-marca-suave" : "border-linea bg-superficie"}`}>
      <p className={`text-3xl font-extrabold tabular-nums ${destacada ? "text-marca-oscuro" : "text-tinta"}`}>
        {valor.toLocaleString("es-MX")}
      </p>
      <p className={`mt-1 text-sm ${destacada ? "text-marca-oscuro" : "text-texto-suave"}`}>{titulo}</p>
    </div>
  );
}

/**
 * En el celular, cada casa es un renglón con sus cifras debajo; en escritorio,
 * una tabla. No es la misma lista encogida: a 390 px una tabla de cinco
 * columnas obliga a desplazarse de lado, y eso ya se corrigió en F2.
 */
function TablaDeCasas({ casas, soloVistas }: { casas: MetricasDeCasa[]; soloVistas: boolean }) {
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
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto">
              <span>
                <span className="font-bold tabular-nums">{casa.vistas}</span> vistas
              </span>
              {soloVistas ? null : (
                <>
                  <span>
                    <span className="font-bold tabular-nums">{casa.whatsapp}</span> WhatsApp
                  </span>
                  <span>
                    <span className="font-bold tabular-nums">{casa.telefono}</span> teléfono
                  </span>
                  <span>
                    <span className="font-bold tabular-nums">{casa.prospectos}</span> prospectos
                  </span>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Casas ordenadas por fichas vistas</caption>
          <thead>
            <tr className="border-b border-linea text-sm text-texto-suave">
              <th scope="col" className="py-2 pr-4 font-bold">
                Casa
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                Vistas
              </th>
              {soloVistas ? null : (
                <>
                  <th scope="col" className="px-3 py-2 text-right font-bold">
                    WhatsApp
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-bold">
                    Teléfono
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-bold">
                    Compartida
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-bold">
                    Prospectos
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {casas.map((casa) => (
              <tr key={casa.id} className="group transition-colors hover:bg-fondo">
                <th scope="row" className="max-w-sm py-2.5 pr-4 font-normal">
                  <Link to={`/panel/propiedades/${casa.id}`} className="block">
                    <span className="block truncate font-bold text-tinta group-hover:text-marca">{casa.titulo}</span>
                    <span className="block truncate text-sm text-texto-suave">
                      <span className="tabular-nums">{casa.clave}</span>
                      {casa.asesor ? ` · ${casa.asesor}` : ""}
                    </span>
                  </Link>
                </th>
                <td className="px-3 py-2.5 text-right font-bold text-tinta tabular-nums">{casa.vistas}</td>
                {soloVistas ? null : (
                  <>
                    <td className="px-3 py-2.5 text-right text-texto tabular-nums">{casa.whatsapp}</td>
                    <td className="px-3 py-2.5 text-right text-texto tabular-nums">{casa.telefono}</td>
                    <td className="px-3 py-2.5 text-right text-texto tabular-nums">{casa.compartir}</td>
                    <td className="py-2.5 pl-3 text-right font-bold text-marca tabular-nums">{casa.prospectos}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TablaDeAsesores({ asesores }: { asesores: MetricasDeAsesor[] }) {
  return (
    <ul className="flex flex-col divide-y divide-linea">
      {asesores.map((persona) => (
        <li key={persona.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <p className="font-bold text-tinta">{persona.nombre}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto">
            <span>
              <span className="font-bold tabular-nums">{persona.casas}</span> casas
            </span>
            <span>
              <span className="font-bold tabular-nums">{persona.vistas}</span> vistas
            </span>
            <span>
              <span className="font-bold tabular-nums">{persona.prospectos}</span> prospectos
            </span>
            {persona.abiertos > 0 ? (
              <span className="font-bold text-marca tabular-nums">{persona.abiertos} sin cerrar</span>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}
