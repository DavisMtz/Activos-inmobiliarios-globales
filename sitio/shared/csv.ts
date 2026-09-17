/**
 * CSV que abre bien en Excel (PLAN §15, «listo cuando» de F4).
 *
 * Tres cosas que no se adivinan y que cuestan un archivo ilegible:
 *
 * 1. **BOM UTF-8 al principio.** Sin él, Excel abre el archivo con la
 *    codificación de Windows y «Martínez» se lee «MartÃ­nez». El BOM se escribe
 *    con su código (`fromCharCode`) y NO como un escape en el texto: un escape
 *    Unicode tecleado en el editor llega al archivo como el carácter real, y
 *    entonces git toma el archivo por binario.
 * 2. **Las fórmulas.** Una celda que empieza por `=`, `+`, `-` o `@` la ejecuta
 *    Excel al abrirla. El nombre y el mensaje los escribe cualquiera desde el
 *    formulario del sitio público, así que van neutralizados con un apóstrofo
 *    delante (recomendación de OWASP contra la inyección de fórmulas).
 * 3. **Los fines de línea son CRLF** y las comillas se doblan. Aquí se entrecomilla
 *    TODO: una coma o un salto de línea dentro de un mensaje no se puede olvidar
 *    si no hay caso en el que se olvide.
 */

const BOM = String.fromCharCode(0xfeff);

/** Los arranques que Excel y LibreOffice toman por fórmula. */
const ARRANQUE_DE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Una celda, siempre entre comillas. `neutralizar` es para los campos que
 * escribió una persona desde el sitio; el teléfono se deja como está, porque un
 * «+52…» legítimo empieza por `+` y ya viene validado.
 */
export function celdaCSV(valor: unknown, { neutralizar = true } = {}): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  const seguro = neutralizar && ARRANQUE_DE_FORMULA.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replaceAll('"', '""')}"`;
}

export type ColumnaCSV = {
  titulo: string;
  /** El teléfono y las fechas no necesitan apóstrofo: no son texto libre. */
  literal?: boolean;
};

/** Arma el archivo entero: BOM, encabezados y filas, con CRLF. */
export function armarCSV(columnas: ColumnaCSV[], filas: unknown[][]): string {
  const renglones = [
    columnas.map((columna) => celdaCSV(columna.titulo, { neutralizar: false })).join(","),
    ...filas.map((fila) =>
      columnas.map((columna, i) => celdaCSV(fila[i], { neutralizar: !columna.literal })).join(","),
    ),
  ];
  return BOM + renglones.join("\r\n") + "\r\n";
}

const reloj = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // `h23` explícito: con `hour12: false` a secas, la medianoche sale como «24».
  hourCycle: "h23",
});

/**
 * `2026-09-17T23:04:05.123Z` → `2026-09-17 17:04`, en hora de Morelia.
 *
 * Excel reconoce ese formato como fecha y lo ordena bien; el ISO con `T` y `Z`
 * lo deja como texto. Las fechas de la base son UTC (`server/fechas.ts`) y en
 * un CSV que lee el equipo tienen que estar en su hora.
 */
export function fechaParaExcel(iso: string | null | undefined): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const partes = Object.fromEntries(reloj.formatToParts(fecha).map((parte) => [parte.type, parte.value]));
  return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}`;
}
