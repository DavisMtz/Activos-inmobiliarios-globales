import { data, redirect } from "react-router";
import { puede } from "../../../shared/permisos";
import { revisarPropiedad } from "../../../shared/propiedad";
import { asesorMencionado, datosDeTextoFacebook, normalizarDescripcion, resumenDe } from "../../../shared/texto";
import { sesionDePeticion } from "../../../server/auth/guardia";
import { asesoresAsignables, crearPropiedad, zonasConocidas } from "../../../server/db/panel/propiedades";
import { FormularioDePropiedad } from "../../components/panel/formulario-propiedad";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/propiedad-nueva";

export function meta() {
  return [{ title: "Subir una casa | Panel" }];
}

const VACIOS = {
  titulo: "",
  operacion: "venta",
  tipo: "casa",
  condicion: "",
  precio: "",
  precio_renta: "",
  recamaras: "",
  banos_completos: "",
  medios_banos: "",
  estacionamientos: "",
  niveles: "",
  m2_terreno: "",
  m2_construccion: "",
  anio_construccion: "",
  ciudad: "Morelia",
  colonia: "",
  direccion_privada: "",
  resumen: "",
  descripcion: "",
  video_url: "",
  destacada: "",
  asesor_id: "",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;
  if (!puede(usuario, "propiedades.crear")) throw new Response("Sin permiso", { status: 403 });

  const [asesores, zonas] = await Promise.all([
    asesoresAsignables(servicios.db),
    zonasConocidas(servicios.db),
  ]);

  return {
    apoyo: { asesores, zonas },
    puedePublicar: puede(usuario, "propiedades.publicar"),
    puedeAsignar: puede(usuario, "propiedades.asignar_asesor"),
    valores: VACIOS,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;

  const formulario = await request.formData();
  const crudo = Object.fromEntries(formulario.entries()) as Record<string, unknown>;

  // «Leer el texto»: se contesta con lo que se sacó y no se guarda nada.
  if (formulario.get("que") === "facebook") {
    const texto = String(formulario.get("texto_facebook") ?? "").slice(0, 20_000);
    const descripcion = normalizarDescripcion(texto);
    return data({
      sugerencias: {
        datos: datosDeTextoFacebook(texto),
        descripcion,
        resumen: resumenDe(descripcion),
        asesor: asesorMencionado(texto),
      },
      error: null,
    });
  }

  const revision = revisarPropiedad(crudo);
  if (!revision.ok) {
    return data({ sugerencias: null, error: { campo: revision.campo, mensaje: revision.mensaje } }, { status: 400 });
  }

  const r = await crearPropiedad(servicios.db, usuario, revision.valor);
  if (!r.ok) return data({ sugerencias: null, error: { mensaje: r.mensaje } }, { status: r.estado });

  // Recién creada se abre su ficha: ahí se le suben las fotos y se publica.
  return redirect(`/panel/propiedades/${r.valor.id}?creada=1`);
}

export default function CasaNueva({ loaderData, actionData }: Route.ComponentProps) {
  const { apoyo, puedePublicar, puedeAsignar, valores } = loaderData;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Subir una casa</h1>
        <p className="mt-2 text-texto-suave">
          Con el título, la ciudad y el precio basta para empezar; lo demás se puede completar después.
        </p>
      </header>

      <FormularioDePropiedad
        id="nueva"
        valores={valores}
        apoyo={apoyo}
        sugerencias={actionData?.sugerencias ?? null}
        error={actionData?.error ?? null}
        puedePublicar={puedePublicar}
        puedeAsignar={puedeAsignar}
        textoBoton="Guardar y seguir"
      />
    </div>
  );
}
