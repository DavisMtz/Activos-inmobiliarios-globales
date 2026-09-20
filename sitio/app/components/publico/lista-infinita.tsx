import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation } from "react-router";
import type { Pagina, Tarjeta } from "../../../server/db/propiedades";
import { rutaDeListado, type Filtros } from "../../../shared/filtros";
import { useYaHidrato } from "./hidratacion";
import { Paginacion, TarjetaPropiedad } from "./piezas";
import type { Volver } from "./volver";

/**
 * El listado de /propiedades que sigue cargando al bajar («scroll infinito»,
 * pedido del 18/09/2026), como MEJORA de la paginación y no en su lugar:
 *
 * - **El servidor pinta la página de siempre**, con «Anterior» y «Siguiente»
 *   como enlaces de verdad (`?pagina=N`). Sin JavaScript se navega igual que
 *   antes, y un buscador que no ejecuta JavaScript sigue encontrando todas
 *   las páginas (PLAN §10.1: «JavaScript solo mejora»).
 * - **Con JavaScript, ese mismo «Siguiente» es el control:** tocarlo trae las
 *   12 siguientes aquí mismo, y cuando se acerca al bajar (a una pantalla de
 *   distancia) se dispara solo. Teclado y lector de pantalla tienen así un
 *   botón real, y el automático es solo el atajo.
 * - **La URL no cambia al cargar:** los filtros en la URL son para compartir
 *   una búsqueda; hasta dónde bajó cada quien no. Lo cargado se guarda en
 *   `sessionStorage` por ENTRADA DEL HISTORIAL, y al volver de una ficha la
 *   lista reaparece entera, así el navegador puede devolver el scroll a donde
 *   estaba (con solo 12 casas lo apretaría contra el fondo).
 * - Las páginas siguientes salen de `GET /api/propiedades`, que usa las mismas
 *   funciones que el loader: si el listado cuenta 38, la API cuenta 38.
 */

type Estado = { items: Tarjeta[]; hasta: number; total: number; paginas: number };

type RespuestaApi = { total: number; pagina: number; paginas: number; items: Tarjeta[] };

// ─── Lo guardado por entrada del historial ────────────────────────
// Skill `webapp-storage-cache`: llave con prefijo y versión, vigencia, todo en
// try/catch y un tope de entradas. Es CACHÉ: si el navegador no deja guardar,
// la lista simplemente arranca de nuevo al volver.

const PREFIJO = "aig:v1:listado:";
/** Media hora: más vieja, la lista podría enseñar un precio que ya cambió. */
const VIGENCIA = 30 * 60_000;
/** Una por búsqueda recorrida en esta pestaña; las más viejas se van. */
const MAXIMO_GUARDADAS = 8;

type Guardado = { e: number; y: number; hasta: number; items: Tarjeta[] };

function leerGuardado(llave: string): Guardado | null {
  try {
    const crudo = window.sessionStorage.getItem(llave);
    if (!crudo) return null;
    const g = JSON.parse(crudo) as Partial<Guardado> | null;
    if (!g || typeof g.e !== "number" || g.e < Date.now() || !Array.isArray(g.items) || typeof g.hasta !== "number") {
      window.sessionStorage.removeItem(llave);
      return null;
    }
    return { e: g.e, y: Number(g.y) || 0, hasta: g.hasta, items: g.items };
  } catch {
    return null;
  }
}

function guardar(llave: string, estado: Estado, y: number): void {
  try {
    const almacen = window.sessionStorage;
    // Primero se tira lo vencido o dañado, y si aún sobran, lo más viejo.
    const nuestras: { llave: string; e: number }[] = [];
    for (let i = 0; i < almacen.length; i++) {
      const otra = almacen.key(i);
      if (!otra?.startsWith(PREFIJO) || otra === llave) continue;
      let e = 0;
      try {
        e = Number((JSON.parse(almacen.getItem(otra) ?? "null") as Guardado | null)?.e) || 0;
      } catch {}
      nuestras.push({ llave: otra, e });
    }
    nuestras
      .sort((a, b) => a.e - b.e)
      .forEach((otra, i) => {
        if (otra.e < Date.now() || i < nuestras.length - (MAXIMO_GUARDADAS - 1)) almacen.removeItem(otra.llave);
      });
    const valor: Guardado = { e: Date.now() + VIGENCIA, y, hasta: estado.hasta, items: estado.items };
    almacen.setItem(llave, JSON.stringify(valor));
  } catch {
    // Cuota llena o almacenamiento bloqueado (modo privado): sin restaurar, nada más.
  }
}

/** Lo que trae el servidor, más lo guardado que no esté ya (por clave). */
function combinar(servidor: Estado, guardado: Guardado): Estado {
  if (guardado.hasta <= servidor.hasta) return servidor;
  const vistas = new Set(servidor.items.map((casa) => casa.clave));
  const extra = guardado.items.filter((casa) => !vistas.has(casa.clave));
  return { ...servidor, items: [...servidor.items, ...extra], hasta: Math.min(guardado.hasta, servidor.paginas) };
}

// ─── El listado ───────────────────────────────────────────────────

/** Una fila de esqueletos, tantas como columnas tiene la reja en cada ancho. */
const ESQUELETOS = ["", "hidden sm:block", "hidden lg:block", "hidden 2xl:block", "hidden 4xl:block"];

export function ListaInfinita({ filtros, inicial }: { filtros: Filtros; inicial: Pagina }) {
  const { key, pathname, search } = useLocation();
  const llave = `${PREFIJO}${key}:${search}`;
  const yaHidrato = useYaHidrato();
  // El camino de regreso que cada tarjeta le cuelga a su ficha: con la búsqueda
  // tal cual está, para que el migajón de allá vuelva a ESTA lista (`volver.ts`).
  const volver = useMemo<Volver>(() => ({ listado: `${pathname}${search}`, saltos: 1 }), [pathname, search]);

  const [estado, setEstado] = useState<Estado>(() => {
    const delServidor: Estado = { items: inicial.items, hasta: inicial.pagina, total: inicial.total, paginas: inicial.paginas };
    // Se monta navegando (volver atrás desde una ficha): lo guardado entra en
    // el PRIMER pintado, y así el navegador tiene a dónde devolver el scroll.
    if (!yaHidrato) return delServidor;
    const guardado = leerGuardado(llave);
    return guardado ? combinar(delServidor, guardado) : delServidor;
  });
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(false);
  // El lote recién llegado, para que solo esas tarjetas hagan su entrada.
  const [lote, setLote] = useState<{ desde: number; hasta: number } | null>(null);

  const estadoActual = useRef(estado);
  estadoActual.current = estado;
  const enVuelo = useRef<AbortController | null>(null);
  const siguiente = useRef<HTMLAnchorElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const enfocarDesde = useRef<number | null>(null);
  const desplazarA = useRef<number | null>(null);
  // Se montó hidratando (recarga o primera visita): lo guardado se restaura
  // después, una sola vez.
  const hidratadoAlMontar = useRef(!yaHidrato);

  const hayMas = estado.hasta < estado.paginas;

  const cargar = useCallback(
    async (enfocar: boolean) => {
      const actual = estadoActual.current;
      if (enVuelo.current || actual.hasta >= actual.paginas) return;
      const control = new AbortController();
      enVuelo.current = control;
      setCargando(true);
      setFallo(false);
      try {
        const respuesta = await fetch(rutaDeListado({ ...filtros, pagina: actual.hasta + 1 }, "/api/propiedades"), {
          signal: control.signal,
          headers: { accept: "application/json" },
        });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const datos = (await respuesta.json()) as RespuestaApi;
        const previo = estadoActual.current;
        // Por clave: si se publicó una casa entre dos peticiones, el corte se
        // recorre y la del borde vendría dos veces.
        const vistas = new Set(previo.items.map((casa) => casa.clave));
        const nuevas = datos.items.filter((casa) => !vistas.has(casa.clave));
        if (enfocar && nuevas.length) enfocarDesde.current = previo.items.length;
        setLote({ desde: previo.items.length, hasta: previo.items.length + nuevas.length });
        setEstado({
          items: [...previo.items, ...nuevas],
          hasta: Math.max(previo.hasta + 1, datos.pagina),
          total: datos.total,
          paginas: datos.paginas,
        });
      } catch {
        if (!control.signal.aborted) setFallo(true);
      } finally {
        if (enVuelo.current === control) {
          enVuelo.current = null;
          setCargando(false);
        }
      }
    },
    [filtros],
  );

  // Al acercarse a «Siguiente» (una pantalla antes), se carga solo. Se vuelve
  // a observar después de cada carga: en una pantalla alta 12 casas más quizá
  // no lo alejan, y el observador no avisa dos veces del mismo estado.
  useEffect(() => {
    const enlace = siguiente.current;
    if (!yaHidrato || !enlace || !hayMas || fallo || typeof IntersectionObserver !== "function") return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada?.isIntersecting) void cargar(false);
      },
      { rootMargin: "0px 0px 100% 0px" },
    );
    observador.observe(enlace);
    return () => observador.disconnect();
  }, [yaHidrato, hayMas, fallo, estado.hasta, cargar]);

  // Lo cargado se guarda para volver atrás; el scroll, al irse de la página.
  useEffect(() => {
    if (estado.hasta > inicial.pagina) guardar(llave, estado, window.scrollY);
  }, [estado, llave, inicial.pagina]);
  useLayoutEffect(() => {
    if (!yaHidrato) return;
    const anotarScroll = () => {
      const actual = estadoActual.current;
      if (actual.hasta > inicial.pagina) guardar(llave, actual, window.scrollY);
    };
    window.addEventListener("pagehide", anotarScroll);
    return () => {
      window.removeEventListener("pagehide", anotarScroll);
      // Al navegar a otra página, antes de que la nueva mueva el scroll.
      anotarScroll();
    };
  }, [yaHidrato, llave, inicial.pagina]);

  // Recargar (F5) con la lista ya larga: el servidor pinta solo la primera
  // tanda; lo guardado se agrega en cuanto termina la hidratación y se vuelve
  // al mismo scroll, antes de pintar.
  useLayoutEffect(() => {
    if (!yaHidrato || !hidratadoAlMontar.current) return;
    hidratadoAlMontar.current = false;
    const guardado = leerGuardado(llave);
    if (!guardado || guardado.hasta <= estadoActual.current.hasta) return;
    desplazarA.current = guardado.y;
    setEstado((previo) => combinar(previo, guardado));
  }, [yaHidrato, llave]);
  useLayoutEffect(() => {
    if (desplazarA.current !== null) {
      window.scrollTo(0, desplazarA.current);
      desplazarA.current = null;
    }
    // Quien pidió más con el teclado sigue desde la primera casa nueva.
    if (enfocarDesde.current !== null) {
      lista.current?.children[enfocarDesde.current]?.querySelector<HTMLElement>("a")?.focus();
      enfocarDesde.current = null;
    }
  }, [estado]);

  // Si la página se desmonta con una petición en vuelo, se cancela.
  useEffect(() => () => enVuelo.current?.abort(), []);

  const alTocarSiguiente = (evento: MouseEvent<HTMLAnchorElement>) => {
    // Abrir en otra pestaña (clic con Ctrl, rueda…) sigue siendo un enlace normal.
    if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    void cargar(true);
  };

  const mostrando = estado.items.length;
  const avance = estado.total ? Math.min(1, mostrando / estado.total) : 1;

  return (
    <>
      {/* Con JavaScript, si se llegó por `?pagina=3`, el camino de regreso. */}
      {yaHidrato && inicial.pagina > 1 ? (
        <p className="mt-4">
          <Link
            to={rutaDeListado({ ...filtros, pagina: 1 })}
            className="text-sm font-bold text-marca underline underline-offset-4"
          >
            Ver desde la primera
          </Link>
        </p>
      ) : null}

      <ul ref={lista} data-animar-lista className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 4xl:grid-cols-5">
        {estado.items.map((item, i) => {
          const nueva = lote !== null && i >= lote.desde && i < lote.hasta;
          return (
            <li
              key={item.clave}
              // Las recién llegadas suben en tanda, 40 ms una tras otra. Las de
              // la primera tanda las anima GSAP (movimiento.ts), no esto.
              className={nueva ? "motion-safe:animate-entrada" : undefined}
              style={nueva ? { animationDelay: `${(i - lote.desde) * 40}ms` } : undefined}
            >
              <TarjetaPropiedad item={item} prioridad={i < 2} volver={volver} />
            </li>
          );
        })}
      </ul>

      {cargando ? (
        // Fuera de la lista animada: la sonda de movimiento no los confunde
        // con tarjetas a medio aparecer.
        <ul aria-hidden="true" className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 4xl:grid-cols-5">
          {ESQUELETOS.map((clases, i) => (
            <li key={i} className={clases}>
              <div className="overflow-hidden rounded-2xl border border-linea bg-superficie motion-safe:animate-pulse">
                <div className="aspect-[4/3] bg-marca-suave" />
                <div className="flex flex-col gap-3 p-5">
                  <div className="h-7 w-2/5 rounded-md bg-linea" />
                  <div className="h-5 w-3/4 rounded-md bg-linea" />
                  <div className="h-4 w-1/2 rounded-md bg-linea" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!yaHidrato ? (
        // Sin JavaScript (y mientras hidrata): la paginación de siempre.
        <Paginacion filtros={filtros} paginas={inicial.paginas} />
      ) : estado.paginas > 1 ? (
        <nav aria-label="Más propiedades" className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-4 text-center">
          {/* Al final lo dice «Ya viste…»: la cuenta se queda solo para el
              lector de pantalla, que es quien la oye cambiar. */}
          <p
            aria-live="polite"
            aria-atomic="true"
            className={hayMas ? "text-sm text-texto-suave tabular-nums" : "sr-only"}
          >
            Mostrando {mostrando} de {estado.total}
          </p>
          {/* Cuánto del catálogo lleva visto. */}
          <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-linea">
            <div
              className="h-full origin-left rounded-full bg-marca transition-transform duration-500 ease-[var(--ease-entrada)]"
              style={{ transform: `scaleX(${avance})` }}
            />
          </div>
          {hayMas ? (
            <Link
              ref={siguiente}
              to={rutaDeListado({ ...filtros, pagina: estado.hasta + 1 })}
              rel="next"
              aria-busy={cargando || undefined}
              onClick={alTocarSiguiente}
              className="flex h-12 items-center rounded-xl border border-linea bg-superficie px-6 text-sm font-bold text-tinta transition-colors hover:border-marca hover:text-marca"
            >
              {cargando ? "Cargando más propiedades…" : fallo ? "No se pudieron cargar. Reintentar" : "Ver más propiedades"}
            </Link>
          ) : (
            <>
              <p className="font-display text-xl font-semibold text-tinta">
                Ya viste {estado.total === 1 ? "la propiedad" : `las ${estado.total} propiedades`}
              </p>
              {/* Botón y no `<a href="#filtros">`: el ancla crearía otra
                  entrada del historial. */}
              <button
                type="button"
                onClick={(evento) => {
                  const formulario = document.getElementById("filtros");
                  if (!formulario) return;
                  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                  formulario.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
                  // Con el teclado (`detail` 0) el foco va al buscador; con el
                  // dedo no, o se abriría el teclado del celular.
                  if (evento.detail === 0) formulario.querySelector<HTMLElement>("input")?.focus({ preventScroll: true });
                }}
                className="cursor-pointer text-sm font-bold text-marca underline underline-offset-4"
              >
                Volver a los filtros
              </button>
            </>
          )}
        </nav>
      ) : null}
    </>
  );
}
