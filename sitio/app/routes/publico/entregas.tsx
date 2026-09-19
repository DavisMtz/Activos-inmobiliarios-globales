import { data, Link } from "react-router";
import { leerEntregasPublicas } from "../../../server/db/entregas";
import { TarjetaEntrega } from "../../components/publico/entregas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/entregas";

/**
 * Entregas (F5): las casas entregadas, con la foto del día y lo que cada
 * cliente quiso contar. Solo lo aprobado y solo con los permisos que dio cada
 * quien. Sin ninguna publicada la página no existe (404) y el menú no la
 * ofrece: una página vacía de testimonios dice lo contrario de lo que busca.
 */

export async function loader({ context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const entregas = await leerEntregasPublicas(servicios.db, servicios.config.cloudinary.cloudName);
  if (!entregas.length) throw data(null, { status: 404 });
  return { entregas, nombreNegocio: servicios.config.nombreNegocio };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const nombre = loaderData?.nombreNegocio ?? "Activos Inmobiliarios Globales";
  return [
    { title: `Entregas | ${nombre}` },
    {
      name: "description",
      content: "Las casas que entregamos en Morelia, con la foto del día y lo que nos contaron sus dueños.",
    },
  ];
}

export default function Entregas({ loaderData }: Route.ComponentProps) {
  const { entregas } = loaderData;

  return (
    <div className="mx-auto max-w-sitio px-5 py-10 sm:py-14 lg:px-10">
      <header className="max-w-2xl">
        <h1 className="font-display text-titulo text-tinta">Entregas</h1>
        <p className="mt-3 text-guia text-texto-suave">
          Al entregar una casa solemos llevar un obsequio y tomar una foto del día. Estas familias nos dieron
          permiso de compartirlas.
        </p>
      </header>

      <ul data-animar-lista className="mt-10 grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {entregas.map((entrega) => (
          <li key={entrega.id}>
            <TarjetaEntrega entrega={entrega} conTodas />
          </li>
        ))}
      </ul>

      <div className="mt-12">
        <Link
          to="/propiedades"
          viewTransition
          className="inline-flex h-12 items-center rounded-xl bg-marca px-6 font-extrabold text-white transition-colors hover:bg-marca-oscuro"
        >
          Encuentra la tuya
        </Link>
      </div>
    </div>
  );
}
