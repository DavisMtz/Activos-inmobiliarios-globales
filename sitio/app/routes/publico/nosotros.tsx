import { Link } from "react-router";
import { leerConfiguracion } from "../../../server/db/configuracion";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/nosotros";

/**
 * Historia, misión y valores reales del negocio (PLAN §6.3).
 *
 * **La visión va vacía a propósito:** en el sitio actual tiene exactamente el
 * mismo texto que la misión, que es un error de contenido. Aquí se oculta
 * hasta que el negocio escriba la suya; no se inventa (PLAN §0.4).
 */

export async function loader({ context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const { nosotros } = await leerConfiguracion(servicios.db);
  return { nosotros, nombreNegocio: servicios.config.nombreNegocio };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const nombre = loaderData?.nombreNegocio ?? "Activos Inmobiliarios Globales";
  return [
    { title: `Nosotros · Quiénes somos | ${nombre}` },
    {
      name: "description",
      content:
        "Inmobiliaria en Morelia, Michoacán, fundada el 1 de diciembre de 2024. Comercialización, renta y financiamiento de inmuebles.",
    },
  ];
}

export default function Nosotros({ loaderData }: Route.ComponentProps) {
  const { nosotros, nombreNegocio } = loaderData;

  return (
    <div>
      <div className="mx-auto max-w-sitio px-5 lg:px-10 py-10 sm:py-14">
        {/* En escritorio, el nombre a la izquierda y la historia a su lado:
            en una sola columna la mitad derecha quedaba vacía. */}
        <header className="max-w-3xl lg:grid lg:max-w-none lg:grid-cols-2 lg:items-end lg:gap-16">
          <h1 className="font-display text-titulo text-tinta">{nombreNegocio}</h1>
          {nosotros.historia ? (
            <p className="mt-5 max-w-[60ch] text-guia leading-relaxed text-texto lg:mt-0">{nosotros.historia}</p>
          ) : null}
        </header>
      </div>

      {nosotros.mision ? (
        <section className="campo-oscuro bg-marca-oscuro text-sobre-oscuro">
          <div className="mx-auto max-w-sitio px-5 lg:px-10 py-14 sm:py-20">
            <h2 className="text-sm font-bold tracking-widest text-sobre-vino-suave uppercase">Nuestra misión</h2>
            <p className="mt-5 max-w-[46ch] font-display text-seccion leading-tight text-white 3xl:max-w-[56ch] 3xl:text-titulo">{nosotros.mision}</p>
          </div>
        </section>
      ) : null}

      {/* La visión solo aparece si existe de verdad. */}
      {nosotros.vision ? (
        <div className="mx-auto max-w-sitio px-5 lg:px-10 pt-14">
          <h2 className="font-display text-seccion text-tinta">Nuestra visión</h2>
          <p className="mt-4 max-w-[60ch] leading-relaxed text-texto">{nosotros.vision}</p>
        </div>
      ) : null}

      {nosotros.valores.length ? (
        <section className="mx-auto max-w-sitio px-5 lg:px-10 py-14 sm:py-20">
          <h2 className="font-display text-seccion text-tinta">Nuestros valores</h2>
          <dl className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
            {nosotros.valores.map((valor) => (
              <div key={valor.nombre} className="border-t border-linea pt-5">
                <dt className="font-display text-xl font-semibold text-tinta">{valor.nombre}</dt>
                <dd className="mt-2 max-w-[48ch] text-texto-suave">{valor.descripcion}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <div className="mx-auto max-w-sitio px-5 lg:px-10 pb-16">
        <Link
          to="/propiedades"
          className="inline-flex h-12 items-center rounded-xl bg-marca px-6 font-extrabold text-white transition-colors hover:bg-marca-oscuro"
        >
          Ver las propiedades
        </Link>
      </div>
    </div>
  );
}
