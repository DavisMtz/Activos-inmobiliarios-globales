import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";
import { borrarDeCloudinary } from "../../../server/cloudinary";
import { sesionDePeticion } from "../../../server/auth/guardia";
import {
  aprobarEntrega,
  borrarEntrega,
  borrarFotoDeEntrega,
  cambiarFotoVisible,
  cambiarNombrePublico,
  crearEntrega,
  enlaceNuevo,
  leerEntregasDelPanel,
  ocultarEntrega,
  type EntregaDelPanel,
} from "../../../server/db/panel/entregas";
import {
  DIAS_DEL_ENLACE,
  ETIQUETA_ESTADO_ENTREGA,
  FOTOS_DEL_EQUIPO,
  mensajeDeInvitacion,
  type EstadoEntrega,
} from "../../../shared/entrega";
import { puede } from "../../../shared/permisos";
import { numeroInternacionalMX } from "../../../shared/whatsapp";
import { SubirFotosDeEntrega } from "../../components/panel/fotos-entrega";
import { Aviso, Bloque, Boton, Campo, Etiqueta, Vacio, type TonoEtiqueta } from "../../components/panel/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/entregas";

export function meta() {
  return [{ title: "Entregas | Panel" }];
}

/**
 * Entregas (F5). El recorrido, en el orden en que lo hace el equipo:
 * 1. Crea la entrega con el nombre del cliente y sube la foto del día.
 * 2. Le manda por WhatsApp su enlace personal (se enseña UNA vez, al crearlo).
 * 3. El cliente contesta: comentario, dos permisos por separado y, si quiere,
 *    sus fotos.
 * 4. Aquí se revisa y se publica. Solo sale lo que el cliente autorizó.
 *
 * Todo menos subir fotos funciona sin JavaScript: cada acción es un POST.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  if (!puede(encontrada.sesion.usuario, "contenido.editar")) throw new Response("Sin permiso", { status: 403 });

  return {
    entregas: await leerEntregasDelPanel(servicios.db, servicios.config.cloudinary.cloudName),
    cloudinaryListo: servicios.config.cloudinary.configurado,
  };
}

/** El enlace que se le manda al cliente y el de WhatsApp que lo lleva. */
function enlacesDe(request: Request, token: string, nombre: string, nombreNegocio: string, telefono: string) {
  const enlace = new URL(`/entrega/${encodeURIComponent(token)}`, new URL(request.url).origin).toString();
  // Con teléfono se abre su chat; sin él, WhatsApp deja elegir a quién.
  const numero = numeroInternacionalMX(telefono);
  const whatsapp = new URL(numero ? `https://wa.me/${numero}` : "https://wa.me/");
  whatsapp.searchParams.set("text", mensajeDeInvitacion(nombre, nombreNegocio, enlace));
  return { enlace, whatsapp: whatsapp.toString() };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios, esperar } = context.get(contextoServidor);
  const encontrada = await sesionDePeticion(servicios, request);
  if (!encontrada) throw redirect("/panel/entrar");
  const { usuario } = encontrada.sesion;
  const { db, config } = servicios;

  const formulario = await request.formData();
  const que = String(formulario.get("que") ?? "");
  const id = Number(formulario.get("id") ?? 0);
  const texto = (nombre: string) => String(formulario.get(nombre) ?? "");
  const falla = (r: { mensaje: string; estado: number }) => data({ error: r.mensaje }, { status: r.estado });

  if (que === "crear") {
    const r = await crearEntrega(db, usuario, texto("nombre"));
    if (!r.ok) return falla(r);
    return {
      nueva: {
        id: r.valor.id,
        nombre: texto("nombre"),
        ...enlacesDe(request, r.valor.token, texto("nombre"), config.nombreNegocio, texto("telefono")),
      },
    };
  }

  if (que === "enlace") {
    const r = await enlaceNuevo(db, usuario, id);
    if (!r.ok) return falla(r);
    return {
      nueva: {
        id,
        nombre: texto("nombre"),
        ...enlacesDe(request, r.valor.token, texto("nombre"), config.nombreNegocio, ""),
      },
    };
  }

  const r = await (async () => {
    switch (que) {
      case "publicar":
        return aprobarEntrega(db, usuario, id, config.cloudinary.cloudName);
      case "ocultar":
        return ocultarEntrega(db, usuario, id);
      case "nombre":
        return cambiarNombrePublico(db, usuario, id, texto("nombre_publico"));
      case "foto_visible":
        return cambiarFotoVisible(db, usuario, Number(texto("foto")), texto("visible") === "1");
      case "borrar_foto": {
        const borrada = await borrarFotoDeEntrega(db, usuario, Number(texto("foto")));
        if (borrada.ok) esperar(borrarDeCloudinary(config.cloudinary, borrada.valor.publicId));
        return borrada;
      }
      case "borrar": {
        const borrada = await borrarEntrega(db, usuario, id);
        // Primero la base, después la nube: si esto falla queda una huérfana,
        // no un hueco en el sitio.
        if (borrada.ok)
          for (const publicId of borrada.valor.publicIds) esperar(borrarDeCloudinary(config.cloudinary, publicId));
        return borrada;
      }
      default:
        return {
          ok: false as const,
          estado: 400 as const,
          error: "accion",
          mensaje: "No entendimos qué hacer.",
        };
    }
  })();
  if (!r.ok) return falla(r);
  return redirect(`/panel/entregas#e-${id || ""}`);
}

// ─── Pantalla ─────────────────────────────────────────────────────

const TONO_ESTADO: Record<EstadoEntrega, TonoEtiqueta> = {
  invitado: "neutro",
  respondido: "aviso",
  aprobado: "exito",
  oculto: "neutro",
};

const FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});
const fecha = (iso: string | null) => (iso ? FECHA.format(new Date(iso)) : "");

export default function Entregas({ loaderData, actionData }: Route.ComponentProps) {
  const { entregas, cloudinaryListo } = loaderData;
  const navegacion = useNavigation();
  const creando = navegacion.state === "submitting" && navegacion.formData?.get("que") === "crear";
  const error = actionData && "error" in actionData ? actionData.error : null;
  const nueva = actionData && "nueva" in actionData ? actionData.nueva : null;
  const porRevisar = entregas.filter((e) => e.estado === "respondido").length;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold text-tinta sm:text-3xl">Entregas</h1>
        <p className="mt-2 max-w-[65ch] text-texto-suave">
          La foto del día de la entrega y lo que cuenta el cliente. Él recibe un enlace, escribe su comentario y decide
          por separado si se publica el comentario y si se publican las fotos. Nada sale al sitio hasta que lo publiques
          aquí.
        </p>
        {porRevisar ? (
          <p className="mt-3">
            <Etiqueta tono="aviso">
              {porRevisar} {porRevisar === 1 ? "respuesta por revisar" : "respuestas por revisar"}
            </Etiqueta>
          </p>
        ) : null}
      </header>

      {error ? <Aviso>{error}</Aviso> : null}
      {nueva ? <EnlaceListo {...nueva} /> : null}
      {!cloudinaryListo ? (
        <Aviso tono="info">Cloudinary no está configurado: por ahora no se pueden subir fotos.</Aviso>
      ) : null}

      <Bloque
        titulo="Nueva entrega"
        descripcion="Después de crearla podrás subir la foto del día y mandarle su enlace."
      >
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="que" value="crear" />
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end">
            <Campo
              etiqueta="¿A quién se le entregó?"
              name="nombre"
              required
              minLength={2}
              maxLength={80}
              placeholder="Laura Martínez"
            />
            <Campo
              etiqueta="Su WhatsApp (opcional)"
              name="telefono"
              type="tel"
              inputMode="tel"
              placeholder="443 123 4567"
            />
            <Boton type="submit" ocupado={creando}>
              Crear
            </Boton>
          </div>
          <p className="text-sm text-texto-suave">
            El WhatsApp solo sirve para abrir su chat al mandarle el enlace. No se guarda.
          </p>
        </Form>
      </Bloque>

      {entregas.length === 0 ? (
        <Bloque>
          <Vacio titulo="Todavía no hay entregas">
            La próxima vez que entreguen una casa, créala aquí con la foto del día y mándale el enlace al cliente.
          </Vacio>
        </Bloque>
      ) : (
        entregas.map((entrega) => <FichaDeEntrega key={entrega.id} entrega={entrega} />)
      )}
    </div>
  );
}

/** El enlace recién hecho. Es la ÚNICA vez que se ve: la base guarda solo su huella. */
function EnlaceListo({ nombre, enlace, whatsapp }: { id: number; nombre: string; enlace: string; whatsapp: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <section aria-live="polite" className="flex flex-col gap-3 rounded-2xl border border-exito/30 bg-exito/10 p-5">
      <p className="font-bold text-tinta">Enlace listo para {nombre}</p>
      <p className="text-sm text-texto">
        Mándaselo ahora: por seguridad <strong>no se vuelve a enseñar</strong>. Si se pierde, genera otro desde su
        entrega. Sirve {DIAS_DEL_ENLACE} días y una sola vez. Si todavía no subes la foto del día, súbela antes de
        mandarlo: el cliente autoriza lo que ve.
      </p>
      <input
        readOnly
        value={enlace}
        aria-label="Enlace para el cliente"
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 w-full rounded-xl border border-linea bg-superficie px-3 text-sm text-tinta"
      />
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center rounded-xl bg-marca px-4 text-sm font-bold text-white hover:bg-marca-oscuro"
        >
          Mandar por WhatsApp
        </a>
        <Boton
          type="button"
          tono="secundario"
          pequeno
          onClick={() => {
            void navigator.clipboard?.writeText(enlace).then(() => setCopiado(true));
          }}
        >
          {copiado ? "Copiado" : "Copiar enlace"}
        </Boton>
      </div>
    </section>
  );
}

function FichaDeEntrega({ entrega }: { entrega: EntregaDelPanel }) {
  const respondio = Boolean(entrega.enviadoEn);
  const sinPermisoRegistrado = respondio && !entrega.aceptadoEn;
  const fotosDelEquipo = entrega.fotos.filter((f) => f.subidaPor === "equipo").length;

  return (
    <section id={`e-${entrega.id}`} className="scroll-mt-24 rounded-2xl border border-linea bg-superficie">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-linea px-5 py-4">
        <div>
          <h2 className="text-lg font-extrabold text-tinta">{entrega.nombre}</h2>
          <p className="mt-1 text-sm text-texto-suave">
            {respondio
              ? `Contestó el ${fecha(entrega.enviadoEn)}`
              : entrega.enlaceVencido
                ? "Su enlace ya venció: genera otro."
                : `Creada el ${fecha(entrega.creadaEn)} · el enlace vence el ${fecha(entrega.enlaceExpira)}`}
          </p>
        </div>
        <Etiqueta tono={TONO_ESTADO[entrega.estado]}>{ETIQUETA_ESTADO_ENTREGA[entrega.estado]}</Etiqueta>
      </header>

      <div className="flex flex-col gap-5 p-5">
        {respondio ? (
          sinPermisoRegistrado ? (
            <Aviso tono="info">
              Se capturó antes de que existieran los permisos del cliente, así que no se puede publicar. Si quieres
              publicarla, crea una entrega nueva y mándale su enlace.
            </Aviso>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Permiso titulo="Su comentario" si={entrega.aceptaTexto} />
              <Permiso titulo="Sus fotos" si={entrega.aceptaFotos} />
              <div className="sm:col-span-2 text-texto-suave">
                Lo autorizó el {fecha(entrega.aceptadoEn)}. En el sitio sale como{" "}
                <strong className="text-tinta">{entrega.nombrePublico}</strong>.
              </div>
            </dl>
          )
        ) : null}

        {entrega.comentario ? (
          <blockquote className="border-l-2 border-marca pl-4 whitespace-pre-line text-texto">
            {entrega.comentario}
          </blockquote>
        ) : null}

        {respondio && !entrega.aceptaFotos && entrega.fotos.length ? (
          <p className="text-sm text-texto-suave">No autorizó sus fotos: estas no se publican.</p>
        ) : null}

        {entrega.fotos.length ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {entrega.fotos.map((foto) => (
              <li key={foto.id} className="flex flex-col gap-1.5">
                <img
                  src={foto.src}
                  alt=""
                  width={160}
                  height={120}
                  loading="lazy"
                  className={`aspect-[4/3] w-full rounded-lg object-cover ${foto.visible ? "" : "opacity-40"}`}
                />
                <span className="text-xs text-texto-suave">
                  {foto.subidaPor === "equipo" ? "Del equipo" : "Del cliente"}
                  {foto.visible ? "" : " · fuera"}
                </span>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {respondio && entrega.aceptaFotos ? (
                    <Form method="post">
                      <input type="hidden" name="que" value="foto_visible" />
                      <input type="hidden" name="id" value={entrega.id} />
                      <input type="hidden" name="foto" value={foto.id} />
                      <input type="hidden" name="visible" value={foto.visible ? "0" : "1"} />
                      <button type="submit" className="text-xs font-bold text-marca underline underline-offset-2">
                        {foto.visible ? "Dejar fuera" : "Incluir"}
                      </button>
                    </Form>
                  ) : null}
                  <Form method="post">
                    <input type="hidden" name="que" value="borrar_foto" />
                    <input type="hidden" name="id" value={entrega.id} />
                    <input type="hidden" name="foto" value={foto.id} />
                    <button
                      type="submit"
                      className="text-xs font-bold text-texto-suave underline underline-offset-2 hover:text-marca"
                    >
                      Borrar
                    </button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {!respondio ? (
          <SubirFotosDeEntrega entregaId={entrega.id} tope={FOTOS_DEL_EQUIPO} subidas={fotosDelEquipo} />
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-linea pt-4">
          {!respondio ? (
            <Form method="post">
              <input type="hidden" name="que" value="enlace" />
              <input type="hidden" name="id" value={entrega.id} />
              <input type="hidden" name="nombre" value={entrega.nombre} />
              <Boton type="submit" tono="secundario" pequeno>
                Generar enlace nuevo
              </Boton>
            </Form>
          ) : null}

          {respondio && entrega.estado !== "aprobado" && !sinPermisoRegistrado ? (
            <Form method="post">
              <input type="hidden" name="que" value="publicar" />
              <input type="hidden" name="id" value={entrega.id} />
              <Boton type="submit" pequeno disabled={!entrega.publicable}>
                Publicar en el sitio
              </Boton>
            </Form>
          ) : null}

          {entrega.estado === "aprobado" ? (
            <Form method="post">
              <input type="hidden" name="que" value="ocultar" />
              <input type="hidden" name="id" value={entrega.id} />
              <Boton type="submit" tono="secundario" pequeno>
                Quitar del sitio
              </Boton>
            </Form>
          ) : null}

          {respondio && !sinPermisoRegistrado ? (
            <details className="w-full">
              <summary className="inline-flex cursor-pointer list-none text-sm font-bold text-marca underline underline-offset-4 [&::-webkit-details-marker]:hidden">
                Cambiar cómo sale el nombre
              </summary>
              <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="que" value="nombre" />
                <input type="hidden" name="id" value={entrega.id} />
                <div className="min-w-56 flex-1">
                  <Campo
                    etiqueta="Nombre en el sitio"
                    name="nombre_publico"
                    defaultValue={entrega.nombrePublico ?? ""}
                    maxLength={60}
                    required
                  />
                </div>
                <Boton type="submit" tono="secundario">
                  Guardar
                </Boton>
              </Form>
            </details>
          ) : null}

          <details className="w-full">
            <summary className="inline-flex cursor-pointer list-none text-sm font-bold text-texto-suave underline underline-offset-4 hover:text-marca [&::-webkit-details-marker]:hidden">
              Borrar esta entrega
            </summary>
            <Form method="post" className="mt-3 flex flex-wrap items-center gap-3">
              <input type="hidden" name="que" value="borrar" />
              <input type="hidden" name="id" value={entrega.id} />
              <p className="text-sm text-texto">Se borran el comentario y todas sus fotos, también de la nube.</p>
              <Boton type="submit" tono="peligro" pequeno>
                Sí, borrarla
              </Boton>
            </Form>
          </details>
        </div>
      </div>
    </section>
  );
}

function Permiso({ titulo, si }: { titulo: string; si: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-linea px-4 py-3">
      <dt className="font-bold text-tinta">{titulo}</dt>
      <dd>
        <Etiqueta tono={si ? "exito" : "neutro"}>{si ? "Se puede publicar" : "No autorizó"}</Etiqueta>
      </dd>
    </div>
  );
}
