import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LETRAS_MATEMATICAS,
  asesorMencionado,
  decodificarEntidades,
  htmlATexto,
  normalizarDescripcion,
  resumenDe,
  slugificar,
} from "../shared/texto";

const cp = (...c: number[]) => String.fromCodePoint(...c);
/** «CASA» en negritas matemáticas (U+1D5D6…), como las escribe el equipo en Facebook. */
const negritas = (texto: string) =>
  [...texto].map((c) => (/[A-Z]/.test(c) ? cp(0x1d5d4 + c.charCodeAt(0) - 65) : c)).join("");

describe("htmlATexto", () => {
  it("respeta los <br> con atributos que escribe el editor de WordPress", () => {
    const html = '<p><strong>Último Piso:</strong><br data-start="1524" data-end="1527" />• Bodega<br data-x="1"/>• Cuarto</p>';
    expect(htmlATexto(html)).toBe("Último Piso:\n• Bodega\n• Cuarto");
  });

  it("convierte <hr> y </p> en párrafos y decodifica entidades", () => {
    expect(htmlATexto("<p>Uno &amp; dos</p><hr data-start=\"1\" /><p>Casa &#8211; El&nbsp;Prado</p>")).toBe(
      "Uno & dos\n\nCasa – El Prado",
    );
  });

  it("decodifica entidades numéricas, hexadecimales y con nombre", () => {
    expect(decodificarEntidades("&#171;Los Ayeres&#187; &#x2013; &laquo;x&raquo; &nada;")).toBe("«Los Ayeres» – «x» &nada;");
  });
});

describe("normalizarDescripcion", () => {
  it("pasa las letras «negritas» de Unicode a letras normales", () => {
    const entrada = `${negritas("CASA NUEVA EN VENTA")} en El Prado`;
    expect(LETRAS_MATEMATICAS.test(entrada)).toBe(true);
    const salida = normalizarDescripcion(entrada);
    expect(salida).toBe("CASA NUEVA EN VENTA en El Prado");
    expect(LETRAS_MATEMATICAS.test(salida)).toBe(false);
  });

  it("convierte las viñetas con emoji en «• » y quita los emojis de adorno y las banderas", () => {
    const entrada = [`✔${cp(0xfe0f)} Cochera para 2 autos`, "▪️ Jardín", "📍 Salida al Aeropuerto", `${cp(0x1f1ea, 0x1f1f8)} Cerámica española`].join("\n");
    expect(normalizarDescripcion(entrada)).toBe("• Cochera para 2 autos\n• Jardín\nSalida al Aeropuerto\nCerámica española");
  });

  it("quita separadores, hashtags y renglones que solo repiten el precio", () => {
    const entrada = "Casa amplia\n━━━━━━━━━━\n💰 PRECIO DE VENTA: $3,000,000 MXN\nRenta mensual: $14,000\n#ElPrado #CasaNueva\nCon jardín";
    expect(normalizarDescripcion(entrada)).toBe("Casa amplia\nCon jardín");
  });

  it("corta el bloque final de «Informes y citas» con nombre y teléfono", () => {
    const entrada = [
      "Casa en Lomalta",
      "Tres recámaras con clóset",
      "Cocina integral",
      "Jardín trasero",
      "Cochera para dos autos",
      "📲 INFORMES Y CITAS",
      "🏢 Activos Inmobiliarios Globales",
      "📞 443 492 2197",
      "#Morelia #BienesRaices",
    ].join("\n");
    expect(normalizarDescripcion(entrada)).toBe("Casa en Lomalta\nTres recámaras con clóset\nCocina integral\nJardín trasero\nCochera para dos autos");
  });

  it("no corta una frase de contacto que va a media descripción", () => {
    const entrada = [
      "Casa en Altozano",
      "Contáctanos para más información",
      "Sala y comedor con doble altura",
      "Cocina integral con isla y alacena",
      "Recámara principal con vestidor y baño completo",
      "Dos recámaras secundarias con clóset",
      "Jardín amplio con asador",
    ].join("\n");
    expect(normalizarDescripcion(entrada)).toContain("Jardín amplio con asador");
  });

  it("quita solo la frase que trae un teléfono", () => {
    expect(
      normalizarDescripcion("Más información por mensaje directo: 443 492 2197¡Excelente ubicación, cerca de todo!\nCon jardín amplio"),
    ).toBe("¡Excelente ubicación, cerca de todo!\nCon jardín amplio");
    expect(normalizarDescripcion("Cisterna de 10,000 litros. Terreno de 2942 m2.")).toBe("Cisterna de 10,000 litros. Terreno de 2942 m2.");
  });

  it("en el bloque final quita al asesor y el contacto, pero conserva el aviso legal", () => {
    const entrada = [
      "Casa en Valle Quieto",
      "Terreno en esquina",
      "Cerca de Av. Universidad",
      "Excelente para crear patrimonio",
      "📲 INFORMES Y CITAS",
      "Lic. Eberth Martínez Corona",
      "📞 443 492 2197",
      "Precio sujeto a disponibilidad y cambio sin previo aviso.",
      "#CasaEnVenta #Morelia",
    ].join("\n");
    expect(normalizarDescripcion(entrada)).toBe(
      "Casa en Valle Quieto\nTerreno en esquina\nCerca de Av. Universidad\nExcelente para crear patrimonio\nPrecio sujeto a disponibilidad y cambio sin previo aviso.",
    );
  });

  it("detecta al asesor nombrado en el texto", () => {
    expect(asesorMencionado("Casa\n📲 INFORMES Y CITAS\n👤 Lic. Eberth Martínez Corona\n📞 443 492 2197")).toBe("Lic. Eberth Martínez Corona");
    expect(asesorMencionado("Casa en venta\nLicencia de construcción al corriente")).toBeNull();
  });
});

describe("resumenDe", () => {
  it("salta encabezados en mayúsculas, títulos y direcciones, y toma la primera frase útil", () => {
    const descripcion = [
      "CASA NUEVA EN VENTA – EL PRADO",
      "Casa en Venta – Av. Escritor de la Independencia",
      "Amado Nervo, Centro, Morelia, Michoacán",
      "Una casa moderna y completamente equipada, con excelentes acabados. Su estudio ofrece versatilidad.",
    ].join("\n");
    expect(resumenDe(descripcion)).toBe("Una casa moderna y completamente equipada, con excelentes acabados.");
  });

  it("no corta en una abreviatura", () => {
    expect(resumenDe("Casa a dos cuadras de Av. Madero, con cochera techada y patio de servicio.")).toBe(
      "Casa a dos cuadras de Av. Madero, con cochera techada y patio de servicio.",
    );
  });

  it("recorta a 160 caracteres en una palabra, con puntos suspensivos", () => {
    const larga = `Descubre una residencia ${"con grandes espacios y acabados de lujo ".repeat(8)}en Morelia`;
    const resumen = resumenDe(larga);
    expect(resumen).not.toBeNull();
    expect(resumen!.length).toBeLessThanOrEqual(160);
    expect(resumen!.endsWith("…")).toBe(true);
  });

  it("devuelve null si no hay ninguna frase útil", () => {
    expect(resumenDe("DEPARTAMENTO 141.2 M2 CONSTRUCCION\nTerreno: 96 m2")).toBeNull();
  });
});

describe("slugificar", () => {
  it("quita acentos, símbolos y mayúsculas", () => {
    expect(slugificar("Club Campestre Erandeni")).toBe("club-campestre-erandeni");
    expect(slugificar("Morelia Pátzcuaro Ñandú")).toBe("morelia-patzcuaro-nandu");
    expect(slugificar("terreno-de-2942m²")).toBe("terreno-de-2942m2");
  });
});

describe("las 188 descripciones reales del sitio actual", () => {
  const crudo = new URL("../../analisis/crudo/", import.meta.url);
  const leer = (archivo: string) => JSON.parse(readFileSync(new URL(archivo, crudo), "utf8")) as { slug: string; content: { rendered: string } }[];
  const propiedades = [...leer("api_properties.json"), ...leer("api_properties_p2.json")];
  const limpias = propiedades.map((p) => ({ slug: p.slug, texto: normalizarDescripcion(htmlATexto(p.content.rendered)) }));

  it("son 188", () => {
    expect(propiedades).toHaveLength(188);
  });

  it("ninguna conserva letras matemáticas, hashtags, separadores, «informes y citas» ni teléfonos", () => {
    const problemas = limpias.filter(
      ({ texto }) =>
        LETRAS_MATEMATICAS.test(texto) ||
        /(^|\s)#\p{L}/u.test(texto) ||
        /━/.test(texto) ||
        /informes y citas/i.test(texto) ||
        /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(texto) ||
        /\p{Extended_Pictographic}/u.test(texto),
    );
    expect(problemas.map((p) => p.slug)).toEqual([]);
  });

  it("ninguna queda vacía y las listas conservan un elemento por renglón", () => {
    expect(limpias.filter((l) => l.texto.length < 30).map((l) => l.slug)).toEqual([]);
    const lujo = limpias.find((l) => l.slug === "casa-de-lujo")!.texto;
    expect(lujo).toContain("Último Piso:\n• Bodega\n• Cuarto con baño completo");
  });

  it("conserva el contenido de la casa (El Prado 4)", () => {
    const prado = limpias.find((l) => l.slug === "casa-en-el-prado-4")!.texto;
    for (const frase of ["Cocina integral con isla", "Cisterna de 10,000 litros", "• Cochera para 2 autos", "Cerámica española"]) {
      expect(prado).toContain(frase);
    }
    expect(prado).not.toMatch(/443 492 2197|PRECIO DE VENTA/);
  });

  it("los resúmenes miden 40–160 caracteres y casi todas tienen uno", () => {
    const resumenes = limpias.map((l) => resumenDe(l.texto));
    const con = resumenes.filter((r): r is string => r !== null);
    expect(con.every((r) => r.length >= 40 && r.length <= 160)).toBe(true);
    expect(con.length).toBeGreaterThanOrEqual(175);
  });
});
