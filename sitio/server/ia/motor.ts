/**
 * El motor de inteligencia artificial: la ÚNICA puerta a Workers AI. Fuera de
 * aquí nadie llama a `env.AI` ni sabe con qué modelo se está hablando.
 *
 * Reglas, y ninguna es negociable:
 *
 * 1. **La IA nunca está en el camino crítico.** `preguntar` no lanza jamás:
 *    devuelve por qué no hubo respuesta y quien llama sigue por su camino de
 *    siempre. Apagada, sin presupuesto, lenta o diciendo tonterías, el sitio
 *    busca igual que antes de que existiera.
 * 2. **Tiene reloj.** La búsqueda bloquea la página que más se mira: al modelo
 *    se le espera `ESPERA_MAXIMA_MS` y ni un milisegundo más.
 * 3. **Nada de lo que contesta se cree.** De aquí sale JSON crudo; validarlo es
 *    trabajo de quien pregunta (`shared/intencion.ts`).
 *
 * Los modelos se MIDIERON antes de elegir (`npm run medir:ia`, PLAN §19): la
 * lista de abajo no es un catálogo, es la tabla de resultados del 20/09/2026
 * con 51 frases reales × 2 vueltas.
 */

/**
 * Lo único que este proyecto necesita del binding. Es un tipo propio y no el
 * `Ai` que genera `wrangler types` porque aquel tipa el nombre del modelo
 * contra una lista cerrada que cambia con cada regeneración.
 */
export type MotorIA = {
  run(modelo: string, entrada: Record<string, unknown>, opciones?: Record<string, unknown>): Promise<unknown>;
};

/**
 * Cómo se le habla a cada modelo. Los «clásicos» reciben el esquema directo y
 * contestan en `response`; los compatibles con OpenAI lo reciben envuelto,
 * contestan en `choices[0].message.content` y, si no se les dice que no,
 * «razonan» en voz alta: segundos y tokens tirados para llenar un formulario.
 */
type Familia = "clasica" | "openai";

export type ModeloMedido = {
  id: string;
  nombre: string;
  familia: Familia;
  /** Lo que salió en la medición, para quien elige en el panel. */
  nota: string;
  /** USD por millón de tokens [entrada, salida], del catálogo del 20/09/2026: para estimar Neurons. */
  precio: readonly [number, number];
};

/** Workers AI cobra en Neurons: 0.011 USD por cada 1,000. */
const USD_POR_NEURON = 0.011 / 1000;

/** Los Neurons que costaron esos tokens con ese modelo. Es una ESTIMACIÓN: la cuenta de verdad la lleva Cloudflare. */
export function neuronsEstimados(modelo: string, tokensEntrada: number, tokensSalida: number): number {
  const [entrada, salida] = MODELOS.find((m) => m.id === modelo)?.precio ?? MODELOS[0]!.precio;
  return Math.round((tokensEntrada * entrada + tokensSalida * salida) / 1_000_000 / USD_POR_NEURON);
}

export const MODELOS: readonly ModeloMedido[] = [
  {
    id: "@cf/zai-org/glm-4.7-flash",
    nombre: "GLM 4.7 Flash",
    familia: "openai",
    nota: "El de fábrica. Entendió 100 de 102 frases, contesta en 1 segundo y gasta unos 5 Neurons por búsqueda.",
    precio: [0.0605, 0.4],
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    nombre: "Llama 3.3 70B",
    familia: "clasica",
    nota: "El más preciso: 102 de 102, en 1.3 segundos. Gasta cinco veces más (unos 27 Neurons por búsqueda).",
    precio: [0.293, 2.253],
  },
  {
    id: "@cf/google/gemma-4-26b-a4b-it",
    nombre: "Gemma 4 26B",
    familia: "openai",
    nota: "Alternativa: 97 de 102, en 1.2 segundos y unos 7 Neurons por búsqueda.",
    precio: [0.1, 0.3],
  },
  {
    id: "@cf/meta/llama-3.2-3b-instruct",
    nombre: "Llama 3.2 3B",
    familia: "clasica",
    nota: "El más rápido (0.3 segundos), pero se equivoca más: 86 de 102. Confunde rasgos con colonias.",
    precio: [0.0509, 0.335],
  },
];

export const MODELO_DE_FABRICA = MODELOS[0]!.id;

export const modeloValido = (id: unknown): id is string => typeof id === "string" && MODELOS.some((m) => m.id === id);

/** Medido: p90 de 1.6 s y colas ocasionales de 10 a 17 s, que aquí se cortan. */
export const ESPERA_MAXIMA_MS = 3_000;

/** Lo mínimo que tiene que quedar del reloj para que valga un segundo intento. */
const MINIMO_PARA_REINTENTAR = 900;

export type Pregunta = {
  modelo: string;
  instrucciones: string;
  mensaje: string;
  /** JSON Schema de la respuesta. Ayuda a que acierte; no es una garantía. */
  esquema: Record<string, unknown>;
  maxTokens?: number;
  ms?: number;
};

export type Motivo =
  | "tiempo" /** tardó más de lo que se le concede */
  | "formato" /** contestó, pero no un objeto JSON */
  | "fallo"; /** el modelo o la red reventaron */

export type Respuesta = {
  /** El objeto JSON que contestó, sin validar; null si no hubo. */
  json: Record<string, unknown> | null;
  motivo: Motivo | null;
  /** Llamadas hechas de verdad (1 o 2): es lo que descuenta del tope diario. */
  consultas: number;
  ms: number;
  tokensEntrada: number;
  tokensSalida: number;
};

const TARDE = Symbol("tarde");

function conTope<T>(promesa: Promise<T>, ms: number): Promise<T | typeof TARDE> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<typeof TARDE>((resolver) => {
    reloj = setTimeout(() => resolver(TARDE), ms);
  });
  // Una promesa que pierde la carrera no debe acabar como rechazo sin atender.
  promesa.catch(() => undefined);
  return Promise.race([promesa, tope]).finally(() => clearTimeout(reloj));
}

function cuerpoPara(familia: Familia, p: Pregunta, conEsquema: boolean): Record<string, unknown> {
  const instrucciones = conEsquema
    ? p.instrucciones
    : `${p.instrucciones}\nResponde SOLO el objeto JSON, sin texto alrededor.`;
  const cuerpo: Record<string, unknown> = {
    messages: [
      { role: "system", content: instrucciones },
      { role: "user", content: p.mensaje },
    ],
    max_tokens: p.maxTokens ?? 220,
    // Cero: la misma frase tiene que dar la misma búsqueda.
    temperature: 0,
  };
  if (conEsquema) {
    cuerpo.response_format =
      familia === "openai"
        ? { type: "json_schema", json_schema: { name: "respuesta", schema: p.esquema, strict: true } }
        : { type: "json_schema", json_schema: p.esquema };
  }
  if (familia === "openai") {
    cuerpo.chat_template_kwargs = { enable_thinking: false };
    cuerpo.reasoning_effort = "low";
  }
  return cuerpo;
}

/** El texto de la respuesta y su cuenta de tokens, venga en la forma que venga. */
export function leerSalida(bruto: unknown): { texto: string | null; objeto: Record<string, unknown> | null; entrada: number; salida: number } {
  const r = (bruto ?? {}) as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const entrada = Math.trunc(Number(r.usage?.prompt_tokens) || 0);
  const salida = Math.trunc(Number(r.usage?.completion_tokens) || 0);
  const contenido = r.response ?? r.choices?.[0]?.message?.content ?? null;
  if (typeof contenido === "string") return { texto: contenido, objeto: null, entrada, salida };
  // Con `response_format` algunos modelos entregan el objeto ya armado.
  if (contenido && typeof contenido === "object" && !Array.isArray(contenido)) {
    return { texto: null, objeto: contenido as Record<string, unknown>, entrada, salida };
  }
  return { texto: null, objeto: null, entrada, salida };
}

/**
 * Una pregunta al modelo, con su reloj. `extraer` convierte el texto en objeto
 * (lo pone quien pregunta: `extraerJson` de `shared/intencion.ts`).
 *
 * Dos formas de pedirlo, en orden: con `response_format` y, si esa revienta
 * (no todos los modelos lo aceptan), UNA vez más pidiendo el JSON en el
 * mensaje. No se repite si lo que pasó fue que tardó: eso sería esperar dos
 * veces. El reloj es de la pregunta entera, no de cada intento.
 */
export async function preguntar(
  motor: MotorIA,
  p: Pregunta,
  extraer: (texto: string) => unknown,
): Promise<Respuesta> {
  const familia = MODELOS.find((m) => m.id === p.modelo)?.familia ?? "clasica";
  const tope = p.ms ?? ESPERA_MAXIMA_MS;
  const arranque = Date.now();
  const respuesta: Respuesta = { json: null, motivo: "fallo", consultas: 0, ms: 0, tokensEntrada: 0, tokensSalida: 0 };

  for (const conEsquema of [true, false]) {
    const resto = tope - (Date.now() - arranque);
    if (respuesta.consultas > 0 && resto < MINIMO_PARA_REINTENTAR) break;
    respuesta.consultas++;

    let bruto: unknown;
    try {
      const llegada = await conTope(motor.run(p.modelo, cuerpoPara(familia, p, conEsquema)), Math.max(1, resto));
      if (llegada === TARDE) {
        respuesta.motivo = "tiempo";
        break;
      }
      bruto = llegada;
    } catch (error) {
      console.error("IA: el modelo falló:", p.modelo, error instanceof Error ? error.message : error);
      respuesta.motivo = "fallo";
      continue;
    }

    const salida = leerSalida(bruto);
    respuesta.tokensEntrada += salida.entrada;
    respuesta.tokensSalida += salida.salida;
    const valor = salida.objeto ?? (salida.texto !== null ? extraer(salida.texto) : null);
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      respuesta.json = valor as Record<string, unknown>;
      respuesta.motivo = null;
      break;
    }
    respuesta.motivo = "formato";
  }

  respuesta.ms = Date.now() - arranque;
  return respuesta;
}
