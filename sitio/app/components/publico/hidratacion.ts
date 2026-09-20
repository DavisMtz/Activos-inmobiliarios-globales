import { useSyncExternalStore } from "react";

const sinSuscripcion = () => () => {};

/**
 * `false` en el servidor y mientras React hidrata; `true` después, y desde el
 * primer instante en lo que se monta navegando. Mientras hidrata, el cliente
 * tiene que pintar lo mismo que el servidor: ni almacenamiento, ni
 * `history.state`, ni botones que todavía no funcionan.
 */
export const useYaHidrato = () =>
  useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
