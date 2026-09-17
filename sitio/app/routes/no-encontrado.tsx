import { data } from "react-router";

/** Cualquier ruta que no exista cae aquí y la pinta el ErrorBoundary de la raíz con su 404. */
export function loader() {
  throw data(null, { status: 404 });
}

export default function NoEncontrado() {
  return null;
}
