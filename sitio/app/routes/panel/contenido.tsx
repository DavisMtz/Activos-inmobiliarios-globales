import { data, Form, Link, redirect } from "react-router";
import { puede } from "../../../shared/permisos";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { leerConfiguracion } from "../../../server/db/configuracion";
import {
  borrarElemento,
  esTipoDeContenido,
  guardarElemento,
  leerElementos,
  leerTodoElContenido,
  ordenarElementos,
  type Elemento,
  type TipoDeContenido,
} from "../../../server/db/panel/contenido";
import { guardarConfiguracion } from "../../../server/db/panel/configuracion";
import { IconoAtras, IconoAdelante, IconoMas } from "../../components/panel/iconos";
import { Aviso, Bloque, Boton, Campo, CampoTexto, Etiqueta, Vacio } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/contenido";

export function meta() {
  return [{ title: "Contenido | Panel" }];
}

/**
 * Los textos del sitio (PLAN §11.2). Nada de esto vive en el código: la
 * portada, el «nosotros», los servicios y las preguntas se
 * escriben aquí y el sitio los lee de la base.
 *
 * Todo funciona sin JavaScript: cada ficha es un `<details>` con su propio
 * formulario, y ordenar es un `POST` que intercambia dos posiciones.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  if (!puede(encontrada.sesion.usuario, "contenido.editar")) throw new Response("Sin permiso", { status: 403 });

  const [contenido, configuracion] = await Promise.all([
    leerTodoElContenido(servicios.db),
    leerConfiguracion(servicios.db),
  ]);

  return {
    contenido,
    portada: configuracion.portada,
    nosotros: configuracion.nosotros,
    guardado: new URL(request.url).searchParams.get("guardado"),
  };
}

/** Ordenar sin JavaScript: se lee el orden de ahora y se intercambian dos. */
async function mover(
  db: D1Database,
  actor: { id: string; rol: "maestro" | "director" | "asesor" | "contenido" },
  tipo: TipoDeContenido,
  id: number,
  hacia: "arriba" | "abajo",
) {
  const lista: Elemento[] = await leerElementos(db, tipo);
  const indice = lista.findIndex((elemento) => elemento.id === id);
  const otro = hacia === "arriba" ? indice - 1 : indice + 1;
  if (indice < 0 || otro < 0 || otro >= lista.length) return;
  const ids = lista.map((elemento) => elemento.id);
  [ids[indice], ids[otro]] = [ids[otro], ids[indice]];
  await ordenarElementos(db, actor, tipo, ids);
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;

  const formulario = await request.formData();
  const que = String(formulario.get("que") ?? "");
  const campo = (nombre: string) => formulario.get(nombre);

  // ─── Textos de la portada y de «nosotros» ────────────────────
  if (que === "portada" || que === "nosotros") {
    const crudo: Record<string, unknown> = Object.fromEntries(formulario.entries());
    if (que === "nosotros") {
      // Los valores llegan en casillas sueltas para que funcione sin
      // JavaScript; aquí se vuelven la lista que guarda la base.
      crudo.valores = [0, 1, 2, 3, 4, 5]
        .map((i) => ({ nombre: String(campo(`valor_nombre_${i}`) ?? ""), descripcion: String(campo(`valor_descripcion_${i}`) ?? "") }))
        .filter((valor) => valor.nombre.trim());
    }
    const r = await guardarConfiguracion(servicios.db, usuario, que, crudo);
    return r.ok
      ? redirect(`/panel/contenido?guardado=${que}`)
      : data({ error: r.mensaje }, { status: r.estado });
  }

  // ─── Servicios y preguntas ───────────────────────────────────
  const tipo = String(campo("tipo") ?? "");
  if (!esTipoDeContenido(tipo)) return data({ error: "No entendimos qué guardar." }, { status: 400 });
  const id = Number(campo("id") ?? 0);

  if (que === "borrar") {
    const r = await borrarElemento(servicios.db, usuario, tipo, id);
    return r.ok ? redirect("/panel/contenido") : data({ error: r.mensaje }, { status: r.estado });
  }

  if (que === "mover") {
    const hacia = String(campo("hacia") ?? "abajo") === "arriba" ? "arriba" : "abajo";
    await mover(servicios.db, usuario, tipo, id, hacia);
    return redirect("/panel/contenido");
  }

  const datos = Object.fromEntries(formulario.entries()) as Record<string, unknown>;
  const r = await guardarElemento(servicios.db, usuario, tipo, id > 0 ? id : null, datos);
  return r.ok ? redirect(`/panel/contenido?guardado=${tipo}`) : data({ error: r.mensaje }, { status: r.estado });
}

// ─── Pantalla ─────────────────────────────────────────────────────

type CamposDeTipo = {
  titulo: string;
  campos: [string, string][];
  conOrden: boolean;
  /** Bajo el título del bloque: qué es esta lista. */
  descripcion: string;
  /** Cuando está vacía: qué pasa si se queda así. */
  vacio: string;
};

const DE_CADA_TIPO: Record<TipoDeContenido, CamposDeTipo> = {
  servicio: {
    titulo: "Servicios",
    campos: [
      ["titulo", "Título"],
      ["descripcion", "Descripción"],
    ],
    conOrden: true,
    descripcion: "Se ven en la portada y en la página de servicios, en este orden.",
    vacio: "Sin servicios, la página de servicios se queda en blanco.",
  },
  pregunta: {
    titulo: "Preguntas frecuentes",
    campos: [
      ["pregunta", "Pregunta"],
      ["respuesta", "Respuesta"],
    ],
    conOrden: true,
    descripcion: "Salen en la portada, en este orden: lo que más preguntan por teléfono, contestado una sola vez.",
    vacio: "Todavía no hay ninguna. Agrega la que más te repitan esta semana.",
  },
};

export default function Contenido({ loaderData, actionData }: Route.ComponentProps) {
  const { contenido, portada, nosotros, guardado } = loaderData;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Contenido</h1>
        <p className="mt-2 text-texto-suave">
          Lo que se lee en el sitio. Se guarda en cuanto pulses Guardar y se ve al recargar la página.
        </p>
      </header>

      {actionData?.error ? <Aviso>{actionData.error}</Aviso> : null}
      {guardado ? <Aviso tono="exito">Guardado.</Aviso> : null}

      <Bloque titulo="Portada" descripcion="El titular y el lema que se leen al entrar.">
        <Form method="post" className="flex flex-col gap-5">
          <input type="hidden" name="que" value="portada" />
          <Campo
            etiqueta="Saludo"
            name="saludo"
            defaultValue={portada.saludo}
            maxLength={80}
            ayuda="Una línea corta arriba del titular. Vacío: no sale nada."
          />
          <Campo
            etiqueta="Titular"
            name="titular"
            defaultValue={portada.titular}
            maxLength={140}
            ayuda="Lo más grande de la portada; también es el título de la pestaña. Vacío: «Comercialización, renta y financiamiento de inmuebles»."
          />
          <Campo etiqueta="Lema" name="lema" defaultValue={portada.lema} maxLength={140} ayuda="Debajo del titular." />
          <CampoTexto
            etiqueta="Presentación"
            name="presentacion"
            defaultValue={portada.presentacion}
            filas={3}
            ayuda="La frase grande de la franja oscura de servicios. Vacío: «Qué hacemos»."
          />
          <CampoTexto
            etiqueta="Antes de los servicios"
            name="intro_servicios"
            defaultValue={portada.introServicios}
            filas={2}
            ayuda="Debajo de la presentación, y arriba de la página de Servicios."
          />
          <Campo
            etiqueta="Casa de la foto principal"
            name="imagen_propiedad_clave"
            defaultValue={portada.imagenPropiedadClave ?? ""}
            ayuda="La clave, como AIG-0042: esa casa abre la vitrina de la portada. Vacío: las destacadas y luego las más recientes."
          />
          <div>
            <Boton type="submit">Guardar la portada</Boton>
          </div>
        </Form>
      </Bloque>

      <Bloque titulo="Nosotros" descripcion="La historia, la misión y los valores.">
        <Form method="post" className="flex flex-col gap-5">
          <input type="hidden" name="que" value="nosotros" />
          <CampoTexto etiqueta="Historia" name="historia" defaultValue={nosotros.historia} filas={5} />
          <CampoTexto etiqueta="Misión" name="mision" defaultValue={nosotros.mision} filas={3} />
          <CampoTexto
            etiqueta="Visión"
            name="vision"
            defaultValue={nosotros.vision}
            filas={3}
            ayuda="Hoy está vacía a propósito: en el sitio anterior era una copia de la misión."
          />
          <fieldset className="flex flex-col gap-4 rounded-xl border border-linea p-4">
            <legend className="px-2 text-sm font-bold text-tinta">Valores</legend>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <Campo etiqueta={`Valor ${i + 1}`} name={`valor_nombre_${i}`} defaultValue={nosotros.valores[i]?.nombre ?? ""} />
                <Campo
                  etiqueta="Qué significa"
                  name={`valor_descripcion_${i}`}
                  defaultValue={nosotros.valores[i]?.descripcion ?? ""}
                />
              </div>
            ))}
          </fieldset>
          <div>
            <Boton type="submit">Guardar «nosotros»</Boton>
          </div>
        </Form>
      </Bloque>

      {(Object.keys(DE_CADA_TIPO) as TipoDeContenido[]).map((tipo) => (
        <ListaDeContenido key={tipo} tipo={tipo} elementos={contenido[tipo]} />
      ))}

      {/* Los testimonios que escribía el equipo los reemplazaron las Entregas
          (19/09/2026): lo que sale en la portada es lo que el cliente autorizó
          desde su enlace, con su foto si la permitió. */}
      <Bloque titulo="Lo que dicen los clientes" descripcion="Vive en «Entregas», con el permiso de cada cliente.">
        <p className="text-texto-suave">
          Los comentarios y las fotos de la portada salen de{" "}
          <Link to="/panel/entregas" className="font-bold text-marca underline underline-offset-4">
            Entregas
          </Link>
          : el cliente los escribe desde su enlace y decide qué se publica.
        </p>
      </Bloque>
    </div>
  );
}

function ListaDeContenido({ tipo, elementos }: { tipo: TipoDeContenido; elementos: Elemento[] }) {
  const forma = DE_CADA_TIPO[tipo];

  return (
    <Bloque titulo={forma.titulo} descripcion={forma.descripcion}>
      <div className="flex flex-col gap-3">
        {elementos.length === 0 ? (
          <Vacio titulo={`Todavía no hay ${forma.titulo.toLowerCase()}`}>{forma.vacio}</Vacio>
        ) : (
          <ul className="flex flex-col divide-y divide-linea">
            {elementos.map((elemento, indice) => (
              <li key={elemento.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-tinta">
                      {String(elemento[forma.campos[0][0]] ?? "")}
                      {!elemento.visible ? <Etiqueta tono="neutro">Oculto</Etiqueta> : null}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-texto-suave">
                      {String(elemento[forma.campos[1][0]] ?? "")}
                    </p>
                  </div>
                  {forma.conOrden ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <BotonMover tipo={tipo} id={elemento.id} hacia="arriba" deshabilitado={indice === 0} />
                      <BotonMover
                        tipo={tipo}
                        id={elemento.id}
                        hacia="abajo"
                        deshabilitado={indice === elementos.length - 1}
                      />
                    </div>
                  ) : null}
                </div>

                <details className="mt-2">
                  <summary className="inline-flex cursor-pointer list-none text-sm font-bold text-marca underline underline-offset-4 [&::-webkit-details-marker]:hidden">
                    Editar
                  </summary>
                  <FichaDeContenido tipo={tipo} elemento={elemento} />
                </details>
              </li>
            ))}
          </ul>
        )}

        {/* Separado de la lista: pegado al último renglón se leía como parte de él. */}
        <details className={elementos.length ? "border-t border-linea pt-3" : ""}>
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-marca [&::-webkit-details-marker]:hidden">
            <IconoMas className="h-5 w-5" />
            Agregar
          </summary>
          <FichaDeContenido tipo={tipo} elemento={null} />
        </details>
      </div>
    </Bloque>
  );
}

function BotonMover({
  tipo,
  id,
  hacia,
  deshabilitado,
}: {
  tipo: TipoDeContenido;
  id: number;
  hacia: "arriba" | "abajo";
  deshabilitado: boolean;
}) {
  return (
    <Form method="post">
      <input type="hidden" name="que" value="mover" />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="hacia" value={hacia} />
      <button
        type="submit"
        disabled={deshabilitado}
        aria-label={hacia === "arriba" ? "Subir en la lista" : "Bajar en la lista"}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta transition-colors hover:bg-marca-suave hover:text-marca disabled:opacity-40"
      >
        {hacia === "arriba" ? (
          <IconoAtras className="h-4 w-4 -rotate-90" />
        ) : (
          <IconoAdelante className="h-4 w-4 -rotate-90" />
        )}
      </button>
    </Form>
  );
}

function FichaDeContenido({ tipo, elemento }: { tipo: TipoDeContenido; elemento: Elemento | null }) {
  const forma = DE_CADA_TIPO[tipo];
  return (
    <Form method="post" className="mt-3 flex flex-col gap-4 rounded-xl border border-linea bg-fondo p-4">
      <input type="hidden" name="que" value="guardar" />
      <input type="hidden" name="tipo" value={tipo} />
      {elemento ? <input type="hidden" name="id" value={elemento.id} /> : null}

      <Campo
        etiqueta={forma.campos[0][1]}
        name={forma.campos[0][0]}
        defaultValue={elemento ? String(elemento[forma.campos[0][0]] ?? "") : ""}
        required
      />
      <CampoTexto
        etiqueta={forma.campos[1][1]}
        name={forma.campos[1][0]}
        defaultValue={elemento ? String(elemento[forma.campos[1][0]] ?? "") : ""}
        filas={3}
        required
      />

      <label className="flex items-center gap-3 text-sm font-semibold text-tinta">
        <input
          type="checkbox"
          name="visible"
          defaultChecked={elemento ? elemento.visible : true}
          className="h-5 w-5 accent-[var(--color-marca)]"
        />
        Se ve en el sitio
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit">{elemento ? "Guardar" : "Agregar"}</Boton>
        {elemento ? (
          <button
            type="submit"
            name="que"
            value="borrar"
            formNoValidate
            className="h-12 rounded-xl px-4 text-sm font-bold text-marca transition-colors hover:bg-marca-suave"
          >
            Quitar
          </button>
        ) : null}
      </div>
    </Form>
  );
}
