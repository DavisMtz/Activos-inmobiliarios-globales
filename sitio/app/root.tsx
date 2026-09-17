import "@fontsource-variable/nunito/wght.css";
import "./styles/app.css";

import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import { contextoServidor } from "./contexto";

export function loader({ context }: Route.LoaderArgs) {
  const { config } = context.get(contextoServidor).servicios;
  return { modoDemo: config.modoDemo, nombreNegocio: config.nombreNegocio };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const datos = useRouteLoaderData<typeof loader>("root");
  // Si el loader de la raíz falló, se asume la demo: mejor no indexar de más.
  const modoDemo = datos?.modoDemo ?? true;
  return (
    <html lang="es-MX">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#a0051c" />
        {modoDemo ? <meta name="robots" content="noindex,nofollow" /> : null}
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh bg-fondo font-sans text-texto antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Raiz() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const noExiste = isRouteErrorResponse(error) && error.status === 404;
  const titulo = noExiste ? "No encontramos esta página" : "Algo salió mal";
  const detalle = noExiste
    ? "Puede que la dirección esté mal escrita o que la página ya no exista."
    : "Intenta de nuevo en un momento.";
  const pila = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <title>{`${titulo} | Activos Inmobiliarios Globales`}</title>
      <p className="text-sm font-bold tracking-widest text-marca uppercase">{noExiste ? "Error 404" : "Error"}</p>
      <h1 className="text-3xl font-extrabold text-tinta">{titulo}</h1>
      <p className="text-texto-suave">{detalle}</p>
      <p>
        <Link to="/" className="font-bold text-marca underline underline-offset-4">
          Ir al inicio
        </Link>
      </p>
      {pila ? <pre className="overflow-x-auto rounded-lg bg-tinta p-4 text-xs text-white">{pila}</pre> : null}
    </main>
  );
}
