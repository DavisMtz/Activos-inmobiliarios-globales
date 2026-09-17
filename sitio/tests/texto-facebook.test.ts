import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { datosDeTextoFacebook, htmlATexto } from "../shared/texto";

/**
 * «Pegar texto de Facebook» (PLAN §11.3, paso 2).
 *
 * Dos pruebas distintas: los casos escritos a mano, sacados de renglones reales
 * del sitio actual, y la medición sobre las **188 descripciones reales**
 * comparada con el inventario que se leyó del HTML de cada ficha.
 *
 * La regla que se está defendiendo aquí es que **rellenar de más es peor que no
 * rellenar**: lo que sale de aquí entra en un formulario y una persona lo
 * confirma de un vistazo. Por eso, cuando el texto se contradice (dice «3
 * recámaras» y además enumera otra suelta, que es como el equipo escribe), el
 * campo se queda vacío en vez de elegir una de las dos cifras.
 */

const cp = (...c: number[]) => String.fromCodePoint(...c);
const ALFILER = cp(0x1f4cd);
/** «PRECIO» en negritas matemáticas, como sale copiado de Facebook. */
const negritas = (texto: string) =>
  [...texto].map((c) => (/[A-Z]/.test(c) ? cp(0x1d5d4 + c.charCodeAt(0) - 65) : c)).join("");

describe("precios", () => {
  it("lee el precio como lo escriben, con negritas de Unicode y todo", () => {
    const encabezado = `CASA NUEVA EN VENTA\n${negritas("PRECIO")}: $3,000,000 MXN`;
    expect(encabezado).not.toContain("PRECIO:");
    expect(datosDeTextoFacebook(encabezado).precio).toBe(3_000_000);
    expect(datosDeTextoFacebook("Precio de venta: $3,000,000.00").precio).toBe(3_000_000);
  });

  it("distingue la renta del precio de venta", () => {
    const solaRenta = datosDeTextoFacebook("CASA EN RENTA\nRenta mensual: $14,000");
    expect(solaRenta.precioRenta).toBe(14_000);
    expect(solaRenta.precio).toBeNull();

    const ambos = datosDeTextoFacebook("PRECIO DE VENTA: $3,000,000 / RENTA: $20,000");
    expect(ambos.precio).toBe(3_000_000);
    expect(ambos.precioRenta).toBe(20_000);
  });

  it("no confunde un enganche ni una cuota con el precio", () => {
    expect(datosDeTextoFacebook("Enganche desde $500,000\nMensualidades de $18,000").precio).toBeNull();
    expect(datosDeTextoFacebook("Cuota de mantenimiento: $1,200").precio).toBeNull();
  });

  it("si el texto dice dos precios distintos, no elige ninguno", () => {
    expect(datosDeTextoFacebook("Precio: $3,000,000\nPrecio de lista: $3,200,000").precio).toBeNull();
    // Y el mismo precio repetido sí se toma: repetirlo no es contradecirse.
    expect(datosDeTextoFacebook("Precio: $3,000,000\nPRECIO DE VENTA $3,000,000").precio).toBe(3_000_000);
  });
});

describe("recámaras y baños", () => {
  it("toma la cifra cuando el texto la dice una sola vez", () => {
    expect(datosDeTextoFacebook("Casa en venta\n3 recámaras con clóset").recamaras).toBe(3);
    expect(datosDeTextoFacebook("Casa en venta\nRecámaras: 4").recamaras).toBe(4);
    expect(datosDeTextoFacebook("Casa en venta\ntres recámaras amplias").recamaras).toBe(3);
  });

  it("con una recámara enumerada aparte, el total ya no está escrito", () => {
    // Así lo escribe el equipo, y el inventario las suma: son 4, no 3.
    const conEstudio = datosDeTextoFacebook("3 RECÁMARAS + ESTUDIO\n4ª RECÁMARA + TERRAZA");
    expect(conEstudio.recamaras).toBeNull();

    const conPrincipal = datosDeTextoFacebook("2 recámaras con clóset\nRecámara principal con vestidor");
    expect(conPrincipal.recamaras).toBeNull();

    const suelta = datosDeTextoFacebook("3 recámaras\nRecámara en planta baja");
    expect(suelta.recamaras).toBeNull();
  });

  it("«2.5 baños» son 2 completos y 1 medio", () => {
    const datos = datosDeTextoFacebook("Casa en venta\n2.5 baños");
    expect(datos.banosCompletos).toBe(2);
    expect(datos.mediosBanos).toBe(1);
  });

  it("cuenta los medios baños por separado", () => {
    const datos = datosDeTextoFacebook("2 baños completos\n1 medio baño");
    expect(datos.banosCompletos).toBe(2);
    expect(datos.mediosBanos).toBe(1);
    expect(datosDeTextoFacebook("Casa\nMedio baño de visitas").mediosBanos).toBe(1);
  });

  it("un baño mencionado sin número deja la cuenta en duda", () => {
    const datos = datosDeTextoFacebook("1 baño completo\nRecámara principal con baño completo");
    expect(datos.banosCompletos).toBeNull();
  });
});

describe("metros, estacionamientos y niveles", () => {
  it("separa terreno de construcción y conserva los decimales", () => {
    const datos = datosDeTextoFacebook("Terreno: 93.7 m2 | Construcción: 158.66 m2");
    expect(datos.m2Terreno).toBe(93.7);
    expect(datos.m2Construccion).toBe(158.66);
  });

  it("unos metros que no dicen de qué son, no se usan", () => {
    expect(datosDeTextoFacebook("Casa amplia de 141.2 m2").m2Terreno).toBeNull();
    expect(datosDeTextoFacebook("Casa amplia de 141.2 m2").m2Construccion).toBeNull();
  });

  it("lee la cochera y los niveles", () => {
    expect(datosDeTextoFacebook("Cochera para 2 autos").estacionamientos).toBe(2);
    expect(datosDeTextoFacebook("Estacionamiento para tres vehículos").estacionamientos).toBe(3);
    expect(datosDeTextoFacebook("Casa de 2 niveles").niveles).toBe(2);
    expect(datosDeTextoFacebook("Departamento en el tercer piso").niveles).toBeNull();
  });

  it("una cisterna de 10,000 litros no es un precio ni unos metros", () => {
    const datos = datosDeTextoFacebook("Cisterna de 10,000 litros");
    expect(datos.precio).toBeNull();
    expect(datos.m2Terreno).toBeNull();
  });
});

describe("ubicación, operación y tipo", () => {
  it("lee la colonia y la ciudad del renglón del alfiler", () => {
    const datos = datosDeTextoFacebook(`${ALFILER} Prados Verdes | Morelia, Michoacán`);
    expect(datos.colonia).toBe("Prados Verdes");
    expect(datos.ciudad).toBe("Morelia");
  });

  it("una referencia de cómo llegar no es una colonia", () => {
    const datos = datosDeTextoFacebook(`${ALFILER} A solo una cuadra de Av. Periodismo | Morelia`);
    expect(datos.colonia).toBeNull();
    expect(datos.ciudad).toBe("Morelia");
  });

  it("también lee «Ubicación:» cuando no hay alfiler", () => {
    expect(datosDeTextoFacebook("Ubicación: Altozano").colonia).toBe("Altozano");
  });

  it("saca la operación, el tipo y la condición del encabezado", () => {
    const datos = datosDeTextoFacebook("CASA NUEVA EN VENTA – EL PRADO");
    expect(datos.operacion).toBe("venta");
    expect(datos.tipo).toBe("casa");
    expect(datos.condicion).toBe("nueva");

    expect(datosDeTextoFacebook("DEPARTAMENTO EN PREVENTA").tipo).toBe("departamento");
    expect(datosDeTextoFacebook("DEPARTAMENTO EN PREVENTA").condicion).toBe("preventa");
    expect(datosDeTextoFacebook("Casa en venta o renta").operacion).toBe("venta_renta");
  });

  it("un texto vacío no inventa nada", () => {
    const datos = datosDeTextoFacebook("");
    expect(Object.values(datos).every((v) => v === null)).toBe(true);
  });
});

/**
 * La medición de verdad: las 188 descripciones reales contra el inventario
 * (`analisis/crudo/inventario_propiedades.json`, leído del HTML de cada ficha
 * del sitio actual). Los topes de abajo son los medidos el 17/09/2026, con un
 * poco de margen: si un cambio en el extractor empieza a rellenar de más, esto
 * lo detiene.
 */
describe("las 188 descripciones reales", () => {
  const crudo = new URL("../../analisis/crudo/", import.meta.url);
  const leerJson = (archivo: string) => JSON.parse(readFileSync(new URL(archivo, crudo), "utf8"));

  type Ficha = { slug: string; content: { rendered: string } };
  type Inventario = { slug: string; precio?: string; specs?: Record<string, string> };

  const propiedades: Ficha[] = [...leerJson("api_properties.json"), ...leerJson("api_properties_p2.json")];
  const inventario: Inventario[] = leerJson("inventario_propiedades.json");
  const porSlug = new Map(inventario.map((i) => [i.slug, i]));

  const numero = (valor: string | undefined): number | null => {
    if (valor === undefined) return null;
    const limpio = String(valor).replace(/[^\d.]/g, "");
    const n = Number(limpio);
    return limpio !== "" && Number.isFinite(n) ? n : null;
  };

  /** Campo del extractor → de dónde sale en el inventario, y cuánto se tolera. */
  const CAMPOS = [
    ["precio", (i: Inventario) => numero(i.precio), 5],
    ["recamaras", (i: Inventario) => numero(i.specs?.["Habitaciones"]), 8],
    ["banosCompletos", (i: Inventario) => numero(i.specs?.["Baños completos"]), 9],
    ["mediosBanos", (i: Inventario) => numero(i.specs?.["Medios Baños"]), 3],
    ["estacionamientos", (i: Inventario) => numero(i.specs?.["Estacionamientos"]), 19],
    ["niveles", (i: Inventario) => numero(i.specs?.["Cantidad de Pisos"]), 6],
    ["m2Terreno", (i: Inventario) => numero(i.specs?.["Tamaño de la propiedad"]), 5],
    ["m2Construccion", (i: Inventario) => numero(i.specs?.["En construcción"]), 6],
  ] as const;

  const leidos = propiedades.map((p) => ({
    slug: p.slug,
    // El texto CRUDO, que es lo que se pega en el panel: la descripción ya
    // normalizada no trae ni el precio ni el alfiler de la ubicación.
    datos: datosDeTextoFacebook(htmlATexto(p.content.rendered)),
    inventario: porSlug.get(p.slug),
  }));

  it("son 188 y todas están en el inventario", () => {
    expect(propiedades).toHaveLength(188);
    expect(leidos.filter((l) => !l.inventario)).toHaveLength(0);
  });

  for (const [campo, delInventario, topeDeErrores] of CAMPOS) {
    it(`${campo}: no contradice al inventario más de ${topeDeErrores} veces`, () => {
      const desacuerdos: string[] = [];
      let iguales = 0;

      for (const { slug, datos, inventario: inv } of leidos) {
        const leido = datos[campo];
        const esperado = inv ? delInventario(inv) : null;
        if (leido === null || esperado === null) continue;
        // WordPress guardó los metros redondeados hacia abajo («93.7» → «93»):
        // ahí el texto es MÁS preciso, no está equivocado.
        const igual =
          Math.abs(leido - esperado) < 0.05 ||
          (campo.startsWith("m2") && Math.floor(leido) === Math.floor(esperado));
        if (igual) iguales++;
        else desacuerdos.push(`${slug}: texto ${leido}, inventario ${esperado}`);
      }

      expect(desacuerdos.length, desacuerdos.slice(0, 5).join(" · ")).toBeLessThanOrEqual(topeDeErrores);
      // Y que siga sirviendo de algo: sin esto, devolver null siempre pasaría.
      expect(iguales).toBeGreaterThan(desacuerdos.length * 2);
    });
  }

  it("rellena de verdad: más de 600 datos correctos en total", () => {
    let iguales = 0;
    for (const { datos, inventario: inv } of leidos) {
      for (const [campo, delInventario] of CAMPOS) {
        const leido = datos[campo];
        const esperado = inv ? delInventario(inv) : null;
        if (leido === null || esperado === null) continue;
        if (Math.abs(leido - esperado) < 0.05 || (campo.startsWith("m2") && Math.floor(leido) === Math.floor(esperado))) {
          iguales++;
        }
      }
    }
    expect(iguales).toBeGreaterThanOrEqual(600);
  });

  it("encuentra la colonia en al menos 85 de las 188", () => {
    expect(leidos.filter((l) => l.datos.colonia).length).toBeGreaterThanOrEqual(85);
  });
});
