import { Form, Link, redirect } from "react-router";
import { puede } from "../../../shared/permisos";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { leerBitacora, leerFiltrosBitacora, personasConRastro } from "../../../server/db/panel/bitacora";
import { ENTIDADES_DE_BITACORA, ETIQUETA_ENTIDAD, comoSeDice } from "../../../server/db/panel/etiquetas";
import { Bloque, Vacio } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/bitacora";

export function meta() {
  return [{ title: "Bitácora | Panel" }];
}

const cuando = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

/**
 * Quién cambió qué y cuándo (PLAN §11.4). Nunca trae contraseñas: lo que se
 * guarda son los campos que cambiaron, no los valores de una clave.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  if (!puede(encontrada.sesion.usuario, "bitacora.ver")) throw new Response("Sin permiso", { status: 403 });

  const filtros = leerFiltrosBitacora(new URL(request.url).searchParams);
  const [pagina, personas] = await Promise.all([
    leerBitacora(servicios.db, filtros),
    personasConRastro(servicios.db),
  ]);
  return { filtros, pagina, personas };
}

export default function Bitacora({ loaderData }: Route.ComponentProps) {
  const { filtros, pagina, personas } = loaderData;
  const hayFiltros = Boolean(filtros.usuarioId || filtros.entidad);

  const enlace = (n: number) => {
    const parametros = new URLSearchParams();
    if (filtros.usuarioId) parametros.set("usuario", filtros.usuarioId);
    if (filtros.entidad) parametros.set("entidad", filtros.entidad);
    if (n > 1) parametros.set("pagina", String(n));
    const cola = parametros.toString();
    return cola ? `/panel/bitacora?${cola}` : "/panel/bitacora";
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Bitácora</h1>
        <p className="mt-2 text-texto-suave">
          <span className="tabular-nums">{pagina.total}</span> movimientos registrados. Se anotan solos, en el mismo
          momento en que pasan.
        </p>
      </header>

      <Form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-linea bg-superficie p-4">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
          <span className="text-sm font-bold text-tinta">Quién</span>
          <select
            name="usuario"
            defaultValue={filtros.usuarioId ?? ""}
            className="h-12 w-full rounded-xl border border-linea bg-superficie px-3 text-base text-tinta outline-none focus:border-marca"
          >
            <option value="">Cualquiera</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
          <span className="text-sm font-bold text-tinta">Sobre qué</span>
          <select
            name="entidad"
            defaultValue={filtros.entidad ?? ""}
            className="h-12 w-full rounded-xl border border-linea bg-superficie px-3 text-base text-tinta outline-none focus:border-marca"
          >
            <option value="">Todo</option>
            {ENTIDADES_DE_BITACORA.map((entidad) => (
              <option key={entidad} value={entidad}>
                {ETIQUETA_ENTIDAD[entidad] ?? entidad}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="h-12 rounded-xl bg-tinta px-5 text-base font-bold text-white transition-colors hover:bg-black"
        >
          Filtrar
        </button>
        {hayFiltros ? (
          <Link to="/panel/bitacora" className="text-sm font-bold text-marca underline underline-offset-4">
            Quitar filtros
          </Link>
        ) : null}
      </Form>

      <Bloque>
        {pagina.items.length === 0 ? (
          <Vacio titulo="Sin movimientos">
            {hayFiltros ? "Prueba con otros filtros." : "Aquí va quedando todo lo que el equipo cambie."}
          </Vacio>
        ) : (
          <ul className="flex flex-col divide-y divide-linea">
            {pagina.items.map((entrada) => (
              <li key={entrada.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="text-sm">
                  {/* Sin nombre es un script o un acceso fallido, no una persona. */}
                  <span className="font-bold text-tinta">{entrada.quien === "—" ? "El sistema" : entrada.quien}</span>{" "}
                  <span className="text-texto">{comoSeDice(entrada.accion)}</span> <Sobre entrada={entrada} />
                </p>
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-texto-suave">
                  <span className="tabular-nums">{cuando.format(new Date(entrada.cuando))}</span>
                  {entrada.cambios ? <CambiosLegibles cambios={entrada.cambios} /> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      {pagina.paginas > 1 ? (
        <nav aria-label="Páginas de la bitácora" className="flex items-center justify-between gap-4">
          {pagina.pagina > 1 ? (
            <Link
              to={enlace(pagina.pagina - 1)}
              rel="prev"
              className="flex h-12 items-center rounded-xl border border-linea bg-superficie px-5 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
            >
              Más recientes
            </Link>
          ) : (
            <span />
          )}
          <p className="text-sm text-texto-suave tabular-nums">
            Página {pagina.pagina} de {pagina.paginas}
          </p>
          {pagina.pagina < pagina.paginas ? (
            <Link
              to={enlace(pagina.pagina + 1)}
              rel="next"
              className="flex h-12 items-center rounded-xl border border-linea bg-superficie px-5 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
            >
              Más antiguos
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

/**
 * Sobre qué fue el movimiento, dicho como se diría en voz alta. La etiqueta de
 * la entidad solo aparece cuando agrega algo: «cambió su contraseña» ya se
 * entiende, y decir además «Cuentas» dejaba la frase coja.
 */
function Sobre({ entrada }: { entrada: { entidad: string; entidadId: string; cambios: Record<string, unknown> | null; casa: { clave: string; titulo: string } | null } }) {
  if (entrada.casa) {
    return (
      <Link
        to={`/panel/propiedades/${entrada.entidadId}`}
        className="font-semibold text-marca underline underline-offset-4"
      >
        {entrada.casa.clave} · {entrada.casa.titulo}
      </Link>
    );
  }

  if (entrada.entidad === "usuario") {
    // Al crear una cuenta, el nombre queda en los cambios; en lo demás, el
    // sujeto es quien actuó y no hace falta repetirlo.
    const nombre = typeof entrada.cambios?.nombre === "string" ? entrada.cambios.nombre : null;
    return nombre ? <span className="font-semibold text-tinta">la cuenta de {nombre}</span> : null;
  }

  if (entrada.entidad === "configuracion" || entrada.entidad === "contenido" || entrada.entidad === "sistema") {
    return <span className="text-texto-suave">{entrada.entidadId.replace(/_/g, " ").replace(":", " ")}</span>;
  }

  return <span className="text-texto-suave">{ETIQUETA_ENTIDAD[entrada.entidad] ?? entrada.entidad}</span>;
}

/** Los campos que cambiaron, no sus valores: un diff entero no cabe en un renglón. */
function CambiosLegibles({ cambios }: { cambios: Record<string, unknown> }) {
  const campos = Object.keys(cambios).filter((campo) => campo !== "ip");
  if (!campos.length) return null;
  const legibles = campos.slice(0, 6).join(", ");
  return <span>{campos.length > 6 ? `${legibles} y ${campos.length - 6} más` : legibles}</span>;
}
