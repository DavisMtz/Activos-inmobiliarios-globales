import { Link } from "react-router";
import {
  ETIQUETA_OPERACION,
  ETIQUETA_ORDEN,
  ETIQUETA_TIPO_PLURAL,
  ORDEN_PREDETERMINADO,
  aParametros,
  type Filtros,
} from "../../../shared/filtros";
import { precioMXN } from "../../../shared/formato";
import { IconoCerrar, IconoDestello } from "./iconos";

/**
 * Lo que el buscador entendió de una frase (PLAN §10.5). Es OBLIGATORIO
 * enseñarlo: si la página filtra por cosas que la persona no ve, una casa que
 * falta parece un fallo del sitio. Aquí lee con qué se quedó el buscador, quita
 * con un toque lo que no era y, si nada era, tiene a mano la búsqueda del texto
 * tal como lo escribió.
 *
 * Desde el 20/09/2026 va ARRIBA del buscador, no debajo: es lo primero que hay
 * que leer, y que lo entendió una máquina lo dice sola la orilla del panel
 * (`marco-estelar.tsx`).
 *
 * No enseña nada «de la IA»: enseña los FILTROS que quedaron en la URL, que son
 * lo que de verdad decidió qué casas salen (con el modelo, sin él o con la
 * memoria). Por eso no puede desfasarse de los resultados. Y por eso mismo
 * enseña también lo HEREDADO: la frase manda sobre el formulario, pero lo que
 * no menciona se conserva, y un «3 o más recámaras» de la búsqueda anterior
 * tiene que verse para poder quitarse.
 */

type Etiqueta = {
  texto: string;
  /** Los filtros que se sueltan al quitarla. */
  sin: Partial<Filtros>;
};

/** Los filtros puestos, dichos como los diría una persona, y cómo quitar cada uno. */
export function etiquetasDeFiltros(filtros: Filtros, zonas: { slug: string; colonia: string }[]): Etiqueta[] {
  const etiquetas: Etiqueta[] = [];
  if (filtros.tipo) etiquetas.push({ texto: ETIQUETA_TIPO_PLURAL[filtros.tipo], sin: { tipo: null } });
  if (filtros.operacion) etiquetas.push({ texto: ETIQUETA_OPERACION[filtros.operacion], sin: { operacion: null } });
  if (filtros.q) etiquetas.push({ texto: `«${filtros.q}»`, sin: { q: null } });
  if (filtros.zona) {
    etiquetas.push({ texto: zonas.find((z) => z.slug === filtros.zona)?.colonia ?? filtros.zona, sin: { zona: null } });
  }
  if (filtros.recamaras) etiquetas.push({ texto: `${filtros.recamaras} o más recámaras`, sin: { recamaras: null } });
  if (filtros.banos) etiquetas.push({ texto: `${filtros.banos} o más baños`, sin: { banos: null } });

  const [desde, hasta] = [precioMXN(filtros.precioMin), precioMXN(filtros.precioMax)];
  const sinPrecio = { precioMin: null, precioMax: null };
  if (desde && hasta) etiquetas.push({ texto: desde === hasta ? `de ${desde}` : `de ${desde} a ${hasta}`, sin: sinPrecio });
  else if (hasta) etiquetas.push({ texto: `hasta ${hasta}`, sin: sinPrecio });
  else if (desde) etiquetas.push({ texto: `desde ${desde}`, sin: sinPrecio });

  for (const rasgo of filtros.rasgos) {
    etiquetas.push({ texto: `con ${rasgo}`, sin: { rasgos: filtros.rasgos.filter((otro) => otro !== rasgo) } });
  }
  if (filtros.orden !== ORDEN_PREDETERMINADO) {
    etiquetas.push({ texto: ETIQUETA_ORDEN[filtros.orden].toLowerCase(), sin: { orden: ORDEN_PREDETERMINADO } });
  }
  return etiquetas;
}

const PASTILLA =
  "flex items-center gap-1.5 rounded-full border border-linea bg-superficie py-1 pr-2 pl-3 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca";

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
  const con = (filtrosDeLaRuta: Partial<Filtros>, extra: [string, string]): string => {
    const parametros = aParametros(filtrosDeLaRuta);
    parametros.set(...extra);
    return `/propiedades?${parametros.toString()}`;
  };
  const literal = con({ q: frase }, ["literal", "1"]);
  // La frase sigue en la dirección al quitar un filtro: esto es lo que se
  // entendió de ELLA, menos lo que la persona va descartando.
  const sin = (parte: Partial<Filtros>) => con({ ...filtros, ...parte, pagina: 1 }, ["frase", frase]);

  return (
    <aside aria-label="Cómo entendimos tu búsqueda" className="mt-6 border-l-2 border-marca pl-4">
      {/* El rótulo y la frase en un solo renglón: esto va ARRIBA del buscador,
          y cada renglón de aquí aleja la primera casa. */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-tinta">
        <span className="flex items-center gap-2 text-sm font-bold tracking-widest text-texto-suave uppercase">
          <IconoDestello className="h-4 w-4 text-marca" />
          Así lo entendimos
        </span>
        <q className="font-bold">{frase}</q>
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {etiquetas.map((etiqueta) => (
          <li key={etiqueta.texto}>
            <Link to={sin(etiqueta.sin)} preventScrollReset className={PASTILLA}>
              {etiqueta.texto}
              <IconoCerrar className="h-3.5 w-3.5 text-texto-suave" />
              <span className="sr-only">(quitar)</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-sm text-texto-suave">
        ¿No era eso? Quita lo que sobre o{" "}
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
export function RasgosPedidos({ filtros, frase }: { filtros: Filtros; frase?: string }) {
  if (!filtros.rasgos.length) return null;
  // Igual que las pastillas de «Así lo entendimos»: quitar un rasgo no borra la nota.
  const sin = (rasgo: string): string => {
    const parametros = aParametros({ ...filtros, rasgos: filtros.rasgos.filter((otro) => otro !== rasgo), pagina: 1 });
    if (frase) parametros.set("frase", frase);
    const consulta = parametros.toString();
    return consulta ? `/propiedades?${consulta}` : "/propiedades";
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="con" value={filtros.rasgos.join(",")} />
      <span className="text-sm font-bold text-tinta">Que tenga</span>
      {filtros.rasgos.map((rasgo) => (
        <Link
          key={rasgo}
          to={sin(rasgo)}
          preventScrollReset
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
