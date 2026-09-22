import { describe, expect, it } from "vitest";
import { textoDeCambio, textoPorcentaje, topeBonito } from "../app/components/panel/cifras";
import { diaDeMorelia, diasEntre, inicioDeDiaMorelia, sumarDias } from "../server/fechas";
import {
  armarSerie,
  cubetaPara,
  cuentasEnCero,
  mediana,
  rangoDePrecio,
  rejillaDeHoras,
  ventanaDeMetricas,
  type Cuentas,
} from "../server/metricas";

const con = (parcial: Partial<Cuentas>): Cuentas => ({ ...cuentasEnCero(), ...parcial });

describe("días de Morelia", () => {
  it("el día cambia a medianoche de Morelia (06:00 UTC), no a medianoche de Greenwich", () => {
    // Lo mismo que dio `date(creado_en, '-6 hours')` en la D1 local.
    expect(diaDeMorelia(new Date("2026-09-17T05:26:09.107Z"))).toBe("2026-09-16");
    expect(diaDeMorelia(new Date("2026-09-17T06:00:00.000Z"))).toBe("2026-09-17");
    // Una visita de las 7 de la tarde es de HOY, no de mañana.
    expect(diaDeMorelia(new Date("2026-09-21T01:00:00.000Z"))).toBe("2026-09-20");
  });

  it("el principio de un día y la aritmética de días", () => {
    expect(inicioDeDiaMorelia("2026-09-20")).toBe("2026-09-20T06:00:00.000Z");
    expect(sumarDias("2026-09-01", -1)).toBe("2026-08-31");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(diasEntre("2026-09-01", "2026-09-03")).toBe(2);
  });
});

describe("la ventana de las métricas", () => {
  // Domingo 21 de septiembre de 2026, 10:00 de la mañana en Morelia.
  const ahora = new Date("2026-09-21T16:00:00.000Z");

  it("«7 días» son hoy y los seis de antes, completos", () => {
    const ventana = ventanaDeMetricas(7, ahora);
    expect(ventana.hoy).toBe("2026-09-21");
    expect(ventana.primerDia).toBe("2026-09-15");
    expect(ventana.desde).toBe("2026-09-15T06:00:00.000Z");
  });

  it("el periodo anterior mide lo mismo y se corta a la MISMA hora", () => {
    const ventana = ventanaDeMetricas(7, ahora);
    expect(ventana.anterior?.desde).toBe("2026-09-08T06:00:00.000Z");
    // Siete días antes de este mismo instante: hoy va a medias, y comparar
    // contra días completos haría que todo pareciera ir a la baja.
    expect(ventana.anterior?.hasta).toBe("2026-09-14T16:00:00.000Z");
    const largoActual = ahora.getTime() - Date.parse(ventana.desde!);
    const largoAnterior = Date.parse(ventana.anterior!.hasta) - Date.parse(ventana.anterior!.desde);
    expect(largoAnterior).toBe(largoActual);
    // Y no se enciman.
    expect(ventana.anterior!.hasta < ventana.desde!).toBe(true);
  });

  it("«Todo» no tiene principio fijo ni periodo anterior", () => {
    const ventana = ventanaDeMetricas(null, ahora);
    expect(ventana.primerDia).toBeNull();
    expect(ventana.desde).toBeNull();
    expect(ventana.anterior).toBeNull();
  });
});

describe("la serie", () => {
  it("rellena con cero los días sin nada: SQL solo trae los que tuvieron algo", () => {
    const porDia = new Map([
      ["2026-09-15", con({ vistas: 4 })],
      ["2026-09-18", con({ vistas: 2, whatsapp: 1 })],
    ]);
    const serie = armarSerie(porDia, "2026-09-15", "2026-09-21", "dia");
    expect(serie).toHaveLength(7);
    expect(serie.map((p) => p.vistas)).toEqual([4, 0, 0, 2, 0, 0, 0]);
    expect(serie[3]).toMatchObject({ desde: "2026-09-18", hasta: "2026-09-18", whatsapp: 1 });
  });

  it("la suma de la serie es el total: no se pierde ni se inventa nada", () => {
    const porDia = new Map([
      ["2026-06-01", con({ vistas: 3, prospectos: 1 })],
      ["2026-07-15", con({ vistas: 5 })],
      ["2026-09-21", con({ vistas: 1 })],
    ]);
    for (const cubeta of ["dia", "semana", "mes"] as const) {
      const serie = armarSerie(porDia, "2026-06-01", "2026-09-21", cubeta);
      expect(serie.reduce((suma, p) => suma + p.vistas, 0)).toBe(9);
      expect(serie.reduce((suma, p) => suma + p.prospectos, 0)).toBe(1);
    }
  });

  it("las semanas empiezan en lunes, y la primera puede venir cortada", () => {
    // El 17/09/2026 es jueves.
    const serie = armarSerie(new Map(), "2026-09-17", "2026-09-30", "semana");
    expect(serie.map((p) => [p.desde, p.hasta])).toEqual([
      ["2026-09-17", "2026-09-20"],
      ["2026-09-21", "2026-09-27"],
      ["2026-09-28", "2026-09-30"],
    ]);
  });

  it("los meses se parten por mes de calendario", () => {
    const serie = armarSerie(new Map(), "2026-08-30", "2026-10-02", "mes");
    expect(serie.map((p) => p.desde)).toEqual(["2026-08-30", "2026-09-01", "2026-10-01"]);
  });

  it("la cubeta se elige por el largo", () => {
    expect(cubetaPara(7)).toBe("dia");
    expect(cubetaPara(90)).toBe("dia");
    expect(cubetaPara(200)).toBe("semana");
    expect(cubetaPara(900)).toBe("mes");
  });
});

describe("horas, precios y mediana", () => {
  it("la rejilla va de lunes a domingo: SQLite numera desde el domingo", () => {
    const rejilla = rejillaDeHoras([
      { dow: 0, hora: 21, n: 3 }, // domingo
      { dow: 1, hora: 9, n: 2 }, // lunes
    ]);
    expect(rejilla).toHaveLength(7);
    expect(rejilla[6][21]).toBe(3);
    expect(rejilla[0][9]).toBe(2);
    expect(rejilla.flat().reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("cada precio cae en su rango; sin precio no cae en ninguno", () => {
    expect(rangoDePrecio(1_200_000)).toBe("hasta-1.5");
    expect(rangoDePrecio(1_500_000)).toBe("1.5-3");
    expect(rangoDePrecio(4_999_999)).toBe("3-5");
    expect(rangoDePrecio(65_000_000)).toBe("mas-15");
    expect(rangoDePrecio(null)).toBeNull();
    expect(rangoDePrecio(0)).toBeNull();
  });

  it("la mediana no se deja jalar por un prospecto olvidado", () => {
    expect(mediana([])).toBeNull();
    expect(mediana([2, 1, 720])).toBe(2);
    expect(mediana([1, 3])).toBe(2);
  });
});

describe("lo que dice la pantalla", () => {
  it("el tope del eje es redondo y queda por encima del máximo", () => {
    expect(topeBonito(0)).toBe(1);
    expect(topeBonito(3)).toBe(3);
    expect(topeBonito(7)).toBe(8);
    expect(topeBonito(18)).toBe(20);
    expect(topeBonito(98)).toBe(100);
    expect(topeBonito(130)).toBe(150);
  });

  it("con cifras chicas el cambio se dice en piezas, no en porcentaje", () => {
    expect(textoDeCambio(3, 2)).toEqual({ texto: "1 más que", sentido: "sube" });
    expect(textoDeCambio(0, 4)).toEqual({ texto: "4 menos que", sentido: "baja" });
    expect(textoDeCambio(5, 5).sentido).toBe("igual");
    expect(textoDeCambio(120, 100)).toEqual({ texto: "20 % más que", sentido: "sube" });
  });

  it("un porcentaje de algo que sí pasó nunca se escribe «0 %»", () => {
    expect(textoPorcentaje(0)).toBe("0 %");
    expect(textoPorcentaje(0.02)).toBe("0.1 %");
    expect(textoPorcentaje(3.46)).toBe("3.5 %");
    expect(textoPorcentaje(84.2)).toBe("84 %");
  });
});
