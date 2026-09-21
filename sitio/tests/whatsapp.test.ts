import { describe, expect, it } from "vitest";
import {
  enlaceDePropiedad,
  enlaceWhatsApp,
  numeroInternacionalMX,
  numeroLimpio,
  numeroParaLeer,
  textoDeWhatsApp,
} from "../shared/whatsapp";

describe("numeroParaLeer", () => {
  it("quita la clave de México y agrupa como se dicta", () => {
    expect(numeroParaLeer("524434922197")).toBe("443 492 2197");
    expect(numeroParaLeer("+52 443 492 2197")).toBe("443 492 2197");
    expect(numeroParaLeer("5214434922197")).toBe("443 492 2197");
    expect(numeroParaLeer("(443) 298-3138")).toBe("443 298 3138");
  });

  it("lo que no es de México sale con su clave y sin partir", () => {
    expect(numeroParaLeer("14155552671")).toBe("+14155552671");
  });

  it("vacío si no hay número", () => {
    expect(numeroParaLeer("")).toBe("");
  });
});

const DATOS = {
  titulo: "Casa en Jesús del Monte",
  clave: "AIG-0042",
  url: "https://ejemplo.mx/propiedades/casa-en-jesus-del-monte",
};

describe("numeroLimpio", () => {
  it("deja solo cifras", () => {
    expect(numeroLimpio("+52 443 492 2197")).toBe("524434922197");
    expect(numeroLimpio("(443) 298-3138")).toBe("4432983138");
  });
});

describe("numeroInternacionalMX", () => {
  it("le pone el 52 a las diez cifras que teclea un prospecto", () => {
    expect(numeroInternacionalMX("443 111 2233")).toBe("524431112233");
    expect(numeroInternacionalMX("(443) 298-3138")).toBe("524432983138");
  });

  it("deja tal cual lo que ya trae clave de país", () => {
    expect(numeroInternacionalMX("+52 443 492 2197")).toBe("524434922197");
    // El viejo formato de celular, con el 1 después del 52.
    expect(numeroInternacionalMX("5214434922197")).toBe("5214434922197");
  });

  it("lo que no parece un número se queda vacío, y entonces no hay botón", () => {
    expect(numeroInternacionalMX("443 298")).toBe("");
    expect(numeroInternacionalMX("")).toBe("");
    expect(numeroInternacionalMX("no tengo")).toBe("");
  });

  it("con él sí sale un enlace de wa.me que abre chat", () => {
    expect(enlaceWhatsApp(numeroInternacionalMX("443 111 2233"), "Hola")).toBe(
      "https://wa.me/524431112233?text=Hola",
    );
  });
});

describe("textoDeWhatsApp", () => {
  it("rellena título, clave y url", () => {
    expect(textoDeWhatsApp("Hola, me interesa {titulo} ({clave}): {url}", DATOS)).toBe(
      `Hola, me interesa ${DATOS.titulo} (${DATOS.clave}): ${DATOS.url}`,
    );
  });

  it("deja tal cual una llave que no conoce", () => {
    expect(textoDeWhatsApp("Precio {precio} de {clave}", DATOS)).toBe("Precio {precio} de AIG-0042");
  });
});

describe("enlaceWhatsApp", () => {
  it("codifica acentos, signos de apertura y espacios", () => {
    const enlace = enlaceWhatsApp("524434922197", "¿Sigue disponible la casa en Pátzcuaro?")!;
    expect(enlace).toBe(
      "https://wa.me/524434922197?text=%C2%BFSigue%20disponible%20la%20casa%20en%20P%C3%A1tzcuaro%3F",
    );
    // Lo que se decodifica tiene que ser exactamente lo que se escribió.
    expect(decodeURIComponent(new URL(enlace).searchParams.get("text")!)).toContain("Pátzcuaro");
  });

  it("sin número configurado no hay enlace", () => {
    expect(enlaceWhatsApp("", "hola")).toBeNull();
    expect(enlaceWhatsApp("443 298", "hola")).toBeNull();
  });
});

describe("enlaceDePropiedad", () => {
  it("lleva el título, la clave y la URL de la casa", () => {
    const enlace = enlaceDePropiedad("524434922197", "Hola, me interesa {titulo} ({clave}): {url}", DATOS)!;
    const texto = new URL(enlace).searchParams.get("text")!;
    expect(texto).toContain(DATOS.titulo);
    expect(texto).toContain(DATOS.clave);
    expect(texto).toContain(DATOS.url);
  });
});
