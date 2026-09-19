import { describe, expect, it } from "vitest";
import { mensajeDeInvitacion, nombrePublico, revisarRespuesta } from "../shared/entrega";

/**
 * Entregas (F5). Lo que se comprueba es lo que protege al cliente: que del
 * nombre solo salga la inicial del apellido, que los dos permisos vayan por
 * separado y que un comentario no autorizado ni siquiera se guarde.
 */

const formulario = (campos: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

describe("nombrePublico", () => {
  it("nombre e inicial del primer apellido", () => {
    expect(nombrePublico("Laura", "Martínez García")).toBe("Laura M.");
    expect(nombrePublico("  laura   ELENA ", "martínez")).toBe("Laura Elena M.");
  });

  it("salta las partículas del apellido", () => {
    expect(nombrePublico("José", "de la Torre")).toBe("José T.");
    expect(nombrePublico("Ana", "Del Río")).toBe("Ana R.");
  });

  it("acentos y eñes en la inicial", () => {
    expect(nombrePublico("Pedro", "Ñáñez")).toBe("Pedro Ñ.");
    expect(nombrePublico("Sofía", "álvarez")).toBe("Sofía Á.");
  });

  it("sin apellido, solo el nombre", () => {
    expect(nombrePublico("Familia Pérez", "")).toBe("Familia Pérez");
  });
});

describe("revisarRespuesta", () => {
  const base = { nombre: "Laura", apellido: "Martínez", comentario: "Todo el proceso fue muy claro." };

  it("los dos permisos, por separado", () => {
    const r = revisarRespuesta(formulario({ ...base, acepta_texto: "on" }), true);
    expect(r.ok && r.valor.aceptaTexto && !r.valor.aceptaFotos).toBe(true);
    const s = revisarRespuesta(formulario({ ...base, acepta_fotos: "on" }), true);
    expect(s.ok && !s.valor.aceptaTexto && s.valor.aceptaFotos).toBe(true);
  });

  it("un comentario sin permiso de publicarlo no se guarda", () => {
    const r = revisarRespuesta(formulario({ ...base, acepta_fotos: "on" }), true);
    expect(r.ok && r.valor.comentario).toBe("");
  });

  it("sin ningún permiso no hay nada que enviar", () => {
    const r = revisarRespuesta(formulario(base), true);
    expect(r.ok).toBe(false);
  });

  it("permitir las fotos de una entrega sin fotos no cuenta", () => {
    expect(revisarRespuesta(formulario({ ...base, acepta_fotos: "on" }), false).ok).toBe(false);
  });

  it("pedir publicar el comentario exige escribirlo", () => {
    const r = revisarRespuesta(formulario({ ...base, comentario: "", acepta_texto: "on" }), true);
    expect(!r.ok && r.campo).toBe("comentario");
  });

  it("el campo trampa se detecta", () => {
    const r = revisarRespuesta(formulario({ ...base, acepta_texto: "on", sitio_web: "http://spam.invalid" }), true);
    expect(r.ok && r.trampa).toBe(true);
  });

  it("arma el nombre público en el servidor, no lo toma del formulario", () => {
    const r = revisarRespuesta(formulario({ ...base, acepta_texto: "on", nombre_publico: "Laura Martínez" }), true);
    expect(r.ok && r.valor.nombrePublico).toBe("Laura M.");
  });
});

describe("mensajeDeInvitacion", () => {
  it("saluda por el nombre de pila y deja el enlace solo al final", () => {
    const m = mensajeDeInvitacion("laura martínez", "Activos Inmobiliarios Globales", "https://x.invalid/entrega/abc");
    expect(m.startsWith("¡Hola Laura!")).toBe(true);
    expect(m.split("\n").at(-1)).toBe("https://x.invalid/entrega/abc");
  });
});
