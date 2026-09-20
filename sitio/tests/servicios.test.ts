import { describe, expect, it } from "vitest";
import {
  DIBUJOS_DE_SERVICIO,
  DIBUJO_DE_RESERVA,
  dibujoDeServicio,
  esClaveDeDibujo,
  etiquetaDeDibujo,
} from "../shared/servicios";

describe("dibujoDeServicio", () => {
  it("los seis servicios reales del negocio tienen cada uno el suyo, sin tocar la base", () => {
    // Tal como están sembrados (`seed/generado/0001_semilla.sql`), con `icono` en NULL.
    const reales: [string, string][] = [
      ["Venta de inmuebles", "venta"],
      ["Renta de inmuebles", "renta"],
      ["Financiamientos inmobiliarios", "financiamiento"],
      ["Trámites inmobiliarios", "tramites"],
      ["Asesoría personalizada", "asesoria"],
      ["Promoción y marketing inmobiliario", "promocion"],
    ];
    for (const [titulo, esperado] of reales) {
      expect(dibujoDeServicio({ titulo, icono: null }), titulo).toBe(esperado);
    }
    // Ninguno comparte dibujo: seis servicios, seis dibujos.
    expect(new Set(reales.map(([titulo]) => dibujoDeServicio({ titulo }))).size).toBe(6);
  });

  it("lo escogido en el panel manda sobre el título", () => {
    expect(dibujoDeServicio({ titulo: "Venta de inmuebles", icono: "promocion" })).toBe("promocion");
    expect(dibujoDeServicio({ titulo: "Algo sin pistas", icono: "tramites" })).toBe("tramites");
    expect(dibujoDeServicio({ titulo: "Venta de inmuebles", icono: "  renta  " })).toBe("renta");
  });

  it("lo guardado que no es una clave de la lista no cuenta", () => {
    // La columna es texto libre y el panel la dejaba en "" en cada guardado.
    for (const basura of ["", "   ", "home", "<svg>", "VENTA", "fa-house"]) {
      expect(dibujoDeServicio({ titulo: "Renta de inmuebles", icono: basura }), basura).toBe("renta");
    }
  });

  it("lee el título sin acentos ni mayúsculas", () => {
    expect(dibujoDeServicio({ titulo: "TRAMITES Y ESCRITURACIÓN" })).toBe("tramites");
    expect(dibujoDeServicio({ titulo: "asesoria" })).toBe("asesoria");
    expect(dibujoDeServicio({ titulo: "Créditos hipotecarios" })).toBe("financiamiento");
  });

  it("lo específico gana a «venta» y «renta»", () => {
    expect(dibujoDeServicio({ titulo: "Asesoría en venta de terrenos" })).toBe("asesoria");
    expect(dibujoDeServicio({ titulo: "Créditos para comprar tu casa" })).toBe("financiamiento");
    expect(dibujoDeServicio({ titulo: "Contratos de arrendamiento" })).toBe("tramites");
    expect(dibujoDeServicio({ titulo: "Publicidad para vender más rápido" })).toBe("promocion");
  });

  it("un servicio nuevo que el equipo agregue nace con un dibujo que le queda", () => {
    expect(dibujoDeServicio({ titulo: "Avalúos certificados" })).toBe("tramites");
    expect(dibujoDeServicio({ titulo: "Administración de rentas" })).toBe("renta");
    expect(dibujoDeServicio({ titulo: "Compra de terrenos" })).toBe("venta");
  });

  it("si el título no dice nada conocido, la casa de reserva", () => {
    expect(dibujoDeServicio({ titulo: "Remodelaciones" })).toBe(DIBUJO_DE_RESERVA);
    expect(dibujoDeServicio({ titulo: "" })).toBe(DIBUJO_DE_RESERVA);
  });
});

describe("el catálogo de dibujos", () => {
  it("no repite claves, y todas caben en la columna (40 caracteres)", () => {
    const claves = DIBUJOS_DE_SERVICIO.map((dibujo) => dibujo.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const clave of claves) expect(clave.length).toBeLessThanOrEqual(40);
  });

  it("la de reserva está en la lista, y cada clave tiene nombre para el panel", () => {
    expect(esClaveDeDibujo(DIBUJO_DE_RESERVA)).toBe(true);
    for (const { clave, etiqueta } of DIBUJOS_DE_SERVICIO) {
      expect(etiquetaDeDibujo(clave)).toBe(etiqueta);
      expect(etiqueta.length).toBeGreaterThan(3);
    }
  });

  it("solo reconoce cadenas de la lista", () => {
    expect(esClaveDeDibujo("venta")).toBe(true);
    for (const otro of ["", "Venta", "ventas", null, undefined, 3, {}]) expect(esClaveDeDibujo(otro)).toBe(false);
  });
});
