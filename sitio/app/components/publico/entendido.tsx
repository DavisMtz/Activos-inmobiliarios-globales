import { Link } from "react-router";
import {
  ETIQUETA_OPERACION,
  ETIQUETA_ORDEN,
  ETIQUETA_TIPO_PLURAL,
  ORDEN_PREDETERMINADO,
  rutaDeListado,
  type Filtros,
} from "../../../shared/filtros";
import { precioMXN } from "../../../shared/formato";
import { IconoCerrar, IconoDestello } from "./iconos";

/**
 * Lo que el buscador entendió de una frase (PLAN §10.5). Es OBLIGATORIO
 * enseñarlo: si la página filtra por cosas que la persona no ve, una casa que
 * falta parece un fallo del sitio. Aquí lee con qué se quedó el buscador y, si
 * no era eso, tiene a un toque la búsqueda del texto tal como lo escribió.
 *
 * No enseña nada «de la IA»: enseña los FILTROS que quedaron en la URL, que son
 * lo que de verdad decidió qué casas salen (con el modelo, sin él o con la
 * memoria). Por eso no puede desfasarse de los resultados.
 */

const PASTILLA = "rounded-full border border-linea bg-superficie px-3 py-1 text-sm font-bold text-tinta";

/** Los filtros puestos, dichos como los diría una persona. */
export function etiquetasDeFiltros(filtros: Filtros, zonas: { slug: string; colonia: string }[]): string[] {
  const etiquetas: string[] = [];
  if (filtros.tipo) etiquetas.push(ETIQUETA_TIPO_PLURAL[filtros.tipo]);
  if (filtros.operacion) etiquetas.push(ETIQUETA_OPERACION[filtros.operacion]);
  if (filtros.q) etiquetas.push(`«${filtros.q}»`);
  if (filtros.zona) etiquetas.push(zonas.find((z) => z.slug === filtros.zona)?.colonia ?? filtros.zona);
  if (filtros.recamaras) etiquetas.push(`${filtros.recamaras} o más recámaras`);
  if (filtros.banos) etiquetas.push(`${filtros.banos} o más baños`);

  const [desde, hasta] = [precioMXN(filtros.precioMin), precioMXN(filtros.precioMax)];
  if (desde && hasta) etiquetas.push(desde === hasta ? `de ${desde}` : `de ${desde} a ${hasta}`);
  else if (hasta) etiquetas.push(`hasta ${hasta}`);
  else if (desde) etiquetas.push(`desde ${desde}`);

  for (const rasgo of filtros.rasgos) etiquetas.push(`con ${rasgo}`);
  if (filtros.orden !== ORDEN_PREDETERMINADO) etiquetas.push(ETIQUETA_ORDEN[filtros.orden].toLowerCase());
  return etiquetas;
}

export function AsiLoEntendimos({
  frase,
  filtros,
  zonas,
}: {
  frase: string;
  filtros: Filtros;
  zonas: { slug: string; colonia: string }[];
}) {
  const etiquetas = etiquetasDeFiltros(filtros, zonas);
  if (!etiquetas.length) return null;
  const literal = `${rutaDeListado({ q: frase })}&literal=1`;

  return (
    <aside aria-label="Cómo entendimos tu búsqueda" className="mt-6 border-l-2 border-marca pl-4">
      <p className="flex items-center gap-2 text-sm font-bold tracking-widest text-texto-suave uppercase">
        <IconoDestello className="h-4 w-4 text-marca" />
        Así lo entendimos
      </p>
      <p className="mt-1.5 text-tinta">
        Buscaste <q className="font-bold">{frase}</q>
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {etiquetas.map((etiqueta) => (
          <li key={etiqueta} className={PASTILLA}>
            {etiqueta}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-sm text-texto-suave">
        ¿No era eso? Cambia los filtros de arriba o{" "}
        <Link to={literal} className="font-bold text-marca underline underline-offset-4">
          busca ese texto tal cual
        </Link>
        .
      </p>
    </aside>
  );
}

/**
 * Los rasgos pedidos («con alberca»), cada uno con su botón para quitarlo. Van
 * DENTRO del formulario con un campo oculto, para que mover otro filtro y
 * pulsar «Buscar» no los pierda por el camino.
 */
export function RasgosPedidos({ filtros }: { filtros: Filtros }) {
  if (!filtros.rasgos.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="con" value={filtros.rasgos.join(",")} />
      <span className="text-sm font-bold text-tinta">Que tenga</span>
      {filtros.rasgos.map((rasgo) => (
        <Link
          key={rasgo}
          to={rutaDeListado({ ...filtros, rasgos: filtros.rasgos.filter((otro) => otro !== rasgo), pagina: 1 })}
          className="flex items-center gap-1.5 rounded-full border border-linea bg-superficie py-1.5 pr-2.5 pl-3.5 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
        >
          {rasgo}
          <IconoCerrar className="h-3.5 w-3.5" />
          <span className="sr-only">(quitar)</span>
        </Link>
      ))}
    </div>
  );
}
