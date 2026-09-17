import { describe, expect, it } from "vitest";
import { LARGO_MAXIMO_PATRON, patronBusqueda } from "../shared/busqueda";

/**
 * El patrón se prueba contra SQLite de verdad en `npm run verificar:f2`; aquí
 * se comprueba su semántica traduciéndolo a una expresión regular, con las
 * mismas reglas que `LIKE`: `%` es «cualquier cosa», `_` es «un carácter» y el
 * resto casa sin distinguir mayúsculas (en ASCII, como hace SQLite).
 */
function casa(patron: string, texto: string): boolean {
  const regex = [...patron]
    .map((c) => (c === "%" ? "[\\s\\S]*" : c === "_" ? "[\\s\\S]" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${regex}$`, "iu").test(texto);
}

describe("patronBusqueda", () => {
  it("ignora lo que no da para buscar", () => {
    expect(patronBusqueda("")).toBeNull();
    expect(patronBusqueda("   ")).toBeNull();
    expect(patronBusqueda("a")).toBeNull();
    expect(patronBusqueda("el")).toBeNull();
    expect(patronBusqueda("-- ")).toBeNull();
  });

  it("solo letras acentuables no es una búsqueda: encontraría todo", () => {
    expect(patronBusqueda("aeiou")).toBeNull();
    expect(patronBusqueda("ñoño")).toBeNull();
  });

  it("encuentra con acentos escribiendo sin ellos, y al revés", () => {
    const patron = patronBusqueda("tres marias")!;
    expect(casa(patron, "Casa en Lomalta, Tres Marías")).toBe(true);
    expect(casa(patron, "Casa en Tres Marias")).toBe(true);
    expect(casa(patronBusqueda("TRES MARÍAS")!, "Casa en Lomalta, Tres Marías")).toBe(true);
    expect(casa(patron, "Casa en El Prado")).toBe(false);
  });

  it("la eñe y la diéresis cuentan como su letra base", () => {
    expect(casa(patronBusqueda("erandeni")!, "Club Campestre Erandeni")).toBe(true);
    expect(casa(patronBusqueda("penas")!, "Las Peñas")).toBe(true);
    expect(casa(patronBusqueda("PEÑAS")!, "Las Penas")).toBe(true);
  });

  it("los separadores casan con cualquier cosa, o con nada", () => {
    expect(casa(patronBusqueda("santa-fe")!, "Casa en Fracc. Santa Fe Sur Poniente")).toBe(true);
    expect(casa(patronBusqueda("jesus del monte")!, "Casa en Jesús del Monte")).toBe(true);
    expect(casa(patronBusqueda("patzcuaro")!, "Casa en Pátzcuaro")).toBe(true);
  });

  it("encuentra por clave", () => {
    expect(casa(patronBusqueda("aig-0094")!, "Casa en Altozano AIG-0094")).toBe(true);
    expect(casa(patronBusqueda("0094")!, "Casa en Altozano AIG-0094")).toBe(true);
    expect(casa(patronBusqueda("0094")!, "Casa en Altozano AIG-0095")).toBe(false);
  });

  it("ningún comodín del buscador llega crudo al patrón", () => {
    // Un `%` escrito por una persona buscaría el catálogo entero.
    const patron = patronBusqueda("el %prado%")!;
    expect(casa(patron, "Casa en El Prado")).toBe(true);
    expect(casa(patron, "Casa en Altozano")).toBe(false);
    // Lo mismo con el guion bajo y las comillas.
    expect(casa(patronBusqueda("el_prado")!, "Casa en El Prado")).toBe(true);
    expect(patronBusqueda("o'higgins' OR 1=1 --")).not.toContain("'");
  });

  it("nunca pasa el tope de patrón que acepta D1 (~50 caracteres)", () => {
    const largo = patronBusqueda(
      "casa en fraccionamiento residencial club campestre erandeni con alberca y jardín",
    )!;
    expect(largo.length).toBeLessThanOrEqual(LARGO_MAXIMO_PATRON);
    expect(largo.startsWith("%")).toBe(true);
    expect(largo.endsWith("%")).toBe(true);
    // Recortado o no, lo que alcanzó a entrar tiene que seguir encontrando.
    expect(casa(largo, "Casa en Fraccionamiento Residencial Club Campestre Erandeni con alberca")).toBe(true);
  });
});
