import { data, Form, redirect, useNavigation } from "react-router";
import { NOMBRE_ROL } from "../../../shared/permisos";
import { LARGO_MINIMO_CLAVE } from "../../../shared/validacion";
import { cambiarClave, confirmarClaveActual } from "../../../server/auth/acceso";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { editarDatos } from "../../../server/db/panel/usuarios";
import { Aviso, Bloque, Boton, Campo, CampoClave } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/mi-cuenta";

export function meta() {
  return [{ title: "Mi cuenta | Panel" }];
}

/**
 * «Mi cuenta» (PLAN §11.2): los datos de quien entró y su contraseña.
 *
 * El cambio de contraseña se pide en dos pasos y no por gusto: verificar la
 * actual y derivar la nueva son dos PBKDF2 de 100 000 iteraciones, y dos en la
 * misma petición rebasan el CPU de un Worker (PLAN §17). Que ya confirmó la
 * actual lo recuerda la sesión, así que el segundo paso aparece solo, sin que
 * la pantalla tenga que guardar nada.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { sesion } = encontrada;

  return {
    usuario: sesion.usuario,
    rol: NOMBRE_ROL[sesion.usuario.rol],
    claveConfirmada: sesion.claveConfirmadaHasta !== null && sesion.claveConfirmadaHasta > new Date().toISOString(),
    // Del servidor y no de `window`: leer la URL al pintar daría un HTML
    // distinto al del servidor y React lo rehace entero al hidratar.
    reciencambiada: new URL(request.url).searchParams.get("clave") === "cambiada",
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios, peticion } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { sesion, token } = encontrada;

  const formulario = await request.formData();
  const que = String(formulario.get("que") ?? "");

  if (que === "datos") {
    const r = await editarDatos(servicios.db, sesion.usuario, sesion.usuario.id, {
      nombre: formulario.get("nombre"),
      telefono: formulario.get("telefono"),
      whatsapp: formulario.get("whatsapp"),
    });
    return r.ok
      ? data({ que, mensaje: "Guardado.", exito: true })
      : data({ que, mensaje: r.mensaje, exito: false }, { status: r.estado });
  }

  if (que === "confirmar") {
    const r = await confirmarClaveActual(servicios, sesion, token, formulario.get("actual"));
    return r.ok
      ? data({ que, mensaje: "Contraseña confirmada. Ahora elige la nueva.", exito: true })
      : data({ que, mensaje: r.mensaje, exito: false }, { status: r.estado });
  }

  if (que === "clave") {
    const r = await cambiarClave(
      servicios,
      sesion,
      token,
      { nueva: formulario.get("nueva"), confirmacion: formulario.get("confirmacion") },
      peticion,
    );
    if (!r.ok) return data({ que, mensaje: r.mensaje, exito: false }, { status: r.estado });
    // Cambiar la contraseña cierra todas las sesiones, incluida esta: la cookie
    // nueva es la que deja seguir trabajando sin volver a entrar.
    return redirect("/panel/mi-cuenta?clave=cambiada", { headers: { "Set-Cookie": r.valor.cookie } });
  }

  return data({ que: "", mensaje: "No entendimos qué guardar.", exito: false }, { status: 400 });
}

export default function MiCuenta({ loaderData, actionData }: Route.ComponentProps) {
  const { usuario, rol, claveConfirmada, reciencambiada } = loaderData;
  const navegacion = useNavigation();
  const enviando = (que: string) => navegacion.formData?.get("que") === que && navegacion.state !== "idle";
  const respuesta = (que: string) => (actionData?.que === que ? actionData : null);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Mi cuenta</h1>
        <p className="mt-2 text-texto-suave">
          {usuario.correo} · {rol}
        </p>
      </header>

      <Bloque titulo="Tus datos" descripcion="Tu WhatsApp aparece en las casas que tienes asignadas.">
        <Form method="post" className="flex flex-col gap-5">
          <input type="hidden" name="que" value="datos" />
          {respuesta("datos") ? (
            <Aviso tono={respuesta("datos")!.exito ? "exito" : "error"}>{respuesta("datos")!.mensaje}</Aviso>
          ) : null}
          <Campo etiqueta="Nombre" name="nombre" defaultValue={usuario.nombre} required minLength={3} />
          <Campo
            etiqueta="Teléfono"
            name="telefono"
            type="tel"
            inputMode="tel"
            defaultValue={usuario.telefono ?? ""}
            ayuda="Diez dígitos. Se queda en el panel."
          />
          <Campo
            etiqueta="WhatsApp"
            name="whatsapp"
            type="tel"
            inputMode="tel"
            defaultValue={usuario.whatsapp ?? ""}
            ayuda="Si lo pones, quien pregunte por una de tus casas te escribe a ti."
          />
          <div>
            <Boton type="submit" ocupado={enviando("datos")}>
              {enviando("datos") ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </Form>
      </Bloque>

      <Bloque
        titulo="Tu contraseña"
        descripcion="Primero confirma la que usas hoy y después elige la nueva."
      >
        {reciencambiada ? <Aviso tono="exito">Tu contraseña quedó cambiada.</Aviso> : null}

        <Form method="post" className="flex flex-col gap-5">
          <input type="hidden" name="que" value="confirmar" />
          {respuesta("confirmar") ? (
            <Aviso tono={respuesta("confirmar")!.exito ? "exito" : "error"}>{respuesta("confirmar")!.mensaje}</Aviso>
          ) : null}
          <CampoClave
            etiqueta="Contraseña actual"
            name="actual"
            autoComplete="current-password"
            required
            disabled={claveConfirmada}
            ayuda={claveConfirmada ? "Ya la confirmaste. Tienes unos minutos para elegir la nueva." : undefined}
          />
          {!claveConfirmada ? (
            <div>
              <Boton type="submit" tono="secundario" ocupado={enviando("confirmar")}>
                {enviando("confirmar") ? "Comprobando…" : "Confirmar"}
              </Boton>
            </div>
          ) : null}
        </Form>

        {claveConfirmada ? (
          <Form method="post" className="mt-6 flex flex-col gap-5 border-t border-linea pt-6">
            <input type="hidden" name="que" value="clave" />
            {respuesta("clave") ? <Aviso>{respuesta("clave")!.mensaje}</Aviso> : null}
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
            <div>
              <Boton type="submit" ocupado={enviando("clave")}>
                {enviando("clave") ? "Guardando…" : "Guardar la contraseña"}
              </Boton>
            </div>
          </Form>
        ) : null}
      </Bloque>
    </div>
  );
}
