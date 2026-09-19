/**
 * Qué casas salen en la portada y dónde (PLAN §10.1): las de la VITRINA de
 * arriba, que van pasando de una en una, y las de «Lo más reciente», sin
 * repetir ninguna.
 *
 * La vitrina se llena en este orden:
 *
 * 0. **La que abre la vitrina**, si el equipo la eligió en Panel › Contenido
 *    («Casa de la foto principal»): va primero, aunque no sea reciente.
 * 1. **Las destacadas**, tal como las marcó el equipo en el panel, aunque
 *    sean de la misma colonia: son su decisión.
 * 2. **Las más recientes, una por colonia.** Medido el 18/09/2026: las cuatro
 *    últimas que se subieron eran «Casa en El Prado», y una vitrina que pasa
 *    cuatro veces por el mismo nombre parece que no cambia.
 * 3. **Si no alcanzan las colonias**, las que falten, por fecha.
 *
 * Y queda en el orden de la consulta (primero las destacadas, luego por
 * fecha). «Lo más reciente» son las siguientes que no entraron a la vitrina.
 * Es una función pura sobre cualquier forma de casa: la consulta vive en
 * `server/db/propiedades.ts`.
 */

export type ReglasPortada<T> = {
  enVitrina: number;
  recientes: number;
  /** La casa elegida para abrir la vitrina (si la hay y tiene foto). */
  preferida?: (casa: T) => boolean;
  destacada: (casa: T) => boolean;
  /** La colonia (o la ciudad, si no tiene): dos casas con la misma no van juntas en la vitrina. */
  zona: (casa: T) => string;
  /** Una casa sin foto no puede ir en la vitrina, que es una foto grande. */
  conFoto: (casa: T) => boolean;
};

export function repartirPortada<T>(casas: readonly T[], reglas: ReglasPortada<T>): { vitrina: T[]; recientes: T[] } {
  const elegidas = new Set<number>();
  const zonas = new Set<string>();
  const tomar = (indice: number) => {
    elegidas.add(indice);
    zonas.add(reglas.zona(casas[indice]));
  };
  const cabe = () => elegidas.size < reglas.enVitrina;

  // 0. La que abre la vitrina.
  const preferida = reglas.preferida
    ? casas.findIndex((casa) => reglas.preferida!(casa) && reglas.conFoto(casa))
    : -1;
  if (preferida >= 0 && cabe()) tomar(preferida);

  // 1. Las destacadas.
  casas.forEach((casa, i) => {
    if (cabe() && reglas.destacada(casa) && reglas.conFoto(casa)) tomar(i);
  });
  // 2. Una por colonia.
  casas.forEach((casa, i) => {
    if (cabe() && !elegidas.has(i) && reglas.conFoto(casa) && !zonas.has(reglas.zona(casa))) tomar(i);
  });
  // 3. Las que falten, aunque repitan colonia.
  casas.forEach((casa, i) => {
    if (cabe() && !elegidas.has(i) && reglas.conFoto(casa)) tomar(i);
  });

  // La elegida primero; las demás, en el orden de la consulta.
  const vitrina = [...elegidas]
    .sort((a, b) => (a === preferida ? -1 : b === preferida ? 1 : a - b))
    .map((i) => casas[i]);
  const recientes = casas.filter((_, i) => !elegidas.has(i)).slice(0, reglas.recientes);
  return { vitrina, recientes };
}
