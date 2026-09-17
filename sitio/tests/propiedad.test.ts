import { describe, expect, it } from "vitest";
import {
  avisosDePropiedad,
  estadoTrasEditar,
  problemaAlPublicar,
  puedeCambiarElSlug,
  revisarPropiedad,
  type ContextoDeAvisos,
} from "../shared/propiedad";

/** Lo mínimo que el formulario manda siempre. */
const base = {
  titulo: "Casa en El Prado",
  operacion: "venta",
  tipo: "casa",
  ciudad: "Morelia",
  colonia: "El Prado",
};

const valorDe = (crudo: Record<string, unknown>) => {
  const revision = revisarPropiedad(crudo);
  if (!revision.ok) throw new Error(`Se esperaba que pasara: ${revision.campo} ${revision.mensaje}`);
  return revision.valor;
};

describe("revisarPropiedad", () => {
  it("acepta lo mínimo y deja en null lo que no se capturó", () => {
    const casa = valorDe(base);
    expect(casa.titulo).toBe("Casa en El Prado");
    expect(casa.precio).toBeNull();
    expect(casa.condicion).toBeNull();
    expect(casa.destacada).toBe(false);
  });

  it("entiende los precios como los escribe una persona", () => {
    expect(valorDe({ ...base, precio: "$3,000,000" }).precio).toBe(3_000_000);
    expect(valorDe({ ...base, precio: "3000000.00" }).precio).toBe(3_000_000);
    expect(valorDe({ ...base, precio: 2_500_000 }).precio).toBe(2_500_000);
    expect(valorDe({ ...base, precio: "" }).precio).toBeNull();
  });

  it("rechaza un precio que habría que adivinar en vez de inventarlo", () => {
    const revision = revisarPropiedad({ ...base, precio: "tres millones" });
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.campo).toBe("precio");
  });

  it("conserva los decimales de los metros y redondea las cuentas enteras", () => {
    const casa = valorDe({ ...base, m2_construccion: "141.2", m2_terreno: "96 m2", recamaras: "3" });
    expect(casa.m2Construccion).toBe(141.2);
    expect(casa.m2Terreno).toBe(96);
    expect(casa.recamaras).toBe(3);
  });

  it("pide un título de verdad", () => {
    const revision = revisarPropiedad({ ...base, titulo: "Ca" });
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.campo).toBe("titulo");
  });

  it("no acepta un video que no sea un enlace seguro", () => {
    expect(revisarPropiedad({ ...base, video_url: "youtube.com/ver" }).ok).toBe(false);
    expect(valorDe({ ...base, video_url: "https://youtu.be/abc123" }).videoUrl).toBe("https://youtu.be/abc123");
  });

  it("corta el resumen que no cabe en la tarjeta", () => {
    const revision = revisarPropiedad({ ...base, resumen: "a".repeat(161) });
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.campo).toBe("resumen");
  });

  it("acepta la casilla de destacada venga como venga", () => {
    expect(valorDe({ ...base, destacada: "on" }).destacada).toBe(true);
    expect(valorDe({ ...base, destacada: true }).destacada).toBe(true);
    expect(valorDe({ ...base, destacada: "0" }).destacada).toBe(false);
  });

  it("exige ciudad, operación y tipo válidos", () => {
    expect(revisarPropiedad({ ...base, ciudad: "" }).ok).toBe(false);
    expect(revisarPropiedad({ ...base, operacion: "regalo" }).ok).toBe(false);
    expect(revisarPropiedad({ ...base, tipo: "castillo" }).ok).toBe(false);
  });

  it("conserva los renglones de la descripción, que es una lista", () => {
    const casa = valorDe({ ...base, descripcion: "Casa amplia\n• Cochera\n\n\n• Jardín  " });
    expect(casa.descripcion).toBe("Casa amplia\n• Cochera\n\n• Jardín");
  });
});

describe("avisosDePropiedad", () => {
  const completa: ContextoDeAvisos = {
    operacion: "venta",
    tipo: "casa",
    precio: 3_000_000,
    precioRenta: null,
    recamaras: 3,
    banosCompletos: 2,
    m2Terreno: 200,
    m2Construccion: 180,
    resumen: "Una casa moderna y completamente equipada, con excelentes acabados.",
    descripcion: "Casa amplia con jardín.",
    colonia: "El Prado",
    asesorId: "11111111-1111-1111-1111-111111111111",
    fotos: 5,
    revisar: null,
  };

  it("una casa completa no tiene ningún aviso", () => {
    expect(avisosDePropiedad(completa)).toEqual([]);
    expect(problemaAlPublicar(completa)).toBeNull();
  });

  it("lo que impide publicar es el precio, la zona y las fotos", () => {
    const sinNada = { ...completa, precio: null, colonia: null, fotos: 0 };
    const impiden = avisosDePropiedad(sinNada).filter((a) => a.impidePublicar).map((a) => a.clave);
    expect(impiden).toEqual(["precio", "fotos", "colonia"]);
    expect(problemaAlPublicar(sinNada)).toMatch(/precio de venta/);
  });

  it("una casa en renta necesita la renta, no el precio de venta", () => {
    const renta = { ...completa, operacion: "renta" as const, precio: null, precioRenta: null };
    expect(problemaAlPublicar(renta)).toBe("Falta la renta mensual.");
    expect(problemaAlPublicar({ ...renta, precioRenta: 14_000 })).toBeNull();
  });

  it("una casa en venta y renta necesita los dos precios", () => {
    const dos = { ...completa, operacion: "venta_renta" as const };
    expect(problemaAlPublicar(dos)).toBe("Falta la renta mensual.");
  });

  it("los avisos que dejó la importación se enseñan tal cual, sin impedir publicar", () => {
    const avisos = avisosDePropiedad({ ...completa, revisar: '["colonia adivinada","confirmar disponibilidad"]' });
    expect(avisos.map((a) => a.texto)).toEqual(["colonia adivinada", "confirmar disponibilidad"]);
    expect(avisos.every((a) => !a.impidePublicar)).toBe(true);
  });

  it("un `revisar` roto no rompe la pantalla", () => {
    expect(avisosDePropiedad({ ...completa, revisar: "{esto no es json" })).toEqual([]);
  });

  it("un terreno no necesita recámaras ni baños", () => {
    const terreno = { ...completa, tipo: "terreno" as const, recamaras: null, banosCompletos: null };
    expect(avisosDePropiedad(terreno)).toEqual([]);
  });
});

describe("estado y dirección al editar", () => {
  it("lo que sube un asesor espera revisión", () => {
    expect(estadoTrasEditar("borrador", { yaSePublico: false, puedePublicar: false })).toBe("revision");
  });

  it("editar una casa YA publicada no la baja del sitio", () => {
    expect(estadoTrasEditar("publicada", { yaSePublico: true, puedePublicar: false })).toBe("publicada");
  });

  it("quien publica deja el estado donde está", () => {
    expect(estadoTrasEditar("borrador", { yaSePublico: false, puedePublicar: true })).toBe("borrador");
  });

  it("la dirección de una casa publicada o venida de WordPress no cambia", () => {
    expect(puedeCambiarElSlug({ yaSePublico: true, vieneDeWordpress: false })).toBe(false);
    expect(puedeCambiarElSlug({ yaSePublico: false, vieneDeWordpress: true })).toBe(false);
    expect(puedeCambiarElSlug({ yaSePublico: false, vieneDeWordpress: false })).toBe(true);
  });
});
