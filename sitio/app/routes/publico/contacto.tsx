import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { data, Form, Link, useNavigation } from "react-router";
import { leerConfigDelSitio } from "../../../server/db/configuracion";
import { guardarProspecto, revisarProspecto } from "../../../server/db/prospectos";
import { MOTIVOS_DE_CONTACTO, mensajeConMotivo, motivoDeContacto, primerNombre } from "../../../shared/contacto";
import {
  CAMPOS_DE_PROSPECTO,
  normalizarCorreo,
  problemasDeProspecto,
  SIN_FORMA_DE_CONTESTAR,
  type CampoDeProspecto,
  type DatosDeProspecto,
} from "../../../shared/validacion";
import { enlaceWhatsApp, numeroParaLeer } from "../../../shared/whatsapp";
import { DibujoDeServicio } from "../../components/publico/dibujos-servicio";
import { useYaHidrato } from "../../components/publico/hidratacion";
import {
  IconoCorreo,
  IconoFlecha,
  IconoReloj,
  IconoTelefono,
  IconoUbicacion,
  IconoWhatsApp,
} from "../../components/publico/iconos";
import { contextoServidor } from "../../contexto";
import type { Route } from "./+types/contacto";

/**
 * Contacto: los datos reales y un formulario que sí guarda (PLAN §10.2).
 *
 * En la propuesta no se manda ningún correo (D11): el mensaje queda en el
 * panel. El enlace al mapa es un enlace, no un iframe de Google: el del sitio
 * actual pesa y bloquea el dibujado en el celular.
 *
 * **La composición es «el mostrador»** (21/09/2026), elegida entre cuatro
 * retratadas sobre la página real (`Escritorio\portada-propuestas\
 * contacto-21-09\`). Antes, la izquierda era un titular y un botón frente a un
 * formulario de 640 px: ~450 px de nada en escritorio. Ahora esa columna es un
 * campo de tinta —como los cierres del sitio— con el camino rápido (WhatsApp),
 * los datos de la oficina cuando existan y el dibujo de asesoría de Servicios
 * en línea clara; el formulario va en su hoja, a la misma altura.
 *
 * **El formulario avisa junto al campo**, con la MISMA regla que decide el
 * servidor (`problemasDeProspecto`): el navegador revisa al salir de cada campo
 * y al mandar, y lo que llega del servidor (sin JavaScript, o un error que
 * solo él ve) cae en el campo que falló, no en un letrero arriba. Sin
 * JavaScript funciona entero: validación del navegador, envío normal y la
 * página vuelve con lo tecleado.
 */

export async function loader({ context }: Route.LoaderArgs) {
  const { servicios } = context.get(contextoServidor);
  const { contacto, whatsapp } = await leerConfigDelSitio(servicios.db);
  return {
    contacto,
    whatsapp: enlaceWhatsApp(whatsapp.numero, whatsapp.plantillaGeneral),
    // Junto al botón: hay quien prefiere guardar el número en su teléfono.
    numeroWhatsApp: numeroParaLeer(whatsapp.numero),
    nombreNegocio: servicios.config.nombreNegocio,
  };
}

type Valores = { nombre: string; telefono: string; correo: string; mensaje: string; motivo: string };

export async function action({ request, context }: Route.ActionArgs) {
  const { servicios, peticion } = context.get(contextoServidor);
  const formulario = await request.formData();

  // Lo que se tecleó, tal cual, para devolverlo si algo falla: sin JavaScript
  // la página se vuelve a pintar entera y se perdería.
  const leido = (campo: string, tope: number) => String(formulario.get(campo) ?? "").slice(0, tope);
  const valores: Valores = {
    nombre: leido("nombre", 80),
    telefono: leido("telefono", 30),
    correo: leido("correo", 254),
    mensaje: leido("mensaje", 1000),
    motivo: leido("motivo", 40),
  };

  // «¿Qué necesitas?» decide el tipo y, si hace falta, antepone su frase al
  // mensaje (`shared/contacto.ts`). Sin elegir nada es un `general`, como antes.
  const motivo = motivoDeContacto(formulario.get("motivo"));
  formulario.set("mensaje", mensajeConMotivo(motivo, valores.mensaje));

  const revision = revisarProspecto(formulario, { tipo: motivo?.tipo ?? "general", origen: "contacto" });
  if (!revision.ok) {
    return data({ error: revision.mensaje, campo: revision.campo as string | null, valores }, { status: 400 });
  }

  // El mismo «gracias» para quien llenó la trampa: no se le enseña nada.
  const { nombre, telefono, correo } = revision.valor;
  const gracias = {
    ok: true as const,
    nombre: primerNombre(nombre),
    // Por dónde lo van a buscar, para que vea si lo escribió bien.
    respuesta: telefono ? numeroParaLeer(telefono) : correo,
  };
  if (revision.trampa) return gracias;

  const permitido = await servicios.limites.formularios.limit({ key: `formulario:${peticion.ip}` });
  if (!permitido.success) {
    return data(
      {
        error: "Recibimos varios mensajes desde aquí. Espera un minuto e inténtalo de nuevo.",
        campo: null as string | null,
        valores,
      },
      { status: 429 },
    );
  }

  await guardarProspecto(servicios.db, revision.valor);
  return gracias;
}

export function meta({ loaderData }: Route.MetaArgs) {
  const nombre = loaderData?.nombreNegocio ?? "Activos Inmobiliarios Globales";
  return [
    { title: `Contacto | ${nombre}` },
    {
      name: "description",
      content: "Escríbenos por WhatsApp o déjanos tus datos y un asesor te contacta. Morelia, Michoacán.",
    },
  ];
}

type Fallo = { error: string; campo: string | null; valores: Valores };

const esCampo = (campo: unknown): campo is CampoDeProspecto =>
  typeof campo === "string" && (CAMPOS_DE_PROSPECTO as readonly string[]).includes(campo);

export default function Contacto({ loaderData, actionData }: Route.ComponentProps) {
  const { contacto, whatsapp, numeroWhatsApp } = loaderData;
  const navegacion = useNavigation();
  const enviando = navegacion.state === "submitting";
  const gracias = actionData && "ok" in actionData ? actionData : null;
  const fallo: Fallo | null = actionData && "error" in actionData ? actionData : null;

  const hoja = useRef<HTMLElement>(null);
  const altoAntes = useRef<number | null>(null);
  const tituloGracias = useRef<HTMLHeadingElement>(null);

  // Al llegar el «gracias» la hoja no salta a su alto nuevo: se encoge desde el
  // que tenía el formulario (FLIP, antes de pintar), y el foco pasa al título
  // para que un lector de pantalla lo diga. Sin JavaScript llega ya puesto.
  useLayoutEffect(() => {
    if (!gracias) return;
    const nodo = hoja.current;
    const antes = altoAntes.current;
    altoAntes.current = null;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (nodo && antes && !quieto) {
      const ahora = nodo.getBoundingClientRect().height;
      if (Math.abs(ahora - antes) > 2) {
        nodo.style.overflow = "clip";
        const encoge = nodo.animate([{ height: `${antes}px` }, { height: `${ahora}px` }], {
          duration: 480,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        });
        const soltar = () => {
          nodo.style.overflow = "";
        };
        encoge.onfinish = soltar;
        encoge.oncancel = soltar;
      }
    }
    tituloGracias.current?.focus({ preventScroll: true });
    // En el teléfono el formulario mide más que la pantalla y quien lo mandó
    // está abajo, frente al botón: la hoja sube hasta asomar bajo la cabecera
    // (`scroll-mt-24`). `nearest` no serviría: mientras encoge, la hoja todavía
    // tapa la pantalla entera y para él ya «está a la vista».
    if (nodo && nodo.getBoundingClientRect().top < 96) {
      nodo.scrollIntoView({ block: "start", behavior: quieto ? "auto" : "smooth" });
    }
  }, [gracias]);

  return (
    <div
      className="contacto mx-auto max-w-sitio px-5 pt-2 pb-14 sm:pb-20 lg:px-10 lg:pt-5"
      data-listo={gracias ? "" : undefined}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-5 3xl:grid-cols-[minmax(0,1fr)_minmax(0,54rem)]">
        <Mostrador contacto={contacto} whatsapp={whatsapp} numeroWhatsApp={numeroWhatsApp} />

        <section
          ref={hoja}
          aria-labelledby={gracias ? "gracias-titulo" : "formulario-titulo"}
          className={`scroll-mt-24 rounded-[1.75rem] border border-linea bg-superficie px-5 py-8 shadow-tarjeta sm:px-8 sm:py-10 lg:flex lg:flex-col lg:px-12 lg:py-12 3xl:px-14 motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_120ms)] ${gracias ? "lg:justify-center" : ""}`}
        >
          {gracias ? (
            <Gracias
              nombre={gracias.nombre}
              respuesta={gracias.respuesta}
              whatsapp={whatsapp}
              titulo={tituloGracias}
            />
          ) : (
            <FormularioContacto
              fallo={fallo}
              enviando={enviando}
              alMandar={() => {
                altoAntes.current = hoja.current?.getBoundingClientRect().height ?? null;
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

// ─── El mostrador ─────────────────────────────────────────────────

type Canal = {
  clave: string;
  etiqueta: string;
  valor: string;
  icono: ReactNode;
  enlace?: string;
  /** Teléfono y correo se copian: en una computadora `tel:` no lleva a nada. */
  copiable?: boolean;
  debajo?: ReactNode;
};

function Mostrador({
  contacto,
  whatsapp,
  numeroWhatsApp,
}: {
  contacto: Route.ComponentProps["loaderData"]["contacto"];
  whatsapp: string | null;
  numeroWhatsApp: string;
}) {
  const mapa = contacto.direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contacto.direccion)}`
    : null;
  const icono = "h-4 w-4";

  // Solo lo capturado en Panel › Configuración: hoy, en producción, nada. Por
  // eso el mostrador tiene que verse completo sin estos renglones.
  const canales: Canal[] = [];
  if (contacto.telefono) {
    canales.push({
      clave: "telefono",
      etiqueta: "Teléfono",
      valor: contacto.telefono,
      icono: <IconoTelefono className={icono} />,
      enlace: `tel:${contacto.telefono.replace(/[^\d+]/g, "")}`,
      copiable: true,
    });
  }
  if (contacto.correo) {
    canales.push({
      clave: "correo",
      etiqueta: "Correo",
      valor: contacto.correo,
      icono: <IconoCorreo className={icono} />,
      enlace: `mailto:${contacto.correo}`,
      copiable: true,
    });
  }
  if (contacto.direccion) {
    canales.push({
      clave: "oficina",
      etiqueta: "Oficina",
      valor: contacto.direccion,
      icono: <IconoUbicacion className={icono} />,
      debajo: mapa ? (
        <a
          href={mapa}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-bold text-marca-claro underline underline-offset-4"
        >
          Abrir en Mapas<span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      ) : null,
    });
  }
  if (contacto.horario) {
    canales.push({
      clave: "horario",
      etiqueta: "Horario",
      valor: contacto.horario,
      icono: <IconoReloj className={icono} />,
    });
  }

  return (
    <section
      aria-labelledby="contacto-titulo"
      className="campo-oscuro relative flex flex-col overflow-hidden rounded-[1.75rem] bg-tinta px-6 pt-9 text-sobre-oscuro sm:px-9 sm:pt-11 lg:px-12 lg:pt-14 3xl:px-16 3xl:pt-16"
    >
      {/* El titular solo se desliza: es el LCP y nunca se transparenta. */}
      <h1
        id="contacto-titulo"
        className="max-w-[11ch] font-display text-titulo font-light text-white 3xl:text-display motion-safe:animate-entrada-titular motion-safe:[animation-delay:var(--rb,0s)]"
      >
        Hablemos de tu propiedad
      </h1>
      <p className="mt-4 max-w-[34ch] text-guia text-sobre-oscuro-suave motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_80ms)]">
        Escríbenos por WhatsApp y te contestamos en el momento, o déjanos tus datos y un asesor te busca.
      </p>

      {whatsapp ? (
        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_160ms)]">
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="cta-mostrador inline-flex h-13 items-center gap-2.5 rounded-xl bg-marca px-6 font-extrabold text-white transition-[background-color,scale] duration-200 hover:bg-[color-mix(in_oklab,var(--color-marca),white_14%)] active:scale-[0.98]"
          >
            <IconoWhatsApp className="h-5 w-5" />
            Escribir por WhatsApp
          </a>
          {numeroWhatsApp ? <p className="font-semibold text-sobre-oscuro-suave tabular-nums">{numeroWhatsApp}</p> : null}
        </div>
      ) : null}

      {/* El icono va chico junto a la etiqueta y «Copiar» en esa misma línea:
          así el dato tiene todo el ancho. Con un círculo de 44 px y el botón a
          la derecha, el correo de la oficina se partía a media palabra. */}
      {canales.length ? (
        <ul className="mt-9 grid gap-5 border-t border-white/12 pt-7 motion-safe:animate-entrada motion-safe:[animation-delay:calc(var(--rb,0s)_+_220ms)]">
          {canales.map((canal) => (
            <li key={canal.clave} data-canal={canal.clave} className="min-w-0">
              <div className="flex min-h-7 items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm text-sobre-oscuro-suave">
                  <span className="text-marca-claro">{canal.icono}</span>
                  {canal.etiqueta}
                </p>
                {canal.copiable ? <BotonCopiar valor={canal.valor} que={canal.etiqueta.toLowerCase()} /> : null}
              </div>
              {canal.enlace ? (
                <a
                  href={canal.enlace}
                  className="mt-0.5 block text-base font-bold text-white tabular-nums [overflow-wrap:anywhere] hover:underline sm:text-lg"
                >
                  {canal.clave === "correo" ? cortableTrasArroba(canal.valor) : canal.valor}
                </a>
              ) : (
                <p className="mt-0.5 text-base font-bold text-white sm:text-lg">{canal.valor}</p>
              )}
              {canal.debajo}
            </li>
          ))}
        </ul>
      ) : null}

      {/* El dibujo de asesoría de Servicios, en línea clara. Entra solo (sus
          clases) un poco después que el titular, y sus puntos «escriben» una
          vez cada que la persona hace algo: `.contacto` en app.css. */}
      <div
        // En un 2560 el mostrador mide 1 500 px: el dibujo crece con él, o
        // queda un campo de tinta con un dibujo chico en la esquina. Con los
        // datos de la oficina se achica: si no, el mostrador medía 1 086 px
        // contra 702 del formulario (medido a 1440).
        className={`mt-auto -mr-2 w-52 self-end pt-8 sm:w-64 lg:-mr-3 ${
          canales.length
            ? "lg:w-[min(100%,17rem)] 3xl:w-[22rem] 4xl:w-[26rem]"
            : "lg:w-[min(100%,24rem)] 3xl:w-[30rem] 4xl:w-[36rem]"
        }`}
        style={{ "--i": 4 } as CSSProperties}
      >
        <DibujoDeServicio clave="asesoria" className="escena-contacto block h-auto w-full" />
      </div>
    </section>
  );
}

/** Un correo largo se parte después de la «@», nunca a media palabra. */
function cortableTrasArroba(correo: string): ReactNode {
  const arroba = correo.indexOf("@");
  if (arroba < 0) return correo;
  return (
    <>
      {correo.slice(0, arroba + 1)}
      <wbr />
      {correo.slice(arroba + 1)}
    </>
  );
}

function BotonCopiar({ valor, que }: { valor: string; que: string }) {
  const hidratado = useYaHidrato();
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const reloj = window.setTimeout(() => setCopiado(false), 1800);
    return () => window.clearTimeout(reloj);
  }, [copiado]);

  // Sin JavaScript, o sin portapapeles, un botón que no hace nada estorba.
  if (!hidratado || !navigator.clipboard) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(valor).then(
            () => setCopiado(true),
            () => {},
          );
        }}
        className="h-7 shrink-0 rounded-full border border-white/15 px-3 text-xs font-bold text-sobre-oscuro transition-colors hover:border-white/45 hover:text-white"
      >
        {copiado ? "Copiado" : "Copiar"}
        <span className="sr-only"> {que}</span>
      </button>
      <span role="status" className="sr-only">
        {copiado ? `Se copió el ${que}` : ""}
      </span>
    </>
  );
}

// ─── El formulario ────────────────────────────────────────────────

type Errores = Partial<Record<CampoDeProspecto, string>>;

/** Lo mismo que lee el servidor, normalizado igual (`revisarProspecto`). */
function leerDatos(formulario: HTMLFormElement): DatosDeProspecto {
  const datos = new FormData(formulario);
  const texto = (campo: string) =>
    String(datos.get(campo) ?? "")
      .replace(/\s+/g, " ")
      .trim();
  return {
    nombre: texto("nombre"),
    telefono: texto("telefono"),
    correo: normalizarCorreo(texto("correo")),
    acepto: Boolean(datos.get("acepto")),
  };
}

/** Un «no» con la cabeza: firme, sin rebote, y se apaga con «menos movimiento». */
function sacudir(nodo: Element | null | undefined) {
  if (!nodo || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  nodo.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(1.5px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 380, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" },
  );
}

const entradaDe = (formulario: HTMLFormElement, campo: CampoDeProspecto) =>
  formulario.querySelector<HTMLInputElement>(`[name="${campo}"]`);

/** Sacude la caja del campo; el error del par sacude también la del correo. */
function sacudirCampo(formulario: HTMLFormElement, campo: CampoDeProspecto, mensaje?: string) {
  sacudir(entradaDe(formulario, campo)?.closest(".campo-caja, .casilla-fila"));
  if (mensaje === SIN_FORMA_DE_CONTESTAR) sacudir(entradaDe(formulario, "correo")?.closest(".campo-caja"));
}

function FormularioContacto({
  fallo,
  enviando,
  alMandar,
}: {
  fallo: Fallo | null;
  enviando: boolean;
  alMandar: () => void;
}) {
  const hidratado = useYaHidrato();
  const formulario = useRef<HTMLFormElement>(null);
  const aviso = useRef<HTMLParagraphElement>(null);
  const campoDelServidor = fallo && esCampo(fallo.campo) ? fallo.campo : null;
  const valores = fallo?.valores;

  // Lo que dijo el servidor, desde el primer pintado: sin JavaScript es lo único.
  const [errores, setErrores] = useState<Errores>(() =>
    fallo && campoDelServidor ? { [campoDelServidor]: fallo.error } : {},
  );
  // Qué campos ya se pueden juzgar: los que la persona dejó con algo escrito,
  // y todos en cuanto intenta mandar. Antes de eso, nadie regaña a nadie.
  const [vistos, setVistos] = useState<ReadonlySet<CampoDeProspecto>>(
    () => new Set(campoDelServidor ? [campoDelServidor] : []),
  );
  const [bien, setBien] = useState<ReadonlySet<CampoDeProspecto>>(() => new Set());
  const errorDelPar = errores.telefono === SIN_FORMA_DE_CONTESTAR ? errores.telefono : null;

  /**
   * Revisa con la regla del servidor y enseña solo lo de los campos vistos.
   * Mientras se escribe (`soloQuitar`) los errores se van en cuanto se
   * corrigen, pero no aparecen: eso toca al salir del campo o al mandar.
   */
  const revisar = (mostrar: ReadonlySet<CampoDeProspecto>, { soloQuitar = false } = {}) => {
    const nodo = formulario.current;
    if (!nodo) return {};
    const datos = leerDatos(nodo);
    const problemas = problemasDeProspecto(datos);
    setErrores((antes) => {
      const siguen: Errores = {};
      for (const campo of CAMPOS_DE_PROSPECTO) {
        if (!mostrar.has(campo) || !problemas[campo]) continue;
        if (soloQuitar && !antes[campo]) continue;
        siguen[campo] = problemas[campo];
      }
      return siguen;
    });
    setBien(new Set(CAMPOS_DE_PROSPECTO.filter((c) => c !== "acepto" && mostrar.has(c) && !problemas[c] && datos[c])));
    return problemas;
  };

  const alSalir = (evento: FocusEvent<HTMLFormElement>) => {
    const entrada: EventTarget = evento.target;
    if (!(entrada instanceof HTMLInputElement)) return;
    const campo = entrada.name;
    if (!esCampo(campo) || campo === "acepto") return;
    // Pasar por un campo vacío no es un error todavía.
    if (!entrada.value.trim() && !vistos.has(campo)) return;
    const mostrar = new Set(vistos).add(campo);
    setVistos(mostrar);
    revisar(mostrar);
  };

  const alCambiar = () => {
    if (vistos.size) revisar(vistos, { soloQuitar: true });
  };

  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    const todos = new Set(CAMPOS_DE_PROSPECTO);
    setVistos(todos);
    const problemas = revisar(todos);
    const fallan = CAMPOS_DE_PROSPECTO.filter((campo) => problemas[campo]);
    if (!fallan.length) {
      alMandar();
      return;
    }
    evento.preventDefault();
    const nodo = evento.currentTarget;
    for (const campo of fallan) sacudirCampo(nodo, campo, problemas[campo]);
    entradaDe(nodo, fallan[0])?.focus();
  };

  // Lo que el servidor rechazó cae en su campo, con el mismo gesto.
  useEffect(() => {
    if (!fallo) return;
    const nodo = formulario.current;
    const campo = esCampo(fallo.campo) ? fallo.campo : null;
    if (!nodo) return;
    if (!campo) {
      aviso.current?.focus();
      return;
    }
    setVistos((antes) => new Set(antes).add(campo));
    setErrores((antes) => ({ ...antes, [campo]: fallo.error }));
    sacudirCampo(nodo, campo, fallo.error);
    entradaDe(nodo, campo)?.focus();
  }, [fallo]);

  // Un botón de radio no se desmarca solo, y elegir es opcional: tocar otra vez
  // la opción marcada la suelta.
  const alTocarMotivo = (evento: MouseEvent<HTMLInputElement>) => {
    const opcion = evento.currentTarget;
    if (opcion.dataset.marcado === "si") {
      opcion.checked = false;
      delete opcion.dataset.marcado;
      return;
    }
    for (const otra of opcion.form?.querySelectorAll<HTMLInputElement>('input[name="motivo"]') ?? []) {
      delete otra.dataset.marcado;
    }
    opcion.dataset.marcado = "si";
  };

  return (
    <Form
      ref={formulario}
      method="post"
      // Con JavaScript avisa este formulario, junto al campo; sin él, el
      // navegador con sus globos y el servidor con su respuesta.
      noValidate={hidratado}
      onSubmit={alEnviar}
      onBlur={alSalir}
      onChange={alCambiar}
      className="formulario-contacto flex flex-col gap-7 lg:flex-1"
    >
      <div>
        <h2 id="formulario-titulo" className="font-display text-seccion text-tinta">
          Déjanos tus datos
        </h2>
        <p className="mt-2 text-texto-suave">Un asesor te busca por teléfono o por correo.</p>
      </div>

      <fieldset className="min-w-0">
        <legend className="text-sm font-bold text-tinta">
          ¿Qué necesitas? <span className="font-medium text-texto-suave">(opcional)</span>
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {MOTIVOS_DE_CONTACTO.map((motivo) => (
            <label key={motivo.valor} className="opcion">
              <input
                type="radio"
                name="motivo"
                value={motivo.valor}
                defaultChecked={valores?.motivo === motivo.valor}
                data-marcado={valores?.motivo === motivo.valor ? "si" : undefined}
                onClick={alTocarMotivo}
                className="sr-only"
              />
              {motivo.etiqueta}
            </label>
          ))}
        </div>
      </fieldset>

      <Campo
        nombre="nombre"
        etiqueta="Tu nombre"
        error={errores.nombre}
        bien={bien.has("nombre")}
        autoComplete="name"
        required
        minLength={2}
        maxLength={80}
        defaultValue={valores?.nombre}
      />

      <div>
        <div className="grid gap-7 sm:grid-cols-2 sm:gap-4">
          <Campo
            nombre="telefono"
            etiqueta="Tu teléfono"
            error={errorDelPar ? undefined : errores.telefono}
            invalido={Boolean(errorDelPar)}
            bien={bien.has("telefono")}
            describe={errorDelPar ? "contacto-par-error" : "contacto-uno-de-dos"}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={30}
            placeholder="443 123 4567"
            defaultValue={valores?.telefono}
          />
          <Campo
            nombre="correo"
            etiqueta="Tu correo"
            error={errores.correo}
            invalido={Boolean(errorDelPar)}
            bien={bien.has("correo")}
            describe={errorDelPar ? "contacto-par-error" : "contacto-uno-de-dos"}
            type="email"
            autoComplete="email"
            maxLength={254}
            placeholder="tu@correo.com"
            defaultValue={valores?.correo}
          />
        </div>
        {/* «Uno de los dos» es un error del PAR, no del teléfono: sale debajo
            de los dos, en el lugar de la nota que ya lo pedía. */}
        {errorDelPar ? (
          <MensajeDeError id="contacto-par-error">{errorDelPar}</MensajeDeError>
        ) : (
          <p id="contacto-uno-de-dos" className="mt-2.5 text-[0.8125rem] text-texto-suave">
            Con uno de los dos nos basta para contestarte.
          </p>
        )}
      </div>

      {/* Si el mostrador es más alto que el formulario (con los datos de la
          oficina capturados), el mensaje crece hasta llenar la hoja en vez de
          dejar un hueco blanco debajo del botón. */}
      <div className="lg:flex lg:flex-1 lg:flex-col">
        <label htmlFor="contacto-mensaje" className="block text-sm font-bold text-tinta">
          ¿En qué te ayudamos? <span className="font-medium text-texto-suave">(opcional)</span>
        </label>
        <span className="campo-caja campo-crece mt-2">
          <textarea
            id="contacto-mensaje"
            name="mensaje"
            rows={4}
            maxLength={1000}
            placeholder="Por ejemplo: busco casa de 3 recámaras en Altozano, hasta 4 millones."
            defaultValue={valores?.mensaje}
          />
        </span>
      </div>

      {/* Campo trampa: una persona no lo ve, un programa lo llena. */}
      <input
        type="text"
        name="empresa"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      {fallo && !campoDelServidor ? (
        <p
          ref={aviso}
          role="alert"
          tabIndex={-1}
          className="rounded-xl border border-marca/30 bg-marca-suave px-4 py-3 text-sm font-semibold text-marca-oscuro focus:outline-none"
        >
          {fallo.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-5 border-t border-linea pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <label className="casilla-fila flex items-start gap-3 text-sm leading-snug text-texto">
            <span className="casilla">
              <input
                type="checkbox"
                name="acepto"
                required
                aria-invalid={errores.acepto ? true : undefined}
                aria-describedby={errores.acepto ? "contacto-acepto-error" : undefined}
              />
              <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  pathLength={1}
                  d="M2.75 7.4l2.9 2.9L11.4 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>
              Acepto el{" "}
              {/* En otra pestaña: leer el aviso no debe borrar lo que ya se escribió. */}
              <a
                href="/aviso-de-privacidad"
                target="_blank"
                rel="noopener"
                className="font-bold text-marca underline underline-offset-4"
              >
                aviso de privacidad<span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
              .
            </span>
          </label>
          {errores.acepto ? <MensajeDeError id="contacto-acepto-error">{errores.acepto}</MensajeDeError> : null}
        </div>

        <button
          type="submit"
          disabled={enviando}
          aria-busy={enviando || undefined}
          className="boton-enviar w-full sm:w-auto"
        >
          <span>{enviando ? "Enviando…" : "Enviar mensaje"}</span>
          <svg viewBox="0 0 30 16" className="flecha-estelas" fill="none" aria-hidden="true">
            {/* Las estelas del isotipo: alineadas a la derecha, como las suyas. */}
            <rect className="estela" x="5" y="3" width="7" height="2" rx="1" fill="currentColor" />
            <rect className="estela" x="2" y="7" width="10" height="2" rx="1" fill="currentColor" />
            <rect className="estela" x="6" y="11" width="6" height="2" rx="1" fill="currentColor" />
            <path
              className="punta"
              d="M15 8h12.5M22.5 3l5 5-5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </Form>
  );
}

function Campo({
  nombre,
  etiqueta,
  error,
  invalido = false,
  bien,
  describe,
  ...entrada
}: {
  nombre: CampoDeProspecto;
  etiqueta: string;
  error?: string;
  /** En falta sin mensaje propio: el del par sale debajo de los dos. */
  invalido?: boolean;
  bien?: boolean;
  /** Una nota o un error compartido con otro campo (el par teléfono/correo). */
  describe?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = `contacto-${nombre}`;
  const idError = `${id}-error`;
  const descripcion = [error ? idError : null, describe].filter(Boolean).join(" ") || undefined;
  const mal = Boolean(error) || invalido;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-bold text-tinta">
        {etiqueta}
      </label>
      <span className="campo-caja mt-2">
        <input
          id={id}
          name={nombre}
          aria-invalid={mal ? true : undefined}
          aria-describedby={descripcion}
          className="scroll-mt-28 scroll-mb-8"
          {...entrada}
        />
        {bien && !mal ? (
          <svg viewBox="0 0 18 18" className="campo-bien" fill="none" aria-hidden="true">
            <path
              pathLength={1}
              d="M4 9.5l3.2 3.2L14 5.8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      {error ? <MensajeDeError id={idError}>{error}</MensajeDeError> : null}
    </div>
  );
}

function MensajeDeError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="campo-error">
      <svg
        viewBox="0 0 16 16"
        className="mt-px h-3.5 w-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 4.75v3.75M8 11.1v.15" />
      </svg>
      {children}
    </p>
  );
}

// ─── El gracias ───────────────────────────────────────────────────

/** El globo rojo del asesor en el dibujo: aquí llega con una palomita. */
const GLOBO_RESPUESTA =
  "M68 56H112A12 12 0 0 1 124 68V82A12 12 0 0 1 112 94H82L58 108L68 94A12 12 0 0 1 56 82V68A12 12 0 0 1 68 56Z";

function Gracias({
  nombre,
  respuesta,
  whatsapp,
  titulo,
}: {
  nombre: string;
  respuesta: string;
  whatsapp: string | null;
  titulo: RefObject<HTMLHeadingElement | null>;
}) {
  const porCorreo = respuesta.includes("@");
  return (
    <div className="flex flex-col items-start">
      <svg viewBox="52 52 76 60" className="h-17 w-auto overflow-visible" aria-hidden="true">
        <g className="exito-globo">
          <path d={GLOBO_RESPUESTA} fill="var(--color-marca)" />
          <path
            className="exito-palomita"
            pathLength={1}
            d="M77.5 75.5l7 7L98 69"
            fill="none"
            stroke="#fff"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>

      <h2
        id="gracias-titulo"
        ref={titulo}
        tabIndex={-1}
        className="mt-7 font-display text-seccion text-tinta focus:outline-none motion-safe:animate-entrada motion-safe:[animation-delay:120ms]"
      >
        Ya tenemos tu mensaje
      </h2>
      <p className="mt-3 max-w-[44ch] text-guia text-texto-suave motion-safe:animate-entrada motion-safe:[animation-delay:200ms]">
        {nombre ? `Gracias, ${nombre}. ` : "Gracias. "}
        {respuesta ? (
          <>
            Un asesor te {porCorreo ? "escribe" : "busca"} pronto {porCorreo ? "a" : "al"}{" "}
            <span className="font-bold text-tinta tabular-nums [overflow-wrap:anywhere]">{respuesta}</span>.{" "}
          </>
        ) : (
          "Un asesor te contacta pronto. "
        )}
        Si prefieres no esperar, escríbenos por WhatsApp.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3 motion-safe:animate-entrada motion-safe:[animation-delay:280ms]">
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-13 items-center gap-2.5 rounded-xl bg-marca px-6 font-extrabold text-white transition-[background-color,scale] duration-200 hover:bg-marca-oscuro active:scale-[0.98]"
          >
            <IconoWhatsApp className="h-5 w-5" />
            Escribir por WhatsApp
          </a>
        ) : null}
        <Link
          to="/propiedades"
          viewTransition
          className="group inline-flex h-13 items-center gap-2 rounded-xl border border-linea px-5 font-extrabold text-tinta transition-colors hover:border-tinta"
        >
          Ver propiedades
          <IconoFlecha className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
