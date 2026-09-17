import { createContext } from "react-router";
import type { Servicios } from "../server/config";

/**
 * Lo que el Worker le pasa a los loaders y acciones de React Router. Así el
 * código de las pantallas no toca `env` (PLAN §6.1): recibe los servicios ya
 * validados por `server/config.ts`.
 */
export type ContextoServidor = {
  servicios: Servicios;
  peticion: { ip: string; agente: string | null };
  /** `ctx.waitUntil`: trabajo que sigue después de responder (métricas, avisos). */
  esperar: (promesa: Promise<unknown>) => void;
};

export const contextoServidor = createContext<ContextoServidor>();
