import { describe, expect, it } from "vitest";
import { extraerJson, validarIntencion } from "../shared/intencion";

/** Lo que contestaría un modelo bien portado, con todos los campos del esquema. */
const modelo = (parcial: Record<string, unknown>) => ({
  lugar: null,
  recamaras: null,
  banos: null,
  precio_min: null,
  precio_max: null,
  palabras: [],
  ...parcial,
});

describe("validarIntencion", () => {
  it("junta lo que leyó el vocabulario con lo que contestó el modelo", () => {
    const i = validarIntencion(
      modelo({ lugar: "altosano", recamaras: 2, precio_max: 15000 }),
      "depa de 2 recamaras en renta por altosano que no pase de 15 mil",
    );
    expect(i).toEqual({
      operacion: "renta",
      tipo: "departamento",
      lugar: "altosano",
      recamaras: 2,
      banos: null,
      precioMin: null,
      precioMax: 15000,
      orden: null,
      palabras: [],
      clave: null,
    });
  });

  it("sin modelo (apagado, lento o roto) queda lo del vocabulario", () => {
    expect(validarIntencion(null, "kasa en benta 3 rrecamaras")).toMatchObject({ operacion: "venta", tipo: "casa", recamaras: 3 });
    expect(validarIntencion("no soy un objeto", "casa con alberca")).toMatchObject({ tipo: "casa", palabras: ["alberca"] });
  });

  it("una frase que no dice nada de casas no es una intención", () => {
    expect(validarIntencion(modelo({}), "hola buenas tardes")).toBeNull();
    expect(validarIntencion(null, "cuál es su horario de atención")).toBeNull();
  });

  describe("no le cree al modelo lo que la frase no sostiene", () => {
    it("recámaras y baños: tiene que estar ESE número y nombrarse la recámara", () => {
      // El modelo chico lee «3 recamaras» y contesta también «banos: 3».
      const i = validarIntencion(modelo({ recamaras: 3, banos: 3 }), "casa de 3 recamaras en altozano");
      expect(i?.recamaras).toBe(3);
      expect(i?.banos).toBeNull();
      // «de 1 a 2 millones» no son recámaras.
      expect(validarIntencion(modelo({ recamaras: 1, banos: 1 }), "propiedades de 1 a 2 millones")).toBeNull();
    });

    it("precios: sin una sola cantidad en la frase, cualquier precio es inventado", () => {
      expect(validarIntencion(modelo({ precio_max: 3_000_000 }), "casa bonita en altozano")?.precioMax ?? null).toBeNull();
      expect(validarIntencion(modelo({ precio_max: 3_000_000 }), "casa hasta tres millones")?.precioMax).toBe(3_000_000);
    });

    it("endereza un rango al revés y acepta cifras escritas como texto", () => {
      const i = validarIntencion(modelo({ precio_min: "4,500,000", precio_max: "$3000000" }), "casa entre 3 y 4.5 millones");
      expect([i?.precioMin, i?.precioMax]).toEqual([3_000_000, 4_500_000]);
    });

    it("el lugar no puede salir de una palabra que ya se leyó como vocabulario", () => {
      // «benta» ya es venta: no puede ser además una colonia.
      expect(validarIntencion(modelo({ lugar: "benta" }), "kasa en benta 3 rrecamaras")?.lugar).toBeNull();
      expect(validarIntencion(modelo({ lugar: "departamento" }), "departamneto amueblado")?.lugar).toBeNull();
      // Ni de una palabra que no está en la frase.
      expect(validarIntencion(modelo({ lugar: "Polanco" }), "casa en altozano")?.lugar).toBeNull();
    });

    it("acepta el lugar aunque el modelo lo haya «corregido»", () => {
      expect(validarIntencion(modelo({ lugar: "Altozano" }), "casa en altosano")?.lugar).toBe("Altozano");
    });

    it("«en privada» y «en el tercer piso» son rasgos, no colonias", () => {
      const i = validarIntencion(modelo({ lugar: "tercer piso", palabras: ["elevador"] }), "departamento en el tercer piso con elevador");
      expect(i?.lugar).toBeNull();
      expect(i?.palabras).toEqual(["elevador", "tercer piso"]);
    });

    it("los rasgos: solo los que la frase trae, sin relleno, sin cifras y nunca lo negado", () => {
      const i = validarIntencion(
        modelo({ palabras: ["vista al lago", "casa", "3 millones", "chimenea", "gimnasio"] }),
        "casa con vista al lago y chimenea de 3 millones sin gimnasio",
      );
      expect(i?.palabras).toEqual(["chimenea", "vista al lago"]);
    });

    it("a lo más tres rasgos, y primero los que leyó el vocabulario", () => {
      const i = validarIntencion(
        modelo({ palabras: ["vista al lago", "biblioteca", "cava"] }),
        "casa con alberca y jardin con vista al lago, biblioteca y cava",
      );
      expect(i?.palabras).toEqual(["alberca", "jardín", "vista al lago"]);
    });
  });
});

describe("extraerJson", () => {
  it("saca el objeto aunque venga envuelto", () => {
    expect(extraerJson('{"lugar":"centro"}')).toEqual({ lugar: "centro" });
    expect(extraerJson('```json\n{"lugar":"centro"}\n```')).toEqual({ lugar: "centro" });
    expect(extraerJson('Claro, aquí está: {"lugar":"centro","palabras":[]} ¡Suerte!')).toEqual({ lugar: "centro", palabras: [] });
    expect(extraerJson('<think>veamos…</think>{"lugar":null}')).toEqual({ lugar: null });
  });

  it("lo que no es JSON es null, no un error", () => {
    expect(extraerJson("no sé")).toBeNull();
    expect(extraerJson("")).toBeNull();
    expect(extraerJson("{roto")).toBeNull();
  });
});
