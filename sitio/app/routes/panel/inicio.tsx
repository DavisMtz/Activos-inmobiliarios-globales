import { Link, redirect } from "react-router";
import { puede } from "../../../shared/permisos";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { avisosDeInicio, resumenDeInicio } from "../../../server/db/panel/inicio";
import { IconoAdelante, IconoAtencion, IconoListo, IconoMas } from "../../components/panel/iconos";
import { Bloque, BotonEnlace } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/inicio";

export function meta() {
  return [{ title: "Panel | Activos Inmobiliarios Globales" }];
}

/**
 * Lo primero que se ve al entrar (PLAN §11.2): qué pide atención hoy, con su
 * cuenta y el enlace a esa misma lista ya filtrada. Sin avisos, lo dice y
 * ofrece el siguiente paso, en vez de dejar una pantalla vacía.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;

  const [avisos, resumen] = await Promise.all([
    avisosDeInicio(servicios.db, usuario),
    resumenDeInicio(servicios.db, usuario),
  ]);

  return {
    nombre: usuario.nombre.split(" ")[0],
    avisos,
    resumen,
    puedeCrear: puede(usuario, "propiedades.crear"),
    llevaCasas: resumen.mias > 0,
  };
}

const TONOS = {
  urgente: { texto: "text-marca", campo: "bg-marca-suave text-marca-oscuro" },
  atencion: { texto: "text-aviso", campo: "bg-aviso/10 text-aviso" },
  calma: { texto: "text-texto-suave", campo: "bg-fondo text-texto-suave" },
} as const;

export default function InicioPanel({ loaderData }: Route.ComponentProps) {
  const { nombre, avisos, resumen, puedeCrear, llevaCasas } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Hola, {nombre}</h1>
          {/* Una línea con las cifras, no cuatro recuadros: son datos de contexto,
              no el contenido de la pantalla. */}
          <p className="mt-2 text-texto-suave">
            <span className="font-bold text-texto tabular-nums">{resumen.publicadas}</span> casas publicadas ·{" "}
            <span className="tabular-nums">{resumen.enVenta}</span> en venta ·{" "}
            <span className="tabular-nums">{resumen.enRenta}</span> en renta
            {llevaCasas ? (
              <>
                {" · "}
                <span className="tabular-nums">{resumen.mias}</span> a tu nombre
              </>
            ) : null}
          </p>
        </div>
        {/* La acción principal es de la pantalla, no del bloque de avisos. */}
        {puedeCrear ? (
          <BotonEnlace a="/panel/propiedades/nueva" tono="principal" className="w-full sm:w-auto">
            <IconoMas className="h-5 w-5" />
            Subir una casa
          </BotonEnlace>
        ) : null}
      </header>

      <Bloque titulo="Lo que pide atención" descripcion={avisos.length ? "Cada renglón lleva a su lista." : undefined}>
        {avisos.length === 0 ? (
          <div className="flex items-center gap-3 text-texto">
            <IconoListo className="h-6 w-6 shrink-0 text-exito" />
            <p>
              <span className="font-bold text-tinta">Todo al día.</span> No hay casas esperando revisión ni datos
              pendientes.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-linea">
            {avisos.map((aviso) => {
              const tono = TONOS[aviso.tono];
              return (
                <li key={aviso.clave}>
                  <Link
                    to={aviso.ruta}
                    className="group -mx-2 flex items-center gap-4 rounded-xl px-2 py-3.5 transition-colors hover:bg-fondo"
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-extrabold tabular-nums ${tono.campo}`}
                    >
                      {aviso.cuantos}
                    </span>
                    <span className="min-w-0 flex-1 font-semibold text-tinta">{aviso.titulo}</span>
                    <IconoAdelante className="h-5 w-5 shrink-0 text-texto-suave transition-colors group-hover:text-marca" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Bloque>

      {/* Mientras el sitio está en modo propuesta, esto es lo que hay que saber
          antes de tocar nada: lo que se publica aquí se ve en el sitio. */}
      <p className="flex items-start gap-3 rounded-2xl border border-linea bg-superficie px-5 py-4 text-sm text-texto-suave">
        <IconoAtencion className="mt-0.5 h-5 w-5 shrink-0 text-aviso" />
        <span>
          Lo que publiques aquí se ve en el sitio en cuanto recargues la página. Si una casa está en{" "}
          <strong className="font-bold text-texto">borrador</strong> o en{" "}
          <strong className="font-bold text-texto">revisión</strong>, nadie más que el equipo la ve.
        </span>
      </p>
    </div>
  );
}
