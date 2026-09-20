/**
 * Los dibujos de la página de Servicios (pedido del 19/09/2026: «más visual»).
 *
 * Aquí viven solo los NOMBRES y la regla que elige; los trazos están en
 * `app/components/publico/dibujos-servicio.tsx`. Va partido así porque el panel
 * tiene que poder ofrecer la lista y no puede importar ni un módulo de interfaz
 * del sitio público (criterio 8 de F3: los trozos del panel se identifican por
 * su contenido).
 *
 * La columna es `servicios.icono`, que existía desde la primera migración y
 * nadie leía. Guarda una de estas claves, o nada.
 *
 * **Vacío no significa «sin dibujo»: significa «elígelo tú».** El dibujo sale
 * entonces del título. Así los seis servicios que ya existían tienen el suyo
 * sin migrar nada ni pedirle a nadie que entre al panel, y uno nuevo que se
 * llame «Avalúos» o «Administración de rentas» nace con un dibujo que le
 * queda. Quien quiera otro, lo escoge en Panel › Contenido y eso manda.
 */

export const DIBUJOS_DE_SERVICIO = [
  { clave: "venta", etiqueta: "Casa con letrero (venta)" },
  { clave: "renta", etiqueta: "Llave con llavero (renta)" },
  { clave: "financiamiento", etiqueta: "Monedas que suben a la casa (financiamiento)" },
  { clave: "tramites", etiqueta: "Escritura con sello (trámites)" },
  { clave: "asesoria", etiqueta: "Conversación (asesoría)" },
  { clave: "promocion", etiqueta: "Megáfono (promoción)" },
  { clave: "casa", etiqueta: "Casa (sirve para cualquier servicio)" },
] as const;

export type ClaveDeDibujo = (typeof DIBUJOS_DE_SERVICIO)[number]["clave"];

/** El de reserva: un servicio cuyo título no dice nada conocido. */
export const DIBUJO_DE_RESERVA: ClaveDeDibujo = "casa";

const CLAVES = new Set<string>(DIBUJOS_DE_SERVICIO.map((dibujo) => dibujo.clave));

export const esClaveDeDibujo = (valor: unknown): valor is ClaveDeDibujo =>
  typeof valor === "string" && CLAVES.has(valor);

export const etiquetaDeDibujo = (clave: ClaveDeDibujo): string =>
  DIBUJOS_DE_SERVICIO.find((dibujo) => dibujo.clave === clave)?.etiqueta ?? clave;

/**
 * De qué habla el título, por su raíz y sin acentos. **El orden importa:** lo
 * específico va antes que «renta» y «venta», porque «Asesoría en venta» es una
 * asesoría y «Créditos para tu renta» es un financiamiento.
 */
const POR_TITULO: [RegExp, ClaveDeDibujo][] = [
  [/financ|credit|hipotec|prestamo|infonavit|fovissste/, "financiamiento"],
  [/tramit|escritur|notari|legal|juridic|avaluo|contrato|document/, "tramites"],
  [/asesor|consult|orienta|acompan/, "asesoria"],
  [/promo|market|mercadot|publici|difusi|anunci/, "promocion"],
  [/rent|arrend|alquil/, "renta"],
  [/vent|vend|compr/, "venta"],
];

const sinAcentos = (texto: string): string =>
  texto
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** El dibujo de un servicio: el que se escogió en el panel o, si no, el que sugiere su título. */
export function dibujoDeServicio(servicio: { titulo: string; icono?: string | null }): ClaveDeDibujo {
  // Lo guardado puede ser cualquier cosa (la columna es texto libre y antes de
  // esto nadie la validaba): si no es una clave de la lista, no cuenta.
  const escogido = (servicio.icono ?? "").trim();
  if (esClaveDeDibujo(escogido)) return escogido;

  const titulo = sinAcentos(servicio.titulo);
  return POR_TITULO.find(([raiz]) => raiz.test(titulo))?.[1] ?? DIBUJO_DE_RESERVA;
}
