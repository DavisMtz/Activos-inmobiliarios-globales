#!/usr/bin/env node
/**
 * Crea (o restablece) el acceso maestro con una contraseña temporal (PLAN §8.5).
 *
 *   npm run maestro:crear -- --correo davismartinesad@gmail.com --nombre "David" --local|--remote [--restablecer]
 *
 * - Imprime la contraseña temporal UNA sola vez. No se guarda en claro en
 *   ningún sitio: ni en la base, ni en la bitácora, ni en un archivo.
 * - Si el correo ya existe, aborta; con --restablecer le pone una temporal
 *   nueva y le borra todas las sesiones (así se recupera el acceso maestro).
 * - Las pruebas NO se hacen con la cuenta real: consumirían la temporal.
 */
import { parseArgs } from "node:util";
import { HORAS_TEMPORAL, buscarUsuario, correoValido, crearUsuarioConTemporal, normalizarCorreo, restablecerConTemporal } from "./lib/usuarios.mjs";

const { values } = parseArgs({
  options: {
    correo: { type: "string" },
    nombre: { type: "string" },
    local: { type: "boolean", default: false },
    remote: { type: "boolean", default: false },
    restablecer: { type: "boolean", default: false },
  },
});

function salirConError(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

const correo = normalizarCorreo(values.correo);
if (!correoValido(correo)) salirConError("Falta --correo o no es un correo válido.");
if (values.local === values.remote) salirConError("Indica exactamente uno: --local o --remote.");
const remoto = values.remote;
const donde = remoto ? "PRODUCCIÓN (D1 remota)" : "local";

const existente = buscarUsuario(correo, { remoto });
let resultado;

if (existente) {
  if (!values.restablecer) {
    salirConError(`${correo} ya tiene cuenta (${existente.rol}) en ${donde}. Usa --restablecer para darle una temporal nueva.`);
  }
  if (existente.rol !== "maestro") {
    salirConError(`${correo} existe pero su rol es «${existente.rol}», no maestro. Este script solo restablece maestros.`);
  }
  resultado = await restablecerConTemporal(existente.id, { remoto });
  console.log(`\n✔ Acceso maestro restablecido en ${donde}. Se cerraron todas sus sesiones.`);
} else {
  const nombre = String(values.nombre ?? "").trim();
  if (!nombre) salirConError("Falta --nombre para crear la cuenta.");
  resultado = await crearUsuarioConTemporal({ correo, nombre, rol: "maestro" }, { remoto });
  console.log(`\n✔ Acceso maestro creado en ${donde}.`);
}

console.log(`
  Correo:               ${correo}
  Contraseña temporal:  ${resultado.clave}
  Vence:                en ${HORAS_TEMPORAL} horas (${resultado.expira})

  Cópiala ahora: no se volverá a mostrar.
  Al entrar, el sistema pedirá cambiarla por una propia.
`);
