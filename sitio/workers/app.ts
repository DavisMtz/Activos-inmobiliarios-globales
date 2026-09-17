import { createRequestHandler } from "react-router";
import { crearApp } from "../server/app";

const manejarReact = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

const app = crearApp(manejarReact);

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
} satisfies ExportedHandler<Env>;
