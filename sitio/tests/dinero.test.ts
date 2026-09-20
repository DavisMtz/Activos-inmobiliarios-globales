import { describe, expect, it } from "vitest";
import { cantidadesDe, cifraDe, leerDinero } from "../shared/dinero";
import { piezasDe } from "../shared/frase";

const montos = (frase: string) => cantidadesDe(piezasDe(frase)).map((c) => c.valor);
const precio = (frase: string) => {
  const d = leerDinero(piezasDe(frase));
  return { min: d.precioMin, max: d.precioMax, seguro: d.seguro };
};

describe("cifraDe", () => {
  it("lee cifras como las escribe la gente", () => {
    expect(cifraDe("3,500,000")).toBe(3_500_000);
    expect(cifraDe("1.500.000")).toBe(1_500_000);
    expect(cifraDe("4.5")).toBe(4.5);
    expect(cifraDe("2,5")).toBe(2.5);
    expect(cifraDe("12000")).toBe(12_000);
    expect(cifraDe("casa")).toBeNull();
  });
});

describe("cantidadesDe: el MONTO sale por aritmética, no del modelo", () => {
  it("millones, con sus miles y sus medios", () => {
    // La frase que el modelo de fábrica leyó como 2,010,000 (20/09/2026).
    expect(montos("casas de menos de 2 millones 251 mil")).toEqual([2_251_000]);
    expect(montos("casa por 3 millones 200 mil")).toEqual([3_200_000]);
    expect(montos("casa de 2 millones y medio")).toEqual([2_500_000]);
    expect(montos("hasta 2.5 mdp")).toEqual([2_500_000]);
    expect(montos("un millon")).toEqual([1_000_000]);
    expect(montos("millon y medio")).toEqual([1_500_000]);
    expect(montos("medio millon")).toEqual([500_000]);
    expect(montos("tres millones y medio")).toEqual([3_500_000]);
  });

  it("miles, pegados o no, en cifras o en letra", () => {
    expect(montos("renta casa 15 mil al mes")).toEqual([15_000]);
    expect(montos("por camelinas 18mil")).toEqual([18_000]);
    expect(montos("depto 800 mil pesos")).toEqual([800_000]);
    expect(montos("800k")).toEqual([800_000]);
    expect(montos("quince mil")).toEqual([15_000]);
    expect(montos("15 mil 500")).toEqual([15_500]);
    expect(montos("treinta y cinco mil")).toEqual([35_000]);
  });

  it("cifras sueltas: solo si son grandes, y nunca un año ni una medida", () => {
    expect(montos("que no pase de 12000")).toEqual([12_000]);
    expect(montos("casa de 3,500,000")).toEqual([3_500_000]);
    expect(montos("casa de 3 recamaras y 2 baños")).toEqual([]);
    expect(montos("terreno de 1200 metros")).toEqual([]);
    expect(montos("bodega de 500 m2")).toEqual([]);
    expect(montos("casa 2 pisos para 2 autos")).toEqual([]);
    expect(montos("construida en 2020")).toEqual([]);
  });

  it("en un rango, la unidad del segundo es también la del primero", () => {
    expect(montos("casa entre 3 y 4.5 millones")).toEqual([3_000_000, 4_500_000]);
    expect(montos("propiedades de 1 a 2 millones")).toEqual([1_000_000, 2_000_000]);
    expect(montos("oficinas de 10 a 20 mil")).toEqual([10_000, 20_000]);
    expect(montos("de 10 mil a 20 mil")).toEqual([10_000, 20_000]);
    // «3 recámaras y 2 millones» NO es un rango: el 3 no va pegado al conector.
    expect(montos("3 recamaras y 2 millones")).toEqual([2_000_000]);
  });
});

describe("leerDinero: qué papel tiene cada monto", () => {
  it("con comparador, el papel es seguro", () => {
    expect(precio("casas de menos de 2 millones")).toEqual({ min: null, max: 2_000_000, seguro: true });
    expect(precio("hasta 5 mdp")).toEqual({ min: null, max: 5_000_000, seguro: true });
    expect(precio("que no pase de 12000")).toEqual({ min: null, max: 12_000, seguro: true });
    expect(precio("maximo 3 millones")).toEqual({ min: null, max: 3_000_000, seguro: true });
    expect(precio("mas de 10 millones")).toEqual({ min: 10_000_000, max: null, seguro: true });
    expect(precio("desde 2 millones")).toEqual({ min: 2_000_000, max: null, seguro: true });
    expect(precio("minimo 4 millones")).toEqual({ min: 4_000_000, max: null, seguro: true });
    expect(precio("arriba de 3 millones")).toEqual({ min: 3_000_000, max: null, seguro: true });
  });

  it("la negación voltea el papel: «no más de» es un tope; «no menos de» y «que no baje de», un mínimo", () => {
    expect(precio("no mas de 3 millones")).toEqual({ min: null, max: 3_000_000, seguro: true });
    expect(precio("no menos de 3 millones")).toEqual({ min: 3_000_000, max: null, seguro: true });
    expect(precio("que no baje de 2 millones")).toEqual({ min: 2_000_000, max: null, seguro: true });
    // «que no pase de» ya es un tope con su «no» puesto: no se voltea.
    expect(precio("que no pase de 15 mil")).toEqual({ min: null, max: 15_000, seguro: true });
  });

  it("un rango llena los dos, en el orden que sea", () => {
    expect(precio("entre 3 y 4.5 millones")).toEqual({ min: 3_000_000, max: 4_500_000, seguro: true });
    expect(precio("de 20 mil a 10 mil")).toEqual({ min: 10_000, max: 20_000, seguro: true });
    expect(precio("desde 1 millon hasta 2 millones")).toEqual({ min: 1_000_000, max: 2_000_000, seguro: true });
  });

  it("una cifra suelta es un tope, pero sin comparador es solo una suposición", () => {
    expect(precio("casa de 3 millones")).toEqual({ min: null, max: 3_000_000, seguro: false });
    expect(precio("depto 800 mil pesos")).toEqual({ min: null, max: 800_000, seguro: false });
  });

  it("con tres cantidades, o dos que no forman un rango, no se arriesga", () => {
    expect(precio("casa de 2 millones o depa de 800 mil o terreno de 500 mil")).toEqual({ min: null, max: null, seguro: false });
    expect(precio("casa de 3 millones con enganche y recamaras para 500 mil")).toEqual({ min: null, max: null, seguro: false });
  });

  it("«al mes» y «mensuales» avisan de que es una renta", () => {
    expect(leerDinero(piezasDe("casa 15 mil al mes")).alMes).toBe(true);
    expect(leerDinero(piezasDe("12 mil mensuales")).alMes).toBe(true);
    expect(leerDinero(piezasDe("casa de 3 millones")).alMes).toBe(false);
  });

  it("marca como explicadas el comparador, la cantidad y su cola", () => {
    const piezas = piezasDe("casas de menos de 2 millones de pesos en altozano");
    const usadas = leerDinero(piezas).usadas;
    const sobran = piezas.filter((_, i) => !usadas.has(i));
    expect(sobran).toEqual(["casas", "en", "altozano"]);
  });
});
