import { useState } from "react";
import { data, Form, Link, useNavigation } from "react-router";
import { guardarRespuesta, leerEntregaDelEnlace } from "../../../server/db/entregas";
import {
  FOTOS_DEL_CLIENTE,
  PERMISO_COMENTARIO,
  PERMISO_FOTOS,
  PUEDE_RETIRARLO,
  TOPE_COMENTARIO,
  nombrePublico,
  revisarRespuesta,
} from "../../../shared/entrega";
import { FotosDelCliente } from "../../components/publico/fotos-del-cliente";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/entrega";

/**
 * La página que abre el cliente desde el enlace que le manda el equipo (F5).
 * Ve las fotos de su entrega, deja su comentario y da DOS permisos por
 * separado. Nada de lo que mande sale al sitio hasta que el equipo lo aprueba.
 *
 * El enlace es la llave: enlace falso o caducado → 404 (no se confirma que
 * existió); ya contestado → las gracias. La página nunca se indexa ni se
 * guarda en caché, y no manda `Referer` a nadie (`server/http.ts`).
 *
 * El comentario y los permisos van en un POST normal, así que funcionan sin
 * JavaScript. Agregar fotos propias sí lo necesita (se suben directo a
 * Cloudinary desde el navegador).
 */

export async function loader({ params, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const entrega = await leerEntregaDelEnlace(servicios.db, servicios.config.cloudinary.cloudName, params.token);
  if (!entrega) throw data(null, { status: 404 });
  return {
    entrega,
    nombreNegocio: servicios.config.nombreNegocio,
    subidaLista: servicios.config.cloudinary.configurado,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const { servicios, peticion, esperar } = context.get(contextoServidor);
  const { db, config } = servicios;

  const entrega = await leerEntregaDelEnlace(db, config.cloudinary.cloudName, params.token);
  if (!entrega) throw data(null, { status: 404 });
  if (entrega.enviada) return { ok: true as const };

  const formulario = await request.formData();
  const hayFotos = entrega.fotosDelEquipo.length + entrega.fotosDelCliente.length > 0;
  const revision = revisarRespuesta(formulario, hayFotos);
  if (!revision.ok) return data({ error: revision.mensaje, campo: revision.campo }, { status: 400 });
  // El campo trampa: se contesta «gracias» y no se guarda nada.
  if (revision.trampa) return { ok: true as const };

  const permitido = await servicios.limites.formularios.limit({
    key: `formulario:${peticion.ip}`,
  });
  if (!permitido.success) {
    return data(
      {
        error: "Recibimos varios envíos desde aquí. Espera un minuto e inténtalo de nuevo.",
        campo: "",
      },
      { status: 429 },
    );
  }

  const r = await guardarRespuesta(db, config.cloudinary, params.token, revision.valor, esperar);
  if (!r.ok && r.error !== "ya_enviada") return data({ error: r.mensaje, campo: "" }, { status: r.estado });
  return { ok: true as const };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const nombre = loaderData?.nombreNegocio ?? "Activos Inmobiliarios Globales";
  return [{ title: `Tu entrega | ${nombre}` }, { name: "robots", content: "noindex, nofollow" }];
}

const CAMPO =
  "h-12 w-full rounded-xl border border-linea bg-superficie px-4 text-base text-tinta outline-none transition-colors focus:border-marca";

export default function Entrega({ loaderData, actionData, params }: Route.ComponentProps) {
  const { entrega, nombreNegocio, subidaLista } = loaderData;
  const navegacion = useNavigation();
  const enviando = navegacion.state === "submitting";
  const listo = entrega.enviada || (actionData && "ok" in actionData && actionData.ok);
  const error = actionData && "error" in actionData ? actionData.error : null;

  // El saludo con el nombre que capturó el equipo; lo que escriba el cliente
  // manda sobre cómo sale publicado.
  const pila = entrega.nombre.split(" ")[0] ?? "";
  const [nombre, setNombre] = useState(pila);
  const [apellido, setApellido] = useState(entrega.nombre.split(" ").slice(1).join(" "));
  const [aceptaFotos, setAceptaFotos] = useState(false);
  const [comentario, setComentario] = useState("");

  if (listo) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <h1 className="font-display text-titulo text-tinta">¡Gracias{pila ? `, ${pila}` : ""}!</h1>
        <p className="mt-4 text-guia text-texto-suave">
          Ya recibimos tu respuesta. Antes de publicar cualquier cosa la revisamos, y solo sale lo que nos autorizaste.
        </p>
        <p className="mt-4 text-texto-suave">{PUEDE_RETIRARLO}</p>
        <Link
          to="/"
          viewTransition
          className="mt-10 inline-flex h-12 items-center rounded-xl bg-marca px-6 font-extrabold text-white transition-colors hover:bg-marca-oscuro"
        >
          Ir al sitio de {nombreNegocio}
        </Link>
      </div>
    );
  }

  const fotosDelEquipo = entrega.fotosDelEquipo;
  const asiAparece = nombre.trim().length >= 2 ? nombrePublico(nombre, apellido) : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <header>
        <p className="text-sm font-bold tracking-widest text-marca uppercase">Tu entrega</p>
        <h1 className="mt-2 font-display text-titulo text-tinta">Hola{pila ? `, ${pila}` : ""}</h1>
        <p className="mt-3 max-w-[60ch] text-guia text-texto-suave">
          Gracias por confiar en {nombreNegocio}. Nos encantaría contarles a otras familias cómo te fue.{" "}
          <strong className="font-bold text-tinta">Tú decides qué se publica</strong>, y nada sale sin que lo revisemos.
        </p>
      </header>

      {fotosDelEquipo.length ? (
        <section className="mt-10" aria-labelledby="titulo-fotos">
          <h2 id="titulo-fotos" className="font-display text-seccion text-tinta">
            {fotosDelEquipo.length === 1 ? "La foto de tu entrega" : "Las fotos de tu entrega"}
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {fotosDelEquipo.map((foto) => (
              <li key={foto.src} className="overflow-hidden rounded-2xl bg-marca-suave">
                <img
                  src={foto.src}
                  srcSet={foto.srcset ?? undefined}
                  sizes="(min-width: 640px) 24rem, 92vw"
                  alt={foto.alt}
                  width={640}
                  height={480}
                  decoding="async"
                  className="aspect-[4/3] w-full object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Form method="post" className="mt-10 flex flex-col gap-8">
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-marca/30 bg-marca-suave px-4 py-3 text-sm font-semibold text-marca-oscuro"
          >
            {error}
          </p>
        ) : null}

        <fieldset className="flex flex-col gap-4">
          <legend className="font-display text-seccion text-tinta">¿Cómo te llamas?</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold text-tinta">Nombre</span>
              <input
                name="nombre"
                required
                minLength={2}
                maxLength={40}
                autoComplete="given-name"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className={CAMPO}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold text-tinta">Apellido</span>
              <input
                name="apellido"
                maxLength={40}
                autoComplete="family-name"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                className={CAMPO}
              />
            </label>
          </div>
          <p className="text-sm text-texto-suave">
            En el sitio solo sale tu nombre y la inicial de tu apellido
            {asiAparece ? (
              <>
                : <strong className="font-bold text-tinta">{asiAparece}</strong>
              </>
            ) : null}
            .
          </p>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="font-display text-seccion text-tinta">¿Cómo te fue con nosotros?</span>
          <span className="text-sm text-texto-suave">Opcional. Lo que quieras contar de tu casa o de la atención.</span>
          <textarea
            name="comentario"
            rows={5}
            maxLength={TOPE_COMENTARIO}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            className="mt-1.5 rounded-xl border border-linea bg-superficie px-4 py-3 text-base text-tinta outline-none focus:border-marca"
          />
          <span className="self-end text-xs text-texto-suave tabular-nums">
            {comentario.length} / {TOPE_COMENTARIO}
          </span>
        </label>

        {/* Campo trampa: una persona no lo ve, un programa lo llena. */}
        <input
          type="text"
          name="sitio_web"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />

        <fieldset className="flex flex-col gap-4 rounded-2xl border border-linea bg-superficie p-5 sm:p-6">
          <legend className="px-2 font-display text-seccion text-tinta">Tus permisos</legend>
          <p className="text-sm text-texto-suave">Cada uno por separado: puedes darnos uno, los dos o ninguno.</p>

          <label className="flex items-start gap-3 text-texto">
            <input type="checkbox" name="acepta_texto" value="1" className="mt-0.5 h-5 w-5 shrink-0 accent-[#a0051c]" />
            <span>{PERMISO_COMENTARIO}</span>
          </label>

          <label className="flex items-start gap-3 text-texto">
            <input
              type="checkbox"
              name="acepta_fotos"
              value="1"
              checked={aceptaFotos}
              onChange={(e) => setAceptaFotos(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#a0051c]"
            />
            <span>{PERMISO_FOTOS}</span>
          </label>

          <p className="text-sm text-texto-suave">
            {PUEDE_RETIRARLO} Más detalles en el{" "}
            <Link to="/aviso-de-privacidad" className="font-bold text-marca underline underline-offset-4">
              aviso de privacidad
            </Link>
            .
          </p>
        </fieldset>

        <FotosDelCliente
          token={params.token}
          fotos={entrega.fotosDelCliente}
          habilitado={aceptaFotos && subidaLista}
          tope={FOTOS_DEL_CLIENTE}
        />

        <div>
          <button
            type="submit"
            disabled={enviando}
            className="h-13 w-full rounded-xl bg-tinta px-8 text-base font-extrabold text-white transition-colors hover:bg-marca-oscuro disabled:cursor-wait disabled:opacity-70 sm:w-auto"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
          <p className="mt-3 text-sm text-texto-suave">Solo se puede enviar una vez.</p>
        </div>
      </Form>
    </div>
  );
}
