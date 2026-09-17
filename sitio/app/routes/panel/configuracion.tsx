import { data, Form, redirect } from "react-router";
import { puede } from "../../../shared/permisos";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { leerConfiguracion } from "../../../server/db/configuracion";
import { esClaveEditable, guardarConfiguracion } from "../../../server/db/panel/configuracion";
import { Aviso, Bloque, Boton, Campo, CampoTexto } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/configuracion";

export function meta() {
  return [{ title: "Configuración | Panel" }];
}

/**
 * Teléfono, WhatsApp, redes y aviso de privacidad (PLAN §6.3). Cambiar el
 * teléfono aquí lo cambia en TODO el sitio: en el pie, en la ficha y en el
 * enlace de WhatsApp de cada casa. Por eso no está en el código.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;
  if (!puede(usuario, "configuracion.contacto") && !puede(usuario, "configuracion.aviso")) {
    throw new Response("Sin permiso", { status: 403 });
  }

  const configuracion = await leerConfiguracion(servicios.db);
  return {
    configuracion,
    puedeContacto: puede(usuario, "configuracion.contacto"),
    puedeAviso: puede(usuario, "configuracion.aviso"),
    guardado: new URL(request.url).searchParams.get("guardado"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");

  const formulario = await request.formData();
  const clave = String(formulario.get("que") ?? "");
  if (!esClaveEditable(clave)) return data({ error: "No entendimos qué guardar." }, { status: 400 });

  const r = await guardarConfiguracion(
    servicios.db,
    encontrada.sesion.usuario,
    clave,
    Object.fromEntries(formulario.entries()) as Record<string, unknown>,
  );
  return r.ok ? redirect(`/panel/configuracion?guardado=${clave}`) : data({ error: r.mensaje }, { status: r.estado });
}

export default function Configuracion({ loaderData, actionData }: Route.ComponentProps) {
  const { configuracion, puedeContacto, puedeAviso, guardado } = loaderData;
  const { contacto, whatsapp, redes, avisoPrivacidad } = configuracion;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Configuración</h1>
        <p className="mt-2 text-texto-suave">
          Lo que cambies aquí se ve en todo el sitio: el pie, la página de contacto y el WhatsApp de cada casa.
        </p>
      </header>

      {actionData?.error ? <Aviso>{actionData.error}</Aviso> : null}
      {guardado ? <Aviso tono="exito">Guardado. Recarga el sitio para verlo.</Aviso> : null}

      {puedeContacto ? (
        <>
          <Bloque titulo="Contacto" descripcion="El teléfono y el correo que se leen en el pie y en Contacto.">
            <Form method="post" className="flex flex-col gap-5">
              <input type="hidden" name="que" value="contacto" />
              <Campo
                etiqueta="Teléfono"
                name="telefono"
                type="tel"
                inputMode="tel"
                defaultValue={contacto.telefono}
                ayuda="Se enseña tal como lo escribas, y el enlace para llamar sale de aquí mismo."
              />
              <Campo etiqueta="Correo" name="correo" type="email" defaultValue={contacto.correo} />
              <CampoTexto etiqueta="Dirección" name="direccion" defaultValue={contacto.direccion} filas={2} />
              <Campo
                etiqueta="Horario"
                name="horario"
                defaultValue={contacto.horario}
                ayuda="Si lo dejas vacío, el sitio no enseña horario en vez de inventarlo."
              />
              <div>
                <Boton type="submit">Guardar el contacto</Boton>
              </div>
            </Form>
          </Bloque>

          <Bloque titulo="WhatsApp" descripcion="El número que recibe los mensajes y lo que va escrito de antemano.">
            <Form method="post" className="flex flex-col gap-5">
              <input type="hidden" name="que" value="whatsapp" />
              <Campo
                etiqueta="Número"
                name="numero"
                inputMode="tel"
                defaultValue={whatsapp.numero}
                ayuda="Con clave de país y solo cifras: 52 y los diez dígitos."
              />
              <CampoTexto
                etiqueta="Mensaje al preguntar por una casa"
                name="plantilla_propiedad"
                defaultValue={whatsapp.plantillaPropiedad}
                filas={2}
                ayuda="Puedes usar {titulo}, {clave} y {url}. El {url} es obligatorio: es lo que dice de qué casa hablan."
              />
              <CampoTexto
                etiqueta="Mensaje general"
                name="plantilla_general"
                defaultValue={whatsapp.plantillaGeneral}
                filas={2}
              />
              <div>
                <Boton type="submit">Guardar el WhatsApp</Boton>
              </div>
            </Form>
          </Bloque>

          <Bloque titulo="Redes" descripcion="Los enlaces que salen en el pie. Vacío: no se enseña el icono.">
            <Form method="post" className="flex flex-col gap-5">
              <input type="hidden" name="que" value="redes" />
              <Campo etiqueta="Facebook" name="facebook" type="url" defaultValue={redes.facebook} />
              <Campo etiqueta="Instagram" name="instagram" type="url" defaultValue={redes.instagram} />
              <div>
                <Boton type="submit">Guardar las redes</Boton>
              </div>
            </Form>
          </Bloque>
        </>
      ) : null}

      {puedeAviso ? (
        <Bloque
          titulo="Aviso de privacidad"
          descripcion="El texto que se ve en /aviso-de-privacidad. Lo que hay es un borrador: tiene que revisarlo un abogado."
        >
          <Form method="post" className="flex flex-col gap-5">
            <input type="hidden" name="que" value="aviso_privacidad" />
            <Campo etiqueta="Estado" name="estado" defaultValue={avisoPrivacidad.estado} maxLength={80} />
            <Campo
              etiqueta="Advertencia"
              name="advertencia"
              defaultValue={avisoPrivacidad.advertencia}
              maxLength={300}
              ayuda="Se enseña arriba del texto mientras sea un borrador."
            />
            <Campo etiqueta="Última actualización" name="actualizado" defaultValue={avisoPrivacidad.actualizado} />
            <CampoTexto etiqueta="Texto" name="texto" defaultValue={avisoPrivacidad.texto} filas={14} />
            <div>
              <Boton type="submit">Guardar el aviso</Boton>
            </div>
          </Form>
        </Bloque>
      ) : null}
    </div>
  );
}
