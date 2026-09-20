import { describe, expect, it } from "vitest";
import { claveEnFrase, leerFrase, piezasDe } from "../shared/frase";

describe("piezasDe", () => {
  it("separa palabras y cantidades, y deja enteras las cifras con decimales o comas", () => {
    expect(piezasDe("Casa de 3rec, $3,500,000 ó 4.5 mdp")).toEqual(["casa", "de", "3", "rec", "3,500,000", "o", "4.5", "mdp"]);
  });
});

describe("claveEnFrase", () => {
  it("reconoce la clave como la dicta la gente", () => {
    expect(claveEnFrase("AIG-0042")).toBe("AIG-0042");
    expect(claveEnFrase("la aig 42")).toBe("AIG-0042");
    expect(claveEnFrase("aig0094")).toBe("AIG-0094");
    expect(claveEnFrase("casa en altozano")).toBeNull();
  });
});

describe("leerFrase: lo que se entiende sin gastar", () => {
  it("operación, tipo y recámaras, con los errores perdonados", () => {
    const l = leerFrase("kasa en benta 3 rrecamaras");
    expect(l).toMatchObject({ operacion: "venta", tipo: "casa", recamaras: 3, resto: [] });
  });

  it("los modos de decir cada tipo", () => {
    expect(leerFrase("depa").tipo).toBe("departamento");
    expect(leerFrase("departamneto").tipo).toBe("departamento");
    expect(leerFrase("un lote").tipo).toBe("terreno");
    expect(leerFrase("penthouse").tipo).toBe("departamento");
    expect(leerFrase("ofisinas").tipo).toBe("oficina");
  });

  it("baños y medio, cuartos y habitaciones", () => {
    expect(leerFrase("casa con 3 recamaras y 2 baños y medio en el prado")).toMatchObject({
      tipo: "casa",
      recamaras: 3,
      banos: 2,
      resto: ["prado"],
    });
    expect(leerFrase("tres cuartos").recamaras).toBe(3);
    expect(leerFrase("4 habitaciones").recamaras).toBe(4);
  });

  it("«un cuarto de servicio» es un rasgo, no una recámara", () => {
    const l = leerFrase("casa con un cuarto de servicio y 3 recamaras");
    expect(l.recamaras).toBe(3);
    expect(l.rasgos).toEqual(["cuarto de servicio"]);
  });

  it("el orden que se pide con un adjetivo", () => {
    expect(leerFrase("terreno barato").orden).toBe("precio_asc");
    expect(leerFrase("la casa más grande que tengan")).toMatchObject({ tipo: "casa", orden: "m2_desc", resto: [] });
    expect(leerFrase("casa de lujo").orden).toBe("precio_desc");
  });

  it("dos tipos o dos operaciones no se pueden pedir con un filtro: no filtra", () => {
    expect(leerFrase("casa o departamento en renta")).toMatchObject({ tipo: null, operacion: "renta" });
    expect(leerFrase("casa en venta o renta").operacion).toBeNull();
  });

  it("los rasgos más pedidos, con sus variantes, y «casa con bodega» no es una bodega", () => {
    expect(leerFrase("depa amueblado con roof garden").rasgos).toEqual(["roof garden", "amueblado"]);
    expect(leerFrase("casa de 1 piso").rasgos).toEqual(["una planta"]);
    expect(leerFrase("casa 2 pisos").rasgos).toEqual(["dos plantas"]);
    expect(leerFrase("alverca").rasgos).toEqual(["alberca"]);
    expect(leerFrase("casa con bodega y alberca")).toMatchObject({ tipo: "casa", rasgos: ["bodega", "alberca"] });
  });

  it("lo que se pide que NO tenga no se busca al revés", () => {
    expect(leerFrase("casa sin escaleras ni alberca")).toMatchObject({ tipo: "casa", rasgos: [], resto: [] });
    expect(leerFrase("casa sin una planta").rasgos).toEqual([]);
  });

  it("los precios se leen aquí, con aritmética, y no se le dejan al modelo", () => {
    expect(leerFrase("casas de menos de 2 millones 251 mil")).toMatchObject({ tipo: "casa", precioMax: 2_251_000, precioSeguro: true, resto: [] });
    expect(leerFrase("casa entre 3 y 4.5 millones con 4 recámaras y 3 baños")).toMatchObject({
      precioMin: 3_000_000,
      precioMax: 4_500_000,
      recamaras: 4,
      banos: 3,
      resto: [],
    });
    expect(leerFrase("terreno de 200 metros en tarimbaro")).toMatchObject({ precioMin: null, precioMax: null, montos: [] });
  });

  it("«al mes» es una renta aunque nadie diga «renta»", () => {
    expect(leerFrase("casa 15 mil al mes")).toMatchObject({ operacion: "renta", tipo: "casa", precioMax: 15_000, resto: [] });
    // …pero si dice «venta», se contradice y no filtra por operación.
    expect(leerFrase("casa en venta 15 mil al mes").operacion).toBeNull();
  });

  it("una clave con cuatro cifras no es un precio", () => {
    expect(leerFrase("aig 1500")).toMatchObject({ clave: "AIG-1500", precioMax: null, montos: [], resto: [] });
  });

  it("lo que no entiende queda en `resto`, en orden: es lo que decide si se pregunta al modelo", () => {
    expect(leerFrase("casa en tres marias con cochera para 2 autos")).toMatchObject({
      rasgos: ["cochera"],
      resto: ["tres", "marias", "2", "autos"],
    });
    expect(leerFrase("casa con vista al lago en patzcuaro").resto).toEqual(["vista", "lago", "patzcuaro"]);
  });

  it("las palabras que no filtran nada no despiertan al modelo", () => {
    expect(leerFrase("hola buenas tardes busco una casa bonita para mis papás").resto).toEqual([]);
    expect(leerFrase("quiero invertir en un terreno").resto).toEqual([]);
  });

  it("la clave se lleva sus cifras", () => {
    expect(leerFrase("aig 42")).toMatchObject({ clave: "AIG-0042", resto: [] });
  });
});
