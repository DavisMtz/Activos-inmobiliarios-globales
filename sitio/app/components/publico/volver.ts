import { useLocation } from "react-router";
import { useYaHidrato } from "./hidratacion";

/**
 * El camino de regreso de una ficha al catálogo.
 *
 * **Lo que estaba mal (medido el 19/09/2026):** el migajón «← Todas las
 * propiedades» era un enlace normal a `/propiedades`, o sea una entrada NUEVA
 * del historial. Con entrada nueva no hay nada que restaurar —
 * `ScrollRestoration` guarda por `location.key`, y la lista larga por esa misma
 * llave—, así que el catálogo reaparecía sin los filtros y desde arriba
 * (escritorio: `y=3539` con 36 casas → `y=0` con 12). El botón «atrás» del
 * navegador, en cambio, SIEMPRE funcionó: devolvía el scroll exacto con y sin
 * filtros.
 *
 * **La solución es no competir con el navegador sino usarlo:** la tarjeta le
 * cuelga a la ficha que abre de dónde viene, y el migajón, en vez de empujar
 * una entrada nueva, retrocede las que haga falta. El regreso pasa a ser el
 * mismo POP que ya se restauraba solo.
 *
 * - **Sigue siendo un enlace de verdad** (`href` al listado CON sus filtros):
 *   sin JavaScript, en otra pestaña o con el botón de en medio navega como
 *   siempre, y ahora conservando la búsqueda en lugar de perderla.
 * - **Los saltos se cuentan** porque desde una ficha se abre otra en
 *   «Propiedades parecidas»: dos fichas encadenadas son dos entradas. Una ficha
 *   es exactamente una entrada, porque la galería y el visor son estado local y
 *   no tocan el historial.
 */

/** Lo que una tarjeta del catálogo le cuelga a la ficha que abre. */
export type Volver = { listado: string; saltos: number };

/** Hasta dónde se encadena; más allá, el migajón vuelve a ser un enlace normal. */
const MAXIMO_SALTOS = 5;

/** Solo `/propiedades`, con o sin búsqueda. Nunca otra ruta ni otro sitio. */
const RUTA_DEL_LISTADO = /^\/propiedades(\?\S*)?$/;

/**
 * Lo guardado en esta entrada del historial, ya comprobado. Viene de
 * `history.state`, que sobrevive a las recargas y se puede editar a mano: si no
 * es exactamente una ruta del catálogo se ignora, porque un `listado` inventado
 * podría ser `//otro-sitio` y el migajón sacaría a la gente del sitio.
 */
export function useVolverAlListado(): Volver | undefined {
  const { state } = useLocation();
  // El servidor no conoce `history.state`. Sin esperar a que termine la
  // hidratación, el enlace cambiaría de destino y de texto entre el HTML y el
  // primer pintado, que es justo lo que React reclama como diferencia.
  const yaHidrato = useYaHidrato();
  if (!yaHidrato) return undefined;

  const guardado = state as Partial<Volver> | null;
  if (!guardado || typeof guardado.listado !== "string" || !RUTA_DEL_LISTADO.test(guardado.listado)) return undefined;
  const saltos = Number(guardado.saltos);
  if (!Number.isInteger(saltos) || saltos < 1 || saltos > MAXIMO_SALTOS) return undefined;
  return { listado: guardado.listado, saltos };
}

/** El siguiente eslabón: la ficha abierta DESDE una ficha queda un salto más lejos. */
export const unSaltoMas = (volver: Volver | undefined): Volver | undefined =>
  volver && volver.saltos < MAXIMO_SALTOS ? { listado: volver.listado, saltos: volver.saltos + 1 } : undefined;
