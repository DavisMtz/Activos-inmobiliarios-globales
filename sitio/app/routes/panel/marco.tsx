import { Form, Outlet, redirect } from "react-router";
import { NOMBRE_ROL } from "../../../shared/permisos";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/marco";

/**
 * Marco de todas las pantallas con sesión del panel. La guardia vive en su
 * loader: sin sesión → /panel/entrar; con clave temporal → /panel/cambiar-clave.
 * Los loaders de las pantallas hijas vuelven a comprobar el permiso que les toca.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  if (encontrada.sesion.soloCambioClave) throw redirect("/panel/cambiar-clave");
  const { usuario } = encontrada.sesion;
  return {
    usuario: { nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
    modoDemo: servicios.config.modoDemo,
  };
}

export default function Marco({ loaderData }: Route.ComponentProps) {
  const { usuario, modoDemo } = loaderData;
  return (
    <div className="min-h-dvh">
      {modoDemo ? (
        <p className="bg-tinta px-4 py-2 text-center text-sm font-semibold text-white">
          Modo propuesta: el sitio no aparece en Google y no se envían correos.
        </p>
      ) : null}
      <header className="border-b border-linea bg-superficie">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <img
            src="/marca/logo-1@2x.png"
            alt="Activos Inmobiliarios Globales"
            width={512}
            height={75}
            className="h-auto w-48 sm:w-56"
          />
          <div className="flex items-center gap-4">
            <p className="text-right text-sm leading-tight">
              <span className="block font-bold text-tinta">{usuario.nombre}</span>
              <span className="text-texto-suave">{NOMBRE_ROL[usuario.rol]}</span>
            </p>
            <Form method="post" action="/panel/salir">
              <button
                type="submit"
                className="h-10 rounded-xl border border-linea px-4 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
              >
                Salir
              </button>
            </Form>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
