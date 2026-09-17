import type { ReactNode } from "react";
import { data, Form, Link, redirect } from "react-router";
import { puede } from "../../../shared/permisos";
import {
  ESTADOS_COMERCIALES,
  ESTADOS_DE_PUBLICACION,
  ETIQUETA_ESTADO,
  EXPLICACION_ESTADO,
  problemaAlPublicar,
  revisarPropiedad,
  type EstadoPropiedad,
} from "../../../shared/propiedad";
import { asesorMencionado, datosDeTextoFacebook, normalizarDescripcion, resumenDe } from "../../../shared/texto";
import { sesionDePeticion } from "../../../server/auth/guardia";
import {
  asesoresAsignables,
  cambiarEstado,
  editarPropiedad,
  leerDelPanel,
  moverAPapelera,
  zonasConocidas,
} from "../../../server/db/panel/propiedades";
import { FormularioDePropiedad } from "../../components/panel/formulario-propiedad";
import { Aviso, Bloque, Boton, Etiqueta } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/propiedad";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.casa.clave} · ${loaderData.casa.titulo} | Panel` : "Casa | Panel" }];
}

const texto = (valor: unknown): string => (valor === null || valor === undefined ? "" : String(valor));

/**
 * Cada cambio de estado es su propio `POST`, así que funciona sin JavaScript y
 * cada uno deja su entrada en la bitácora con quién y cuándo.
 */
function CambiarEstado({
  estado,
  tono,
  pequeno,
  deshabilitado,
  children,
}: {
  estado: EstadoPropiedad;
  tono: "principal" | "secundario" | "fantasma";
  pequeno?: boolean;
  deshabilitado?: boolean;
  children: ReactNode;
}) {
  return (
    <Form method="post">
      <input type="hidden" name="que" value="estado" />
      <input type="hidden" name="estado" value={estado} />
      <Boton type="submit" tono={tono} pequeno={pequeno} disabled={deshabilitado}>
        {children}
      </Boton>
    </Form>
  );
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;

  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new Response("No encontrada", { status: 404 });

  const casa = await leerDelPanel(servicios.db, id, servicios.config.cloudinary.cloudName);
  if (!casa) throw new Response("No encontrada", { status: 404 });

  const [asesores, zonas] = await Promise.all([asesoresAsignables(servicios.db), zonasConocidas(servicios.db)]);
  const url = new URL(request.url);

  return {
    casa,
    apoyo: { asesores, zonas },
    // Los campos, con los nombres que espera `revisarPropiedad`.
    valores: {
      titulo: casa.titulo,
      operacion: casa.operacion,
      tipo: casa.tipo,
      condicion: texto(casa.condicion),
      precio: texto(casa.precio),
      precio_renta: texto(casa.precioRenta),
      recamaras: texto(casa.recamaras),
      banos_completos: texto(casa.banosCompletos),
      medios_banos: texto(casa.mediosBanos),
      estacionamientos: texto(casa.estacionamientos),
      niveles: texto(casa.niveles),
      m2_terreno: texto(casa.m2Terreno),
      m2_construccion: texto(casa.m2Construccion),
      anio_construccion: texto(casa.anioConstruccion),
      ciudad: casa.ciudad,
      colonia: texto(casa.colonia),
      direccion_privada: texto(casa.direccionPrivada),
      resumen: texto(casa.resumen),
      descripcion: texto(casa.descripcion),
      video_url: texto(casa.videoUrl),
      destacada: casa.destacada ? "on" : "",
      asesor_id: texto(casa.asesorId),
    },
    puedeEditar: puede(usuario, "propiedades.editar", { asesor_id: casa.asesorId }),
    puedePublicar: puede(usuario, "propiedades.publicar"),
    puedeComercial: puede(usuario, "propiedades.estado_comercial", { asesor_id: casa.asesorId }),
    puedeAsignar: puede(usuario, "propiedades.asignar_asesor"),
    puedePapelera: puede(usuario, "propiedades.papelera"),
    reciencreada: url.searchParams.get("creada") === "1",
    guardada: url.searchParams.get("guardada") === "1",
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;

  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new Response("No encontrada", { status: 404 });

  const formulario = await request.formData();
  const que = String(formulario.get("que") ?? "");

  if (que === "facebook") {
    const pegado = String(formulario.get("texto_facebook") ?? "").slice(0, 20_000);
    const descripcion = normalizarDescripcion(pegado);
    return data({
      sugerencias: {
        datos: datosDeTextoFacebook(pegado),
        descripcion,
        resumen: resumenDe(descripcion),
        asesor: asesorMencionado(pegado),
      },
      error: null,
    });
  }

  if (que === "estado") {
    const estado = String(formulario.get("estado") ?? "") as EstadoPropiedad;
    const r = await cambiarEstado(servicios.db, usuario, id, estado);
    return r.ok
      ? redirect(`/panel/propiedades/${id}`)
      : data({ sugerencias: null, error: { mensaje: r.mensaje } }, { status: r.estado });
  }

  if (que === "papelera" || que === "restaurar") {
    const r = await moverAPapelera(servicios.db, usuario, id, { restaurar: que === "restaurar" });
    if (!r.ok) return data({ sugerencias: null, error: { mensaje: r.mensaje } }, { status: r.estado });
    return redirect(que === "papelera" ? "/panel/propiedades" : `/panel/propiedades/${id}`);
  }

  const revision = revisarPropiedad(Object.fromEntries(formulario.entries()) as Record<string, unknown>);
  if (!revision.ok) {
    return data({ sugerencias: null, error: { campo: revision.campo, mensaje: revision.mensaje } }, { status: 400 });
  }

  const r = await editarPropiedad(servicios.db, usuario, id, revision.valor);
  if (!r.ok) return data({ sugerencias: null, error: { mensaje: r.mensaje } }, { status: r.estado });
  return redirect(`/panel/propiedades/${id}?guardada=1`);
}

export default function Propiedad({ loaderData, actionData }: Route.ComponentProps) {
  const {
    casa,
    apoyo,
    valores,
    puedeEditar,
    puedePublicar,
    puedeComercial,
    puedeAsignar,
    puedePapelera,
    reciencreada,
    guardada,
  } = loaderData;

  const impide = problemaAlPublicar({
    operacion: casa.operacion,
    tipo: casa.tipo,
    precio: casa.precio,
    precioRenta: casa.precioRenta,
    recamaras: casa.recamaras,
    banosCompletos: casa.banosCompletos,
    m2Terreno: casa.m2Terreno,
    m2Construccion: casa.m2Construccion,
    resumen: casa.resumen,
    descripcion: casa.descripcion,
    colonia: casa.colonia,
    asesorId: casa.asesorId,
    fotos: casa.fotos.length,
    revisar: null,
  });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link to="/panel/propiedades" className="text-sm font-bold text-texto-suave underline underline-offset-4 hover:text-marca">
          Volver a la lista
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-balance text-tinta sm:text-3xl">{casa.titulo}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-texto-suave">
              <span className="tabular-nums">{casa.clave}</span>
              <Etiqueta tono={casa.estado === "publicada" ? "exito" : casa.estado === "revision" ? "aviso" : "neutro"}>
                {ETIQUETA_ESTADO[casa.estado]}
              </Etiqueta>
              {casa.enPapelera ? <Etiqueta tono="marca">En la papelera</Etiqueta> : null}
            </p>
          </div>
          {casa.estado === "publicada" || casa.estado === "apartada" ? (
            <a
              href={`/propiedades/${casa.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-marca underline underline-offset-4"
            >
              Ver en el sitio
            </a>
          ) : null}
        </div>
      </header>

      {reciencreada ? <Aviso tono="exito">La casa quedó creada. Ahora súbele fotos y publícala.</Aviso> : null}
      {guardada ? <Aviso tono="exito">Cambios guardados.</Aviso> : null}
      {actionData?.error ? <Aviso>{actionData.error.mensaje}</Aviso> : null}

      {/* ── Estado ──────────────────────────────────────────────── */}
      {puedePublicar || puedeComercial ? (
        <Bloque titulo="Estado" descripcion={EXPLICACION_ESTADO[casa.estado]}>
          {/* Una acción principal y el resto agrupado y en chico: seis botones
              del mismo tamaño, apilados, no dicen cuál es el que se usa. */}
          <div className="flex flex-col gap-5">
            {puedePublicar ? (
              <div className="flex flex-col gap-2">
                {impide ? <p className="text-sm font-semibold text-aviso">{impide}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  {casa.estado === "publicada" ? (
                    <CambiarEstado estado="pausada" tono="secundario">
                      Quitar del sitio
                    </CambiarEstado>
                  ) : (
                    <CambiarEstado estado="publicada" tono="principal" deshabilitado={Boolean(impide)}>
                      Publicar
                    </CambiarEstado>
                  )}
                  {ESTADOS_DE_PUBLICACION.filter(
                    (estado) => estado !== casa.estado && estado !== "publicada" && !(estado === "pausada" && casa.estado === "publicada"),
                  ).map((estado) => (
                    <CambiarEstado key={estado} estado={estado} tono="fantasma" pequeno>
                      {ETIQUETA_ESTADO[estado]}
                    </CambiarEstado>
                  ))}
                </div>
              </div>
            ) : null}

            {puedeComercial ? (
              <div className="flex flex-col gap-2 border-t border-linea pt-4">
                <p className="text-sm font-bold text-tinta">¿Ya se apartó o se cerró?</p>
                <div className="flex flex-wrap items-center gap-2">
                  {ESTADOS_COMERCIALES.filter((estado) => estado !== casa.estado).map((estado) => (
                    <CambiarEstado key={estado} estado={estado} tono="secundario" pequeno>
                      {ETIQUETA_ESTADO[estado]}
                    </CambiarEstado>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Bloque>
      ) : null}

      {puedeEditar ? (
        <FormularioDePropiedad
          id={String(casa.id)}
          valores={valores}
          avisos={casa.avisos}
          apoyo={apoyo}
          sugerencias={actionData?.sugerencias ?? null}
          error={actionData?.error ?? null}
          puedePublicar={puedePublicar}
          puedeAsignar={puedeAsignar}
          textoBoton="Guardar"
        />
      ) : (
        <Aviso tono="info">Esta casa la lleva otra persona, así que puedes verla pero no cambiarla.</Aviso>
      )}

      {/* ── Papelera ────────────────────────────────────────────── */}
      {puedePapelera ? (
        <Bloque
          titulo="Papelera"
          descripcion={
            casa.enPapelera
              ? "Está en la papelera: no se ve en el sitio ni en la lista."
              : "Sale del sitio y de la lista, pero se puede recuperar."
          }
        >
          <Form method="post">
            <input type="hidden" name="que" value={casa.enPapelera ? "restaurar" : "papelera"} />
            <Boton type="submit" tono={casa.enPapelera ? "secundario" : "peligro"}>
              {casa.enPapelera ? "Sacarla de la papelera" : "Mandar a la papelera"}
            </Boton>
          </Form>
        </Bloque>
      ) : null}
    </div>
  );
}
