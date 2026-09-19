import { describe, expect, it } from "vitest";
import { repartirPortada } from "../shared/portada";

type Casa = { clave: string; zona: string; destacada?: boolean; foto?: boolean };

/** Las 12 más recientes de la base al 18/09/2026, en el orden de la consulta. */
const RECIENTES: Casa[] = [
  { clave: "AIG-0188", zona: "El Prado, Morelia" },
  { clave: "AIG-0187", zona: "El Prado, Morelia" },
  { clave: "AIG-0186", zona: "El Prado, Morelia" },
  { clave: "AIG-0185", zona: "El Prado, Morelia" },
  { clave: "AIG-0184", zona: "Lomas del Sur, Morelia" },
  { clave: "AIG-0183", zona: "Defensores de Puebla, Morelia" },
  { clave: "AIG-0182", zona: "Gertrudis Sánchez, Morelia" },
  { clave: "AIG-0181", zona: "Agustín Arriaga Rivera, Morelia" },
  { clave: "AIG-0180", zona: "Jesús del Monte, Morelia" },
  { clave: "AIG-0179", zona: "Prados Verdes, Morelia" },
  { clave: "AIG-0178", zona: "Morelia" },
  { clave: "AIG-0177", zona: "Campo Elíseos, Morelia" },
];

const REGLAS = {
  enVitrina: 5,
  recientes: 6,
  destacada: (c: Casa) => c.destacada === true,
  zona: (c: Casa) => c.zona,
  conFoto: (c: Casa) => c.foto !== false,
};

const claves = (casas: Casa[]) => casas.map((c) => c.clave);

describe("repartirPortada", () => {
  it("sin destacadas: las más recientes, una por colonia", () => {
    const { vitrina, recientes } = repartirPortada(RECIENTES, REGLAS);
    expect(claves(vitrina)).toEqual(["AIG-0188", "AIG-0184", "AIG-0183", "AIG-0182", "AIG-0181"]);
    // «Lo más reciente» se queda con las que no entraron, en su orden.
    expect(claves(recientes)).toEqual(["AIG-0187", "AIG-0186", "AIG-0185", "AIG-0180", "AIG-0179", "AIG-0178"]);
  });

  it("las destacadas van primero y tal cual, aunque repitan colonia", () => {
    // La consulta ya las trae primero (ORDER BY destacada DESC).
    const conDestacadas = [
      { ...RECIENTES[2], destacada: true },
      { ...RECIENTES[3], destacada: true },
      RECIENTES[0],
      RECIENTES[1],
      ...RECIENTES.slice(4),
    ];
    const { vitrina, recientes } = repartirPortada(conDestacadas, REGLAS);
    expect(claves(vitrina)).toEqual(["AIG-0186", "AIG-0185", "AIG-0184", "AIG-0183", "AIG-0182"]);
    expect(claves(recientes)).toEqual(["AIG-0188", "AIG-0187", "AIG-0181", "AIG-0180", "AIG-0179", "AIG-0178"]);
  });

  it("con más destacadas que lugares, entran las primeras", () => {
    const todas = RECIENTES.map((c) => ({ ...c, destacada: true }));
    const { vitrina } = repartirPortada(todas, REGLAS);
    expect(claves(vitrina)).toEqual(["AIG-0188", "AIG-0187", "AIG-0186", "AIG-0185", "AIG-0184"]);
  });

  it("si no alcanzan las colonias, completa por fecha y conserva el orden", () => {
    const pocas = [...RECIENTES.slice(0, 4), RECIENTES[4], { clave: "AIG-0100", zona: "El Prado, Morelia" }];
    const { vitrina, recientes } = repartirPortada(pocas, REGLAS);
    expect(claves(vitrina)).toEqual(["AIG-0188", "AIG-0187", "AIG-0186", "AIG-0185", "AIG-0184"]);
    expect(claves(recientes)).toEqual(["AIG-0100"]);
  });

  it("una casa sin foto nunca va en la vitrina, pero sí en «Lo más reciente»", () => {
    const sinFoto = [{ ...RECIENTES[0], foto: false }, ...RECIENTES.slice(1)];
    const { vitrina, recientes } = repartirPortada(sinFoto, REGLAS);
    expect(claves(vitrina)).toEqual(["AIG-0187", "AIG-0184", "AIG-0183", "AIG-0182", "AIG-0181"]);
    expect(claves(recientes)[0]).toBe("AIG-0188");
  });

  it("la casa elegida en el panel abre la vitrina, aunque sea vieja", () => {
    const { vitrina, recientes } = repartirPortada(RECIENTES, { ...REGLAS, preferida: (c: Casa) => c.clave === "AIG-0177" });
    // Campo Elíseos primero; luego una por colonia, sin repetir la suya.
    expect(claves(vitrina)).toEqual(["AIG-0177", "AIG-0188", "AIG-0184", "AIG-0183", "AIG-0182"]);
    expect(claves(recientes)).not.toContain("AIG-0177");
  });

  it("la elegida sin foto, o que no está entre las candidatas, no cambia nada", () => {
    const normal = ["AIG-0188", "AIG-0184", "AIG-0183", "AIG-0182", "AIG-0181"];
    const sinFoto = RECIENTES.map((c) => (c.clave === "AIG-0177" ? { ...c, foto: false } : c));
    expect(claves(repartirPortada(sinFoto, { ...REGLAS, preferida: (c: Casa) => c.clave === "AIG-0177" }).vitrina)).toEqual(normal);
    expect(claves(repartirPortada(RECIENTES, { ...REGLAS, preferida: (c: Casa) => c.clave === "AIG-9999" }).vitrina)).toEqual(normal);
  });

  it("ninguna casa sale dos veces y se respetan los topes", () => {
    for (const enVitrina of [0, 1, 3, 5, 20]) {
      const { vitrina, recientes } = repartirPortada(RECIENTES, { ...REGLAS, enVitrina });
      const todas = [...claves(vitrina), ...claves(recientes)];
      expect(new Set(todas).size).toBe(todas.length);
      expect(vitrina.length).toBe(Math.min(enVitrina, RECIENTES.length));
      expect(recientes.length).toBeLessThanOrEqual(6);
    }
  });
});
