import { Link } from "react-router";
import { leerConfiguracion, leerServicios } from "../../../server/db/configuracion";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/servicios";

/**
 * Los 6 servicios reales del negocio, tal como los escribió (PLAN §6.3). Van
 * como lista editorial y no como seis tarjetas iguales: los textos tienen
 * largos muy distintos (uno trae una lista dentro) y en tarjetas de la misma
 * altura eso deja huecos.
 */

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoServidor).servicios;
  const [servicios, configuracion] = await Promise.all([leerServicios(db), leerConfiguracion(db)]);
  return {
    servicios: servicios.map((s) => ({ id: s.id, titulo: s.titulo, descripcion: s.descripcion })),
    intro: configuracion.portada.introServicios,
  };
}

export function meta() {
  return [
    { title: "Servicios · Venta, renta y financiamiento | Activos Inmobiliarios Globales" },
    {
      name: "description",
      content:
        "Venta y renta de inmuebles, financiamiento, trámites, asesoría personalizada y promoción inmobiliaria en Morelia, Michoacán.",
    },
  ];
}

export default function Servicios({ loaderData }: Route.ComponentProps) {
  const { servicios, intro } = loaderData;

  return (
    <div className="mx-auto max-w-sitio px-5 lg:px-10 py-10 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="font-display text-titulo text-tinta">Servicios</h1>
        {intro ? <p className="mt-3 text-guia text-texto-suave">{intro}</p> : null}
      </header>

      {/* Hasta 1280 px, renglones de título + texto; desde ahí, tres columnas
          con su filete arriba, que es donde la lista dejaba vacío el 40 %
          derecho de la pantalla. */}
      <div className="mt-10 border-t border-linea xl:grid xl:grid-cols-3 xl:gap-x-12 xl:border-t-0">
        {servicios.map((servicio) => (
          <section
            key={servicio.id}
            className="grid gap-3 border-b border-linea py-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-1 xl:content-start xl:gap-4 xl:border-t xl:border-b-0"
          >
            <h2 className="font-display text-seccion text-tinta">{servicio.titulo}</h2>
            <p className="max-w-[68ch] leading-relaxed whitespace-pre-line text-texto">{servicio.descripcion}</p>
          </section>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          viewTransition
          to="/propiedades"
          className="inline-flex h-12 items-center rounded-xl bg-marca px-6 font-extrabold text-white transition-colors hover:bg-marca-oscuro"
        >
          Ver las propiedades
        </Link>
        <Link
          viewTransition
          to="/contacto"
          className="inline-flex h-12 items-center rounded-xl border border-linea bg-superficie px-6 font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
        >
          Hablar con un asesor
        </Link>
      </div>
    </div>
  );
}
