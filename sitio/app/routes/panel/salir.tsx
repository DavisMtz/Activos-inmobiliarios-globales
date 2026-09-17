import { redirect } from "react-router";
import { cerrarSesion } from "../../../server/auth/acceso";
import { cookieBorrada, tokenDeCookie } from "../../../server/auth/sesion";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/salir";

/** Salir es un POST (un enlace GET lo dispararía cualquier precarga). */
export async function action({ request, context }: Route.ActionArgs) {
  await cerrarSesion(context.get(contextoServidor).servicios, tokenDeCookie(request));
  return redirect("/panel/entrar", { headers: { "Set-Cookie": cookieBorrada() } });
}

export function loader() {
  return redirect("/panel");
}
