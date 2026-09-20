import { data, Form, redirect } from "react-router";
import { puede } from "../../../shared/permisos";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { leerConfiguracion } from "../../../server/db/configuracion";
import { esClaveEditable, guardarConfiguracion } from "../../../server/db/panel/configuracion";
import { MODELOS, neuronsEstimados } from "../../../server/ia/motor";
import { diaDeMorelia, usoReciente } from "../../../server/ia/uso";
import { Aviso, Bloque, Boton, Campo, CampoSelect, CampoTexto } from "../../components/panel/piezas";
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
  const puedeBuscador = puede(usuario, "configuracion.buscador");
  if (!puede(usuario, "configuracion.contacto") && !puede(usuario, "configuracion.aviso") && !puedeBuscador) {
    throw new Response("Sin permiso", { status: 403 });
  }

  const [configuracion, uso] = await Promise.all([
    leerConfiguracion(servicios.db),
    puedeBuscador ? usoReciente(servicios.db, 7) : Promise.resolve([]),
  ]);
  const { modelo } = configuracion.busquedaIA;
  return {
    configuracion,
    puedeContacto: puede(usuario, "configuracion.contacto"),
    puedeAviso: puede(usuario, "configuracion.aviso"),
    puedeBuscador,
    buscador: {
      // Sin el binding de Workers AI el interruptor no enciende nada: que se sepa.
      conectado: Boolean(servicios.ia),
      modelos: MODELOS.map(({ id, nombre, nota }) => ({ id, nombre, nota })),
      hoy: diaDeMorelia(),
      uso: uso.map((dia) => ({
        ...dia,
        promedioMs: dia.consultas ? Math.round(dia.ms / dia.consultas) : 0,
        neurons: neuronsEstimados(modelo, dia.tokensEntrada, dia.tokensSalida),
      })),
    },
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

  const datos = Object.fromEntries(formulario.entries()) as Record<string, unknown>;
  // Una casilla sin marcar NO viaja en el formulario (PLAN §17): el apagado se
  // manda escrito, o apagar el buscador desde aquí sería imposible.
  if (clave === "busqueda_ia") datos.activa = formulario.has("activa") ? "on" : "off";

  const r = await guardarConfiguracion(servicios.db, encontrada.sesion.usuario, clave, datos);
  return r.ok ? redirect(`/panel/configuracion?guardado=${clave}`) : data({ error: r.mensaje }, { status: r.estado });
}

export default function Configuracion({ loaderData, actionData }: Route.ComponentProps) {
  const { configuracion, puedeContacto, puedeAviso, puedeBuscador, buscador, guardado } = loaderData;
  const { contacto, whatsapp, redes, avisoPrivacidad, busquedaIA } = configuracion;
  const usoDeHoy = buscador.uso.find((dia) => dia.dia === buscador.hoy);

  return (
    // Desde 1280 px, dos columnas: Contacto | WhatsApp y Redes | Aviso de
    // privacidad. `items-start` para que Redes no se estire a la altura del aviso.
    <div className="flex max-w-3xl flex-col gap-6 xl:grid xl:max-w-7xl xl:grid-cols-2 xl:items-start">
      <header className="xl:col-span-2">
        <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Configuración</h1>
        <p className="mt-2 text-texto-suave">
          Lo que cambies aquí se ve en todo el sitio: el pie, la página de contacto y el WhatsApp de cada casa.
        </p>
      </header>

      {actionData?.error ? <Aviso className="xl:col-span-2">{actionData.error}</Aviso> : null}
      {guardado ? (
        <Aviso tono="exito" className="xl:col-span-2">
          Guardado. Recarga el sitio para verlo.
        </Aviso>
      ) : null}

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

      {puedeBuscador ? (
        <Bloque
          titulo="Buscador inteligente"
          descripcion="Deja que la gente busque con sus palabras: «casa de 3 recámaras en Altozano hasta 4 millones». Lo entiende la inteligencia artificial de Cloudflare."
          className="xl:col-span-2"
        >
          <div className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:gap-10">
            <Form method="post" className="flex flex-col gap-5">
              <input type="hidden" name="que" value="busqueda_ia" />

              {!buscador.conectado ? (
                <Aviso>Este despliegue no tiene conectada la inteligencia artificial: encenderlo aquí no cambia nada.</Aviso>
              ) : null}

              <label className="flex items-start gap-3 text-sm font-semibold text-tinta">
                <input
                  type="checkbox"
                  name="activa"
                  defaultChecked={busquedaIA.activa}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-marca)]"
                />
                <span>
                  Encendido
                  <span className="mt-1 block font-normal text-texto-suave">
                    Apagado, el buscador sigue entendiendo lo básico sin gastar nada («casa en renta en Altozano», errores de
                    dedo, «con alberca»); deja de entender precios y frases largas.
                  </span>
                </span>
              </label>

              <CampoSelect
                etiqueta="Modelo"
                name="modelo"
                defaultValue={busquedaIA.modelo}
                ayuda="Los cuatro se midieron con 51 búsquedas reales antes de elegir."
              >
                {buscador.modelos.map((modelo) => (
                  <option key={modelo.id} value={modelo.id}>
                    {modelo.nombre}
                  </option>
                ))}
              </CampoSelect>

              <ul className="flex flex-col gap-2 text-sm text-texto-suave">
                {buscador.modelos.map((modelo) => (
                  <li key={modelo.id}>
                    <strong className="font-bold text-tinta">{modelo.nombre}.</strong> {modelo.nota}
                  </li>
                ))}
              </ul>

              <Campo
                etiqueta="Tope de consultas por día"
                name="tope_diario"
                type="number"
                inputMode="numeric"
                min={0}
                max={5000}
                defaultValue={busquedaIA.topeDiario}
                ayuda="Al llegar al tope el buscador sigue funcionando, sin la inteligencia artificial, hasta el día siguiente. La cuenta de Cloudflare incluye 10,000 Neurons al día."
              />

              <div>
                <Boton type="submit">Guardar el buscador</Boton>
              </div>
            </Form>

            <div>
              <h3 className="text-sm font-extrabold text-tinta">Cuánto se ha usado</h3>
              <p className="mt-1 text-sm text-texto-suave">
                Hoy: <strong className="font-bold text-tinta tabular-nums">{usoDeHoy?.consultas ?? 0}</strong> de{" "}
                <span className="tabular-nums">{busquedaIA.topeDiario}</span> consultas. Una frase ya entendida no se vuelve a
                preguntar en una semana, y aquí no se guarda lo que la gente escribe.
              </p>

              {buscador.uso.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <caption className="sr-only">Uso del buscador inteligente en los últimos siete días</caption>
                    <thead>
                      <tr className="border-b border-linea text-texto-suave">
                        <th scope="col" className="py-2 pr-4 font-bold">
                          Día
                        </th>
                        <th scope="col" className="py-2 pr-4 text-right font-bold">
                          Consultas
                        </th>
                        <th scope="col" className="py-2 pr-4 text-right font-bold">
                          De memoria
                        </th>
                        <th scope="col" className="py-2 pr-4 text-right font-bold">
                          Sin respuesta
                        </th>
                        <th scope="col" className="py-2 pr-4 text-right font-bold">
                          Tardó
                        </th>
                        <th scope="col" className="py-2 text-right font-bold">
                          Neurons
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-linea">
                      {buscador.uso.map((dia) => (
                        <tr key={dia.dia} className="tabular-nums">
                          <td className="py-2 pr-4 text-tinta">{dia.dia}</td>
                          <td className="py-2 pr-4 text-right text-tinta">{dia.consultas}</td>
                          <td className="py-2 pr-4 text-right text-texto-suave">{dia.deCache}</td>
                          <td className="py-2 pr-4 text-right text-texto-suave">{dia.fallos}</td>
                          <td className="py-2 pr-4 text-right text-texto-suave">
                            {dia.promedioMs ? `${(dia.promedioMs / 1000).toFixed(1)} s` : "—"}
                          </td>
                          <td className="py-2 text-right text-texto-suave">≈ {dia.neurons}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm text-texto-suave">Todavía no se ha usado en estos siete días.</p>
              )}
            </div>
          </div>
        </Bloque>
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
