import { describe, expect, it } from "vitest";
import { armarCSV, celdaCSV, fechaParaExcel } from "../shared/csv";

/**
 * El CSV de prospectos (F4). Lo que se comprueba aquí es justo lo que hace que
 * el archivo abra bien en Excel: el BOM, los acentos, las comillas y que una
 * celda que empieza por «=» no se ejecute al abrirla.
 */

const COLUMNAS = [{ titulo: "Nombre" }, { titulo: "Teléfono", literal: true }, { titulo: "Mensaje" }];

describe("celdaCSV", () => {
  it("entrecomilla siempre y dobla las comillas de dentro", () => {
    expect(celdaCSV("Ana")).toBe('"Ana"');
    expect(celdaCSV('Dijo "sí"')).toBe('"Dijo ""sí"""');
  });

  it("conserva comas y saltos de línea dentro de la celda", () => {
    expect(celdaCSV("Morelia, Michoacán")).toBe('"Morelia, Michoacán"');
    expect(celdaCSV("Primera\nSegunda")).toBe('"Primera\nSegunda"');
  });

  it("neutraliza lo que Excel tomaría por fórmula", () => {
    expect(celdaCSV("=HYPERLINK(\"http://malo.invalid\",\"Cobra aquí\")")).toMatch(/^"'=HYPERLINK/);
    for (const arranque of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
      expect(celdaCSV(arranque).startsWith("\"'")).toBe(true);
    }
  });

  it("deja en paz lo que no es texto libre: un +52 es un teléfono", () => {
    expect(celdaCSV("+52 443 111 2233", { neutralizar: false })).toBe('"+52 443 111 2233"');
  });

  it("un valor vacío es una celda vacía, no «null»", () => {
    expect(celdaCSV(null)).toBe('""');
    expect(celdaCSV(undefined)).toBe('""');
  });
});

describe("armarCSV", () => {
  const csv = armarCSV(COLUMNAS, [["Martínez Ñandú", "+52 443 111 2233", "=2+2"]]);

  it("empieza por el BOM UTF-8, que es lo que hace que Excel lea los acentos", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // Y en bytes, que es como lo va a ver el navegador: EF BB BF.
    const bytes = new TextEncoder().encode(csv);
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("separa los renglones con CRLF y termina con uno", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
  });

  it("los acentos y la eñe viajan intactos", () => {
    expect(csv).toContain("Martínez Ñandú");
    expect(csv).toContain("Teléfono");
  });

  it("el teléfono no lleva apóstrofo y el mensaje sí", () => {
    expect(csv).toContain('"+52 443 111 2233"');
    expect(csv).toContain("\"'=2+2\"");
  });

  it("los encabezados no se neutralizan", () => {
    // El BOM va pegado al primer encabezado: se quita para compararlo.
    expect(csv.split("\r\n")[0]!.slice(1)).toBe('"Nombre","Teléfono","Mensaje"');
  });
});

describe("fechaParaExcel", () => {
  it("pasa el ISO en UTC a la hora de Morelia, en un formato que Excel entiende", () => {
    // 23:04 UTC del 17 de septiembre son las 17:04 del mismo día en Morelia.
    expect(fechaParaExcel("2026-09-17T23:04:05.123Z")).toBe("2026-09-17 17:04");
  });

  it("la medianoche sale como 00 y no como 24", () => {
    expect(fechaParaExcel("2026-09-18T06:00:00.000Z")).toBe("2026-09-18 00:00");
  });

  it("una fecha ausente o ilegible es una celda vacía", () => {
    expect(fechaParaExcel(null)).toBe("");
    expect(fechaParaExcel("no es una fecha")).toBe("");
  });
});
