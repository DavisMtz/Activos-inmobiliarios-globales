import { describe, expect, it } from "vitest";
import {
  aParametros,
  columnaPrecio,
  cuantosFiltros,
  FILTROS_VACIOS,
  hayFiltros,
  leerFiltros,
  ORDEN_PREDETERMINADO,
  rutaDeListado,
} from "../shared/filtros";

const leer = (consulta: string) => leerFiltros(new URLSearchParams(consulta));

describe("leerFiltros", () => {
  it("sin parámetros, ningún filtro", () => {
    expect(leer("")).toEqual(FILTROS_VACIOS);
    expect(hayFiltros(leer(""))).toBe(false);
  });

  it("lee todos los filtros de la URL", () => {
    const f = leer(
      "operacion=venta&tipo=casa&ciudad=morelia&zona=morelia-altozano&q=tres%20marias&precio_min=1000000&precio_max=5000000&recamaras=3&banos=2&orden=precio_asc&pagina=4",
    );
    expect(f).toEqual({
      operacion: "venta",
      tipo: "casa",
      ciudad: "morelia",
      zona: "morelia-altozano",
      q: "tres marias",
      precioMin: 1_000_000,
      precioMax: 5_000_000,
      recamaras: 3,
      banos: 2,
      orden: "precio_asc",
      pagina: 4,
    });
    expect(cuantosFiltros(f)).toBe(9);
  });

  it("descarta valores que no existen en vez de romper", () => {
    const f = leer("operacion=alquiler&tipo=castillo&orden=al-azar&zona=DROP%20TABLE&recamaras=tres");
    expect(f.operacion).toBeNull();
    expect(f.tipo).toBeNull();
    expect(f.zona).toBeNull();
    expect(f.recamaras).toBeNull();
    expect(f.orden).toBe(ORDEN_PREDETERMINADO);
  });

  it("acepta precios escritos como se leen y endereza el rango al revés", () => {
    expect(leer("precio_min=%241%2C500%2C000").precioMin).toBe(1_500_000);
    const f = leer("precio_min=5000000&precio_max=1000000");
    expect([f.precioMin, f.precioMax]).toEqual([1_000_000, 5_000_000]);
  });

  it("la página nunca baja de 1", () => {
    expect(leer("pagina=0").pagina).toBe(1);
    expect(leer("pagina=-3").pagina).toBe(1);
    expect(leer("pagina=2").pagina).toBe(2);
  });

  it("una búsqueda de una sola letra es como no buscar", () => {
    expect(leer("q=a").q).toBeNull();
    expect(leer("q=%20%20").q).toBeNull();
    expect(leer("q=el%20%20%20prado").q).toBe("el prado");
  });
});

describe("aParametros y rutaDeListado", () => {
  it("no arrastra parámetros vacíos ni los valores por omisión", () => {
    expect(aParametros(FILTROS_VACIOS).toString()).toBe("");
    expect(rutaDeListado(FILTROS_VACIOS)).toBe("/propiedades");
    expect(rutaDeListado({ orden: ORDEN_PREDETERMINADO, pagina: 1 })).toBe("/propiedades");
  });

  it("ida y vuelta: lo que se escribe en la URL es lo que se lee", () => {
    for (const consulta of [
      "operacion=renta&precio_max=30000",
      "tipo=terreno&orden=m2_desc",
      "ciudad=morelia&zona=morelia-el-prado&pagina=3",
      "q=altozano&recamaras=4&banos=3",
    ]) {
      expect(aParametros(leer(consulta)).toString()).toBe(new URLSearchParams(consulta).toString());
    }
  });

  it("arma el enlace de un acceso rápido de la portada", () => {
    expect(rutaDeListado({ tipo: "departamento" })).toBe("/propiedades?tipo=departamento");
    expect(rutaDeListado({ operacion: "renta" })).toBe("/propiedades?operacion=renta");
  });
});

describe("columnaPrecio", () => {
  it("la renta se compara contra precio_renta; lo demás contra precio", () => {
    expect(columnaPrecio("renta")).toBe("precio_renta");
    expect(columnaPrecio("venta")).toBe("precio");
    expect(columnaPrecio(null)).toBe("precio");
  });
});
