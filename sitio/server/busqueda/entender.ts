/**
 * El buscador que entiende frases (PLAN §10.5): de «casa de 3 recamaras en
 * altosano hasta 4 millones con alberca» a
 * `/propiedades?tipo=casa&q=Altozano&precio_max=4000000&recamaras=3&con=alberca`.
 *
 * **Lo entendido acaba SIEMPRE en la URL, como filtros de siempre.** No se
 * aplica «por debajo»: la página 2 del listado, el scroll infinito, la API, el
 * enlace que alguien manda por WhatsApp y el botón «atrás» trabajan con los
 * filtros explícitos, y por eso dan lo mismo hoy, mañana y con la IA apagada.
 * De paso, el formulario aparece lleno con lo que se entendió: la persona lo ve
 * y lo corrige.
 *
 * Tres capas, de la más barata a la más cara, y cada una solo si la anterior
 * no alcanzó:
 *
 * 1. **Vocabulario** (`shared/frase.ts`): operación, tipo, orden, recámaras,
 *    baños, clave, los rasgos más pedidos y los PRECIOS (por aritmética:
 *    `shared/dinero.ts`), con errores de dedo perdonados.
 * 2. **El catálogo** (`corpus.ts`): qué lugar es, corrigiendo «altosano». Si con
 *    esto la frase quedó explicada entera, no se le pregunta a nadie.
 * 3. **El modelo** (`server/ia/motor.ts`), si está encendido y sobró algo: rasgos
 *    fuera de lista («vista al lago»), lugares que el catálogo no reconoció y
 *    el papel de un precio dicho de forma rara. Con memoria (una frase
 *    se pregunta una vez por semana), tope diario, freno por persona y 3.5
 *    segundos de reloj. Si falla, queda lo de las capas 1 y 2.
 */

import { isbot } from "isbot";
import { aParametros, rasgosUnicos, type Filtros } from "../../shared/filtros";
import { leerFrase, piezasDe, type Lectura } from "../../shared/frase";
import {
  ESQUEMA_DE_INTENCION,
  INSTRUCCIONES,
  LARGO_MAXIMO_DE_FRASE,
  extraerJson,
  mensajeDeFrase,
  validarIntencion,
} from "../../shared/intencion";
import { buscarLugar } from "../../shared/lugares";
import type { Servicios } from "../config";
import { leerBusquedaIA, type BusquedaIA } from "../db/configuracion";
import { preguntar } from "../ia/motor";
import { anotarUso, consultasDeHoy, guardarEnCache, huella, leerDeCache } from "../ia/uso";
import { leerCorpus, type Corpus } from "./corpus";

/**
 * Se sube al cambiar `INSTRUCCIONES` o el esquema: lo guardado con las
 * anteriores deja de servir sin tener que borrar nada.
 */
const VERSION_DE_INSTRUCCIONES = "3";

/** Palabras del resto que hablan de dinero o comparan: sin modelo no se entienden, y no son rasgos. */
const DE_CANTIDAD = new Set(
  (
    "menos mas hasta desde entre maximo minimo mayor menor pase pasen tope presupuesto mil miles millon millones mdp pesos peso mes mensual mensuales " +
    "metros metro m mts m2 cuadrados autos auto coches coche no ni medio media"
  ).split(" "),
);

export type Peticion = {
  url: URL;
  filtros: Filtros;
  cabeceras: Headers;
  ip: string;
  esperar: (promesa: Promise<unknown>) => void;
  /**
   * El buscador de siempre ya corrió y no encontró nada. Es cuando vale la pena
   * mirar si UNA palabra está mal escrita («altosano»); si encontró, no se toca.
   */
  sinResultados?: boolean;
};

/** Una precarga del navegador no paga inferencia: nadie ha pedido nada todavía. */
const esPrecarga = (cabeceras: Headers): boolean =>
  /prefetch|prerender/i.test(`${cabeceras.get("sec-purpose") ?? ""} ${cabeceras.get("purpose") ?? ""}`);

const leyoAlgo = (lectura: Lectura): boolean =>
  Boolean(
    lectura.operacion ||
      lectura.tipo ||
      lectura.orden ||
      lectura.recamaras ||
      lectura.banos ||
      lectura.precioMin ||
      lectura.precioMax ||
      lectura.clave ||
      lectura.rasgos.length,
  );

/**
 * La misma búsqueda, con filtros explícitos: la ruta a la que hay que mandar a
 * la persona, o null si no hay nada que mejorar y el buscador de siempre sigue.
 */
export async function entenderBusqueda(servicios: Servicios, p: Peticion): Promise<string | null> {
  const parametros = p.url.searchParams;
  const frase = (parametros.get("q") ?? "").replace(/\s+/g, " ").trim();

  if (!frase || frase.length > LARGO_MAXIMO_DE_FRASE) return null;
  // `literal`: la persona pidió el texto tal cual. `frase`: esto ya es el
  // resultado de entender una. Y una página 2 jamás se reinterpreta.
  if (parametros.has("literal") || parametros.has("frase") || p.filtros.pagina > 1) return null;

  const lectura = leerFrase(frase);
  const unaSolaPalabra = !leyoAlgo(lectura) && lectura.resto.length <= 1;
  // «altozano»: el buscador de siempre lo resuelve sin ayuda. Solo si no
  // encontró nada se mira si estaba mal escrito.
  if (unaSolaPalabra && !p.sinResultados) return null;
  if (!unaSolaPalabra && p.sinResultados) return null;

  // ── Capa 2: el catálogo ──
  let corpus: Corpus | null = null;
  try {
    corpus = lectura.resto.length ? await leerCorpus(servicios.db) : null;
  } catch (error) {
    console.error("Buscador: no se pudo leer el catálogo:", error instanceof Error ? error.message : error);
  }
  const existe = (pieza: string): boolean => corpus?.vocabulario.has(pieza) ?? true;
  const lugarLeido = corpus ? buscarLugar(lectura.resto, corpus.lugares, existe) : null;
  const pendiente = lectura.resto.filter((_, i) => !lugarLeido || i < lugarLeido.desde || i >= lugarLeido.hasta);

  // ── Capa 3: el modelo, solo si quedó algo sin explicar ──
  let delModelo: Record<string, unknown> | null = null;
  if (pendiente.length && !unaSolaPalabra) {
    delModelo = await consultarModelo(servicios, p, frase).catch((error) => {
      console.error("Buscador: la IA falló:", error instanceof Error ? error.message : error);
      return null;
    });
  }

  const intencion = validarIntencion(delModelo, frase, lectura);

  // ── De la intención a los filtros ──
  let lugar: string | null = lugarLeido?.escrito ?? null;
  const rasgos = [...(intencion?.palabras ?? [])];

  if (intencion?.lugar) {
    const delModeloEnCatalogo = corpus ? buscarLugar(piezasDe(intencion.lugar), corpus.lugares, existe) : null;
    if (delModeloEnCatalogo) lugar = delModeloEnCatalogo.escrito;
    // Un lugar que el catálogo no conoce («cerca del Tec») sirve más buscado en
    // las descripciones que como una colonia que no va a encontrar nada.
    else if (!lugar) rasgos.unshift(intencion.lugar.toLowerCase());
  }

  // Sin modelo, lo que sobró y el catálogo SÍ usa al describir casas se busca
  // como rasgo: «casa con chimenea» funciona aunque la IA esté apagada.
  if (!delModelo && corpus) {
    for (const pieza of pendiente) {
      if (pieza.length < 4 || /^\d/.test(pieza) || DE_CANTIDAD.has(pieza) || !corpus.vocabulario.has(pieza)) continue;
      rasgos.push(pieza);
    }
  }

  // **La frase manda sobre lo que quedó en el formulario**, y lo que la frase no
  // menciona se conserva. Tras entender una frase el formulario queda LLENO con
  // lo entendido; si ahí mismo se teclea otra («depa hasta 5 millones» después
  // de «casa de 3 recámaras hasta 3 millones»), esos valores viajan otra vez, y
  // dándoles la razón la segunda búsqueda seguía siendo de casas hasta 3
  // millones. Conservar lo no mencionado es lo que deja elegir «En renta» en la
  // portada y escribir «casa en altozano». Lo heredado se VE en «Así lo
  // entendimos», donde cada filtro se quita con un toque.
  const f = p.filtros;
  // El precio es una sola afirmación: «más de 10 millones» sobre un «hasta 3
  // millones» viejo no es un rango de 3 a 10.
  const traePrecio = intencion ? intencion.precioMin !== null || intencion.precioMax !== null : false;
  const destino: Filtros = {
    ...f,
    operacion: intencion?.operacion ?? f.operacion,
    tipo: intencion?.tipo ?? f.tipo,
    recamaras: intencion?.recamaras ?? f.recamaras,
    banos: intencion?.banos ?? f.banos,
    precioMin: traePrecio ? (intencion?.precioMin ?? null) : f.precioMin,
    precioMax: traePrecio ? (intencion?.precioMax ?? null) : f.precioMax,
    orden: intencion?.orden ?? f.orden,
    // Un lugar en la frase es el lugar: la colonia o la ciudad que hubiera
    // elegidas en «Más filtros» se sueltan, o «en tres marías» sobre
    // `zona=altozano` no encontraría nada.
    zona: lugar ? null : f.zona,
    ciudad: lugar ? null : f.ciudad,
    // La frase se consume: en el buscador queda solo lo que se busca como texto.
    q: intencion?.clave ?? lugar,
    // Los rasgos de la frase REEMPLAZAN a los que había: sumarlos convertía
    // «casa con alberca» → «depa con terraza» en «con alberca Y terraza»: cero casas.
    rasgos: rasgosUnicos(rasgos.length ? rasgos : f.rasgos),
    pagina: 1,
  };
  if (destino.precioMin !== null && destino.precioMax !== null && destino.precioMin > destino.precioMax) {
    [destino.precioMin, destino.precioMax] = [destino.precioMax, destino.precioMin];
  }

  // ¿Cambió algo de verdad? «tres marias» → «Tres Marías» no es un cambio.
  const antes = aParametros({ ...f, q: null, pagina: 1 }).toString();
  const despues = aParametros({ ...destino, q: null }).toString();
  const mismoTexto = piezasDe(destino.q ?? "").join(" ") === piezasDe(frase).join(" ");
  if (antes === despues && mismoTexto) return null;
  // No se entendió nada aprovechable: que el buscador de siempre lo intente con el texto tal cual.
  if (antes === despues && !destino.q) return null;

  // La ruta va escrita y no sale de la petición: en una navegación sin recarga
  // React Router pide `/propiedades.data`, y a eso no se puede mandar a nadie.
  const salida = aParametros(destino);
  salida.set("frase", frase);
  return `/propiedades?${salida.toString()}`;
}

// ─── La capa que gasta ────────────────────────────────────────────

/**
 * Lo que contesta el modelo para esta frase, de la memoria si ya se preguntó.
 * Null si la IA está apagada, sin presupuesto, frenada, lenta o confundida:
 * quien llama sigue con lo que ya entendió sin ella.
 */
async function consultarModelo(servicios: Servicios, p: Peticion, frase: string): Promise<Record<string, unknown> | null> {
  const { db, ia, limites } = servicios;
  if (!ia) return null;

  let ajustes: BusquedaIA;
  try {
    ajustes = await leerBusquedaIA(db);
  } catch {
    return null;
  }
  if (!ajustes.activa || ajustes.topeDiario <= 0) return null;
  // Ni los robots ni las precargas del navegador pagan inferencia. Sin agente
  // también es un robot: ningún navegador de verdad lo omite.
  const agente = p.cabeceras.get("user-agent") ?? "";
  if (!agente || isbot(agente) || esPrecarga(p.cabeceras)) return null;

  const clave = await huella("intencion", VERSION_DE_INSTRUCCIONES, ajustes.modelo, piezasDe(frase).join(" "));
  const guardado = await leerDeCache(db, clave);
  if (guardado) {
    p.esperar(anotarUso(db, { deCache: 1 }));
    return guardado;
  }

  const gastado = await consultasDeHoy(db);
  // Si la cuenta no se puede leer (la tabla no existe), no se gasta a ciegas.
  if (gastado === null || gastado >= ajustes.topeDiario) return null;

  if (limites.ia) {
    const permitido = await limites.ia.limit({ key: `ia:${p.ip}` }).catch(() => ({ success: true }));
    if (!permitido.success) return null;
  }

  const respuesta = await preguntar(
    ia,
    { modelo: ajustes.modelo, instrucciones: INSTRUCCIONES, mensaje: mensajeDeFrase(frase), esquema: ESQUEMA_DE_INTENCION },
    extraerJson,
  );

  p.esperar(
    anotarUso(db, {
      consultas: respuesta.consultas,
      fallos: respuesta.json ? 0 : 1,
      ms: respuesta.ms,
      tokensEntrada: respuesta.tokensEntrada,
      tokensSalida: respuesta.tokensSalida,
    }),
  );
  if (!respuesta.json) return null;

  // Se guarda SOLO lo que el esquema conoce, y recortado: la memoria no es un
  // cajón donde el modelo pueda dejar lo que quiera.
  const limpio = soloLoConocido(respuesta.json);
  p.esperar(guardarEnCache(db, clave, limpio));
  return limpio;
}

function soloLoConocido(json: Record<string, unknown>): Record<string, unknown> {
  const texto = (valor: unknown): string | null => (typeof valor === "string" ? valor.slice(0, 80) : null);
  const numero = (valor: unknown): number | string | null =>
    typeof valor === "number" && Number.isFinite(valor) ? valor : typeof valor === "string" ? valor.slice(0, 20) : null;
  return {
    lugar: texto(json.lugar),
    recamaras: numero(json.recamaras),
    banos: numero(json.banos),
    palabras: Array.isArray(json.palabras) ? json.palabras.slice(0, 5).map(texto).filter((t): t is string => t !== null) : [],
  };
}
