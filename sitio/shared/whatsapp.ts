/**
 * Enlaces de WhatsApp (PLAN §10.2). El número y las plantillas viven en la
 * tabla `configuracion` y se editan desde el panel: aquí no hay ninguno.
 *
 * Lo que arregla esto del sitio actual: hoy el botón «Informes» de una ficha
 * lleva a un formulario genérico y quien contesta no sabe qué casa interesa.
 */

export type DatosDePropiedad = {
  titulo: string;
  clave: string;
  url: string;
};

/** Solo cifras: «+52 443 492 2197» → «524434922197». */
export const numeroLimpio = (numero: string): string => numero.replace(/\D+/g, "");

/**
 * El número con clave de país, que es lo único que acepta `wa.me` (F4).
 *
 * Hace falta para contestarle a un prospecto: quien llena el formulario del
 * sitio teclea diez cifras («443 111 2233»), y `wa.me/4431112233` no abre
 * ningún chat. Diez cifras se toman como mexicanas; lo que ya trae clave se
 * deja tal cual, incluido el viejo `521` de los celulares. Vacío si no parece
 * un número: quien pinta decide si esconde el botón.
 */
export function numeroInternacionalMX(numero: string): string {
  const limpio = numeroLimpio(numero);
  if (limpio.length === 10) return `52${limpio}`;
  return limpio.length >= 11 && limpio.length <= 15 ? limpio : "";
}

/**
 * El número como se lee y se dicta: «524434922197» → «443 492 2197». Lo que
 * no es un número mexicano se enseña con su clave de país, sin agrupar: vale
 * más un número feo que uno mal partido. Vacío si no hay número.
 */
export function numeroParaLeer(numero: string): string {
  const limpio = numeroLimpio(numero);
  const nacional =
    limpio.length === 10
      ? limpio
      : limpio.length === 12 && limpio.startsWith("52")
        ? limpio.slice(2)
        : limpio.length === 13 && limpio.startsWith("521")
          ? limpio.slice(3)
          : null;
  if (nacional) return `${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}`;
  return limpio ? `+${limpio}` : "";
}

/**
 * Rellena `{titulo}`, `{clave}` y `{url}` de la plantilla. Una llave que no
 * exista se deja tal cual: es un texto que escribió una persona en el panel y
 * borrarlo en silencio sería peor que enseñarlo.
 */
export function textoDeWhatsApp(plantilla: string, datos: DatosDePropiedad): string {
  return plantilla.replace(/\{(titulo|clave|url)\}/g, (_, campo: keyof DatosDePropiedad) => datos[campo]);
}

/**
 * `https://wa.me/<numero>?text=…`. Null si no hay número configurado: quien
 * pinta decide si oculta el botón (PLAN §6.1: nada del negocio en el código).
 */
export function enlaceWhatsApp(numero: string, texto: string): string | null {
  const limpio = numeroLimpio(numero);
  // Diez cifras es un celular nacional sin clave de país; menos no es un número.
  if (limpio.length < 10) return null;
  return `https://wa.me/${limpio}?text=${encodeURIComponent(texto)}`;
}

/** El enlace de una casa concreta, con su plantilla ya rellenada. */
export function enlaceDePropiedad(
  numero: string,
  plantilla: string,
  datos: DatosDePropiedad,
): string | null {
  return enlaceWhatsApp(numero, textoDeWhatsApp(plantilla, datos));
}
