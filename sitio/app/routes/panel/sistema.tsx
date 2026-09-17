import { data, Form, redirect } from "react-router";
import { ETIQUETA_ESTADO, type EstadoPropiedad } from "../../../shared/propiedad";
import { puede } from "../../../shared/permisos";
import { sesionDePeticion } from "../../../server/auth/guardia";
import {
  borrarRedireccion,
  estadoDelSistema,
  guardarRedireccion,
  listarRedirecciones,
} from "../../../server/db/panel/sistema";
import { IconoListo, IconoMas } from "../../components/panel/iconos";
import { Aviso, Bloque, Boton, Campo, CampoSelect, Etiqueta, Vacio } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/sistema";

export function meta() {
  return [{ title: "Sistema | Panel" }];
}

/**
 * Lo técnico (PLAN §11.2), solo para el maestro: qué está conectado, qué falta
 * por migrar y las redirecciones de las direcciones viejas, que son las que
 * evitan que lo que hoy está en Google termine en un 404.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  if (!puede(encontrada.sesion.usuario, "sistema.gestionar")) throw new Response("Sin permiso", { status: 403 });

  const [estado, redirecciones] = await Promise.all([
    estadoDelSistema(servicios.db, servicios.config),
    listarRedirecciones(servicios.db),
  ]);
  return { estado, redirecciones };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;

  const formulario = await request.formData();
  const que = String(formulario.get("que") ?? "");

  if (que === "borrar") {
    const r = await borrarRedireccion(servicios.db, usuario, String(formulario.get("origen") ?? ""));
    return r.ok ? redirect("/panel/sistema") : data({ error: r.mensaje }, { status: r.estado });
  }

  const r = await guardarRedireccion(servicios.db, usuario, Object.fromEntries(formulario.entries()));
  return r.ok ? redirect("/panel/sistema") : data({ error: r.mensaje }, { status: r.estado });
}

export default function Sistema({ loaderData, actionData }: Route.ComponentProps) {
  const { estado, redirecciones } = loaderData;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Sistema</h1>
        <p className="mt-2 text-texto-suave">Lo técnico: qué está conectado y qué falta para salir a producción.</p>
      </header>

      {actionData?.error ? <Aviso>{actionData.error}</Aviso> : null}

      <Bloque titulo="Cómo está el sitio ahora">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Dato titulo="Dirección" valor={estado.sitioUrl} />
          <Dato
            titulo="Modo"
            valor={estado.modoDemo ? "Propuesta: sin Google y sin correos" : "Producción"}
            tono={estado.modoDemo ? "aviso" : "exito"}
          />
          <Dato
            titulo="Fotos"
            valor={estado.cloudinary.configurado ? `En Cloudinary (${estado.cloudinary.nube})` : "Sin configurar"}
            tono={estado.cloudinary.configurado ? "exito" : "aviso"}
          />
          <Dato
            titulo="Fotos por migrar"
            valor={
              estado.fotosPendientes === 0
                ? "Ninguna: todas están en Cloudinary"
                : `${estado.fotosPendientes} siguen en el servidor anterior`
            }
            tono={estado.fotosPendientes === 0 ? "exito" : "aviso"}
          />
          <Dato titulo="Analítica" valor={estado.integraciones.analitica ? "Conectada" : "Apagada"} />
          <Dato titulo="Correos" valor={estado.integraciones.correo ? "Conectados" : "Apagados"} />
        </dl>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-linea pt-5">
          {estado.casas.map((casa) => (
            <Etiqueta key={casa.estado} tono={casa.estado === "publicada" ? "exito" : "neutro"}>
              {ETIQUETA_ESTADO[casa.estado as EstadoPropiedad] ?? casa.estado}: {casa.n}
            </Etiqueta>
          ))}
        </div>
      </Bloque>

      <Bloque
        titulo={`Redirecciones (${redirecciones.length})`}
        descripcion="Mandan cada dirección vieja a la nueva. Sin ellas, lo que hoy está en Google caería en un 404."
      >
        <div className="flex flex-col gap-4">
          {redirecciones.length === 0 ? (
            <Vacio titulo="Todavía no hay redirecciones">
              La importación deja aquí las direcciones que cambiaron.
            </Vacio>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Redirecciones</caption>
                <thead>
                  <tr className="border-b border-linea text-texto-suave">
                    <th scope="col" className="py-2 pr-4 font-bold">
                      Dirección vieja
                    </th>
                    <th scope="col" className="py-2 pr-4 font-bold">
                      Va a
                    </th>
                    <th scope="col" className="py-2 pr-4 font-bold">
                      Código
                    </th>
                    <th scope="col" className="py-2">
                      <span className="sr-only">Quitar</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {redirecciones.map((redireccion) => (
                    <tr key={redireccion.origen}>
                      <td className="py-2 pr-4 break-all text-tinta">{redireccion.origen}</td>
                      <td className="py-2 pr-4 break-all text-texto-suave">{redireccion.destino}</td>
                      <td className="py-2 pr-4 text-texto-suave tabular-nums">{redireccion.codigo}</td>
                      <td className="py-2 text-right">
                        <Form method="post">
                          <input type="hidden" name="que" value="borrar" />
                          <input type="hidden" name="origen" value={redireccion.origen} />
                          <button
                            type="submit"
                            className="h-9 rounded-lg px-2.5 text-xs font-bold text-marca transition-colors hover:bg-marca-suave"
                          >
                            Quitar
                          </button>
                        </Form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <details className={redirecciones.length ? "border-t border-linea pt-4" : ""}>
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-marca [&::-webkit-details-marker]:hidden">
              <IconoMas className="h-5 w-5" />
              Agregar una redirección
            </summary>
            <Form method="post" className="mt-3 flex flex-col gap-4 rounded-xl border border-linea bg-fondo p-4">
              <input type="hidden" name="que" value="guardar" />
              <Campo
                etiqueta="Dirección vieja"
                name="origen"
                required
                placeholder="/properties/casa-en-el-prado-4"
                ayuda="Tal como está hoy, empezando con una diagonal."
              />
              <Campo
                etiqueta="Va a"
                name="destino"
                required
                placeholder="/propiedades/casa-en-el-prado-4"
                ayuda="Una dirección de este sitio, o una completa con https://"
              />
              <CampoSelect etiqueta="Código" name="codigo" defaultValue="301">
                <option value="301">301: definitiva</option>
                <option value="302">302: temporal</option>
              </CampoSelect>
              <div>
                <Boton type="submit">Guardar la redirección</Boton>
              </div>
            </Form>
          </details>
        </div>
      </Bloque>
    </div>
  );
}

function Dato({ titulo, valor, tono }: { titulo: string; valor: string; tono?: "exito" | "aviso" }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-texto-suave">{titulo}</dt>
      <dd className="flex items-center gap-2 font-bold break-all text-tinta">
        {tono === "exito" ? <IconoListo className="h-5 w-5 shrink-0 text-exito" /> : null}
        <span className={tono === "aviso" ? "text-aviso" : undefined}>{valor}</span>
      </dd>
    </div>
  );
}
