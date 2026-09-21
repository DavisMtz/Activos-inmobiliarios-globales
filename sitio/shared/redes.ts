/**
 * Las redes sociales que el equipo puede poner en el pie desde el panel
 * (PLAN §6.3). **Solo datos:** el panel no puede importar interfaz del sitio
 * (criterio 8 de F3), así que aquí no hay ni un icono; los dibujos viven en
 * `app/components/publico/iconos.tsx` y el pie los empareja por esta clave.
 *
 * Antes las redes eran dos campos fijos —`facebook` e `instagram`— y para
 * añadir TikTok había que tocar el código. Ahora son una LISTA: la clave sale
 * de aquí y el enlace lo escribe el equipo.
 *
 * **Para agregar una red** hacen falta tres cosas, y las tres se verifican:
 * 1. su renglón en `REDES`, aquí;
 * 2. su dibujo en `iconos.tsx` y su entrada en `ICONO_DE_RED` (`marco.tsx`);
 * 3. mirarla en `npm run hoja:redes` —un icono de marca sacado de memoria
 *    sale torcido y en el código no se nota— y su caso en `tests/redes.test.ts`.
 */

/** El catálogo, en el orden en que se ofrece en el panel. */
export const REDES = {
  facebook: { etiqueta: "Facebook" },
  instagram: { etiqueta: "Instagram" },
  tiktok: { etiqueta: "TikTok" },
  x: { etiqueta: "X" },
  youtube: { etiqueta: "YouTube" },
  linkedin: { etiqueta: "LinkedIn" },
  threads: { etiqueta: "Threads" },
  whatsapp: { etiqueta: "Canal de WhatsApp" },
} as const;

export type ClaveDeRed = keyof typeof REDES;

export const CLAVES_DE_RED = Object.keys(REDES) as ClaveDeRed[];

export const esClaveDeRed = (valor: unknown): valor is ClaveDeRed =>
  typeof valor === "string" && (CLAVES_DE_RED as string[]).includes(valor);

export const etiquetaDeRed = (clave: ClaveDeRed): string => REDES[clave].etiqueta;

/** Un enlace del pie: qué red es y a dónde va. */
export type EnlaceDeRed = { red: ClaveDeRed; url: string };

/**
 * Cuántas caben. Ocho renglones ya llenan la columna del pie en un
 * escritorio; más que eso deja de leerse como una lista y pasa a ser un muro.
 */
export const TOPE_DE_REDES = 8;

// ─── Las reglas, aquí y no repartidas ─────────────────────────────
//
// Leer y guardar viven juntos a propósito: la base guarda un JSON libre y lo
// único que impide que el pie enseñe basura es que las dos puntas apliquen la
// MISMA regla. Además son puras, así que las prueba `tests/redes.test.ts` sin
// levantar D1 (el proyecto de Node no puede importar `server/db`, que necesita
// los tipos de Cloudflare).

type Bolsa = Record<string, unknown>;

const cadena = (bolsa: Bolsa, campo: string): string => {
  const valor = bolsa[campo];
  return typeof valor === "string" ? valor.trim() : "";
};

/** Un enlace de red tiene que ser `https://`: ni `http://`, ni un texto suelto. */
export const enlaceDeRedValido = (url: string): boolean => /^https:\/\/[^\s]+\.[^\s]+$/.test(url);

/**
 * Lo que el sitio lee de la fila `redes`. Entiende las DOS formas: la lista
 * de hoy y los campos sueltos (`facebook`, `instagram`) de antes, que es lo
 * que hay guardado en producción. Nada de lo que no sepa dibujar sale.
 */
export function redesDeBolsa(bolsa: Bolsa): EnlaceDeRed[] {
  const deLaLista = Array.isArray(bolsa.lista)
    ? (bolsa.lista as unknown[])
        .filter((e): e is Bolsa => Boolean(e) && typeof e === "object")
        .map((e) => ({ red: cadena(e, "red"), url: cadena(e, "url") }))
        .filter((e): e is EnlaceDeRed => esClaveDeRed(e.red) && e.url !== "")
    : [];
  if (deLaLista.length) return deLaLista.slice(0, TOPE_DE_REDES);
  const antiguas = CLAVES_DE_RED.map((red) => ({ red, url: cadena(bolsa, red) })).filter((e) => e.url !== "");
  return antiguas.slice(0, TOPE_DE_REDES);
}

export type RevisionDeRedes =
  | { ok: true; lista: EnlaceDeRed[] }
  | { ok: false; campo: string; mensaje: string };

/**
 * Lo que el panel puede guardar. Entra la lista de renglones del formulario
 * —o los campos sueltos que todavía manda la API— y sale la lista limpia:
 * sin renglones vacíos, sin repetidas y sin enlaces que no sean `https://`.
 */
export function revisarRedes(crudo: Bolsa): RevisionDeRedes {
  const crudos: Bolsa[] = Array.isArray(crudo.lista)
    ? (crudo.lista as unknown[]).filter((e): e is Bolsa => Boolean(e) && typeof e === "object")
    : CLAVES_DE_RED.filter((red) => red in crudo).map((red) => ({ red, url: crudo[red] }));

  const lista: EnlaceDeRed[] = [];
  const puestas = new Set<string>();
  for (const entrada of crudos) {
    const red = cadena(entrada, "red");
    const url = cadena(entrada, "url").slice(0, 300);
    // Un renglón sin enlace es un renglón vacío del formulario: se calla. Y
    // vaciarlo es, además, la manera de QUITAR una red del pie.
    if (url === "") continue;
    if (!esClaveDeRed(red)) return { ok: false, campo: "red", mensaje: "Elige una red de la lista." };
    if (!enlaceDeRedValido(url)) {
      return { ok: false, campo: `url_${red}`, mensaje: `El enlace de ${etiquetaDeRed(red)} tiene que empezar con https://` };
    }
    // La misma red dos veces son dos renglones iguales en el pie: manda la
    // primera, que es la que el equipo puso más arriba.
    if (puestas.has(red)) continue;
    puestas.add(red);
    lista.push({ red, url });
    if (lista.length === TOPE_DE_REDES) break;
  }
  return { ok: true, lista };
}
