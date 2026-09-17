import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/inicio";

/**
 * Portada provisional de F0. La portada de verdad (buscador, destacadas,
 * servicios, WhatsApp y el movimiento con GSAP de D13) llega con F2.
 * Sin enlaces al panel, a propósito (PLAN §11.1).
 */

export function loader({ context }: Route.LoaderArgs) {
  const { config } = context.get(contextoServidor).servicios;
  return { nombreNegocio: config.nombreNegocio };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const nombre = loaderData?.nombreNegocio ?? "Activos Inmobiliarios Globales";
  return [
    { title: `${nombre} · Morelia` },
    { name: "description", content: "Comercialización, renta y financiamiento de inmuebles en Morelia, Michoacán." },
  ];
}

export default function Inicio({ loaderData }: Route.ComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <img
        src="/marca/logo-2@2x.png"
        alt={loaderData.nombreNegocio}
        width={512}
        height={264}
        className="h-auto w-64 sm:w-80"
      />
      <h1 className="mt-10 max-w-xl text-2xl font-extrabold text-balance text-tinta sm:text-3xl">
        Estamos preparando la nueva página
      </h1>
      <p className="mt-3 max-w-md text-pretty text-texto-suave">
        Comercialización, renta y financiamiento de inmuebles en Morelia, Michoacán.
      </p>
    </main>
  );
}
