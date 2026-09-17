import { describe, expect, it } from "vitest";
import {
  MATRIZ,
  ROLES,
  estadoInicialAlCrear,
  problemaAlGestionarUsuario,
  puede,
  type Actor,
  type Permiso,
  type Rol,
} from "../shared/permisos";

/**
 * La tabla de PLAN §9 escrita OTRA VEZ, a mano y con sus mismas palabras,
 * para compararla contra `shared/permisos.ts`. Si alguien cambia la matriz
 * sin cambiar esto (o al revés), la prueba falla.
 *
 *   ✅ = sí, siempre      ❌ = nunca
 *   suyas = solo lo que tiene asesor_id = su id
 *   vistas = métricas limitadas a vistas por casa
 *   equipo = usuarios de los roles asesor y contenido
 */
type Celda = "✅" | "❌" | "suyas" | "vistas" | "equipo";

//                                              maestro director  asesor    contenido
const TABLA_DEL_PLAN: Record<Permiso, [Celda, Celda, Celda, Celda]> = {
  "propiedades.ver": ["✅", "✅", "✅", "✅"],
  "propiedades.crear": ["✅", "✅", "✅", "✅"],
  "propiedades.editar": ["✅", "✅", "suyas", "✅"],
  "propiedades.publicar": ["✅", "✅", "❌", "✅"],
  "propiedades.estado_comercial": ["✅", "✅", "suyas", "✅"],
  "propiedades.asignar_asesor": ["✅", "✅", "❌", "❌"],
  "propiedades.papelera": ["✅", "✅", "❌", "❌"],
  "fotos.gestionar": ["✅", "✅", "suyas", "✅"],
  "contenido.editar": ["✅", "✅", "❌", "✅"],
  "configuracion.contacto": ["✅", "✅", "❌", "❌"],
  "configuracion.aviso": ["✅", "✅", "❌", "❌"],
  "prospectos.ver": ["✅", "✅", "suyas", "❌"],
  "prospectos.gestionar": ["✅", "✅", "suyas", "❌"],
  "prospectos.asignar": ["✅", "✅", "❌", "❌"],
  "prospectos.exportar": ["✅", "✅", "❌", "❌"],
  "metricas.ver": ["✅", "✅", "suyas", "vistas"],
  "usuarios.gestionar": ["✅", "equipo", "❌", "❌"],
  "bitacora.ver": ["✅", "✅", "❌", "❌"],
  "sistema.gestionar": ["✅", "❌", "❌", "❌"],
  "cuenta.propia": ["✅", "✅", "✅", "✅"],
};

const actor = (rol: Rol): Actor => ({ id: `id-${rol}`, rol });
const SUYA = (a: Actor) => ({ asesor_id: a.id });
const AJENA = { asesor_id: "id-otra-persona" };
const SIN_ASESOR = { asesor_id: null };

describe("matriz de permisos (PLAN §9)", () => {
  it("cubre exactamente los permisos de la tabla del plan", () => {
    expect(Object.keys(MATRIZ).sort()).toEqual(Object.keys(TABLA_DEL_PLAN).sort());
  });

  for (const [permiso, celdas] of Object.entries(TABLA_DEL_PLAN) as [Permiso, Celda[]][]) {
    ROLES.forEach((rol, i) => {
      const celda = celdas[i];
      const a = actor(rol);

      it(`${permiso} · ${rol} = ${celda}`, () => {
        switch (celda) {
          case "✅":
            expect(puede(a, permiso)).toBe(true);
            expect(puede(a, permiso, SUYA(a))).toBe(true);
            expect(puede(a, permiso, AJENA)).toBe(true);
            break;
          case "❌":
            expect(puede(a, permiso)).toBe(false);
            expect(puede(a, permiso, SUYA(a))).toBe(false);
            expect(puede(a, permiso, AJENA)).toBe(false);
            break;
          case "suyas":
            expect(puede(a, permiso)).toBe(true);
            expect(puede(a, permiso, SUYA(a))).toBe(true);
            expect(puede(a, permiso, AJENA)).toBe(false);
            expect(puede(a, permiso, SIN_ASESOR)).toBe(false);
            break;
          case "vistas":
            expect(MATRIZ[permiso][rol]).toBe("vistas");
            expect(puede(a, permiso)).toBe(true);
            break;
          case "equipo":
            expect(puede(a, permiso)).toBe(true);
            expect(puede(a, permiso, { rol: "asesor" })).toBe(true);
            expect(puede(a, permiso, { rol: "contenido" })).toBe(true);
            expect(puede(a, permiso, { rol: "director" })).toBe(false);
            expect(puede(a, permiso, { rol: "maestro" })).toBe(false);
            break;
        }
      });
    });
  }
});

describe("reglas duras sobre cuentas", () => {
  const maestro = actor("maestro");
  const director = actor("director");

  it("nadie cambia su propio rol ni se desactiva a sí mismo", () => {
    expect(problemaAlGestionarUsuario(maestro, maestro, { rolNuevo: "director" })).toMatch(/propio rol/);
    expect(problemaAlGestionarUsuario(maestro, maestro, { desactivar: true })).toMatch(/propia cuenta/);
  });

  it("el director no gestiona cuentas maestro ni director, ni la suya por aquí", () => {
    expect(problemaAlGestionarUsuario(director, { id: "otro", rol: "maestro" }, { desactivar: true })).not.toBeNull();
    expect(problemaAlGestionarUsuario(director, { id: "otro", rol: "director" }, { desactivar: true })).not.toBeNull();
    expect(problemaAlGestionarUsuario(director, director, {})).not.toBeNull();
  });

  it("el director gestiona asesores y contenido, pero no los asciende a director", () => {
    expect(problemaAlGestionarUsuario(director, { id: "a", rol: "asesor" }, { desactivar: true })).toBeNull();
    expect(problemaAlGestionarUsuario(director, { id: "a", rol: "asesor" }, { rolNuevo: "contenido" })).toBeNull();
    expect(problemaAlGestionarUsuario(director, { id: "a", rol: "asesor" }, { rolNuevo: "director" })).not.toBeNull();
  });

  it("el maestro gestiona a cualquier otra cuenta y da cualquier rol", () => {
    expect(problemaAlGestionarUsuario(maestro, { id: "d", rol: "director" }, { rolNuevo: "maestro" })).toBeNull();
    expect(problemaAlGestionarUsuario(maestro, { id: "m2", rol: "maestro" }, { desactivar: true })).toBeNull();
  });

  it("asesor y contenido no gestionan cuentas", () => {
    for (const rol of ["asesor", "contenido"] as const) {
      expect(problemaAlGestionarUsuario(actor(rol), { id: "x", rol: "asesor" }, {})).not.toBeNull();
    }
  });

  it("lo que crea un asesor nace en revisión; lo de los demás, en borrador", () => {
    expect(estadoInicialAlCrear(actor("asesor"))).toBe("revision");
    for (const rol of ["maestro", "director", "contenido"] as const) {
      expect(estadoInicialAlCrear(actor(rol))).toBe("borrador");
    }
  });
});
