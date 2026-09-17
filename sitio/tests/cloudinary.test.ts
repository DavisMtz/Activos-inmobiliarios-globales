import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  cadenaParaFirmar,
  carpetaDePropiedad,
  firmar,
  firmaDeRespuestaValida,
  firmaDeSubida,
  nombreAlAzar,
  publicIdEnCarpeta,
  type NubeDeFotos,
} from "../server/cloudinary";

/**
 * La firma se calcula con Web Crypto (lo que hay en un Worker) y se compara
 * contra `node:crypto`, que es OTRA implementación: si una de las dos cambiara,
 * la prueba lo vería. Es el mismo trato que `clave.test.ts` con PBKDF2.
 */
const sha1DeNode = (texto: string) => createHash("sha1").update(texto).digest("hex");

const SECRETO = "secreto-de-prueba";

const config = (cambios: Partial<NubeDeFotos> = {}): NubeDeFotos => ({
  cloudName: "nube",
  carpeta: "aig",
  apiKey: "123456789",
  apiSecret: SECRETO,
  configurado: true,
  ...cambios,
});

describe("firma de Cloudinary", () => {
  it("ordena los parámetros alfabéticamente y no mete el secreto", () => {
    const cadena = cadenaParaFirmar({ timestamp: "2", folder: "aig/propiedades/AIG-0001", public_id: "abcd1234" });
    expect(cadena).toBe("folder=aig/propiedades/AIG-0001&public_id=abcd1234&timestamp=2");
    expect(cadena).not.toContain(SECRETO);
  });

  it("da el mismo SHA-1 que node:crypto", async () => {
    const parametros = { folder: "aig/propiedades/AIG-0007", public_id: "0a1b2c3d", timestamp: "1758000000" };
    expect(await firmar(parametros, SECRETO)).toBe(sha1DeNode(cadenaParaFirmar(parametros) + SECRETO));
  });

  it("la subida se firma sobre la carpeta de ESA casa", async () => {
    const firma = await firmaDeSubida(config(), "AIG-0042");
    expect(firma).not.toBeNull();
    expect(firma!.folder).toBe("aig/propiedades/AIG-0042");
    expect(firma!.url).toBe("https://api.cloudinary.com/v1_1/nube/image/upload");
    expect(firma!.signature).toBe(
      sha1DeNode(`folder=${firma!.folder}&public_id=${firma!.publicId}&timestamp=${firma!.timestamp}` + SECRETO),
    );
  });

  it("sin credenciales no hay firma (el panel enseña el aviso y sigue funcionando)", async () => {
    expect(await firmaDeSubida(config({ configurado: false }), "AIG-0042")).toBeNull();
  });

  it("solo acepta la respuesta que Cloudinary firmó", async () => {
    const publicId = "aig/propiedades/AIG-0042/0a1b2c3d";
    const version = "1758000000";
    const buena = sha1DeNode(`public_id=${publicId}&version=${version}` + SECRETO);

    expect(await firmaDeRespuestaValida(config(), { publicId, version, signature: buena })).toBe(true);
    expect(await firmaDeRespuestaValida(config(), { publicId, version, signature: "0".repeat(40) })).toBe(false);
    // Otra foto con la firma de esta: es justo lo que la comprobación impide.
    expect(
      await firmaDeRespuestaValida(config(), { publicId: `${publicId}-otra`, version, signature: buena }),
    ).toBe(false);
  });
});

describe("carpetas", () => {
  it("una carpeta por casa", () => {
    expect(carpetaDePropiedad(config(), "AIG-0001")).toBe("aig/propiedades/AIG-0001");
    expect(carpetaDePropiedad(config({ carpeta: "otra" }), "AIG-0001")).toBe("otra/propiedades/AIG-0001");
  });

  it("no deja registrar una foto que cayó en la carpeta de otra casa", () => {
    const c = config();
    expect(publicIdEnCarpeta(c, "AIG-0001", "aig/propiedades/AIG-0001/abcd1234")).toBe(true);
    expect(publicIdEnCarpeta(c, "AIG-0001", "aig/propiedades/AIG-0002/abcd1234")).toBe(false);
    expect(publicIdEnCarpeta(c, "AIG-0001", "aig/propiedades/AIG-0001")).toBe(false);
    expect(publicIdEnCarpeta(c, "AIG-0001", "otra-nube/AIG-0001/abcd1234")).toBe(false);
  });

  it("los nombres al azar son distintos y caben en una URL", () => {
    const nombres = new Set(Array.from({ length: 200 }, nombreAlAzar));
    expect(nombres.size).toBe(200);
    expect([...nombres].every((n) => /^[0-9a-f]{8}$/.test(n))).toBe(true);
  });
});
