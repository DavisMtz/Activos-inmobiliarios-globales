/**
 * Lo que se enseña al entrar al panel (PLAN §11.2): avisos con lo que pide
 * atención, cada uno con su cuenta y el enlace que lleva justo a esa lista.
 *
 * Los avisos dependen del rol: un asesor ve los de SUS casas, la persona de
 * contenido no ve prospectos y solo el maestro ve lo que falta por migrar.
 * Además, un aviso con cuenta cero no se enseña: un panel lleno de ceros no
 * dice nada.
 */

import { alcance, puede, type Actor } from "../../../shared/permisos";
import { LE_FALTA_PARA_PUBLICAR } from "./propiedades";

export type AvisoDeInicio = {
  clave: string;
  titulo: string;
  cuantos: number;
  /** A dónde lleva: la misma lista, ya filtrada. */
  ruta: string;
  tono: "urgente" | "atencion" | "calma";
};

/** Cada aviso es un COUNT sobre las 188 casas: tres recorridos, no una consulta por casa. */
type Consulta = {
  clave: string;
  titulo: (n: number) => string;
  ruta: string;
  tono: AvisoDeInicio["tono"];
  sql: string;
  valores: unknown[];
};

const DESDE_CASAS = "FROM propiedades p LEFT JOIN zonas z ON z.id = p.zona_id";

/**
 * «Sin atender»: los prospectos que siguen en `nuevo` (el asesor, solo los
 * suyos; quien no ve prospectos, ninguno). Es LA cuenta: la usan el aviso de
 * Inicio y el número de «Prospectos» en el menú, y tienen que decir lo mismo.
 */
function consultaSinAtender(actor: Actor): { sql: string; valores: unknown[] } | null {
  if (!puede(actor, "prospectos.ver")) return null;
  const suyos = alcance(actor, "prospectos.ver") === "propias";
  return {
    sql: `SELECT COUNT(*) AS n FROM prospectos WHERE estado = 'nuevo'${suyos ? " AND asesor_id = ?" : ""}`,
    valores: suyos ? [actor.id] : [],
  };
}

/** El número del menú: un solo COUNT sobre `prospectos`, en cada pantalla del panel. */
export async function prospectosSinAtender(db: D1Database, actor: Actor): Promise<number> {
  const consulta = consultaSinAtender(actor);
  if (!consulta) return 0;
  const fila = await db
    .prepare(consulta.sql)
    .bind(...consulta.valores)
    .first<{ n: number }>();
  return Number(fila?.n ?? 0);
}

export async function avisosDeInicio(db: D1Database, actor: Actor): Promise<AvisoDeInicio[]> {
  const consultas: Consulta[] = [];
  // «Solo las suyas» para el asesor, todas para los demás (§9).
  const soloSuyas = alcance(actor, "propiedades.editar") === "propias";
  const mias = soloSuyas ? "AND p.asesor_id = ?" : "";
  const valorMias = soloSuyas ? [actor.id] : [];

  if (puede(actor, "propiedades.publicar")) {
    consultas.push({
      clave: "revision",
      titulo: (n) => (n === 1 ? "1 casa espera revisión" : `${n} casas esperan revisión`),
      ruta: "/panel/propiedades?estado=revision",
      tono: "urgente",
      sql: `SELECT COUNT(*) AS n FROM propiedades p WHERE p.eliminada_en IS NULL AND p.estado = 'revision'`,
      valores: [],
    });
  }

  consultas.push({
    clave: "falta",
    titulo: (n) => (n === 1 ? "1 casa no se puede publicar todavía" : `${n} casas no se pueden publicar todavía`),
    ruta: "/panel/propiedades?avisos=publicar",
    tono: "atencion",
    sql: `SELECT COUNT(*) AS n ${DESDE_CASAS}
           WHERE p.eliminada_en IS NULL AND p.estado <> 'vendida' AND p.estado <> 'rentada'
             AND ${LE_FALTA_PARA_PUBLICAR} ${mias}`,
    valores: valorMias,
  });

  consultas.push({
    clave: "migracion",
    // Decir de dónde vienen: son las que se trajeron del sitio anterior, no
    // algo que el equipo dejó a medias.
    titulo: (n) => `${n} casas traen datos de la importación por confirmar`,
    ruta: "/panel/propiedades?avisos=migracion",
    tono: "calma",
    sql: `SELECT COUNT(*) AS n FROM propiedades p
           WHERE p.eliminada_en IS NULL AND p.revisar IS NOT NULL AND p.revisar <> '[]' ${mias}`,
    valores: valorMias,
  });

  const sinAtender = consultaSinAtender(actor);
  if (sinAtender) {
    consultas.push({
      clave: "prospectos",
      titulo: (n) => (n === 1 ? "1 persona interesada sin atender" : `${n} personas interesadas sin atender`),
      // Con el filtro puesto: el aviso lleva a esa lista, no a la bandeja entera.
      ruta: "/panel/prospectos?estado=nuevo",
      tono: "urgente",
      ...sinAtender,
    });
  }

  if (puede(actor, "sistema.gestionar")) {
    consultas.push({
      clave: "fotos",
      titulo: (n) => `${n} fotos siguen en el servidor anterior`,
      ruta: "/panel/sistema",
      tono: "calma",
      sql: "SELECT COUNT(*) AS n FROM fotos WHERE public_id IS NULL AND url_origen IS NOT NULL",
      valores: [],
    });
  }

  if (puede(actor, "propiedades.papelera")) {
    consultas.push({
      clave: "papelera",
      titulo: (n) => (n === 1 ? "1 casa en la papelera" : `${n} casas en la papelera`),
      ruta: "/panel/propiedades?papelera=1",
      tono: "calma",
      sql: "SELECT COUNT(*) AS n FROM propiedades p WHERE p.eliminada_en IS NOT NULL",
      valores: [],
    });
  }

  const resultados = await db.batch<{ n: number }>(
    consultas.map((consulta) => db.prepare(consulta.sql).bind(...consulta.valores)),
  );

  return consultas
    .map((consulta, i) => {
      const cuantos = Number(resultados[i]?.results[0]?.n ?? 0);
      return { clave: consulta.clave, titulo: consulta.titulo(cuantos), cuantos, ruta: consulta.ruta, tono: consulta.tono };
    })
    .filter((aviso) => aviso.cuantos > 0);
}

export type ResumenDeInicio = {
  publicadas: number;
  enVenta: number;
  enRenta: number;
  /** Las que este actor tiene asignadas (0 para quien no lleva casas). */
  mias: number;
};

/** Las cifras de arriba: el estado del catálogo en una línea. */
export async function resumenDeInicio(db: D1Database, actor: Actor): Promise<ResumenDeInicio> {
  const fila = await db
    .prepare(
      `SELECT
         SUM(p.estado IN ('publicada','apartada')) AS publicadas,
         SUM(p.estado IN ('publicada','apartada') AND p.operacion IN ('venta','venta_renta')) AS en_venta,
         SUM(p.estado IN ('publicada','apartada') AND p.operacion IN ('renta','venta_renta')) AS en_renta,
         SUM(p.asesor_id = ?) AS mias
       FROM propiedades p WHERE p.eliminada_en IS NULL`,
    )
    .bind(actor.id)
    .first<{ publicadas: number; en_venta: number; en_renta: number; mias: number }>();

  return {
    publicadas: Number(fila?.publicadas ?? 0),
    enVenta: Number(fila?.en_venta ?? 0),
    enRenta: Number(fila?.en_renta ?? 0),
    mias: Number(fila?.mias ?? 0),
  };
}
