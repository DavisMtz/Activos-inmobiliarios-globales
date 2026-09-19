/**
 * El menú del panel sale de los permisos (PLAN §9): cada sección declara qué
 * permiso necesita y la navegación se arma filtrando con `puede()`. La interfaz
 * esconde lo que no se puede hacer, pero quien decide es siempre el servidor,
 * que vuelve a comprobarlo en cada loader y en cada endpoint.
 *
 * Las secciones se van sumando a medida que sus pantallas existen: un menú con
 * enlaces a pantallas que todavía no están sería peor que un menú corto.
 */

import type { ComponentType } from "react";
import { puede, type Actor, type Permiso } from "../../../shared/permisos";
import {
  IconoBitacora,
  IconoCasas,
  IconoConfiguracion,
  IconoContenido,
  IconoCuenta,
  IconoEntregas,
  IconoInicio,
  IconoMetricas,
  IconoProspectos,
  IconoSistema,
  IconoUsuarios,
} from "./iconos";

export type Seccion = {
  ruta: string;
  titulo: string;
  Icono: ComponentType<{ className?: string }>;
  /** Null = basta con tener sesión. */
  permiso: Permiso | null;
  /** Para marcar la sección activa cuando la ruta tiene hijos. */
  raiz?: boolean;
};

const SECCIONES: Seccion[] = [
  { ruta: "/panel", titulo: "Inicio", Icono: IconoInicio, permiso: null },
  { ruta: "/panel/propiedades", titulo: "Casas", Icono: IconoCasas, permiso: "propiedades.ver", raiz: true },
  { ruta: "/panel/prospectos", titulo: "Prospectos", Icono: IconoProspectos, permiso: "prospectos.ver" },
  { ruta: "/panel/metricas", titulo: "Métricas", Icono: IconoMetricas, permiso: "metricas.ver" },
  { ruta: "/panel/contenido", titulo: "Contenido", Icono: IconoContenido, permiso: "contenido.editar" },
  { ruta: "/panel/entregas", titulo: "Entregas", Icono: IconoEntregas, permiso: "contenido.editar" },
  { ruta: "/panel/configuracion", titulo: "Configuración", Icono: IconoConfiguracion, permiso: "configuracion.contacto" },
  { ruta: "/panel/usuarios", titulo: "Cuentas", Icono: IconoUsuarios, permiso: "usuarios.gestionar" },
  { ruta: "/panel/bitacora", titulo: "Bitácora", Icono: IconoBitacora, permiso: "bitacora.ver" },
  { ruta: "/panel/sistema", titulo: "Sistema", Icono: IconoSistema, permiso: "sistema.gestionar" },
  { ruta: "/panel/mi-cuenta", titulo: "Mi cuenta", Icono: IconoCuenta, permiso: "cuenta.propia" },
];

export const seccionesDe = (actor: Actor): Seccion[] =>
  SECCIONES.filter((seccion) => seccion.permiso === null || puede(actor, seccion.permiso));

/** Si la ruta de ahora cae dentro de una sección (para `aria-current`). */
export function esSeccionActiva(seccion: Seccion, ruta: string): boolean {
  if (seccion.ruta === "/panel") return ruta === "/panel" || ruta === "/panel/";
  return seccion.raiz ? ruta === seccion.ruta || ruta.startsWith(`${seccion.ruta}/`) : ruta === seccion.ruta;
}
