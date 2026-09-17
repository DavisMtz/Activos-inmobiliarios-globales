import { describe, expect, it } from "vitest";
import { fotoVista, urlFoto } from "../shared/fotos";

const NUBE = "srz5sh9l";
const EN_NUBE = { public_id: "aig/propiedades/AIG-0001/998fa0de", url_origen: "https://viejo.mx/foto.jpg" };
const SOLO_WORDPRESS = { public_id: null, url_origen: "https://viejo.mx/foto.jpg" };

describe("urlFoto", () => {
  it("construye la URL de Cloudinary con la transformación de la variante", () => {
    expect(urlFoto(EN_NUBE, "tarjeta", NUBE)).toBe(
      `https://res.cloudinary.com/${NUBE}/image/upload/c_fill,g_auto,w_640,h_480,f_auto,q_auto/aig/propiedades/AIG-0001/998fa0de`,
    );
  });

  it("el og va en JPG de 1200×630 (WhatsApp y Facebook no leen bien AVIF)", () => {
    expect(urlFoto(EN_NUBE, "og", NUBE)).toContain("w_1200,h_630,f_jpg");
  });

  it("sin nube configurada, o sin public_id, usa la URL de origen", () => {
    expect(urlFoto(EN_NUBE, "tarjeta", "")).toBe(SOLO_WORDPRESS.url_origen);
    expect(urlFoto(SOLO_WORDPRESS, "tarjeta", NUBE)).toBe(SOLO_WORDPRESS.url_origen);
    expect(urlFoto({ public_id: null, url_origen: null }, "tarjeta", NUBE)).toBeNull();
  });
});

describe("fotoVista", () => {
  it("da dos anchos en la tarjeta y escala el alto con el ancho", () => {
    const vista = fotoVista(EN_NUBE, "tarjeta", NUBE, "Casa en El Prado")!;
    expect(vista.srcset).toContain("w_640,h_480");
    expect(vista.srcset).toContain("w_960,h_720");
    expect(vista.srcset!.split(", ")).toHaveLength(2);
    expect(vista.srcset).toMatch(/ 640w, .* 960w$/);
  });

  it("la galería no recorta: solo cambia el ancho", () => {
    const vista = fotoVista(EN_NUBE, "galeria", NUBE, "x")!;
    expect(vista.srcset).toContain("c_limit,w_800");
    expect(vista.srcset).toContain("c_limit,w_1600");
    expect(vista.srcset).not.toContain("h_");
  });

  it("dos anchos y no más: cada uno cuesta un derivado de Cloudinary", () => {
    for (const variante of ["tarjeta", "galeria"] as const) {
      expect(fotoVista(EN_NUBE, variante, NUBE, "x")!.srcset!.split(", ")).toHaveLength(2);
    }
    // Miniatura y og van con un solo ancho: no tiene sentido un srcset.
    expect(fotoVista(EN_NUBE, "miniatura", NUBE, "x")!.srcset).toBeNull();
    expect(fotoVista(EN_NUBE, "og", NUBE, "x")!.srcset).toBeNull();
  });

  it("sin Cloudinary no hay tamaños que pedir", () => {
    const vista = fotoVista(SOLO_WORDPRESS, "tarjeta", NUBE, "Casa en El Prado")!;
    expect(vista.src).toBe(SOLO_WORDPRESS.url_origen);
    expect(vista.srcset).toBeNull();
  });

  it("sin alt guardado usa el texto alternativo que le pasan", () => {
    expect(fotoVista(EN_NUBE, "tarjeta", NUBE, "Casa en El Prado")!.alt).toBe("Casa en El Prado");
    expect(fotoVista({ ...EN_NUBE, alt: "  " }, "tarjeta", NUBE, "Casa en El Prado")!.alt).toBe("Casa en El Prado");
    expect(fotoVista({ ...EN_NUBE, alt: "Fachada" }, "tarjeta", NUBE, "Casa en El Prado")!.alt).toBe("Fachada");
  });

  it("una casa sin fotos no da vista", () => {
    expect(fotoVista(null, "tarjeta", NUBE, "x")).toBeNull();
    expect(fotoVista({ public_id: null, url_origen: null }, "tarjeta", NUBE, "x")).toBeNull();
  });
});
