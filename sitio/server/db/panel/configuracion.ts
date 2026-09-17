/**
 * Escritura de la tabla `configuracion` (PLAN §6.3). Aquí vive el teléfono, el
 * WhatsApp, las redes, los textos de la portada, el «nosotros» y el aviso de
 * privacidad: nada de eso está en el código, y esta pantalla es la razón.
 *
 * Cada clave guarda un JSON con una forma fija. Se valida al guardar **y** se
 * lee con tolerancia (`server/db/configuracion.ts`), para que ni una fila rara
 * ni un campo de más tumben el sitio.
 *
 * Los nombres de los campos van en el mismo idioma que la base
 * (`plantilla_propiedad`, `intro_servicios`): son los que ya lee el sitio.
 */

import { puede, type Actor, type Permiso } from "../../../shared/permisos";
import { correoValido } from "../../../shared/validacion";
import { numeroLimpio } from "../../../shared/whatsapp";
import { sentenciaBitacora } from "../../bitacora";
import { ahora } from "../../fechas";
import { exito, fallo, type Resultado } from "../../resultado";

export const CLAVES_EDITABLES = ["contacto", "whatsapp", "redes", "portada", "nosotros", "aviso_privacidad"] as const;
export type ClaveEditable = (typeof CLAVES_EDITABLES)[number];

export const esClaveEditable = (valor: unknown): valor is ClaveEditable =>
  typeof valor === "string" && (CLAVES_EDITABLES as readonly string[]).includes(valor);

/** Quién edita qué (§9): los datos de contacto y el aviso no son «contenido». */
export const PERMISO_DE_CLAVE: Record<ClaveEditable, Permiso> = {
  contacto: "configuracion.contacto",
  whatsapp: "configuracion.contacto",
  redes: "configuracion.contacto",
  portada: "contenido.editar",
  nosotros: "contenido.editar",
  aviso_privacidad: "configuracion.aviso",
};

export const TITULO_DE_CLAVE: Record<ClaveEditable, string> = {
  contacto: "Datos de contacto",
  whatsapp: "WhatsApp y plantillas",
  redes: "Redes sociales",
  portada: "Textos de la portada",
  nosotros: "Nosotros",
  aviso_privacidad: "Aviso de privacidad",
};

type Revision =
  | { ok: true; valor: Record<string, unknown> }
  | { ok: false; campo: string; mensaje: string };

const mal = (campo: string, mensaje: string): Revision => ({ ok: false, campo, mensaje });

const texto = (crudo: Record<string, unknown>, campo: string, tope: number): string => {
  const valor = crudo[campo];
  if (typeof valor !== "string") return "";
  return valor
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((r) => r.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, tope);
};

const enlaceValido = (url: string): boolean => url === "" || /^https:\/\/[^\s]+\.[^\s]+$/.test(url);

/**
 * Valida y arma el JSON de cada clave. Lo que no está en esta función no se
 * guarda: así el panel no puede meter campos que el sitio no sabe leer.
 */
export function revisarConfiguracion(clave: ClaveEditable, crudo: Record<string, unknown>): Revision {
  switch (clave) {
    case "contacto": {
      const correo = texto(crudo, "correo", 254).toLowerCase();
      if (correo && !correoValido(correo)) return mal("correo", "Revisa el correo de contacto.");
      const telefono = texto(crudo, "telefono", 30);
      if (telefono && telefono.replace(/\D/g, "").length < 10) {
        return mal("telefono", "El teléfono necesita 10 cifras.");
      }
      // `por_confirmar` de la siembra no se conserva: editar esto ES confirmarlo.
      return {
        ok: true,
        valor: {
          telefono,
          correo,
          direccion: texto(crudo, "direccion", 200),
          horario: texto(crudo, "horario", 120),
        },
      };
    }

    case "whatsapp": {
      const numero = numeroLimpio(texto(crudo, "numero", 20));
      if (numero && numero.length < 10) return mal("numero", "El WhatsApp necesita al menos 10 cifras.");
      const plantillaPropiedad = texto(crudo, "plantilla_propiedad", 300);
      // Sin `{url}` el mensaje llega sin la casa y quien contesta vuelve a
      // preguntar cuál era: es justo lo que el sitio nuevo viene a arreglar.
      if (plantillaPropiedad && !plantillaPropiedad.includes("{url}")) {
        return mal("plantilla_propiedad", "La plantilla tiene que incluir {url} para que llegue el enlace de la casa.");
      }
      return {
        ok: true,
        valor: {
          numero,
          plantilla_propiedad: plantillaPropiedad,
          plantilla_general: texto(crudo, "plantilla_general", 300),
        },
      };
    }

    case "redes": {
      const facebook = texto(crudo, "facebook", 300);
      const instagram = texto(crudo, "instagram", 300);
      if (!enlaceValido(facebook)) return mal("facebook", "El enlace de Facebook tiene que empezar con https://");
      if (!enlaceValido(instagram)) return mal("instagram", "El enlace de Instagram tiene que empezar con https://");
      return { ok: true, valor: { facebook, instagram } };
    }

    case "portada": {
      const imagen = texto(crudo, "imagen_propiedad_clave", 12).toUpperCase();
      if (imagen && !/^AIG-\d{4}$/.test(imagen)) {
        return mal("imagen_propiedad_clave", "Escribe la clave de la casa, como AIG-0042, o déjalo vacío.");
      }
      return {
        ok: true,
        valor: {
          saludo: texto(crudo, "saludo", 80),
          titular: texto(crudo, "titular", 140),
          lema: texto(crudo, "lema", 140),
          presentacion: texto(crudo, "presentacion", 800),
          intro_servicios: texto(crudo, "intro_servicios", 400),
          imagen_propiedad_clave: imagen,
        },
      };
    }

    case "nosotros": {
      const crudos = Array.isArray(crudo.valores) ? crudo.valores : [];
      const valores = crudos
        .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object")
        .slice(0, 12)
        .map((v) => ({ nombre: texto(v, "nombre", 60), descripcion: texto(v, "descripcion", 300) }))
        .filter((v) => v.nombre);
      return {
        ok: true,
        valor: {
          historia: texto(crudo, "historia", 4000),
          mision: texto(crudo, "mision", 1500),
          vision: texto(crudo, "vision", 1500),
          valores,
        },
      };
    }

    case "aviso_privacidad":
      return {
        ok: true,
        valor: {
          estado: texto(crudo, "estado", 80),
          advertencia: texto(crudo, "advertencia", 300),
          actualizado: texto(crudo, "actualizado", 40),
          texto: texto(crudo, "texto", 40_000),
        },
      };
  }
}

/** Qué claves cambiaron de verdad, para la bitácora (nunca el texto entero). */
function camposCambiados(antes: string | undefined, despues: Record<string, unknown>): string[] {
  let previo: Record<string, unknown> = {};
  try {
    previo = antes ? (JSON.parse(antes) as Record<string, unknown>) : {};
  } catch {
    previo = {};
  }
  return Object.keys(despues).filter((campo) => JSON.stringify(previo[campo]) !== JSON.stringify(despues[campo]));
}

export async function guardarConfiguracion(
  db: D1Database,
  actor: Actor,
  clave: ClaveEditable,
  crudo: Record<string, unknown>,
): Promise<Resultado<{ campos: string[] }>> {
  if (!puede(actor, PERMISO_DE_CLAVE[clave])) {
    return fallo(403, "sin_permiso", "No tienes permiso para cambiar esta parte del sitio.");
  }

  const revision = revisarConfiguracion(clave, crudo);
  if (!revision.ok) return fallo(400, "datos_invalidos", revision.mensaje);

  const previo = await db
    .prepare("SELECT valor FROM configuracion WHERE clave = ?")
    .bind(clave)
    .first<{ valor: string }>();
  const campos = camposCambiados(previo?.valor, revision.valor);
  if (!campos.length) return exito({ campos: [] });

  const momento = ahora();
  await db.batch([
    db
      .prepare(
        `INSERT INTO configuracion (clave, valor, actualizado_por, actualizado_en) VALUES (?, ?, ?, ?)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor,
               actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en`,
      )
      .bind(clave, JSON.stringify(revision.valor), actor.id, momento),
    sentenciaBitacora(db, {
      usuarioId: actor.id,
      entidad: "configuracion",
      entidadId: clave,
      accion: "editar",
      cambios: { campos },
    }),
  ]);

  return exito({ campos });
}
