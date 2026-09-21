import { describe, expect, it } from "vitest";
import { mensajeConMotivo, motivoDeContacto, primerNombre } from "../shared/contacto";
import { CAMPOS_DE_PROSPECTO, problemasDeProspecto } from "../shared/validacion";

/**
 * La regla de los formularios que dejan un prospecto. La aplican el servidor
 * (`revisarProspecto`, que devuelve el primer problema en el orden de
 * `CAMPOS_DE_PROSPECTO`) y el navegador (que los marca todos a la vez). El
 * camino entero —el botón, el servidor y la base— lo prueba
 * `npm run verificar:contacto`.
 */

const LAURA = { nombre: "Laura Méndez", telefono: "", correo: "", acepto: true };

describe("problemasDeProspecto", () => {
  it("sin teléfono y sin correo no hay a quién contestarle", () => {
    expect(problemasDeProspecto(LAURA)).toEqual({
      telefono: "Déjanos un teléfono o un correo para poder contestarte.",
    });
  });

  it("con uno de los dos basta", () => {
    expect(problemasDeProspecto({ ...LAURA, correo: "laura@ejemplo.mx" })).toEqual({});
    expect(problemasDeProspecto({ ...LAURA, telefono: "443 123 4567" })).toEqual({});
  });

  it("«Me interesa» sigue exigiendo el teléfono, aunque traiga correo", () => {
    expect(problemasDeProspecto({ ...LAURA, correo: "laura@ejemplo.mx" }, { telefonoObligatorio: true })).toEqual({
      telefono: "Escribe un teléfono de 10 dígitos para poder contestarte.",
    });
  });

  it("un teléfono a medias se señala aunque haya correo", () => {
    expect(problemasDeProspecto({ ...LAURA, telefono: "443 12", correo: "laura@ejemplo.mx" })).toEqual({
      telefono: "Ese teléfono no parece completo.",
    });
  });

  it("devuelve todos a la vez, y el servidor se queda con el primero en este orden", () => {
    const todos = problemasDeProspecto({ nombre: "L", telefono: "", correo: "malo", acepto: false });
    expect(Object.keys(todos).sort()).toEqual(["acepto", "correo", "nombre"]);
    expect(CAMPOS_DE_PROSPECTO.find((campo) => todos[campo])).toBe("nombre");
  });
});

describe("«¿Qué necesitas?»", () => {
  it("cada opción dice su tipo", () => {
    expect(motivoDeContacto("vender")?.tipo).toBe("vender");
    expect(motivoDeContacto("poner-en-renta")?.tipo).toBe("vender");
    expect(motivoDeContacto("credito")?.tipo).toBe("credito");
    expect(motivoDeContacto("comprar")?.tipo).toBe("general");
  });

  it("lo que no es de la lista no cuenta", () => {
    expect(motivoDeContacto("hackear")).toBeNull();
    expect(motivoDeContacto(null)).toBeNull();
  });

  it("antepone su frase al mensaje, y sin mensaje queda la frase sola", () => {
    expect(mensajeConMotivo(motivoDeContacto("vender"), "Tengo una casa en Tres Marías.")).toBe(
      "Quiere vender. Tengo una casa en Tres Marías.",
    );
    expect(mensajeConMotivo(motivoDeContacto("comprar"), "  ")).toBe("Quiere comprar.");
  });

  it("el crédito no lleva frase: la etiqueta del tipo ya lo dice", () => {
    expect(mensajeConMotivo(motivoDeContacto("credito"), "¿Aceptan Infonavit?")).toBe("¿Aceptan Infonavit?");
    expect(mensajeConMotivo(null, "Hola")).toBe("Hola");
  });

  it("da las gracias con el primer nombre", () => {
    expect(primerNombre("  María José López ")).toBe("María");
  });
});
