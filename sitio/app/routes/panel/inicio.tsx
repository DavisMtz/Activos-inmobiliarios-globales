import { useRouteLoaderData } from "react-router";
import type { loader as loaderMarco } from "./marco";

export function meta() {
  return [{ title: "Panel | Activos Inmobiliarios Globales" }];
}

/**
 * Inicio mínimo de F0. Los avisos (casas con datos faltantes, en revisión,
 * prospectos nuevos) y los accesos por rol llegan con F3 y F4.
 */
export default function InicioPanel() {
  const datos = useRouteLoaderData<typeof loaderMarco>("routes/panel/marco");
  const primerNombre = datos?.usuario.nombre.split(" ")[0] ?? "";

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-extrabold text-tinta">Hola, {primerNombre}</h1>
      <p className="mt-2 max-w-prose text-texto-suave">
        Ya tienes acceso al panel. Aquí vas a poder subir y editar casas, cambiar los textos del sitio y atender a los
        clientes interesados, según tu rol.
      </p>
    </main>
  );
}
