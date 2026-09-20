#!/usr/bin/env node
/**
 * Filma una página con su movimiento REAL: fotogramas por CDP a intervalos de
 * reloj, para revisar una coreografía cuadro a cuadro (PLAN §16). Una captura
 * fija no enseña si algo se mueve bien, y leer el CSS tampoco.
 *
 *   node scripts/filmar.mjs servicios salida/ [--base http://localhost:5180]
 *        [--ancho 1366] [--alto 1024] [--movil] [--segundos 12] [--fps 10]
 *        [--desde nosotros]
 *
 * La ruta va SIN la barra inicial (con barra también vale, salvo desde Git
 * Bash, que la convierte en ruta de Windows: ver `normalizar`).
 *
 * Deja `f0000.png`, `f0001.png`… y `tiempos.json` en la carpeta. Para verlo
 * moverse: `py scripts/armar-gif.py salida/ pagina.gif` (necesita Pillow).
 *
 * Lo que ya costó una vuelta (20/09/2026, los dibujos de Servicios):
 * - **Las capturas NO tardan lo mismo.** Con la página a media animación cada
 *   una tarda ~180 ms y en reposo ~110: suponiendo un paso fijo, la entrada
 *   parecía ir al doble de velocidad y los tiempos del CSS «no cuadraban». Por
 *   eso se guarda la hora real a la que llegó cada fotograma (`tiempos.json`),
 *   y el GIF usa esas duraciones.
 * - **`--virtual-time-budget` no sirve** para esperar animaciones (memoria
 *   `verificacion-visual-chrome-headless`): aquí se espera por reloj.
 * - **La cortinilla de bienvenida** tapa la PRIMERA página de cada pestaña
 *   ~1.6 s. Por eso se llega desde otra (`--desde`): se filma lo que ve quien
 *   navega, y la página ya trae su CSS en caché. Con `--desde ""` se filma la
 *   primera visita, cortinilla incluida.
 * - El reloj arranca cuando la página pedida YA está pintada, no al pedirla:
 *   las animaciones de CSS empiezan ahí.
 * - Nunca registra visitas: `/api/eventos` va bloqueado (filmar una ficha en
 *   producción contaría en las métricas del panel).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string", default: "http://localhost:5180" },
    ancho: { type: "string", default: "1366" },
    alto: { type: "string", default: "1024" },
    movil: { type: "boolean", default: false },
    segundos: { type: "string", default: "12" },
    fps: { type: "string", default: "10" },
    desde: { type: "string", default: "/nosotros" },
  },
});
const [rutaCruda, carpeta] = positionals;
if (!rutaCruda || !carpeta) {
  console.error("Uso: node scripts/filmar.mjs <ruta> <carpeta> [--base …] [--ancho …] [--alto …] [--movil] [--segundos …] [--fps …] [--desde …]");
  process.exit(1);
}

/**
 * **Git Bash convierte en ruta de Windows todo argumento que empieza por «/»:**
 * `/servicios` llega como `C:/…/Git/servicios` y la URL sale inválida (pasó al
 * probar este guion). Por eso la ruta se acepta también SIN la barra
 * (`servicios`, `propiedades/casa-en-el-prado-4`), que es como hay que pasarla
 * desde Git Bash; PowerShell y `cmd` la dejan como está.
 */
function normalizar(valor, nombre) {
  if (/^[A-Za-z]:[\\/]/.test(valor)) {
    console.error(
      `${nombre}: llegó «${valor}», que es una ruta de Windows. Git Bash convirtió la «/» inicial: pásala sin barra (servicios) o antepón MSYS_NO_PATHCONV=1.`,
    );
    process.exit(1);
  }
  return valor ? `/${valor.replace(/^\/+/, "")}` : "";
}
const ruta = normalizar(rutaCruda, "ruta");
values.desde = normalizar(values.desde, "--desde");
const BASE = values.base.replace(/\/+$/, "");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(carpeta, { recursive: true });
const perfil = mkdtempSync(join(tmpdir(), "aig-film-"));
const puerto = 9100 + Math.floor(Math.random() * 90);
const chrome = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, "about:blank"],
  { stdio: "ignore" },
);
let objetivos;
for (let i = 0; i < 60; i++) {
  try {
    objetivos = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json();
    if (objetivos.some((o) => o.type === "page")) break;
  } catch {}
  await esperar(200);
}
const ws = new WebSocket(objetivos.find((o) => o.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pendientes = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendientes.has(m.id)) {
    pendientes.get(m.id)(m);
    pendientes.delete(m.id);
  }
});
const cdp = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id;
    pendientes.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["*/api/eventos*"] });
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: Number(values.ancho),
    height: Number(values.alto),
    deviceScaleFactor: 1,
    mobile: values.movil,
  });

  if (values.desde && values.desde !== ruta) {
    await cdp("Page.navigate", { url: BASE + values.desde });
    await esperar(3200);
  }
  await cdp("Page.navigate", { url: BASE + ruta });
  // Hasta que la página pedida está pintada: ahí arranca el reloj del CSS.
  const destino = new URL(BASE + ruta).pathname;
  for (let i = 0; i < 200; i++) {
    const r = await cdp("Runtime.evaluate", {
      expression: "location.pathname + '|' + (document.querySelector('main, h1') ? 1 : 0)",
      returnByValue: true,
    });
    if (r.result?.result?.value === `${destino}|1`) break;
    await esperar(15);
  }

  const paso = 1000 / Number(values.fps);
  const total = Math.round(Number(values.segundos) * Number(values.fps));
  const inicio = Date.now();
  const tiempos = [];
  for (let n = 0; n < total; n++) {
    const falta = inicio + n * paso - Date.now();
    if (falta > 0) await esperar(falta);
    const foto = await cdp("Page.captureScreenshot", { format: "png" });
    // La hora a la que LLEGÓ la foto: capturar tarda, y no siempre lo mismo.
    tiempos.push(Date.now() - inicio);
    writeFileSync(join(carpeta, `f${String(n).padStart(4, "0")}.png`), Buffer.from(foto.result.data, "base64"));
  }
  writeFileSync(join(carpeta, "tiempos.json"), JSON.stringify(tiempos));
  console.log(`${total} fotogramas en ${((Date.now() - inicio) / 1000).toFixed(1)} s → ${carpeta}`);
} finally {
  ws.close();
  chrome.kill();
}
process.exit(0);
