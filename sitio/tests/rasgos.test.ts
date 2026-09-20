import { describe, expect, it } from "vitest";
import { aParametros, leerFiltros, rasgosUnicos } from "../shared/filtros";
import { casasConRasgos, textoComparable } from "../shared/rasgos";

const CASAS = [
  { id: 1, comparable: textoComparable("Casa en Altozano", null, "Hermosa casa con ALBERCA, jardín amplio y roof garden.") },
  { id: 2, comparable: textoComparable("Departamento amueblado", "Céntrico", "Totalmente amueblada. Edificio con elevador y vigilancia 24 h.") },
  { id: 3, comparable: textoComparable("Casa de un nivel", null, "Todo en una sola planta: 3 recámaras, cochera techada para 2 autos y jardines.") },
  { id: 4, comparable: textoComparable("Terreno en Tarímbaro", null, "Terreno plano, ideal para invertir.") },
];

const VOCABULARIO = new Set(CASAS.flatMap((casa) => casa.comparable.trim().split(" ")));
const con = (...rasgos: string[]) => casasConRasgos(CASAS, rasgos, VOCABULARIO);

describe("casasConRasgos", () => {
  it("busca sin acentos ni mayúsculas, en título, resumen y descripción", () => {
    expect(con("alberca")).toEqual([1]);
    expect(con("jardín")).toEqual([1, 3]);
    expect(con("centrico")).toEqual([2]);
  });

  it("el plural y el género no importan", () => {
    expect(con("jardines")).toEqual([1, 3]);
    expect(con("amueblado")).toEqual([2]);
    expect(con("amuebladas")).toEqual([2]);
  });

  it("todos los rasgos a la vez", () => {
    expect(con("alberca", "jardin")).toEqual([1]);
    expect(con("alberca", "elevador")).toEqual([]);
  });

  it("lo mismo dicho de otra forma", () => {
    expect(con("una planta")).toEqual([3]);
    expect(con("un piso")).toEqual([3]);
    expect(con("piscina")).toEqual([1]);
    expect(con("garage")).toEqual([3]);
    expect(con("seguridad")).toEqual([2]);
    expect(con("roof")).toEqual([1]);
  });

  it("busca la palabra entera, con su terminación libre: «plano» no es «planta» ni «lano»", () => {
    expect(con("plano")).toEqual([4]);
    expect(con("planos")).toEqual([4]);
    expect(con("lano")).toEqual([]);
    expect(con("plan")).toEqual([]);
  });

  it("corrige el rasgo mal escrito contra las palabras del catálogo", () => {
    expect(con("alverca")).toEqual([1]);
    expect(con("elebador")).toEqual([2]);
  });

  it("lo que ninguna casa trae no encuentra nada (y no revienta)", () => {
    expect(con("helipuerto")).toEqual([]);
  });
});

describe("rasgos en la URL", () => {
  it("se leen de `?con=`, limpios, sin repetir y hasta tres", () => {
    const f = leerFiltros(new URLSearchParams("con=Alberca,%20jardín%20,alberca,una+planta,elevador"));
    expect(f.rasgos).toEqual(["alberca", "jardín", "una planta"]);
  });

  it("lo que no sirve para buscar se ignora", () => {
    expect(leerFiltros(new URLSearchParams("con=,,12,%25%25,ab")).rasgos).toEqual([]);
    expect(rasgosUnicos(["  ", "x".repeat(80)])).toEqual(["x".repeat(30)]);
  });

  it("vuelven a la URL tal cual, y sin rasgos no hay parámetro", () => {
    expect(aParametros({ rasgos: ["alberca", "una planta"] }).get("con")).toBe("alberca,una planta");
    expect(aParametros({ rasgos: [] }).has("con")).toBe(false);
  });
});
