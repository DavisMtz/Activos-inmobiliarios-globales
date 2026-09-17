import type { SesionActiva } from "../auth/sesion";
import type { Servicios } from "../config";

export type EntornoHono = {
  Bindings: Env;
  Variables: {
    servicios: Servicios;
    sesion: SesionActiva;
    token: string;
  };
};
