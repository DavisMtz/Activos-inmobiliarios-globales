import { data, Form, Link, redirect } from "react-router";
import { puede } from "../../../shared/permisos";
import {
  ESTADOS_PROSPECTO,
  ETIQUETA_ESTADO_PROSPECTO,
  ETIQUETA_TIPO_PROSPECTO,
  EXPLICACION_ESTADO_PROSPECTO,
  SIGUIENTE_ESTADO,
  type EstadoProspecto,
} from "../../../shared/prospecto";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { asesoresAsignables } from "../../../server/db/panel/propiedades";
import {
  agregarNota,
  asignarProspecto,
  cambiarEstadoProspecto,
  leerFiltrosProspectos,
  listarProspectos,
  type FilaProspecto,
} from "../../../server/db/panel/prospectos";
import {
  IconoAbajo,
  IconoBuscarPanel,
  IconoCasas,
  IconoCorreo,
  IconoListo,
  IconoMensaje,
  IconoTelefono,
} from "../../components/panel/iconos";
import { Aviso, Bloque, Boton, Etiqueta, FiltrosDeLista, Vacio, type TonoEtiqueta } from "../../components/panel/piezas";
import { numeroParaLeer } from "../../../shared/whatsapp";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/prospectos";

export function meta() {
  return [{ title: "Prospectos | Panel" }];
}

/**
 * La bandeja (PLAN §11.2): quién preguntó, por qué casa, en qué va y qué se
 * hizo. Es la pantalla que justifica el sitio nuevo: hoy nadie sabe adónde
 * llegan los mensajes del formulario (`analisis/ANALISIS.md`).
 *
 * Todo funciona sin JavaScript: los filtros son un GET y cada acción es un
 * formulario que vuelve a la misma página, al mismo prospecto (`#p-<id>`).
 * Quien atiende lo va a hacer desde el celular, a veces con media barra.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;
  if (!puede(usuario, "prospectos.ver")) throw new Response("Sin permiso", { status: 403 });

  const filtros = leerFiltrosProspectos(new URL(request.url).searchParams);
  const puedeAsignar = puede(usuario, "prospectos.asignar");
  const [pagina, asesores] = await Promise.all([
    listarProspectos(servicios.db, usuario, filtros),
    puedeAsignar ? asesoresAsignables(servicios.db) : Promise.resolve([]),
  ]);

  return {
    filtros,
    pagina,
    asesores,
    puedeAsignar,
    puedeGestionar: puede(usuario, "prospectos.gestionar"),
    puedeExportar: puede(usuario, "prospectos.exportar"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;

  const formulario = await request.formData();
  const que = String(formulario.get("que") ?? "");
  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return data({ error: "No entendimos de qué prospecto se trata." }, { status: 400 });
  }

  // Se vuelve a la misma lista, con los mismos filtros y al mismo renglón.
  const volver = `/panel/prospectos${new URL(request.url).search}#p-${id}`;
  const db = servicios.db;

  const hecho =
    que === "estado"
      ? await cambiarEstadoProspecto(db, usuario, id, formulario.get("estado"))
      : que === "asignar"
        ? await asignarProspecto(db, usuario, id, formulario.get("asesor_id"))
        : que === "nota"
          ? await agregarNota(db, usuario, id, formulario.get("texto"))
          : null;

  if (!hecho) return data({ error: "No entendimos qué hacer." }, { status: 400 });
  return hecho.ok ? redirect(volver) : data({ error: hecho.mensaje }, { status: hecho.estado });
}

const TONO_ESTADO: Record<EstadoProspecto, TonoEtiqueta> = {
  nuevo: "marca",
  contactado: "aviso",
  cita: "exito",
  cerrado: "tinta",
  descartado: "neutro",
};

const cuando = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

const CAMPO_CORTO =
  "h-10 min-w-0 flex-1 rounded-lg border border-linea bg-superficie px-2 text-sm text-tinta outline-none focus:border-marca";

export default function Prospectos({ loaderData, actionData }: Route.ComponentProps) {
  const { filtros, pagina, asesores, puedeAsignar, puedeGestionar, puedeExportar } = loaderData;
  const hayFiltros = Boolean(filtros.q || filtros.estado || filtros.asesor || filtros.abiertos);
  const busqueda = parametrosDe(filtros).toString();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Prospectos</h1>
          <p className="mt-2 text-texto-suave">
            <span className="font-bold text-texto tabular-nums">{pagina.abiertos}</span> sin cerrar ·{" "}
            <span className="tabular-nums">{pagina.total}</span> en la lista
            {hayFiltros ? " con estos filtros" : ""}
          </p>
        </div>
        {puedeExportar && pagina.total > 0 ? (
          // Un enlace de verdad, no una ruta de React Router: lo que vuelve es
          // un archivo con `Content-Disposition`, no una pantalla.
          <a
            href={`/api/panel/prospectos.csv${busqueda ? `?${busqueda}` : ""}`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-linea bg-superficie px-5 text-base font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
          >
            Descargar para Excel
          </a>
        ) : null}
      </header>

      {actionData?.error ? <Aviso>{actionData.error}</Aviso> : null}

      {/* ── Filtros: un GET de toda la vida ───────────────────────── */}
      <FiltrosDeLista
        activos={[filtros.estado, filtros.asesor, filtros.abiertos].filter(Boolean).length}
        buscador={
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-tinta">Buscar</span>
            <span className="relative">
              <IconoBuscarPanel className="absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-texto-suave" />
              <input
                name="q"
                type="search"
                defaultValue={filtros.q ?? ""}
                placeholder="Nombre, teléfono o correo"
                className="h-12 w-full rounded-xl border border-linea bg-superficie pr-4 pl-11 text-base text-tinta transition-colors outline-none placeholder:text-texto-suave/70 focus:border-marca"
              />
            </span>
          </label>
        }
        pie={
          <>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-tinta px-5 text-base font-bold text-white transition-colors hover:bg-black"
            >
              Filtrar
            </button>
            {hayFiltros ? (
              <Link to="/panel/prospectos" className="text-sm font-bold text-marca underline underline-offset-4">
                Quitar filtros
              </Link>
            ) : null}
          </>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-tinta">Estado</span>
          <select
            name="estado"
            defaultValue={filtros.estado ?? ""}
            className="h-12 w-full rounded-xl border border-linea bg-superficie px-3 text-base text-tinta transition-colors outline-none focus:border-marca"
          >
            <option value="">Todos</option>
            {ESTADOS_PROSPECTO.map((estado) => (
              <option key={estado} value={estado}>
                {ETIQUETA_ESTADO_PROSPECTO[estado]}
              </option>
            ))}
          </select>
        </label>

        {/* Quien no puede asignar tampoco elige de quién son: los suyos y ya. */}
        {puedeAsignar ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-tinta">Quién atiende</span>
            <select
              name="asesor"
              defaultValue={filtros.asesor ?? ""}
              className="h-12 w-full rounded-xl border border-linea bg-superficie px-3 text-base text-tinta transition-colors outline-none focus:border-marca"
            >
              <option value="">Cualquiera</option>
              <option value="nadie">Sin asignar</option>
              {asesores.map((asesor) => (
                <option key={asesor.id} value={asesor.id}>
                  {asesor.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex h-12 items-center gap-2 self-end text-sm font-bold text-tinta">
          <input
            type="checkbox"
            name="abiertos"
            value="1"
            defaultChecked={filtros.abiertos}
            className="h-5 w-5 rounded border-linea text-marca focus:ring-marca"
          />
          Solo los que faltan por cerrar
        </label>
      </FiltrosDeLista>

      {pagina.items.length === 0 ? (
        <Bloque>
          <Vacio
            titulo={hayFiltros ? "Ninguno coincide" : "Todavía no hay prospectos"}
            accion={hayFiltros ? <Link to="/panel/prospectos" className="font-bold text-marca underline underline-offset-4">Quitar filtros</Link> : undefined}
          >
            {hayFiltros
              ? "Prueba con menos filtros o busca por el teléfono."
              : "Aquí van a caer los mensajes del formulario de contacto y del botón «Me interesa» de cada casa, con la casa por la que preguntaron."}
          </Vacio>
        </Bloque>
      ) : (
        <ul className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {pagina.items.map((prospecto) => (
            <li key={prospecto.id}>
              <FichaProspecto
                prospecto={prospecto}
                asesores={asesores}
                puedeAsignar={puedeAsignar}
                puedeGestionar={puedeGestionar}
              />
            </li>
          ))}
        </ul>
      )}

      <Paginas filtros={filtros} paginas={pagina.paginas} />
    </div>
  );
}

// ─── Una ficha ────────────────────────────────────────────────────

/**
 * Una persona que preguntó. En el teléfono cabe en media pantalla: arriba quién
 * es y en qué va, luego lo que dijo, y los botones grandes para contestar.
 * Cambiar el estado a mano, asignarla y las notas van plegados en
 * «Seguimiento»: con los seis controles abiertos cada ficha medía ~580 px y la
 * bandeja, 14 600. El paso siguiente del estado («Marcar contactado») sí va a
 * la vista, porque es lo que se hace justo después de contestar.
 */
function FichaProspecto({
  prospecto,
  asesores,
  puedeAsignar,
  puedeGestionar,
}: {
  prospecto: FilaProspecto;
  asesores: { id: string; nombre: string }[];
  puedeAsignar: boolean;
  puedeGestionar: boolean;
}) {
  const siguiente = SIGUIENTE_ESTADO[prospecto.estado];
  const telefono = prospecto.telefono ? numeroParaLeer(prospecto.telefono) : null;

  return (
    <article id={`p-${prospecto.id}`} className="scroll-mt-24 rounded-2xl border border-linea bg-superficie">
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold text-tinta">{prospecto.nombre}</h2>
            <p className="mt-0.5 text-sm text-texto-suave">
              {ETIQUETA_TIPO_PROSPECTO[prospecto.tipo]} ·{" "}
              <span className="whitespace-nowrap tabular-nums">{cuando.format(new Date(prospecto.creadoEn))}</span>
            </p>
            <p className="mt-0.5 text-sm text-texto-suave">
              {prospecto.asesor ? (
                <>
                  Atiende <span className="font-bold text-texto">{prospecto.asesor}</span>
                </>
              ) : (
                <span className="font-bold text-aviso">Sin asignar</span>
              )}
            </p>
          </div>
          <Etiqueta tono={TONO_ESTADO[prospecto.estado]}>{ETIQUETA_ESTADO_PROSPECTO[prospecto.estado]}</Etiqueta>
        </header>

        {prospecto.casa ? (
          <Link
            to={`/panel/propiedades/${prospecto.casa.id}`}
            className="flex min-w-0 items-center gap-2 rounded-xl bg-fondo px-3 py-2 text-sm text-tinta transition-colors hover:text-marca"
          >
            <IconoCasas className="h-4.5 w-4.5 shrink-0 text-texto-suave" />
            <span className="truncate">
              <span className="font-bold">{prospecto.casa.clave}</span> · {prospecto.casa.titulo}
            </span>
          </Link>
        ) : null}

        {prospecto.mensaje ? (
          <p className="line-clamp-4 text-sm leading-relaxed whitespace-pre-line text-texto">{prospecto.mensaje}</p>
        ) : null}

        {/* Contestar es lo primero que se hace aquí: dos botones del mismo
            ancho, y el correo (que casi nunca es lo primero) solo con icono. */}
        {prospecto.whatsapp || telefono || prospecto.correo ? (
          <div className="flex gap-2">
            {prospecto.whatsapp ? (
              <a
                href={prospecto.whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-marca px-3 text-sm font-bold text-white transition-colors hover:bg-marca-oscuro"
              >
                <IconoMensaje className="h-5 w-5 shrink-0" />
                WhatsApp
              </a>
            ) : null}
            {telefono ? (
              <a
                href={`tel:${(prospecto.telefono ?? "").replace(/\s+/g, "")}`}
                aria-label={`Llamar al ${telefono}`}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-linea px-3 text-sm font-bold whitespace-nowrap text-tinta tabular-nums transition-colors hover:border-marca hover:text-marca"
              >
                <IconoTelefono className="h-5 w-5 shrink-0" />
                {telefono}
              </a>
            ) : null}
            {prospecto.correo ? (
              <a
                href={`mailto:${prospecto.correo}`}
                aria-label={`Escribir a ${prospecto.correo}`}
                title={prospecto.correo}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-linea text-tinta transition-colors hover:border-marca hover:text-marca"
              >
                <IconoCorreo className="h-5 w-5" />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      {puedeGestionar ? (
        <div className="border-t border-linea">
          {siguiente ? (
            <Form method="post" className="px-4 pt-3 sm:px-5">
              <input type="hidden" name="que" value="estado" />
              <input type="hidden" name="id" value={prospecto.id} />
              <input type="hidden" name="estado" value={siguiente} />
              <Boton type="submit" tono="secundario" pequeno ancho>
                <IconoListo className="h-5 w-5" />
                Marcar {ETIQUETA_ESTADO_PROSPECTO[siguiente].toLowerCase()}
              </Boton>
            </Form>
          ) : null}
          <Seguimiento prospecto={prospecto} asesores={asesores} puedeAsignar={puedeAsignar} />
        </div>
      ) : prospecto.notas.length ? (
        <div className="border-t border-linea">
          <Seguimiento prospecto={prospecto} asesores={asesores} puedeAsignar={false} soloLeer />
        </div>
      ) : null}
    </article>
  );
}

/**
 * Lo que no se hace en cada visita: cambiar el estado a cualquiera (también
 * hacia atrás), asignar y las notas. Un `<details>`: abre sin JavaScript.
 */
function Seguimiento({
  prospecto,
  asesores,
  puedeAsignar,
  soloLeer = false,
}: {
  prospecto: FilaProspecto;
  asesores: { id: string; nombre: string }[];
  puedeAsignar: boolean;
  soloLeer?: boolean;
}) {
  const notas = prospecto.notas.length;
  return (
    <details className="group">
      <summary className="flex h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-bold text-tinta transition-colors hover:text-marca sm:px-5 [&::-webkit-details-marker]:hidden">
        <span>
          {soloLeer ? "Notas" : "Seguimiento"}
          {notas ? (
            <span className="ml-1.5 font-semibold text-texto-suave tabular-nums">
              · {notas} {notas === 1 ? "nota" : "notas"}
            </span>
          ) : null}
        </span>
        <IconoAbajo className="h-5 w-5 text-texto-suave transition-transform group-open:rotate-180" />
      </summary>

      <div className="flex flex-col gap-4 border-t border-linea bg-fondo/60 px-4 py-4 sm:px-5">
        {!soloLeer ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Form method="post" className="flex flex-col gap-1.5">
              <input type="hidden" name="que" value="estado" />
              <input type="hidden" name="id" value={prospecto.id} />
              <label className="text-sm font-bold text-tinta" htmlFor={`estado-${prospecto.id}`}>
                Estado
              </label>
              <div className="flex gap-2">
                <select id={`estado-${prospecto.id}`} name="estado" defaultValue={prospecto.estado} className={CAMPO_CORTO}>
                  {ESTADOS_PROSPECTO.map((estado) => (
                    <option key={estado} value={estado} title={EXPLICACION_ESTADO_PROSPECTO[estado]}>
                      {ETIQUETA_ESTADO_PROSPECTO[estado]}
                    </option>
                  ))}
                </select>
                <Boton type="submit" tono="secundario" pequeno>
                  Cambiar
                </Boton>
              </div>
            </Form>

            {puedeAsignar ? (
              <Form method="post" className="flex flex-col gap-1.5">
                <input type="hidden" name="que" value="asignar" />
                <input type="hidden" name="id" value={prospecto.id} />
                <label className="text-sm font-bold text-tinta" htmlFor={`asesor-${prospecto.id}`}>
                  Quién atiende
                </label>
                <div className="flex gap-2">
                  <select
                    id={`asesor-${prospecto.id}`}
                    name="asesor_id"
                    defaultValue={prospecto.asesorId ?? ""}
                    className={CAMPO_CORTO}
                  >
                    <option value="">Sin asignar</option>
                    {asesores.map((asesor) => (
                      <option key={asesor.id} value={asesor.id}>
                        {asesor.nombre}
                      </option>
                    ))}
                  </select>
                  <Boton type="submit" tono="secundario" pequeno>
                    Asignar
                  </Boton>
                </div>
              </Form>
            ) : null}
          </div>
        ) : null}

        <Notas prospecto={prospecto} puedeGestionar={!soloLeer} />
      </div>
    </details>
  );
}

/**
 * Las notas de una persona: lo que se hizo («no contestó», «quedamos el
 * jueves»). Viven dentro de «Seguimiento», que ya va plegado.
 */
function Notas({ prospecto, puedeGestionar }: { prospecto: FilaProspecto; puedeGestionar: boolean }) {
  if (!puedeGestionar && prospecto.notas.length === 0) return null;

  return (
    <section aria-label={`Notas sobre ${prospecto.nombre}`} className="flex flex-col gap-3">
      <p className="text-sm font-bold text-tinta">Notas</p>
      {prospecto.notas.length ? (
        <ul className="flex flex-col gap-3">
          {prospecto.notas.map((nota) => (
            <li key={nota.id} className="text-sm">
              <p className="whitespace-pre-line text-texto">{nota.texto}</p>
              <p className="mt-0.5 text-xs text-texto-suave">
                {nota.quien} · <span className="tabular-nums">{cuando.format(new Date(nota.cuando))}</span>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-texto-suave">
          Aquí queda lo que se hizo: «no contestó», «quedamos el jueves a las 5».
        </p>
      )}

      {puedeGestionar ? (
        <Form method="post" className="flex flex-col gap-2">
          <input type="hidden" name="que" value="nota" />
          <input type="hidden" name="id" value={prospecto.id} />
          <label className="sr-only" htmlFor={`nota-${prospecto.id}`}>
            Nota sobre {prospecto.nombre}
          </label>
          <textarea
            id={`nota-${prospecto.id}`}
            name="texto"
            rows={2}
            required
            minLength={2}
            maxLength={1000}
            placeholder="Qué pasó con esta persona"
            className="w-full rounded-xl border border-linea bg-superficie px-3 py-2 text-base leading-relaxed text-tinta outline-none placeholder:text-texto-suave/70 focus:border-marca"
          />
          <div>
            <Boton type="submit" tono="secundario" pequeno>
              Guardar la nota
            </Boton>
          </div>
        </Form>
      ) : null}
    </section>
  );
}

// ─── Páginas ──────────────────────────────────────────────────────

function parametrosDe(filtros: {
  q: string | null;
  estado: string | null;
  asesor: string | null;
  abiertos: boolean;
}): URLSearchParams {
  const parametros = new URLSearchParams();
  if (filtros.q) parametros.set("q", filtros.q);
  if (filtros.estado) parametros.set("estado", filtros.estado);
  if (filtros.asesor) parametros.set("asesor", filtros.asesor);
  if (filtros.abiertos) parametros.set("abiertos", "1");
  return parametros;
}

function Paginas({
  filtros,
  paginas,
}: {
  filtros: { q: string | null; estado: string | null; asesor: string | null; abiertos: boolean; pagina: number };
  paginas: number;
}) {
  if (paginas <= 1) return null;
  const actual = Math.min(filtros.pagina, paginas);

  const enlace = (n: number) => {
    const parametros = parametrosDe(filtros);
    if (n > 1) parametros.set("pagina", String(n));
    const cola = parametros.toString();
    return cola ? `/panel/prospectos?${cola}` : "/panel/prospectos";
  };

  const estilo =
    "flex h-12 items-center rounded-xl border border-linea bg-superficie px-5 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca";

  return (
    <nav aria-label="Páginas de la bandeja" className="flex items-center justify-between gap-4">
      {actual > 1 ? (
        <Link to={enlace(actual - 1)} rel="prev" className={estilo}>
          Más recientes
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-texto-suave tabular-nums">
        Página {actual} de {paginas}
      </p>
      {actual < paginas ? (
        <Link to={enlace(actual + 1)} rel="next" className={estilo}>
          Más antiguos
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
