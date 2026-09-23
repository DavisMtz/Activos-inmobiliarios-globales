import { useCallback, useEffect, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";
import { ETIQUETA_TIPO, TIPOS } from "../../../shared/filtros";
import {
  CONDICIONES,
  ETIQUETA_CONDICION,
  ETIQUETA_OPERACION_PROPIEDAD,
  LARGO_MAXIMO_RESUMEN,
  OPERACIONES_PROPIEDAD,
  type Aviso,
} from "../../../shared/propiedad";
import type { DatosDeFacebook } from "../../../shared/texto";
import { usarBorrador, type Valores } from "./borrador";
import { IconoAtencion } from "./iconos";
import { Aviso as Recuadro, Bloque, Boton, Campo, CampoSelect, CampoTexto } from "./piezas";

/**
 * El formulario de una casa, por secciones (PLAN §11.2). Lo comparten «subir
 * una casa» y la edición: la diferencia es qué trae dentro y a dónde va.
 *
 * Tres decisiones que se notan al usarlo:
 * - **El guardado automático es local** (ver `borrador.ts`). El servidor escribe
 *   cuando se pulsa «Guardar», y así cada cambio deja UNA entrada en la
 *   bitácora, no una por tecleo.
 * - **«Pegar texto de Facebook» solo rellena lo que está vacío** y marca lo que
 *   llenó, para que una persona lo confirme (§11.3). Nunca pisa lo escrito.
 * - Sin JavaScript también funciona: es un `<form>` con `POST`, y el botón de
 *   pegar es otro `submit` con su propio valor.
 *
 * Desde 1280 px (`xl:`) va en dos columnas, pero DENTRO del mismo `<form>`: el
 * borrador y el pegado leen `nodo.elements`, y partirlo en dos formularios los
 * rompería. Lo que falta | pegar texto; Lo básico | Características; la
 * descripción y la publicación a todo lo ancho, porque un texto largo se
 * corrige mejor con renglones largos. Debajo de 1280 no cambia nada: solo hay
 * clases con prefijo `xl:`.
 */

export type ValoresDeCasa = Valores;

export type SugerenciasDeFacebook = {
  datos: DatosDeFacebook;
  descripcion: string;
  resumen: string | null;
  asesor: string | null;
};

export type ApoyoDelFormulario = {
  asesores: { id: string; nombre: string; rol: string }[];
  zonas: { ciudad: string; colonia: string | null }[];
};

/** Qué campo del formulario llena cada dato que se saca del texto pegado. */
const CAMPOS_DE_FACEBOOK: [keyof DatosDeFacebook, string][] = [
  ["operacion", "operacion"],
  ["tipo", "tipo"],
  ["condicion", "condicion"],
  ["precio", "precio"],
  ["precioRenta", "precio_renta"],
  ["recamaras", "recamaras"],
  ["banosCompletos", "banos_completos"],
  ["mediosBanos", "medios_banos"],
  ["estacionamientos", "estacionamientos"],
  ["niveles", "niveles"],
  ["m2Terreno", "m2_terreno"],
  ["m2Construccion", "m2_construccion"],
  ["ciudad", "ciudad"],
  ["colonia", "colonia"],
];

const cuandoTexto = (cuando: number) =>
  new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(
    new Date(cuando),
  );

export function FormularioDePropiedad({
  id,
  valores,
  avisos,
  apoyo,
  sugerencias,
  error,
  puedePublicar,
  puedeAsignar,
  textoBoton,
}: {
  /** El id de la casa, o «nueva». */
  id: string;
  valores: ValoresDeCasa;
  avisos?: Aviso[];
  apoyo: ApoyoDelFormulario;
  sugerencias?: SugerenciasDeFacebook | null;
  error?: { campo?: string; mensaje: string } | null;
  puedePublicar: boolean;
  puedeAsignar: boolean;
  textoBoton: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const refFormulario = useRef<HTMLFormElement>(null);
  const navegacion = useNavigation();
  const guardando = navegacion.state !== "idle" && navegacion.formData?.get("que") === "guardar";
  const [rellenados, setRellenados] = useState<string[]>([]);

  /**
   * El `<form>` de verdad. Se busca dentro del contenedor y no solo por la ref
   * del componente de React Router: si esa ref no llega hasta el nodo, «pegar
   * texto de Facebook» no rellenaría nada y el borrador no guardaría nada, las
   * dos cosas sin avisar (medido al verificar F3).
   */
  const obtenerFormulario = useCallback(
    () => refFormulario.current ?? contenedor.current?.querySelector("form") ?? null,
    [],
  );

  const borrador = usarBorrador({ id, formulario: obtenerFormulario, servidor: valores });

  /**
   * Lo que se sacó del texto pegado entra en los campos VACÍOS. Se hace sobre
   * el formulario ya pintado (y no con `defaultValue`) porque cuando llega la
   * respuesta, los campos ya tienen lo que la persona escribió y React no los
   * vuelve a pintar: pisarlos sería perder su trabajo.
   */
  useEffect(() => {
    const nodo = obtenerFormulario();
    if (!sugerencias || !nodo) return;
    const llenados: string[] = [];

    const poner = (nombre: string, valor: string) => {
      const campo = nodo.elements.namedItem(nombre);
      if (!(campo instanceof HTMLInputElement || campo instanceof HTMLTextAreaElement || campo instanceof HTMLSelectElement)) return;
      if (campo.value.trim() !== "") return;
      campo.value = valor;
      llenados.push(nombre);
    };

    for (const [dato, campo] of CAMPOS_DE_FACEBOOK) {
      const valor = sugerencias.datos[dato];
      if (valor !== null && valor !== undefined && valor !== "") poner(campo, String(valor));
    }
    if (sugerencias.descripcion) poner("descripcion", sugerencias.descripcion);
    if (sugerencias.resumen) poner("resumen", sugerencias.resumen);

    setRellenados(llenados);
    borrador.marcar();
    // Solo cuando llega una respuesta nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugerencias]);

  const marca = (nombre: string) => (rellenados.includes(nombre) ? "Lo llenó el texto pegado: confírmalo." : undefined);

  return (
    <div ref={contenedor}>
      <Form method="post" ref={refFormulario} onChange={borrador.marcar} className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-start">
      {error ? <Recuadro className="xl:col-span-2">{error.mensaje}</Recuadro> : null}

      {borrador.pendiente ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-aviso/30 bg-aviso/10 px-4 py-3 xl:col-span-2">
          <IconoAtencion className="h-5 w-5 shrink-0 text-aviso" />
          <p className="flex-1 text-sm font-semibold text-aviso">
            Tienes cambios sin guardar en este navegador, de {cuandoTexto(borrador.pendiente.cuando)}.
          </p>
          <button
            type="button"
            onClick={borrador.recuperar}
            className="h-10 rounded-lg bg-aviso px-4 text-sm font-bold text-white transition-colors hover:bg-aviso/90"
          >
            Recuperarlos
          </button>
          <button
            type="button"
            onClick={borrador.descartar}
            className="h-10 rounded-lg px-3 text-sm font-bold text-aviso underline underline-offset-4"
          >
            Descartarlos
          </button>
        </div>
      ) : null}

      {avisos && avisos.length ? (
        <Bloque titulo="Lo que le falta a esta casa">
          <ul className="flex flex-col gap-2">
            {avisos.map((aviso) => (
              <li key={aviso.clave} className="flex items-start gap-2.5 text-sm">
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${aviso.impidePublicar ? "bg-marca" : "bg-aviso"}`}
                />
                <span className={aviso.impidePublicar ? "font-semibold text-tinta" : "text-texto"}>{aviso.texto}</span>
              </li>
            ))}
          </ul>
        </Bloque>
      ) : null}

      {/* ── Pegar texto de Facebook ─────────────────────────────── */}
      <Bloque
        className={avisos && avisos.length ? undefined : "xl:col-span-2"}
        titulo="Pegar texto de Facebook"
        descripcion="Pega la publicación tal cual. Llena solo los campos vacíos y deja la descripción limpia; lo que llene, confírmalo."
      >
        <div className="flex flex-col gap-3">
          <textarea
            name="texto_facebook"
            rows={4}
            placeholder="🏡 CASA NUEVA EN VENTA – EL PRADO…"
            className="w-full rounded-xl border border-linea bg-superficie px-4 py-3 text-base leading-relaxed text-tinta transition-colors outline-none placeholder:text-texto-suave/70 focus:border-marca"
          />
          <div className="flex flex-wrap items-center gap-3">
            {/* `formNoValidate` no es un detalle: sin él, el navegador BLOQUEA
                este envío porque el título y la ciudad están vacíos —que es
                justo el momento en que se pega el texto— y no pasa nada de
                nada, sin mensaje. Leer el texto no guarda la casa: no tiene por
                qué exigir sus campos. (Medido al verificar F3.) */}
            <Boton type="submit" name="que" value="facebook" tono="secundario" formNoValidate>
              Leer el texto
            </Boton>
            {rellenados.length ? (
              <p className="text-sm font-semibold text-exito">
                Se llenaron {rellenados.length} {rellenados.length === 1 ? "campo" : "campos"}. Revísalos antes de
                guardar.
              </p>
            ) : null}
            {sugerencias?.asesor ? (
              <p className="text-sm text-texto-suave">El texto menciona a {sugerencias.asesor}.</p>
            ) : null}
          </div>
        </div>
      </Bloque>

      {/* ── Básicos ─────────────────────────────────────────────── */}
      <Bloque titulo="Lo básico">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo
              etiqueta="Título"
              name="titulo"
              defaultValue={valores.titulo}
              required
              minLength={4}
              maxLength={140}
              ayuda="Como se lee en el sitio: «Casa en El Prado»."
            />
          </div>

          <CampoSelect etiqueta="Operación" name="operacion" defaultValue={valores.operacion || "venta"} ayuda={marca("operacion")}>
            {OPERACIONES_PROPIEDAD.map((operacion) => (
              <option key={operacion} value={operacion}>
                {ETIQUETA_OPERACION_PROPIEDAD[operacion]}
              </option>
            ))}
          </CampoSelect>

          <CampoSelect etiqueta="Tipo" name="tipo" defaultValue={valores.tipo || "casa"} ayuda={marca("tipo")}>
            {TIPOS.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ETIQUETA_TIPO[tipo]}
              </option>
            ))}
          </CampoSelect>

          <Campo
            etiqueta="Precio de venta"
            name="precio"
            inputMode="numeric"
            defaultValue={valores.precio}
            ayuda={marca("precio") ?? "Solo cifras. Déjalo vacío si no se vende."}
          />
          <Campo
            etiqueta="Renta mensual"
            name="precio_renta"
            inputMode="numeric"
            defaultValue={valores.precio_renta}
            ayuda={marca("precio_renta") ?? "Solo cifras. Déjalo vacío si no se renta."}
          />

          <Campo etiqueta="Ciudad" name="ciudad" defaultValue={valores.ciudad} required list="ciudades" ayuda={marca("ciudad")} />
          <Campo
            etiqueta="Colonia o fraccionamiento"
            name="colonia"
            defaultValue={valores.colonia}
            list="colonias"
            ayuda={marca("colonia") ?? "Es lo que la gente busca."}
          />

          <datalist id="ciudades">
            {[...new Set(apoyo.zonas.map((zona) => zona.ciudad))].map((ciudad) => (
              <option key={ciudad} value={ciudad} />
            ))}
          </datalist>
          <datalist id="colonias">
            {[...new Set(apoyo.zonas.map((zona) => zona.colonia).filter(Boolean))].map((colonia) => (
              <option key={colonia as string} value={colonia as string} />
            ))}
          </datalist>

          <CampoSelect etiqueta="Condición" name="condicion" defaultValue={valores.condicion} ayuda={marca("condicion")}>
            <option value="">Sin especificar</option>
            {CONDICIONES.map((condicion) => (
              <option key={condicion} value={condicion}>
                {ETIQUETA_CONDICION[condicion]}
              </option>
            ))}
          </CampoSelect>

          <Campo
            etiqueta="Dirección (solo para el equipo)"
            name="direccion_privada"
            defaultValue={valores.direccion_privada}
            ayuda="No se enseña en el sitio."
          />
        </div>
      </Bloque>

      {/* ── Características ─────────────────────────────────────── */}
      <Bloque titulo="Características">
        {/* En media pantalla (xl) caben 3 columnas hasta que no: a 1280 px
            «Año de construcción» se parte en dos renglones y descuadra su
            campo. Dos columnas hasta 2xl. */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
          <Campo etiqueta="Recámaras" name="recamaras" inputMode="numeric" defaultValue={valores.recamaras} ayuda={marca("recamaras")} />
          <Campo etiqueta="Baños completos" name="banos_completos" inputMode="numeric" defaultValue={valores.banos_completos} ayuda={marca("banos_completos")} />
          <Campo etiqueta="Medios baños" name="medios_banos" inputMode="numeric" defaultValue={valores.medios_banos} ayuda={marca("medios_banos")} />
          <Campo etiqueta="Estacionamientos" name="estacionamientos" inputMode="numeric" defaultValue={valores.estacionamientos} ayuda={marca("estacionamientos")} />
          <Campo etiqueta="Niveles" name="niveles" inputMode="numeric" defaultValue={valores.niveles} ayuda={marca("niveles")} />
          <Campo etiqueta="Año de construcción" name="anio_construccion" inputMode="numeric" defaultValue={valores.anio_construccion} />
          <Campo etiqueta="Terreno (m²)" name="m2_terreno" inputMode="decimal" defaultValue={valores.m2_terreno} ayuda={marca("m2_terreno")} />
          <Campo etiqueta="Construcción (m²)" name="m2_construccion" inputMode="decimal" defaultValue={valores.m2_construccion} ayuda={marca("m2_construccion")} />
          <Campo etiqueta="Video (enlace)" name="video_url" type="url" defaultValue={valores.video_url} ayuda="YouTube o similar, con https://" />
        </div>
      </Bloque>

      {/* ── Descripción ─────────────────────────────────────────── */}
      <Bloque titulo="Descripción" className="xl:col-span-2">
        <div className="flex flex-col gap-5">
          <CampoTexto
            etiqueta="Resumen"
            name="resumen"
            defaultValue={valores.resumen}
            maxLength={LARGO_MAXIMO_RESUMEN}
            filas={2}
            ayuda={marca("resumen") ?? `Lo que se lee en la tarjeta y en Google. Máximo ${LARGO_MAXIMO_RESUMEN} caracteres.`}
          />
          <CampoTexto
            etiqueta="Descripción"
            name="descripcion"
            defaultValue={valores.descripcion}
            filas={10}
            ayuda={marca("descripcion") ?? "Un renglón por característica se lee mejor que un párrafo largo."}
          />
        </div>
      </Bloque>

      {/* ── Publicación ─────────────────────────────────────────── */}
      {puedePublicar || puedeAsignar ? (
        <Bloque titulo="Publicación" className="xl:col-span-2">
          <div className="grid gap-5 sm:grid-cols-2">
            {puedeAsignar ? (
              <CampoSelect etiqueta="Asesor" name="asesor_id" defaultValue={valores.asesor_id} ayuda="Quien atiende a quien pregunte.">
                <option value="">Sin asignar</option>
                {apoyo.asesores.map((asesor) => (
                  <option key={asesor.id} value={asesor.id}>
                    {asesor.nombre}
                  </option>
                ))}
              </CampoSelect>
            ) : null}
            {puedePublicar ? (
              <label className="flex items-start gap-3 rounded-xl border border-linea bg-fondo px-4 py-3.5">
                <input
                  type="checkbox"
                  name="destacada"
                  defaultChecked={valores.destacada === "on" || valores.destacada === "1"}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-marca)]"
                />
                <span className="text-sm">
                  <span className="block font-bold text-tinta">Destacada</span>
                  <span className="text-texto-suave">Aparece primero en la portada.</span>
                </span>
              </label>
            ) : null}
          </div>
        </Bloque>
      ) : null}

      <div className="sticky bottom-[var(--alto-barra,0px)] -mx-4 flex items-center gap-3 border-t border-linea bg-fondo/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 xl:col-span-2">
        {/* La copia local NO se borra al pulsar: se borra sola la próxima vez
            que se abra el formulario, porque entonces coincidirá con lo que
            traiga el servidor. Si el guardado falla, lo escrito sigue a salvo. */}
        <Boton type="submit" name="que" value="guardar" ocupado={guardando}>
          {guardando ? "Guardando…" : textoBoton}
        </Boton>
        <p className="text-sm text-texto-suave">Lo que escribes se guarda en este navegador hasta que pulses Guardar.</p>
      </div>
      </Form>
    </div>
  );
}
