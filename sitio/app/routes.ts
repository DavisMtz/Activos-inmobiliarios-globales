import { index, layout, prefix, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  // ─── Sitio público: todo dentro del mismo marco (cabecera, pie y WhatsApp)
  layout("routes/publico/marco.tsx", [
    index("routes/publico/inicio.tsx"),
    route("propiedades", "routes/publico/listado.tsx"),
    route("propiedades/:slug", "routes/publico/propiedad.tsx"),
  ]),

  // ─── Panel privado: no se enlaza desde el sitio público (PLAN §11.1)
  ...prefix("panel", [
    route("entrar", "routes/panel/entrar.tsx"),
    route("cambiar-clave", "routes/panel/cambiar-clave.tsx"),
    route("salir", "routes/panel/salir.tsx"),
    layout("routes/panel/marco.tsx", [index("routes/panel/inicio.tsx")]),
  ]),

  route("*", "routes/no-encontrado.tsx"),
] satisfies RouteConfig;
