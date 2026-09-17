import { leerConfiguracion } from "../../../server/db/configuracion";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/aviso";

/**
 * Aviso de privacidad. El sitio actual **no tiene ninguno** y sus formularios
 * piden nombre, correo, teléfono y ciudad: la ley mexicana lo exige.
 *
 * Este es un **borrador marcado como tal** y se presenta así, con su aviso
 * arriba: el texto definitivo lo revisa un abogado (PLAN §18).
 */

export async function loader({ context }: Route.LoaderArgs) {
  const { db } = context.get(contextoServidor).servicios;
  const { avisoPrivacidad } = await leerConfiguracion(db);
  return { aviso: avisoPrivacidad };
}

export function meta() {
  return [
    { title: "Aviso de privacidad | Activos Inmobiliarios Globales" },
    { name: "description", content: "Cómo tratamos los datos que nos dejas en este sitio." },
    // Un borrador no tiene por qué estar en Google, ni siquiera en producción.
    { name: "robots", content: "noindex" },
  ];
}

export default function Aviso({ loaderData }: Route.ComponentProps) {
  const { aviso } = loaderData;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <h1 className="font-display text-titulo text-tinta">Aviso de privacidad</h1>

      {aviso.advertencia ? (
        <p
          role="note"
          className="mt-6 rounded-2xl border border-aviso/30 bg-marca-suave px-5 py-4 font-semibold text-marca-oscuro"
        >
          {aviso.advertencia}
        </p>
      ) : null}

      {aviso.actualizado ? (
        <p className="mt-4 text-sm text-texto-suave">Última actualización: {aviso.actualizado}</p>
      ) : null}

      {aviso.texto ? (
        <div className="mt-8 max-w-[68ch] leading-relaxed whitespace-pre-line text-texto">{aviso.texto}</div>
      ) : (
        <p className="mt-8 text-texto-suave">Estamos preparando este texto.</p>
      )}
    </div>
  );
}
