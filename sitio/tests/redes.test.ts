import { describe, expect, it } from "vitest";
import { CLAVES_DE_RED, TOPE_DE_REDES, redesDeBolsa, revisarRedes } from "../shared/redes";

/** Lo mismo que hace el sitio con la fila de la base: parsear y armar. */
const redesDeJson = (crudo: string | undefined) => {
  let bolsa: Record<string, unknown> = {};
  try {
    const v = crudo ? JSON.parse(crudo) : {};
    if (v && typeof v === "object" && !Array.isArray(v)) bolsa = v as Record<string, unknown>;
  } catch {
    bolsa = {};
  }
  return { lista: redesDeBolsa(bolsa) };
};

/**
 * Las redes del pie dejaron de ser dos campos fijos y pasaron a ser una lista
 * (20/09/2026). Lo que se prueba aquí es lo que puede romper el sitio de
 * verdad: que la fila que YA está en producción se siga leyendo, y que el
 * panel no pueda guardar basura.
 */

/** La fila tal cual está en producción al 20/09/2026. */
const FILA_DE_PRODUCCION = JSON.stringify({
  facebook: "https://www.facebook.com/profile.php?id=61569927005730",
  instagram: "https://www.instagram.com/activosinmobiliariosglobales/",
});

describe("redesDeJson (lo que lee el pie)", () => {
  it("la fila VIEJA de producción se convierte en lista, sin perder ninguna", () => {
    expect(redesDeJson(FILA_DE_PRODUCCION)).toEqual({
      lista: [
        { red: "facebook", url: "https://www.facebook.com/profile.php?id=61569927005730" },
        { red: "instagram", url: "https://www.instagram.com/activosinmobiliariosglobales/" },
      ],
    });
  });

  it("de la forma vieja, un campo vacío no deja un hueco en el pie", () => {
    const { lista } = redesDeJson(JSON.stringify({ facebook: "https://fb.com/aig", instagram: "" }));
    expect(lista).toEqual([{ red: "facebook", url: "https://fb.com/aig" }]);
  });

  it("la forma nueva se lee tal cual y respeta el orden que puso el equipo", () => {
    const crudo = JSON.stringify({
      lista: [
        { red: "tiktok", url: "https://www.tiktok.com/@aig" },
        { red: "facebook", url: "https://fb.com/aig" },
      ],
    });
    expect(redesDeJson(crudo).lista.map((e) => e.red)).toEqual(["tiktok", "facebook"]);
  });

  it("una red que el sitio no sabe dibujar se cae de la lista, no tumba el pie", () => {
    const crudo = JSON.stringify({
      lista: [
        { red: "myspace", url: "https://myspace.com/aig" },
        { red: "x", url: "https://x.com/aig" },
      ],
    });
    expect(redesDeJson(crudo).lista).toEqual([{ red: "x", url: "https://x.com/aig" }]);
  });

  it("sin fila, con la fila rota o con basura dentro, el pie se queda sin redes y no revienta", () => {
    expect(redesDeJson(undefined).lista).toEqual([]);
    expect(redesDeJson("{no es json").lista).toEqual([]);
    expect(redesDeJson(JSON.stringify({ lista: "no es una lista" })).lista).toEqual([]);
    expect(redesDeJson(JSON.stringify({ lista: [null, 7, { red: "x" }] })).lista).toEqual([]);
  });
});

/** Atajo: el validador devuelve `{ok, valor}` o `{ok:false, campo, mensaje}`. */
const guardar = (crudo: Record<string, unknown>) => revisarRedes(crudo);

describe("revisarRedes (lo que el panel puede guardar)", () => {
  it("guarda la lista del panel y tira los renglones sin enlace", () => {
    const r = guardar({
      lista: [
        { red: "facebook", url: "https://fb.com/aig" },
        { red: "", url: "" },
        { red: "tiktok", url: "" },
        { red: "youtube", url: "https://youtube.com/@aig" },
      ],
    });
    expect(r).toEqual({ ok: true, lista: [
      { red: "facebook", url: "https://fb.com/aig" },
      { red: "youtube", url: "https://youtube.com/@aig" },
    ] });
  });

  it("la misma red dos veces deja UN icono: manda la de más arriba", () => {
    const r = guardar({
      lista: [
        { red: "tiktok", url: "https://www.tiktok.com/@primera" },
        { red: "tiktok", url: "https://www.tiktok.com/@segunda" },
      ],
    });
    expect(r).toEqual({ ok: true, lista: [{ red: "tiktok", url: "https://www.tiktok.com/@primera" }] });
  });

  it("un enlace sin https:// se rechaza con el nombre de la red en el aviso", () => {
    const r = guardar({ lista: [{ red: "instagram", url: "http://instagram.com/aig" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toContain("Instagram");
  });

  it("una red fuera del catálogo no se guarda", () => {
    const r = guardar({ lista: [{ red: "myspace", url: "https://myspace.com/aig" }] });
    expect(r.ok).toBe(false);
  });

  it("no se guardan más de las que caben en el pie", () => {
    const lista = CLAVES_DE_RED.map((red) => ({ red, url: `https://ejemplo.com/${red}` }));
    const r = guardar({ lista });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lista.length).toBeLessThanOrEqual(TOPE_DE_REDES);
  });

  it("la forma VIEJA por la API (`facebook`/`instagram` sueltos) se sigue aceptando", () => {
    const r = guardar({ facebook: "https://fb.com/aig", instagram: "" });
    expect(r).toEqual({ ok: true, lista: [{ red: "facebook", url: "https://fb.com/aig" }] });
  });

  it("lo que se guarda se puede volver a leer: la vuelta completa no pierde nada", () => {
    const r = guardar({ lista: [{ red: "x", url: "https://x.com/aig" }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(redesDeJson(JSON.stringify({ lista: r.lista })).lista).toEqual([{ red: "x", url: "https://x.com/aig" }]);
  });
});
