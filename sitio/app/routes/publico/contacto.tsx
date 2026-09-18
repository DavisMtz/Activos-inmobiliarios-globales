import { data, Form, Link, useNavigation } from "react-router";
import { leerConfigDelSitio } from "../../../server/db/configuracion";
import { guardarProspecto, revisarProspecto } from "../../../server/db/prospectos";
import { enlaceWhatsApp } from "../../../shared/whatsapp";
import { IconoCorreo, IconoTelefono, IconoUbicacion, IconoWhatsApp } from "../../components/publico/iconos";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/contacto";

/**
 * Contacto: los datos reales y un formulario que sí guarda (PLAN §10.2).
 *
 * En la propuesta no se manda ningún correo (D11): el mensaje queda en el
 * panel. El enlace al mapa es un enlace, no un iframe de Google: el del sitio
 * actual pesa y bloquea el dibujado en el celular.
 */

export async function loader({ context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const { contacto, whatsapp } = await leerConfigDelSitio(servicios.db);
  return {
    contacto,
    whatsapp: enlaceWhatsApp(whatsapp.numero, whatsapp.plantillaGeneral),
    nombreNegocio: servicios.config.nombreNegocio,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios, peticion } = context.get(contextoServidor);
  const formulario = await request.formData();

  const revision = revisarProspecto(formulario, { tipo: "general", origen: "contacto" });
  if (!revision.ok) return data({ error: revision.mensaje }, { status: 400 });
  if (revision.trampa) return { ok: true as const };

  const permitido = await servicios.limites.formularios.limit({ key: `formulario:${peticion.ip}` });
  if (!permitido.success) {
    return data(
      { error: "Recibimos varios mensajes desde aquí. Espera un minuto e inténtalo de nuevo." },
      { status: 429 },
    );
  }

  await guardarProspecto(servicios.db, revision.valor);
  return { ok: true as const };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const nombre = loaderData?.nombreNegocio ?? "Activos Inmobiliarios Globales";
  return [
    { title: `Contacto | ${nombre}` },
    {
      name: "description",
      content: "Escríbenos por WhatsApp o déjanos tus datos y un asesor te contacta. Morelia, Michoacán.",
    },
  ];
}

export default function Contacto({ loaderData, actionData }: Route.ComponentProps) {
  const { contacto, whatsapp } = loaderData;
  const navegacion = useNavigation();
  const enviando = navegacion.state === "submitting";
  const listo = actionData && "ok" in actionData && actionData.ok;
  const error = actionData && "error" in actionData ? actionData.error : null;

  const telefonoHref = `tel:${contacto.telefono.replace(/[^\d+]/g, "")}`;
  const mapa = contacto.direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contacto.direccion)}`
    : null;

  return (
    <div className="mx-auto max-w-sitio px-5 lg:px-10 py-10 sm:py-14">
      {/* En escritorio el titular sube a la columna izquierda y el formulario
          arranca a su altura: antes la izquierda era un botón solo frente a un
          formulario de 640 px. En el celular el orden es el mismo. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:gap-16">
        <div>
          <header className="max-w-2xl">
            <h1 className="font-display text-titulo text-tinta">Hablemos de tu propiedad</h1>
            <p className="mt-3 text-guia text-texto-suave">
              Escríbenos por WhatsApp y te contestamos en el momento, o déjanos tus datos y un asesor te busca.
            </p>
          </header>

          <section className="mt-10">
            <ul className="flex flex-col gap-5">
              {contacto.telefono ? (
                <li>
                  <a href={telefonoHref} className="flex items-start gap-4 group">
                    <IconoTelefono className="mt-1 h-5 w-5 shrink-0 text-marca" />
                    <span>
                      <span className="block text-sm text-texto-suave">Teléfono</span>
                      <span className="text-lg font-bold text-tinta tabular-nums group-hover:underline">
                        {contacto.telefono}
                      </span>
                    </span>
                  </a>
                </li>
              ) : null}

              {contacto.correo ? (
                <li>
                  <a href={`mailto:${contacto.correo}`} className="flex items-start gap-4 group">
                    <IconoCorreo className="mt-1 h-5 w-5 shrink-0 text-marca" />
                    <span className="min-w-0">
                      <span className="block text-sm text-texto-suave">Correo</span>
                      <span className="block truncate text-lg font-bold text-tinta group-hover:underline">
                        {contacto.correo}
                      </span>
                    </span>
                  </a>
                </li>
              ) : null}

              {contacto.direccion ? (
                <li className="flex items-start gap-4">
                  <IconoUbicacion className="mt-1 h-5 w-5 shrink-0 text-marca" />
                  <span>
                    <span className="block text-sm text-texto-suave">Oficina</span>
                    <span className="text-lg font-bold text-tinta">{contacto.direccion}</span>
                    {mapa ? (
                      <a
                        href={mapa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block font-bold text-marca underline underline-offset-4"
                      >
                        Abrir en Mapas
                      </a>
                    ) : null}
                  </span>
                </li>
              ) : null}

              {contacto.horario ? (
                <li className="flex items-start gap-4">
                  <span className="mt-1 h-5 w-5 shrink-0" />
                  <span>
                    <span className="block text-sm text-texto-suave">Horario</span>
                    <span className="text-lg font-bold text-tinta">{contacto.horario}</span>
                  </span>
                </li>
              ) : null}
            </ul>

            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex h-13 items-center gap-2 rounded-xl bg-marca px-6 py-3.5 text-base font-extrabold text-white transition-colors hover:bg-marca-oscuro"
              >
                <IconoWhatsApp />
                Escribir por WhatsApp
              </a>
            ) : null}
          </section>
        </div>

        <section className="rounded-3xl border border-linea bg-superficie p-6 shadow-tarjeta sm:p-8">
          {listo ? (
            <>
              <h2 className="font-display text-seccion text-tinta">Gracias, ya tenemos tu mensaje</h2>
              <p className="mt-3 text-texto-suave">
                Un asesor te contacta pronto. Si prefieres no esperar, escríbenos por WhatsApp.
              </p>
            </>
          ) : (
            <Form method="post" className="flex flex-col gap-4">
              <h2 className="font-display text-seccion text-tinta">Déjanos tus datos</h2>

              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-marca/30 bg-marca-suave px-4 py-3 text-sm font-semibold text-marca-oscuro"
                >
                  {error}
                </p>
              ) : null}

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold text-tinta">Tu nombre</span>
                <input
                  name="nombre"
                  required
                  autoComplete="name"
                  className="h-12 rounded-xl border border-linea px-4 text-base text-tinta outline-none focus:border-marca"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold text-tinta">Tu teléfono</span>
                <input
                  name="telefono"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="h-12 rounded-xl border border-linea px-4 text-base text-tinta outline-none focus:border-marca"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold text-tinta">Tu correo (opcional)</span>
                <input
                  name="correo"
                  type="email"
                  autoComplete="email"
                  className="h-12 rounded-xl border border-linea px-4 text-base text-tinta outline-none focus:border-marca"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold text-tinta">¿En qué te ayudamos?</span>
                <textarea
                  name="mensaje"
                  rows={4}
                  className="rounded-xl border border-linea px-4 py-3 text-base text-tinta outline-none focus:border-marca"
                />
              </label>

              {/* Campo trampa: una persona no lo ve, un programa lo llena. */}
              <input
                type="text"
                name="empresa"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
              />

              <label className="flex items-start gap-3 text-sm text-texto">
                <input type="checkbox" name="acepto" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#a0051c]" />
                <span>
                  Acepto el{" "}
                  <Link to="/aviso-de-privacidad" className="font-bold text-marca underline underline-offset-4">
                    aviso de privacidad
                  </Link>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={enviando}
                className="h-12 rounded-xl bg-tinta px-5 text-base font-extrabold text-white transition-colors hover:bg-marca-oscuro disabled:cursor-wait disabled:opacity-70"
              >
                {enviando ? "Enviando…" : "Enviar"}
              </button>
            </Form>
          )}
        </section>
      </div>
    </div>
  );
}
