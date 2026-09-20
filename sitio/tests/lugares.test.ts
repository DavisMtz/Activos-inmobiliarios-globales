import { describe, expect, it } from "vitest";
import { piezasDe } from "../shared/frase";
import { buscarLugar, prepararLugares } from "../shared/lugares";

/** Un trozo del catálogo real: la misma zona repartida en varias colonias. */
const LUGARES = prepararLugares([
  { colonia: "Altozano", ciudad: "Morelia" },
  { colonia: "Club de Golf Altozano", ciudad: "Morelia" },
  { colonia: "Jardines del Valle, Altozano", ciudad: "Morelia" },
  { colonia: "Tres Marías", ciudad: "Morelia" },
  { colonia: "Lomalta, Tres Marías", ciudad: "Morelia" },
  { colonia: "Jesús del Monte", ciudad: "Morelia" },
  { colonia: "Centro Histórico", ciudad: "Morelia" },
  { colonia: "La Colina", ciudad: "Morelia" },
  { colonia: "El Prado", ciudad: "Morelia" },
  { colonia: "Vista Bella", ciudad: "Morelia" },
  { colonia: "Obrera", ciudad: "Morelia" },
  { colonia: "San Francisco", ciudad: "Ciudad Hidalgo" },
  { colonia: null, ciudad: "Pátzcuaro" },
]);

/** Palabras que el catálogo usa al describir casas (no son errores de nadie). */
const DEL_CATALOGO = new Set(["cocina", "jardin", "vista", "ciudad", "casa", "lago"]);
const existe = (pieza: string) => DEL_CATALOGO.has(pieza) || LUGARES.piezas.has(pieza);
const buscar = (texto: string) => buscarLugar(piezasDe(texto), LUGARES, existe);

describe("prepararLugares", () => {
  it("una colonia con coma son dos nombres, y no se repiten", () => {
    const escritos = LUGARES.nombres.map((n) => n.escrito);
    expect(escritos).toContain("Lomalta");
    expect(escritos).toContain("Tres Marías");
    expect(escritos.filter((e) => e === "Tres Marías")).toHaveLength(1);
    expect(escritos.filter((e) => e === "Morelia")).toHaveLength(1);
  });
});

describe("buscarLugar", () => {
  it("encuentra el lugar bien escrito y lo devuelve como se escribe", () => {
    expect(buscar("tres marias")).toMatchObject({ escrito: "Tres Marías", desde: 0, hasta: 2, corregido: false });
    expect(buscar("patzcuaro")).toMatchObject({ escrito: "Pátzcuaro", corregido: false });
  });

  it("corrige el que está mal escrito", () => {
    expect(buscar("altosano")).toMatchObject({ escrito: "Altozano", corregido: true });
    expect(buscar("patscuaro")).toMatchObject({ escrito: "Pátzcuaro", corregido: true });
    expect(buscar("tresmarias")).toMatchObject({ escrito: "Tres Marías", corregido: true });
  });

  it("los conectores no cuentan: «jesus monte» es Jesús del Monte", () => {
    expect(buscar("jesus monte")).toMatchObject({ escrito: "Jesús del Monte" });
    expect(buscar("jesus del monte")).toMatchObject({ escrito: "Jesús del Monte", desde: 0, hasta: 3 });
  });

  it("dice qué piezas de la frase ocupa, para saber qué sobra", () => {
    // resto de «casa en tres marias con cochera para 2 autos»
    expect(buscarLugar(["tres", "marias", "2", "autos"], LUGARES, existe)).toMatchObject({ escrito: "Tres Marías", desde: 0, hasta: 2 });
  });

  it("un trozo de un nombre largo vale: «altozano», «centro», «club de golf»", () => {
    expect(buscar("centro")).toMatchObject({ escrito: "Centro" });
    expect(buscar("club de golf")).toMatchObject({ escrito: "Club de Golf" });
  });

  it("solo se corrige lo que NO existe: «cocina» no es La Colina", () => {
    expect(buscar("cocina")).toBeNull();
    // …pero una palabra que no existe en ningún lado y se le parece, sí.
    expect(buscar("kolina")).toMatchObject({ escrito: "La Colina", corregido: true });
  });

  it("una palabra suelta que es un rasgo no es un lugar", () => {
    expect(buscar("jardin")).toBeNull();
    expect(buscar("vista")).toBeNull();
    // Acompañada, sí.
    expect(buscar("vista bella")).toMatchObject({ escrito: "Vista Bella" });
  });

  it("un trozo genérico no es un lugar («vista a la ciudad»), pero un nombre entero sí («Obrera»)", () => {
    expect(buscar("ciudad")).toBeNull();
    expect(buscar("san")).toBeNull();
    expect(buscar("ciudad hidalgo")).toMatchObject({ escrito: "Ciudad Hidalgo" });
    expect(buscar("obrera")).toMatchObject({ escrito: "Obrera" });
  });

  it("sin nada que se parezca, null", () => {
    expect(buscar("polanco")).toBeNull();
    expect(buscar("2 millones")).toBeNull();
  });
});
