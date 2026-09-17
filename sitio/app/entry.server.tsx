import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  estado: number,
  cabeceras: Headers,
  contextoRouter: EntryContext,
  _contexto: RouterContextProvider,
) {
  let shellListo = false;
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), streamTimeout + 1_000);

  const cuerpo = await renderToReadableStream(<ServerRouter context={contextoRouter} url={request.url} />, {
    signal: controlador.signal,
    onError(error: unknown) {
      estado = 500;
      // Antes de que el shell salga, el error lo pinta el ErrorBoundary; después solo queda anotarlo.
      if (shellListo) console.error(error);
    },
  });
  shellListo = true;

  // Google, WhatsApp y Facebook leen el HTML completo de una vez: a ellos se
  // les espera a que termine todo, para que la vista previa salga con datos.
  if (isbot(request.headers.get("user-agent") ?? "") || contextoRouter.isSpaMode) {
    await cuerpo.allReady;
  }
  clearTimeout(temporizador);

  cabeceras.set("Content-Type", "text/html; charset=utf-8");
  return new Response(cuerpo, { headers: cabeceras, status: estado });
}
