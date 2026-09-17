import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";
import { iniciarSesion } from "../../../server/auth/acceso";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { Aviso, BotonPrincipal, Campo, CampoClave, MarcoAcceso } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/entrar";

export function meta() {
  return [{ title: "Entrar al panel | Activos Inmobiliarios Globales" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const encontrada = await sesionDePeticion(context.get(contextoServidor).servicios, request);
  if (encontrada) throw redirect(encontrada.sesion.soloCambioClave ? "/panel/cambiar-clave" : "/panel");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios, peticion } = context.get(contextoServidor);
  const formulario = await request.formData();
  const correo = formulario.get("correo");
  const r = await iniciarSesion(servicios, { correo, clave: formulario.get("clave") }, peticion);
  if (!r.ok) {
    return data({ mensaje: r.mensaje, correo: typeof correo === "string" ? correo : "" }, { status: r.estado });
  }
  return redirect(r.valor.soloCambioClave ? "/panel/cambiar-clave" : "/panel", {
    headers: { "Set-Cookie": r.valor.cookie },
  });
}

export default function Entrar({ actionData }: Route.ComponentProps) {
  const navegacion = useNavigation();
  const [olvido, setOlvido] = useState(false);

  return (
    <MarcoAcceso titulo="Entrar al panel" bajada="Usa el correo y la contraseña que te dieron.">
      <Form method="post" className="flex flex-col gap-5">
        {actionData?.mensaje ? <Aviso>{actionData.mensaje}</Aviso> : null}
        <Campo
          etiqueta="Correo"
          name="correo"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          defaultValue={actionData?.correo}
        />
        <CampoClave etiqueta="Contraseña" name="clave" autoComplete="current-password" required />
        <BotonPrincipal ocupado={navegacion.state !== "idle"}>
          {navegacion.state === "submitting" ? "Entrando…" : "Entrar"}
        </BotonPrincipal>
      </Form>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setOlvido((v) => !v)}
          aria-expanded={olvido}
          className="text-sm font-bold text-marca underline underline-offset-4"
        >
          ¿Olvidaste tu contraseña?
        </button>
        {olvido ? (
          <p className="mt-2 text-sm text-texto-suave">
            Pide a tu director que te genere una contraseña temporal. Con ella entras y eliges una nueva.
          </p>
        ) : null}
      </div>
    </MarcoAcceso>
  );
}
