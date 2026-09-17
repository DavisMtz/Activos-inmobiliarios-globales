import { index, layout, prefix, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  // ─── Sitio público: todo dentro del mismo marco (cabecera, pie y WhatsApp)
  layout("routes/publico/marco.tsx", [
    index("routes/publico/inicio.tsx"),
    route("propiedades", "routes/publico/listado.tsx"),
    route("propiedades/:slug", "routes/publico/propiedad.tsx"),
    route("servicios", "routes/publico/servicios.tsx"),
    route("nosotros", "routes/publico/nosotros.tsx"),
    route("contacto", "routes/publico/contacto.tsx"),
    route("aviso-de-privacidad", "routes/publico/aviso.tsx"),
  ]),

  // ─── Panel privado: no se enlaza desde el sitio público (PLAN §11.1)
  ...prefix("panel", [
    route("entrar", "routes/panel/entrar.tsx"),
    route("cambiar-clave", "routes/panel/cambiar-clave.tsx"),
    route("salir", "routes/panel/salir.tsx"),
    layout("routes/panel/marco.tsx", [
      index("routes/panel/inicio.tsx"),
      route("propiedades", "routes/panel/propiedades.tsx"),
      route("propiedades/nueva", "routes/panel/propiedad-nueva.tsx"),
      route("propiedades/:id", "routes/panel/propiedad.tsx"),
      route("prospectos", "routes/panel/prospectos.tsx"),
      route("metricas", "routes/panel/metricas.tsx"),
      route("contenido", "routes/panel/contenido.tsx"),
      route("configuracion", "routes/panel/configuracion.tsx"),
      route("usuarios", "routes/panel/usuarios.tsx"),
      route("bitacora", "routes/panel/bitacora.tsx"),
      route("sistema", "routes/panel/sistema.tsx"),
      route("mi-cuenta", "routes/panel/mi-cuenta.tsx"),
    ]),
  ]),

  route("*", "routes/no-encontrado.tsx"),
] satisfies RouteConfig;
