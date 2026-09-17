import { data } from "react-router";
import { precioMXN, m2 } from "../../../shared/formato";
import { urlFoto } from "../../../shared/fotos";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/propiedad";

/**
 * Ficha de una propiedad. En F0 es la prueba de render en servidor (PLAN
 * §4.3): título, precio y og:image leídos de D1 tienen que salir en el HTML
 * sin JavaScript. F2 la convierte en la ficha completa.
 */

type Fila = {
  id: number;
  clave: string;
  slug: string;
  titulo: string;
  operacion: "venta" | "renta" | "venta_renta";
  estado: string;
  precio: number | null;
  precio_renta: number | null;
  recamaras: number | null;
  banos_completos: number | null;
  m2_construccion: number | null;
  m2_terreno: number | null;
  resumen: string | null;
  descripcion: string | null;
  portada_public_id: string | null;
  portada_url_origen: string | null;
};

// Borrador, revisión, pausada y papelera responden 404 (PLAN §10.1).
const ESTADOS_VISIBLES = ["publicada", "apartada", "vendida", "rentada"];

export async function loader({ params, context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const fila = await servicios.db
    .prepare(
      `SELECT p.id, p.clave, p.slug, p.titulo, p.operacion, p.estado, p.precio, p.precio_renta,
              p.recamaras, p.banos_completos, p.m2_construccion, p.m2_terreno, p.resumen, p.descripcion,
              f.public_id AS portada_public_id, f.url_origen AS portada_url_origen
         FROM propiedades p
         LEFT JOIN fotos f ON f.id = (
           SELECT id FROM fotos WHERE propiedad_id = p.id ORDER BY es_portada DESC, orden ASC LIMIT 1
         )
        WHERE p.slug = ? AND p.eliminada_en IS NULL AND p.estado IN (${ESTADOS_VISIBLES.map(() => "?").join(",")})`,
    )
    .bind(params.slug, ...ESTADOS_VISIBLES)
    .first<Fila>();

  if (!fila) throw data(null, { status: 404 });

  const { config } = servicios;
  const foto = { public_id: fila.portada_public_id, url_origen: fila.portada_url_origen };
  return {
    propiedad: fila,
    precio: precioMXN(fila.operacion === "renta" ? fila.precio_renta : fila.precio),
    imagenOg: urlFoto(foto, "og", config.cloudinary.cloudName),
    imagenGaleria: urlFoto(foto, "galeria", config.cloudinary.cloudName),
    url: `${config.sitioUrl}/propiedades/${fila.slug}`,
    nombreNegocio: config.nombreNegocio,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Propiedad no encontrada | Activos Inmobiliarios Globales" }];
  const { propiedad, precio, imagenOg, url, nombreNegocio } = loaderData;
  const partes = [propiedad.titulo, propiedad.recamaras ? `${propiedad.recamaras} rec.` : null, precio];
  const titulo = `${partes.filter(Boolean).join(" · ")} | ${nombreNegocio}`;
  const descripcion = propiedad.resumen ?? `${propiedad.titulo} (${propiedad.clave})`;
  return [
    { title: titulo },
    { name: "description", content: descripcion },
    { property: "og:type", content: "website" },
    { property: "og:title", content: titulo },
    { property: "og:description", content: descripcion },
    { property: "og:url", content: url },
    ...(imagenOg ? [{ property: "og:image", content: imagenOg }] : []),
  ];
}

export default function Propiedad({ loaderData }: Route.ComponentProps) {
  const { propiedad, precio, imagenGaleria } = loaderData;
  const datos = [
    propiedad.recamaras ? `${propiedad.recamaras} recámaras` : null,
    propiedad.banos_completos ? `${propiedad.banos_completos} baños` : null,
    m2(propiedad.m2_construccion) ? `${m2(propiedad.m2_construccion)} de construcción` : null,
    m2(propiedad.m2_terreno) ? `${m2(propiedad.m2_terreno)} de terreno` : null,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      {imagenGaleria ? (
        <img
          src={imagenGaleria}
          alt={propiedad.titulo}
          className="aspect-[4/3] w-full rounded-2xl object-cover"
          width={1600}
          height={1200}
        />
      ) : null}
      <p className="mt-6 text-sm font-bold tracking-widest text-marca uppercase">{propiedad.clave}</p>
      <h1 className="mt-1 text-3xl font-extrabold text-tinta">{propiedad.titulo}</h1>
      {precio ? <p className="mt-2 text-2xl font-bold text-tinta">{precio}</p> : null}
      {datos.length ? <p className="mt-3 text-texto-suave">{datos.join(" · ")}</p> : null}
      {propiedad.descripcion ? <p className="mt-6 whitespace-pre-line">{propiedad.descripcion}</p> : null}
    </main>
  );
}
