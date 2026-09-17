import { useEffect, useState, type InputHTMLAttributes, type ReactElement } from "react";
import { data, Form, Link, useNavigation } from "react-router";
import { leerConfigDelSitio } from "../../../server/db/configuracion";
import { leerFicha, similares } from "../../../server/db/propiedades";
import { guardarProspecto, revisarProspecto } from "../../../server/db/prospectos";
import { ETIQUETA_TIPO } from "../../../shared/filtros";
import { m2, precioMXN } from "../../../shared/formato";
import { enlaceDePropiedad } from "../../../shared/whatsapp";
import {
  IconoBano,
  IconoCerrar,
  IconoEstacionamiento,
  IconoRecamara,
  IconoSuperficie,
  IconoWhatsApp,
} from "../../components/publico/iconos";
import { EtiquetaEstado, TarjetaPropiedad, textoPrecio } from "../../components/publico/piezas";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/propiedad";

/**
 * Ficha de una casa. Es la página que se manda por WhatsApp, así que tiene que
 * llegar con su título, su precio y su `og:image` en el HTML del servidor, sin
 * JavaScript (PLAN §15, «listo cuando» 1).
 *
 * Lo que arregla del sitio actual: el botón «Informes» llevaba a un formulario
 * genérico y quien contestaba no sabía qué casa interesaba. Aquí el WhatsApp y
 * el formulario ya traen el título, la clave y el enlace de ESTA casa.
 */

export async function loader({ params, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const { config, db } = servicios;

  const ficha = await leerFicha(db, params.slug, config.cloudinary.cloudName);
  if (!ficha) throw data(null, { status: 404 });

  const [parecidas, sitio] = await Promise.all([
    similares(db, ficha, config.cloudinary.cloudName),
    leerConfigDelSitio(db),
  ]);

  const url = `${config.sitioUrl}/propiedades/${ficha.slug}`;
  // El asesor de la casa contesta en su propio WhatsApp si tiene (PLAN §10.2).
  const numero = ficha.whatsappAsesor || sitio.whatsapp.numero;

  return {
    ficha,
    parecidas,
    url,
    nombreNegocio: config.nombreNegocio,
    modoDemo: config.modoDemo,
    whatsapp: enlaceDePropiedad(numero, sitio.whatsapp.plantillaPropiedad, {
      titulo: ficha.titulo,
      clave: ficha.clave,
      url,
    }),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const { servicios, peticion } = context.get(contextoServidor);
  const formulario = await request.formData();

  const ficha = await leerFicha(servicios.db, params.slug, "");
  if (!ficha) throw data(null, { status: 404 });

  const revision = revisarProspecto(formulario, {
    tipo: "propiedad",
    propiedadId: ficha.id,
    origen: `ficha:${ficha.clave}`,
  });
  if (!revision.ok) return data({ error: revision.mensaje, campo: revision.campo }, { status: 400 });

  // El campo trampa no se le avisa a quien lo llenó: se le dice que sí.
  if (revision.trampa) return { ok: true as const };

  const permitido = await servicios.limites.formularios.limit({ key: `formulario:${peticion.ip}` });
  if (!permitido.success) {
    return data(
      { error: "Recibimos varios mensajes desde aquí. Espera un minuto e inténtalo de nuevo.", campo: "" },
      { status: 429 },
    );
  }

  await guardarProspecto(servicios.db, revision.valor);
  return { ok: true as const };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Propiedad no encontrada | Activos Inmobiliarios Globales" }];
  const { ficha, url, nombreNegocio } = loaderData;
  const precio = textoPrecio(ficha).principal;

  // Título único: 27 fichas comparten título con otra, así que van la zona y
  // el precio, que es lo que de verdad las distingue en un resultado de Google.
  const partes = [ficha.titulo, ficha.zona, ficha.recamaras ? `${ficha.recamaras} rec.` : null, precio];
  const titulo = `${partes.filter(Boolean).join(" · ")} | ${nombreNegocio}`;
  const descripcion =
    ficha.resumen ?? `${ficha.titulo} en ${ficha.zona || "Morelia"}. Clave ${ficha.clave}. ${precio}.`;

  return [
    { title: titulo },
    { name: "description", content: descripcion },
    { property: "og:type", content: "website" },
    { property: "og:title", content: titulo },
    { property: "og:description", content: descripcion },
    { property: "og:url", content: url },
    ...(ficha.imagenOg ? [{ property: "og:image", content: ficha.imagenOg }] : []),
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

// ─── Página ───────────────────────────────────────────────────────

export default function Propiedad({ loaderData, actionData }: Route.ComponentProps) {
  const { ficha, parecidas, url, modoDemo, whatsapp } = loaderData;
  const precio = textoPrecio(ficha);
  const cerrada = ficha.estado === "vendida" || ficha.estado === "rentada";

  return (
    <div className="pb-24 lg:pb-0">
      <div className="mx-auto max-w-6xl px-5 pt-6">
        <Link to="/propiedades" className="text-sm font-bold text-marca underline underline-offset-4">
          ← Todas las propiedades
        </Link>
      </div>

      <Galeria fotos={ficha.fotos} miniaturas={ficha.miniaturas} titulo={ficha.titulo} />

      <div className="mx-auto max-w-6xl px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-12">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <EtiquetaEstado estado={ficha.estado} operacion={ficha.operacion} />
            <span className="text-sm font-bold tracking-widest text-texto-suave uppercase tabular-nums">
              {ficha.clave}
            </span>
          </div>

          <h1 className="mt-3 font-display text-titulo text-tinta">{ficha.titulo}</h1>
          {ficha.zona ? <p className="mt-2 text-guia text-texto-suave">{ficha.zona}</p> : null}

          <p className="mt-5 text-precio text-tinta tabular-nums lg:hidden">{precio.principal}</p>
          {precio.segundo ? <p className="text-texto-suave lg:hidden">{precio.segundo}</p> : null}

          {cerrada ? (
            <p className="mt-6 rounded-2xl border border-linea bg-marca-suave px-5 py-4 font-semibold text-marca-oscuro">
              Esta propiedad ya se {ficha.estado === "vendida" ? "vendió" : "rentó"}. Abajo hay otras parecidas, o
              escríbenos y te buscamos una.
            </p>
          ) : null}

          <Caracteristicas ficha={ficha} />

          {ficha.descripcion ? (
            <section className="mt-10">
              <h2 className="font-display text-seccion text-tinta">Sobre esta propiedad</h2>
              <div className="mt-4 max-w-[68ch] leading-relaxed whitespace-pre-line text-texto">
                {ficha.descripcion}
              </div>
            </section>
          ) : null}
        </div>

        {/* En escritorio la acción viaja con el scroll; en el celular vive en
            la barra de abajo, que es la que no tapa el precio. */}
        <aside className="mt-10 hidden lg:sticky lg:top-24 lg:mt-0 lg:block">
          <Acciones ficha={ficha} precio={precio} whatsapp={whatsapp} actionData={actionData} />
        </aside>
      </div>

      <div className="mx-auto mt-10 max-w-6xl px-5 lg:hidden">
        <Acciones ficha={ficha} precio={precio} whatsapp={whatsapp} actionData={actionData} />
      </div>

      {parecidas.length ? (
        <section className="mx-auto mt-16 max-w-6xl px-5 pb-16">
          <h2 className="font-display text-seccion text-tinta">Propiedades parecidas</h2>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {parecidas.map((item) => (
              <li key={item.clave}>
                <TarjetaPropiedad item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="pb-16" />
      )}

      {/* Barra pegada abajo, solo en el celular. */}
      {whatsapp ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-linea bg-superficie px-4 py-3 shadow-alzada lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-extrabold text-tinta tabular-nums">{precio.principal}</p>
              <p className="truncate text-xs text-texto-suave">{ficha.clave}</p>
            </div>
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 items-center gap-2 rounded-xl bg-marca px-5 font-extrabold text-white transition-colors hover:bg-marca-oscuro"
            >
              <IconoWhatsApp />
              WhatsApp
            </a>
          </div>
        </div>
      ) : null}

      {!modoDemo ? <DatosEstructurados ficha={ficha} url={url} /> : null}
    </div>
  );
}

// ─── Galería ──────────────────────────────────────────────────────

type Foto = { src: string; srcset: string | null; alt: string };

function Galeria({ fotos, miniaturas, titulo }: { fotos: Foto[]; miniaturas: Foto[]; titulo: string }) {
  const [actual, setActual] = useState(0);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(false);
      if (e.key === "ArrowRight") setActual((n) => Math.min(n + 1, fotos.length - 1));
      if (e.key === "ArrowLeft") setActual((n) => Math.max(n - 1, 0));
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierta, fotos.length]);

  if (!fotos.length) return <div className="mt-6" />;
  const foto = fotos[Math.min(actual, fotos.length - 1)];

  return (
    <section aria-label="Fotos" className="mx-auto mt-4 max-w-6xl px-5">
      <div className="relative overflow-hidden rounded-3xl bg-marca-suave">
        {/* Sin JavaScript el enlace abre la foto completa; con JavaScript se
            queda en la página y abre el visor. */}
        <a
          href={foto.src}
          onClick={(e) => {
            e.preventDefault();
            setAbierta(true);
          }}
          className="block"
        >
          <img
            src={foto.src}
            srcSet={foto.srcset ?? undefined}
            sizes="(min-width: 1024px) 64rem, 100vw"
            alt={foto.alt}
            width={1600}
            height={1067}
            fetchPriority="high"
            decoding="async"
            // Con tope de alto en escritorio: sin él la foto se come la
            // primera pantalla y el precio y el botón quedan abajo del pliegue.
            className="aspect-[4/3] w-full object-cover sm:aspect-[16/10] lg:max-h-[58vh]"
          />
        </a>
        {fotos.length > 1 ? (
          <p className="absolute right-4 bottom-4 rounded-full bg-tinta/80 px-3 py-1.5 text-sm font-bold text-white tabular-nums">
            {Math.min(actual, fotos.length - 1) + 1} / {fotos.length}
          </p>
        ) : null}
      </div>

      {miniaturas.length > 1 ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {miniaturas.map((mini, i) => (
            <li key={mini.src} className="shrink-0">
              <button
                type="button"
                onClick={() => setActual(i)}
                aria-label={`Ver foto ${i + 1} de ${miniaturas.length}`}
                aria-current={i === actual}
                className={`block overflow-hidden rounded-xl border-2 transition-colors ${
                  i === actual ? "border-marca" : "border-transparent hover:border-linea"
                }`}
              >
                <img
                  src={mini.src}
                  alt=""
                  width={160}
                  height={120}
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-20 object-cover sm:h-20 sm:w-28"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {abierta ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${titulo}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/95 p-4"
          onClick={() => setAbierta(false)}
        >
          <img
            src={foto.src}
            srcSet={foto.srcset ?? undefined}
            sizes="100vw"
            alt={foto.alt}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setAbierta(false)}
            aria-label="Cerrar"
            className="absolute top-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30"
          >
            <IconoCerrar className="h-6 w-6" />
          </button>
        </div>
      ) : null}
    </section>
  );
}

// ─── Características ──────────────────────────────────────────────

function Caracteristicas({ ficha }: { ficha: Route.ComponentProps["loaderData"]["ficha"] }) {
  const banos = [ficha.banos ? `${ficha.banos} completos` : null, ficha.mediosBanos ? `${ficha.mediosBanos} medios` : null]
    .filter(Boolean)
    .join(" y ");

  // 55 fichas no tienen m² de construcción y 60 no tienen los de terreno: lo
  // que no existe no se enseña vacío ni se inventa (PLAN §0.4).
  const datos = [
    ficha.recamaras ? { icono: <IconoRecamara />, etiqueta: "Recámaras", valor: String(ficha.recamaras) } : null,
    banos ? { icono: <IconoBano />, etiqueta: "Baños", valor: banos } : null,
    ficha.estacionamientos
      ? { icono: <IconoEstacionamiento />, etiqueta: "Estacionamiento", valor: `${ficha.estacionamientos} autos` }
      : null,
    m2(ficha.m2Construccion)
      ? { icono: <IconoSuperficie />, etiqueta: "Construcción", valor: m2(ficha.m2Construccion)! }
      : null,
    m2(ficha.m2Terreno) ? { icono: <IconoSuperficie />, etiqueta: "Terreno", valor: m2(ficha.m2Terreno)! } : null,
  ].filter((d): d is { icono: ReactElement; etiqueta: string; valor: string } => d !== null);

  const extras = [
    { etiqueta: "Tipo", valor: ETIQUETA_TIPO[ficha.tipo] },
    ficha.niveles ? { etiqueta: "Niveles", valor: String(ficha.niveles) } : null,
    ficha.anioConstruccion ? { etiqueta: "Año", valor: String(ficha.anioConstruccion) } : null,
    ficha.condicion ? { etiqueta: "Condición", valor: ficha.condicion } : null,
  ].filter((d): d is { etiqueta: string; valor: string } => d !== null);

  if (!datos.length && !extras.length) return null;

  return (
    <section className="mt-8">
      {/* Con 5 datos en dos columnas el último queda solo y deja un hueco al
          lado: si el número es impar, el último ocupa el ancho completo. */}
      {datos.length ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 [&>li:last-child:nth-child(odd)]:col-span-2 sm:[&>li:last-child:nth-child(odd)]:col-span-1">
          {datos.map((d) => (
            <li key={d.etiqueta} className="rounded-2xl border border-linea bg-superficie p-4">
              <span className="text-texto-suave">{d.icono}</span>
              <p className="mt-2 text-sm text-texto-suave">{d.etiqueta}</p>
              <p className="font-bold text-tinta tabular-nums">{d.valor}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {extras.length ? (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {extras.map((d) => (
            <div key={d.etiqueta} className="flex gap-2">
              <dt className="text-texto-suave">{d.etiqueta}:</dt>
              <dd className="font-bold text-tinta">{d.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

// ─── Acciones: WhatsApp y «Me interesa» ───────────────────────────

function Acciones({
  ficha,
  precio,
  whatsapp,
  actionData,
}: {
  ficha: Route.ComponentProps["loaderData"]["ficha"];
  precio: { principal: string; segundo: string | null };
  whatsapp: string | null;
  actionData: Route.ComponentProps["actionData"];
}) {
  const navegacion = useNavigation();
  const enviando = navegacion.state === "submitting";
  const listo = actionData && "ok" in actionData && actionData.ok;
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    <div className="rounded-3xl border border-linea bg-superficie p-6 shadow-tarjeta">
      <p className="hidden text-precio text-tinta tabular-nums lg:block">{precio.principal}</p>
      {precio.segundo ? <p className="hidden text-texto-suave lg:block">{precio.segundo}</p> : null}

      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 hidden h-13 w-full items-center justify-center gap-2 rounded-xl bg-marca px-5 py-3.5 text-base font-extrabold text-white transition-colors hover:bg-marca-oscuro lg:flex"
        >
          <IconoWhatsApp />
          Preguntar por WhatsApp
        </a>
      ) : null}

      {listo ? (
        <div className="lg:mt-6">
          <p className="font-display text-xl font-semibold text-tinta">Gracias, ya tenemos tu mensaje</p>
          <p className="mt-2 text-texto-suave">
            Un asesor te contacta pronto por la propiedad {ficha.clave}. Si prefieres, escríbenos ahora mismo por
            WhatsApp.
          </p>
        </div>
      ) : (
        <Form method="post" className="flex flex-col gap-4 lg:mt-6">
          <p className="font-display text-xl font-semibold text-tinta">Me interesa esta propiedad</p>

          {error ? (
            <p role="alert" className="rounded-xl border border-marca/30 bg-marca-suave px-4 py-3 text-sm font-semibold text-marca-oscuro">
              {error}
            </p>
          ) : null}

          <CampoCompacto etiqueta="Tu nombre" name="nombre" autoComplete="name" required />
          <CampoCompacto
            etiqueta="Tu teléfono"
            name="telefono"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
          />
          <CampoCompacto etiqueta="Tu correo (opcional)" name="correo" type="email" autoComplete="email" />

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-tinta">Mensaje (opcional)</span>
            <textarea
              name="mensaje"
              rows={3}
              defaultValue={`Me interesa ${ficha.titulo} (${ficha.clave}).`}
              className="rounded-xl border border-linea bg-superficie px-4 py-3 text-base text-tinta outline-none focus:border-marca"
            />
          </label>

          {/* Campo trampa: una persona no lo ve, un programa lo llena. */}
          <input
            type="text"
            name="empresa"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />

          <label className="flex items-start gap-3 text-sm text-texto">
            <input
              type="checkbox"
              name="acepto"
              required
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#a0051c]"
            />
            <span>
              Acepto el{" "}
              <Link to="/aviso-de-privacidad" className="font-bold text-marca underline underline-offset-4">
                aviso de privacidad
              </Link>
              .
            </span>
          </label>

          <button
            type="submit"
            disabled={enviando}
            className="h-12 w-full rounded-xl bg-tinta px-5 text-base font-extrabold text-white transition-colors hover:bg-marca-oscuro disabled:cursor-wait disabled:opacity-70"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </Form>
      )}
    </div>
  );
}

function CampoCompacto({
  etiqueta,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold text-tinta">{etiqueta}</span>
      <input
        className="h-12 rounded-xl border border-linea bg-superficie px-4 text-base text-tinta outline-none focus:border-marca"
        {...props}
      />
    </label>
  );
}

// ─── Datos estructurados ──────────────────────────────────────────

function DatosEstructurados({
  ficha,
  url,
}: {
  ficha: Route.ComponentProps["loaderData"]["ficha"];
  url: string;
}) {
  const precio = ficha.operacion === "renta" ? ficha.precioRenta : ficha.precio;
  const json = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: ficha.titulo,
    url,
    identifier: ficha.clave,
    ...(ficha.resumen ? { description: ficha.resumen } : {}),
    ...(ficha.imagenOg ? { image: ficha.imagenOg } : {}),
    ...(ficha.ciudad
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: ficha.ciudad,
            ...(ficha.colonia ? { addressRegion: ficha.colonia } : {}),
            addressCountry: "MX",
          },
        }
      : {}),
    ...(precio
      ? { offers: { "@type": "Offer", price: precio, priceCurrency: "MXN", availability: "https://schema.org/InStock" } }
      : {}),
    ...(ficha.recamaras ? { numberOfBedrooms: ficha.recamaras } : {}),
    ...(ficha.banos ? { numberOfBathroomsTotal: ficha.banos } : {}),
    ...(ficha.m2Construccion
      ? { floorSize: { "@type": "QuantitativeValue", value: ficha.m2Construccion, unitCode: "MTK" } }
      : {}),
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}
