/**
 * Importa un módulo TypeScript del proyecto desde un guion de Node.
 *
 * Node ya sabe borrar los tipos, pero su resolutor exige la extensión en cada
 * `import` y el proyecto los escribe sin ella (`from "./parecido"`): un archivo
 * de `shared/` que importe a otro revienta con «Cannot find module». Aquí se
 * empaqueta con el esbuild que ya trae wrangler y se importa desde una URL
 * `data:`, sin escribir nada a disco. Los que no importan nada (`shared/texto.ts`)
 * se siguen importando tal cual.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

export async function importarTs(rutaDesdeLaRaiz) {
  const entrada = fileURLToPath(new URL(`../../${rutaDesdeLaRaiz}`, import.meta.url));
  const resultado = await build({
    entryPoints: [entrada],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    logLevel: "silent",
  });
  const codigo = resultado.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(codigo, "utf8").toString("base64")}`);
}
