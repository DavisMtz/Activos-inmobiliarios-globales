import { data, Form, redirect, useNavigation } from "react-router";
import { fechaCorta } from "../../../shared/formato";
import { NOMBRE_ROL, ROLES, puede, type Rol } from "../../../shared/permisos";
import { sesionDePeticion } from "../../../server/auth/guardia";
import {
  cambiarActivo,
  cambiarRol,
  crearUsuario,
  generarTemporal,
  listarUsuarios,
  type UsuarioPanel,
} from "../../../server/db/panel/usuarios";
import { IconoAtencion, IconoMas } from "../../components/panel/iconos";
import { Aviso, Bloque, Boton, Campo, CampoSelect, Etiqueta } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/usuarios";

export function meta() {
  return [{ title: "Cuentas | Panel" }];
}

/**
 * Las cuentas del equipo (PLAN §11.2 y §8.2).
 *
 * La contraseña temporal se enseña UNA vez, aquí, y no se guarda en ningún
 * lado: ni en la base (solo su hash) ni en la bitácora. Si se pierde, se genera
 * otra. Por eso esta pantalla no redirige después de crear: la respuesta trae
 * la contraseña y se enseña con el aviso de copiarla.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;
  if (!puede(usuario, "usuarios.gestionar")) throw new Response("Sin permiso", { status: 403 });

  return {
    yo: usuario.id,
    miRol: usuario.rol,
    usuarios: await listarUsuarios(servicios.db, usuario),
    // El director solo administra asesores y contenido (§9).
    rolesQuePuedeDar: ROLES.filter((rol) => puede(usuario, "usuarios.gestionar", { rol })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;

  const formulario = await request.formData();
  const que = String(formulario.get("que") ?? "");
  const id = String(formulario.get("id") ?? "");
  const db = servicios.db;

  if (que === "crear") {
    const r = await crearUsuario(db, usuario, {
      nombre: formulario.get("nombre"),
      correo: formulario.get("correo"),
      rol: formulario.get("rol"),
      whatsapp: formulario.get("whatsapp"),
    });
    return r.ok
      ? data({ temporal: { nombre: r.valor.usuario.nombre, correo: r.valor.usuario.correo, clave: r.valor.clave }, error: null })
      : data({ temporal: null, error: r.mensaje }, { status: r.estado });
  }

  if (que === "temporal") {
    const r = await generarTemporal(db, usuario, id);
    return r.ok
      ? data({ temporal: { nombre: r.valor.usuario.nombre, correo: r.valor.usuario.correo, clave: r.valor.clave }, error: null })
      : data({ temporal: null, error: r.mensaje }, { status: r.estado });
  }

  if (que === "rol") {
    const r = await cambiarRol(db, usuario, id, formulario.get("rol"));
    return r.ok ? redirect("/panel/usuarios") : data({ temporal: null, error: r.mensaje }, { status: r.estado });
  }

  if (que === "activo") {
    const r = await cambiarActivo(db, usuario, id, String(formulario.get("activo")) === "1");
    return r.ok ? redirect("/panel/usuarios") : data({ temporal: null, error: r.mensaje }, { status: r.estado });
  }

  return data({ temporal: null, error: "No entendimos qué hacer." }, { status: 400 });
}

export default function Usuarios({ loaderData, actionData }: Route.ComponentProps) {
  const { yo, usuarios, rolesQuePuedeDar } = loaderData;
  const navegacion = useNavigation();
  const creando = navegacion.formData?.get("que") === "crear" && navegacion.state !== "idle";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Cuentas</h1>
        <p className="mt-2 text-texto-suave">
          Quién entra al panel y qué puede hacer. Cada quien usa su propia cuenta: así la bitácora dice quién cambió
          qué.
        </p>
      </header>

      {actionData?.error ? <Aviso>{actionData.error}</Aviso> : null}

      {/* La contraseña temporal, una sola vez y bien visible. */}
      {actionData?.temporal ? (
        <div className="rounded-2xl border border-marca/30 bg-marca-suave p-5">
          <p className="flex items-center gap-2 font-extrabold text-marca-oscuro">
            <IconoAtencion className="h-5 w-5 shrink-0" />
            Cópiala ahora: no se vuelve a mostrar
          </p>
          <p className="mt-3 text-marca-oscuro">
            Contraseña temporal de {actionData.temporal.nombre} ({actionData.temporal.correo}):
          </p>
          <p className="mt-2 rounded-xl border border-marca/20 bg-superficie px-4 py-3 font-mono text-lg font-bold tracking-wider text-tinta select-all">
            {actionData.temporal.clave}
          </p>
          <p className="mt-3 text-sm text-marca-oscuro">
            Mándasela por WhatsApp. Vence en 72 horas y, al entrar, el sistema le pedirá elegir la suya.
          </p>
        </div>
      ) : null}

      <Bloque titulo="Dar de alta a alguien" descripcion="Se le crea una contraseña temporal que tendrá que cambiar al entrar.">
        <Form method="post" className="flex flex-col gap-5">
          <input type="hidden" name="que" value="crear" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Campo etiqueta="Nombre" name="nombre" required minLength={3} />
            <Campo etiqueta="Correo" name="correo" type="email" required />
            <CampoSelect etiqueta="Rol" name="rol" defaultValue={rolesQuePuedeDar[0] ?? "asesor"}>
              {rolesQuePuedeDar.map((rol) => (
                <option key={rol} value={rol}>
                  {NOMBRE_ROL[rol]}
                </option>
              ))}
            </CampoSelect>
            <Campo etiqueta="WhatsApp" name="whatsapp" type="tel" inputMode="tel" ayuda="Opcional. Sale en sus casas." />
          </div>
          <div>
            <Boton type="submit" ocupado={creando}>
              <IconoMas className="h-5 w-5" />
              {creando ? "Creando…" : "Crear la cuenta"}
            </Boton>
          </div>
        </Form>
      </Bloque>

      <Bloque titulo={`Cuentas (${usuarios.length})`}>
        <ul className="flex flex-col divide-y divide-linea">
          {usuarios.map((persona) => (
            <li key={persona.id} className="py-4 first:pt-0 last:pb-0">
              <FichaDeCuenta persona={persona} soyYo={persona.id === yo} rolesQuePuedeDar={rolesQuePuedeDar} />
            </li>
          ))}
        </ul>
      </Bloque>
    </div>
  );
}

function FichaDeCuenta({
  persona,
  soyYo,
  rolesQuePuedeDar,
}: {
  persona: UsuarioPanel;
  soyYo: boolean;
  rolesQuePuedeDar: Rol[];
}) {
  const puedeCambiarRol = !soyYo && rolesQuePuedeDar.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-tinta">{persona.nombre}</span>
            <Etiqueta tono={persona.rol === "maestro" ? "tinta" : "neutro"}>{NOMBRE_ROL[persona.rol]}</Etiqueta>
            {!persona.activo ? <Etiqueta tono="marca">Desactivada</Etiqueta> : null}
            {persona.debeCambiarClave ? <Etiqueta tono="aviso">Con temporal</Etiqueta> : null}
            {soyYo ? <Etiqueta tono="neutro">Tú</Etiqueta> : null}
          </p>
          <p className="mt-1 text-sm break-all text-texto-suave">{persona.correo}</p>
          <p className="mt-1 text-sm text-texto-suave">
            {persona.ultimoAcceso ? `Entró el ${fechaCorta(persona.ultimoAcceso)}` : "Nunca ha entrado"}
            {persona.casas > 0 ? ` · ${persona.casas} ${persona.casas === 1 ? "casa" : "casas"} a su nombre` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {puedeCambiarRol ? (
          <Form method="post" className="flex items-end gap-2">
            <input type="hidden" name="que" value="rol" />
            <input type="hidden" name="id" value={persona.id} />
            <CampoSelect etiqueta="Rol" name="rol" defaultValue={persona.rol}>
              {[...new Set([...rolesQuePuedeDar, persona.rol])].map((rol) => (
                <option key={rol} value={rol}>
                  {NOMBRE_ROL[rol]}
                </option>
              ))}
            </CampoSelect>
            <Boton type="submit" tono="secundario" pequeno>
              Cambiar
            </Boton>
          </Form>
        ) : null}

        {/* Ni desactivarse ni darse una temporal a sí mismo: lo segundo cierra
            tu sesión y te deja entrando con la contraseña que acabas de leer.
            Para cambiar la tuya está «Mi cuenta», que la pide en dos pasos. */}
        {!soyYo ? (
          <>
            <Form method="post">
              <input type="hidden" name="que" value="temporal" />
              <input type="hidden" name="id" value={persona.id} />
              <Boton type="submit" tono="secundario" pequeno>
                Contraseña temporal
              </Boton>
            </Form>

            <Form method="post">
              <input type="hidden" name="que" value="activo" />
              <input type="hidden" name="id" value={persona.id} />
              <input type="hidden" name="activo" value={persona.activo ? "0" : "1"} />
              <Boton type="submit" tono={persona.activo ? "peligro" : "secundario"} pequeno>
                {persona.activo ? "Desactivar" : "Activar"}
              </Boton>
            </Form>
          </>
        ) : (
          <p className="text-sm text-texto-suave">
            Tu contraseña se cambia en{" "}
            <a href="/panel/mi-cuenta" className="font-bold text-marca underline underline-offset-4">
              Mi cuenta
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
