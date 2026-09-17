import { describe, expect, it } from "vitest";
import { destinoDeRutaVieja, esRutaDeSistema, normalizarRuta } from "../server/redirecciones";

/** Ruta vieja → destino, como lo hará el Worker. */
const lleva = (ruta: string) => destinoDeRutaVieja(normalizarRuta(ruta));

describe("normalizarRuta", () => {
  it("baja las mayúsculas y quita la barra final", () => {
    expect(normalizarRuta("/Properties/Casa-En-El-Prado-4/")).toBe("/properties/casa-en-el-prado-4");
    expect(normalizarRuta("/propiedades/")).toBe("/propiedades");
    expect(normalizarRuta("//propiedades//")).toBe("/propiedades");
  });

  it("la raíz se queda en «/»", () => {
    expect(normalizarRuta("/")).toBe("/");
  });

  it("decodifica: el slug con «m²» que dejó WordPress", () => {
    expect(normalizarRuta("/properties/terreno-de-2942m%C2%B2/")).toBe("/properties/terreno-de-2942m²");
  });

  it("un porcentaje suelto no la revienta", () => {
    expect(normalizarRuta("/properties/algo%zz")).toBe("/properties/algo%zz");
  });
});

describe("destinoDeRutaVieja", () => {
  it("las fichas conservan su slug", () => {
    expect(lleva("/properties/casa-en-el-prado-4/")).toBe("/propiedades/casa-en-el-prado-4");
    expect(lleva("/properties/casa-en-torremolinos")).toBe("/propiedades/casa-en-torremolinos");
  });

  it("el listado viejo va al nuevo", () => {
    expect(lleva("/properties/")).toBe("/propiedades");
  });

  it("las taxonomías se vuelven filtros en la URL", () => {
    expect(lleva("/purpose/venta/")).toBe("/propiedades?operacion=venta");
    expect(lleva("/purpose/renta")).toBe("/propiedades?operacion=renta");
    expect(lleva("/property-type/casa/")).toBe("/propiedades?tipo=casa");
    expect(lleva("/property-type/oficinas")).toBe("/propiedades?tipo=oficina");
    expect(lleva("/location/morelia/")).toBe("/propiedades?ciudad=morelia");
    expect(lleva("/type-of-housing/casa-nueva")).toBe("/propiedades");
  });

  it("un tipo sin equivalente cae al listado completo, no a un filtro vacío", () => {
    // «Inmueble» son 3 fichas y «villa» 1: no hay un `tipo` que las junte.
    expect(lleva("/property-type/inmueble")).toBe("/propiedades");
    expect(lleva("/property-type/lo-que-sea")).toBe("/propiedades");
    expect(lleva("/purpose/venta-renta")).toBe("/propiedades");
  });

  it("las páginas que sí tienen equivalente lo usan", () => {
    expect(lleva("/acerca/")).toBe("/nosotros");
    expect(lleva("/contact-us/")).toBe("/contacto");
  });

  it("las nueve páginas de la plantilla Findero no sobreviven", () => {
    // Ocho van a la portada; `/contact-us` va a Contacto, que es su equivalente.
    const alInicio = [
      "/home",
      "/faq",
      "/agents",
      "/single-agent",
      "/inicio-sesion",
      "/registration",
      "/account",
      "/map-listing",
    ];
    for (const ruta of alInicio) expect(lleva(`${ruta}/`)).toBe("/");
    expect(alInicio).toHaveLength(8);
    expect(lleva("/contact-us")).toBe("/contacto");
  });

  it("las rutas nuevas no tienen regla: no se redirigen a sí mismas", () => {
    for (const ruta of ["/", "/propiedades", "/servicios", "/nosotros", "/contacto", "/aviso-de-privacidad"]) {
      expect(lleva(ruta)).toBeNull();
    }
    expect(lleva("/propiedades/casa-en-el-prado-4")).toBeNull();
  });
});

describe("esRutaDeSistema", () => {
  it("no toca lo del Worker ni los archivos", () => {
    for (const ruta of [
      "/api/propiedades",
      "/panel",
      "/panel/entrar",
      "/assets/app-a1b2c3.js",
      "/marca/aig-favicon.svg",
      "/robots.txt",
      "/sitemap.xml",
      "/favicon.ico",
      "/algo.png",
    ]) {
      expect(esRutaDeSistema(ruta), ruta).toBe(true);
    }
  });

  it("las páginas sí se revisan", () => {
    for (const ruta of ["/", "/propiedades", "/properties/casa-en-el-prado-4", "/home"]) {
      expect(esRutaDeSistema(ruta), ruta).toBe(false);
    }
  });
});
