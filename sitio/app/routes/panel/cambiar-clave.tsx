import { data, Form, redirect, useNavigation } from "react-router";
import { LARGO_MINIMO_CLAVE } from "../../../shared/validacion";
import { cambiarClave } from "../../../server/auth/acceso";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { Aviso, BotonPrincipal, CampoClave, MarcoAcceso } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/cambiar-clave";

export function meta() {
  return [{ title: "Elige tu contraseña | Activos Inmobiliarios Globales" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const encontrada = await sesionDePeticion(context.get(contextoServidor).servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  // Desde «Mi cuenta» (sesión normal) el cambio llega con F3, con su paso de
  // confirmar la contraseña actual. Aquí, en F0, solo el cambio obligatorio.
  if (!encontrada.sesion.soloCambioClave) throw redirect("/panel");
  return { nombre: encontrada.sesion.usuario.nombre, correo: encontrada.sesion.usuario.correo };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios, peticion } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");

  const formulario = await request.formData();
  const r = await cambiarClave(
    servicios,
    encontrada.sesion,
    encontrada.token,
    { nueva: formulario.get("nueva"), confirmacion: formulario.get("confirmacion") },
    peticion,
  );
  if (!r.ok) return data({ mensaje: r.mensaje }, { status: r.estado });
  return redirect("/panel", { headers: { "Set-Cookie": r.valor.cookie } });
}

export default function CambiarClave({ loaderData, actionData }: Route.ComponentProps) {
  const navegacion = useNavigation();
  const primerNombre = loaderData.nombre.split(" ")[0];

  return (
    <MarcoAcceso
      titulo={`Hola, ${primerNombre}. Elige tu contraseña`}
      bajada="Entraste con una contraseña temporal. Para seguir, cámbiala por una que solo tú conozcas."
    >
      <Form method="post" className="flex flex-col gap-5">
        {actionData?.mensaje ? <Aviso>{actionData.mensaje}</Aviso> : null}
        {/* Para que el gestor de contraseñas guarde la nueva con el correo correcto. */}
        <input type="email" name="usuario" autoComplete="username" value={loaderData.correo} readOnly className="hidden" />
        <CampoClave
          etiqueta="Contraseña nueva"
          name="nueva"
          autoComplete="new-password"
          minLength={LARGO_MINIMO_CLAVE}
          required
          ayuda={`Al menos ${LARGO_MINIMO_CLAVE} caracteres. Una frase corta es fácil de recordar y difícil de adivinar.`}
        />
        <CampoClave
          etiqueta="Escríbela otra vez"
          name="confirmacion"
          autoComplete="new-password"
          minLength={LARGO_MINIMO_CLAVE}
          required
        />
        <BotonPrincipal ocupado={navegacion.state !== "idle"}>
          {navegacion.state === "submitting" ? "Guardando…" : "Guardar y entrar"}
        </BotonPrincipal>
      </Form>

      <Form method="post" action="/panel/salir" className="mt-6">
        <button type="submit" className="text-sm font-bold text-texto-suave underline underline-offset-4">
          Salir sin cambiarla
        </button>
      </Form>
    </MarcoAcceso>
  );
}
