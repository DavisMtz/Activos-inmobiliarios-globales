import { describe, expect, it } from "vitest";
import { aplanar, comoSuena, distancia, erroresEntre, erroresPerdonados, seParecen } from "../shared/parecido";

describe("aplanar", () => {
  it("quita acentos, mayúsculas y signos", () => {
    expect(aplanar("  Tres  Marías, #4 ")).toBe("tres marias 4");
    expect(aplanar("PEÑAS")).toBe("penas");
    expect(aplanar("¿Dónde?")).toBe("donde");
  });
});

describe("comoSuena", () => {
  it("iguala las confusiones de oído del español", () => {
    expect(comoSuena("altosano")).toBe(comoSuena("altozano"));
    expect(comoSuena("benta")).toBe(comoSuena("venta"));
    expect(comoSuena("kasa")).toBe(comoSuena("casa"));
    expect(comoSuena("abitacion")).toBe(comoSuena("habitacion"));
    expect(comoSuena("rrecamaras")).toBe(comoSuena("recamaras"));
    expect(comoSuena("ofisina")).toBe(comoSuena("oficina"));
    expect(comoSuena("garaje")).toBe(comoSuena("garage"));
  });

  it("la «ch» es un sonido propio: ni la «c» ni la «h» la tocan", () => {
    expect(comoSuena("cochera")).toBe("kochera");
    expect(comoSuena("chimenea")).toBe("chimenea");
  });
});

describe("distancia", () => {
  it("cuenta la trasposición de letras vecinas como UN error", () => {
    expect(distancia("departamneto", "departamento")).toBe(1);
    expect(distancia("casa", "casa")).toBe(0);
    expect(distancia("recamras", "recamaras")).toBe(1);
  });

  it("deja de contar en cuanto se pasa del tope", () => {
    expect(distancia("alberca", "zzzzzzz", 2)).toBe(3);
    expect(distancia("a", "abcdef", 2)).toBe(3);
  });
});

describe("erroresEntre", () => {
  it("a una palabra corta no se le perdona nada: «casa» no es «cava»", () => {
    expect(erroresPerdonados(4)).toBe(0);
    expect(erroresEntre("cava", "casa")).toBeNull();
    expect(erroresEntre("cama", "casa")).toBeNull();
    // …pero si SUENA igual, es la misma palabra.
    expect(erroresEntre("kasa", "casa")).toBe(0);
  });

  it("perdona según el largo", () => {
    expect(erroresEntre("terrno", "terreno")).toBe(1);
    expect(erroresEntre("departamneto", "departamento")).toBe(1);
    expect(erroresEntre("recamras", "recamaras")).toBe(1);
  });

  it("exige la primera letra: «renta» y «venta» suenan casi igual y son lo contrario", () => {
    expect(erroresEntre("renta", "venta")).toBeNull();
    expect(seParecen("venta", "benta")).toBe(true);
  });

  it("no confunde palabras que solo se parecen de lejos", () => {
    expect(seParecen("ventana", "venta")).toBe(false);
    expect(seParecen("vista", "venta")).toBe(false);
    expect(seParecen("banco", "banos")).toBe(false);
  });
});
