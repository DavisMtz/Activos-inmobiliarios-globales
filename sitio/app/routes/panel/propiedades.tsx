import { Form, Link, redirect } from "react-router";
import { ETIQUETA_TIPO } from "../../../shared/filtros";
import { fechaCorta, precioMXN } from "../../../shared/formato";
import { puede } from "../../../shared/permisos";
import { ESTADOS_PROPIEDAD, ETIQUETA_ESTADO } from "../../../shared/propiedad";
import { sesionDePeticion } from "../../../server/auth/guardia";
import {
  asesoresAsignables,
  leerFiltrosPanel,
  listarPanel,
  type FilaPanel,
} from "../../../server/db/panel/propiedades";
import { IconoAdelante, IconoBuscarPanel, IconoMas } from "../../components/panel/iconos";
import { Bloque, BotonEnlace, Etiqueta, Vacio, type TonoEtiqueta } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/propiedades";

export function meta() {
  return [{ title: "Casas | Panel" }];
}

/**
 * La lista de casas (PLAN §11.2). Los filtros viven en la URL, igual que en el
 * sitio público: así un enlace a «las que no se pueden publicar» se puede
 * mandar por WhatsApp, y el botón de atrás del navegador funciona.
 *
 * El formulario de filtros es un GET normal: sin JavaScript también filtra.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;
  if (!puede(usuario, "propiedades.ver")) throw new Response("Sin permiso", { status: 403 });

  const filtros = leerFiltrosPanel(new URL(request.url).searchParams);
  const [pagina, asesores] = await Promise.all([
    listarPanel(servicios.db, filtros, servicios.config.cloudinary.cloudName),
    asesoresAsignables(servicios.db),
  ]);

  return {
    filtros,
    pagina,
    asesores,
    puedeCrear: puede(usuario, "propiedades.crear"),
    puedeVerPapelera: puede(usuario, "propiedades.papelera"),
  };
}

const TONO_ESTADO: Record<string, TonoEtiqueta> = {
  borrador: "neutro",
  revision: "aviso",
  publicada: "exito",
  apartada: "marca",
  vendida: "tinta",
  rentada: "tinta",
  pausada: "neutro",
};

const OPCIONES_AVISOS = [
  { valor: "", texto: "Todas" },
  { valor: "publicar", texto: "Les falta algo para publicarse" },
  { valor: "migracion", texto: "Con datos de la importación" },
];

export default function Propiedades({ loaderData }: Route.ComponentProps) {
  const { filtros, pagina, asesores, puedeCrear, puedeVerPapelera } = loaderData;
  const hayFiltros = Boolean(filtros.q || filtros.estado || filtros.asesorId || filtros.avisos);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">
            {filtros.papelera ? "Papelera" : "Casas"}
          </h1>
          <p className="mt-2 text-texto-suave">
            <span className="tabular-nums">{pagina.total}</span>
            {pagina.total === 1 ? " casa" : " casas"}
            {hayFiltros ? " con estos filtros" : ""}
          </p>
        </div>
        {puedeCrear && !filtros.papelera ? (
          <BotonEnlace a="/panel/propiedades/nueva" tono="principal" className="w-full sm:w-auto">
            <IconoMas className="h-5 w-5" />
            Subir una casa
          </BotonEnlace>
        ) : null}
      </header>

      {/* ── Filtros: un GET de toda la vida ───────────────────────── */}
      <Form method="get" className="flex flex-col gap-3 rounded-2xl border border-linea bg-superficie p-4 sm:p-5">
        {filtros.papelera ? <input type="hidden" name="papelera" value="1" /> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-sm font-bold text-tinta">Buscar</span>
            <span className="relative">
              <IconoBuscarPanel className="absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-texto-suave" />
              <input
                name="q"
                type="search"
                defaultValue={filtros.q ?? ""}
                placeholder="Clave, título o colonia"
                className="h-12 w-full rounded-xl border border-linea bg-superficie pr-4 pl-11 text-base text-tinta transition-colors outline-none placeholder:text-texto-suave/70 focus:border-marca"
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-tinta">Estado</span>
            <select
              name="estado"
              defaultValue={filtros.estado ?? ""}
              className="h-12 w-full rounded-xl border border-linea bg-superficie px-3 text-base text-tinta transition-colors outline-none focus:border-marca"
            >
              <option value="">Todos</option>
              {ESTADOS_PROPIEDAD.map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETA_ESTADO[estado]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-tinta">Avisos</span>
            <select
              name="avisos"
              defaultValue={filtros.avisos ?? ""}
              className="h-12 w-full rounded-xl border border-linea bg-superficie px-3 text-base text-tinta transition-colors outline-none focus:border-marca"
            >
              {OPCIONES_AVISOS.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.texto}
                </option>
              ))}
            </select>
          </label>

          {asesores.length ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold text-tinta">Asesor</span>
              <select
                name="asesor"
                defaultValue={filtros.asesorId ?? ""}
                className="h-12 w-full rounded-xl border border-linea bg-superficie px-3 text-base text-tinta transition-colors outline-none focus:border-marca"
              >
                <option value="">Cualquiera</option>
                {asesores.map((asesor) => (
                  <option key={asesor.id} value={asesor.id}>
                    {asesor.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-tinta px-5 text-base font-bold text-white transition-colors hover:bg-black"
          >
            Filtrar
          </button>
          {hayFiltros ? (
            <Link
              to={filtros.papelera ? "/panel/propiedades?papelera=1" : "/panel/propiedades"}
              className="text-sm font-bold text-marca underline underline-offset-4"
            >
              Quitar filtros
            </Link>
          ) : null}
          {puedeVerPapelera ? (
            <Link
              to={filtros.papelera ? "/panel/propiedades" : "/panel/propiedades?papelera=1"}
              className="ml-auto text-sm font-bold text-texto-suave underline underline-offset-4 hover:text-marca"
            >
              {filtros.papelera ? "Ver las casas activas" : "Ver la papelera"}
            </Link>
          ) : null}
        </div>
      </Form>

      {pagina.items.length === 0 ? (
        <Bloque>
          <Vacio
            titulo={hayFiltros ? "Ninguna casa coincide" : filtros.papelera ? "La papelera está vacía" : "Todavía no hay casas"}
            accion={
              hayFiltros ? (
                <BotonEnlace a="/panel/propiedades">Quitar filtros</BotonEnlace>
              ) : puedeCrear ? (
                <BotonEnlace a="/panel/propiedades/nueva" tono="principal">
                  <IconoMas className="h-5 w-5" />
                  Subir la primera
                </BotonEnlace>
              ) : undefined
            }
          >
            {hayFiltros
              ? "Prueba con menos filtros o busca por la clave de la casa."
              : filtros.papelera
                ? "Lo que mandes a la papelera se queda aquí por si te arrepientes."
                : "Cuando subas una casa aparecerá en esta lista."}
          </Vacio>
        </Bloque>
      ) : (
        <>
          {/* Celular: tarjetas. Escritorio: tabla. No es la misma lista
              encogida, son dos formas de leer lo mismo. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {pagina.items.map((casa) => (
              <li key={casa.id}>
                <TarjetaCasa casa={casa} />
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-2xl border border-linea bg-superficie md:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Casas del catálogo</caption>
              <thead>
                <tr className="border-b border-linea text-sm text-texto-suave">
                  <th scope="col" className="px-4 py-3 font-bold">
                    Casa
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">
                    Precio
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Asesor
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Cambiada
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {pagina.items.map((casa) => (
                  <tr key={casa.id} className="group transition-colors hover:bg-fondo">
                    <th scope="row" className="max-w-md px-4 py-3 font-normal">
                      <Link to={`/panel/propiedades/${casa.id}`} className="flex items-center gap-3">
                        <Miniatura casa={casa} />
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-tinta group-hover:text-marca">
                            {casa.titulo}
                          </span>
                          <span className="block truncate text-sm text-texto-suave">
                            <span className="tabular-nums">{casa.clave}</span>
                            {casa.zona ? ` · ${casa.zona}` : ""} · {ETIQUETA_TIPO[casa.tipo]}
                          </span>
                        </span>
                      </Link>
                    </th>
                    <td className="px-4 py-3 align-middle">
                      <EstadoYAvisos casa={casa} />
                    </td>
                    <td className="px-4 py-3 text-right align-middle text-tinta tabular-nums">{textoPrecio(casa)}</td>
                    <td className="px-4 py-3 align-middle text-sm text-texto-suave">{casa.asesor ?? "—"}</td>
                    <td className="px-4 py-3 align-middle text-sm whitespace-nowrap text-texto-suave tabular-nums">
                      {fechaCorta(casa.actualizadaEn)}
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      <Link
                        to={`/panel/propiedades/${casa.id}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-marca-suave hover:text-marca"
                        aria-label={`Abrir ${casa.titulo}`}
                      >
                        <IconoAdelante className="h-5 w-5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginas filtros={filtros} paginas={pagina.paginas} />
        </>
      )}
    </div>
  );
}

// ─── Piezas de la lista ───────────────────────────────────────────

function textoPrecio(casa: FilaPanel): string {
  const venta = precioMXN(casa.precio);
  const renta = precioMXN(casa.precioRenta);
  if (casa.operacion === "renta") return renta ? `${renta}/mes` : "Sin precio";
  if (casa.operacion === "venta_renta" && venta && renta) return venta;
  return venta ?? renta ?? "Sin precio";
}

function Miniatura({ casa }: { casa: FilaPanel }) {
  if (!casa.foto) {
    return (
      <span
        aria-hidden
        className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg bg-fondo text-xs font-bold text-texto-suave"
      >
        sin foto
      </span>
    );
  }
  return (
    <img
      src={casa.foto.src}
      alt=""
      width={160}
      height={120}
      loading="lazy"
      decoding="async"
      className="h-11 w-14 shrink-0 rounded-lg object-cover"
    />
  );
}

function EstadoYAvisos({ casa }: { casa: FilaPanel }) {
  const bloqueantes = casa.avisos.filter((aviso) => aviso.impidePublicar).length;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Etiqueta tono={TONO_ESTADO[casa.estado] ?? "neutro"}>{ETIQUETA_ESTADO[casa.estado]}</Etiqueta>
      {bloqueantes ? (
        <span className="text-xs font-bold text-aviso">
          {bloqueantes === 1 ? "le falta 1 dato" : `le faltan ${bloqueantes} datos`}
        </span>
      ) : null}
    </span>
  );
}

/**
 * En el celular el título manda y va solo en su renglón: compartiéndolo con el
 * precio se cortaba a media palabra («Casa en Defensores …»), y el título es lo
 * que distingue una casa de otra cuando cuatro se llaman «Casa en El Prado».
 */
function TarjetaCasa({ casa }: { casa: FilaPanel }) {
  return (
    <Link
      to={`/panel/propiedades/${casa.id}`}
      className="flex gap-3 rounded-2xl border border-linea bg-superficie p-3 transition-colors hover:border-marca"
    >
      <Miniatura casa={casa} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-bold text-balance text-tinta">{casa.titulo}</span>
        <span className="text-sm text-texto-suave">
          <span className="tabular-nums">{casa.clave}</span>
          {casa.zona ? ` · ${casa.zona}` : ""}
        </span>
        <span className="flex flex-wrap items-center justify-between gap-2">
          <EstadoYAvisos casa={casa} />
          <span className="font-bold text-tinta tabular-nums">{textoPrecio(casa)}</span>
        </span>
      </span>
    </Link>
  );
}

function Paginas({ filtros, paginas }: { filtros: { pagina: number }; paginas: number }) {
  if (paginas <= 1) return null;
  const actual = Math.min(filtros.pagina, paginas);

  // Se conservan los filtros de ahora y solo cambia la página.
  const enlace = (n: number) => {
    const parametros = new URLSearchParams();
    for (const [nombre, valor] of Object.entries(filtros as Record<string, unknown>)) {
      if (nombre === "pagina" || valor === null || valor === false || valor === "") continue;
      parametros.set(nombre === "asesorId" ? "asesor" : nombre, valor === true ? "1" : String(valor));
    }
    if (n > 1) parametros.set("pagina", String(n));
    const cola = parametros.toString();
    return cola ? `/panel/propiedades?${cola}` : "/panel/propiedades";
  };

  const estilo =
    "flex h-12 items-center rounded-xl border border-linea bg-superficie px-5 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca";

  return (
    <nav aria-label="Páginas de la lista" className="flex items-center justify-between gap-4">
      {actual > 1 ? (
        <Link to={enlace(actual - 1)} rel="prev" className={estilo}>
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-texto-suave tabular-nums">
        Página {actual} de {paginas}
      </p>
      {actual < paginas ? (
        <Link to={enlace(actual + 1)} rel="next" className={estilo}>
          Siguiente
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
