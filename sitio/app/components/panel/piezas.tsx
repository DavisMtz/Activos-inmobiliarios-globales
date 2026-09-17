import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Link } from "react-router";

/**
 * Piezas del panel. Nada de aquí se usa en el sitio público, ni al revés: son
 * dos paquetes separados (PLAN §11.1).
 *
 * El panel es una herramienta, no un folleto: una sola tipografía (Nunito, la
 * misma que carga `root.tsx`; la serif editorial se queda en el sitio público),
 * escala de tamaños fija —no fluida—, y el rojo de la marca reservado para la
 * acción principal, lo seleccionado y los estados. Lo demás es papel y tinta.
 */

// ─── Acceso (entrar y elegir contraseña) ──────────────────────────

export function MarcoAcceso({ titulo, bajada, children }: { titulo: string; bajada?: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden bg-tinta lg:block">
        {/* Franjas en diagonal con el rojo y el vino del logotipo. */}
        <div aria-hidden className="absolute -top-24 -left-40 h-[140%] w-40 rotate-[24deg] bg-marca" />
        <div aria-hidden className="absolute -top-24 left-4 h-[140%] w-10 rotate-[24deg] bg-marca-oscuro" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="text-sm font-bold tracking-[0.2em] text-white/70 uppercase">Panel privado</p>
          <p className="mt-3 max-w-sm text-3xl leading-tight font-extrabold text-balance">
            Donde cada propiedad cuenta una historia
          </p>
        </div>
      </aside>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <img
            src="/marca/logo-1@2x.png"
            alt="Activos Inmobiliarios Globales"
            width={512}
            height={75}
            className="h-auto w-64"
          />
          <h1 className="mt-10 text-2xl font-extrabold text-tinta">{titulo}</h1>
          {bajada ? <div className="mt-2 text-texto-suave">{bajada}</div> : null}
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}

// ─── Campos ───────────────────────────────────────────────────────

const CAMPO =
  "h-12 w-full rounded-xl border border-linea bg-superficie px-4 text-base text-tinta transition-colors outline-none placeholder:text-texto-suave/70 focus:border-marca disabled:cursor-not-allowed disabled:bg-fondo disabled:text-texto-suave";

type Etiquetado = { etiqueta: string; ayuda?: ReactNode; error?: string | null };

function Envoltura({ id, etiqueta, ayuda, error, children }: Etiquetado & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-tinta">
        {etiqueta}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-semibold text-marca">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="text-sm text-texto-suave">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

export function Campo({ etiqueta, ayuda, error, ...props }: InputHTMLAttributes<HTMLInputElement> & Etiquetado) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
        className={CAMPO}
        {...props}
      />
    </Envoltura>
  );
}

export function CampoSelect({
  etiqueta,
  ayuda,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & Etiquetado) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <select id={id} aria-invalid={error ? true : undefined} className={`${CAMPO} px-3`} {...props}>
        {children}
      </select>
    </Envoltura>
  );
}

export function CampoTexto({
  etiqueta,
  ayuda,
  error,
  filas = 5,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & Etiquetado & { filas?: number }) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <textarea
        id={id}
        rows={filas}
        aria-invalid={error ? true : undefined}
        className={`${CAMPO} h-auto py-3 leading-relaxed`}
        {...props}
      />
    </Envoltura>
  );
}

/** Campo de contraseña con botón para verla: en el celular se escribe a ciegas. */
export function CampoClave({ etiqueta, ayuda, error, ...resto }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & Etiquetado) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
          className={`${CAMPO} pr-20`}
          {...resto}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-controls={id}
          aria-pressed={visible}
          className="absolute inset-y-1 right-1 rounded-lg px-3 text-sm font-bold text-marca transition-colors hover:bg-marca-suave"
        >
          {visible ? "Ocultar" : "Ver"}
        </button>
      </div>
    </Envoltura>
  );
}

// ─── Botones ──────────────────────────────────────────────────────

type Tono = "principal" | "secundario" | "fantasma" | "peligro";

const TONOS: Record<Tono, string> = {
  principal: "bg-marca text-white hover:bg-marca-oscuro",
  secundario: "border border-linea bg-superficie text-tinta hover:border-marca hover:text-marca",
  fantasma: "text-tinta hover:bg-marca-suave hover:text-marca-oscuro",
  peligro: "border border-marca/30 bg-marca-suave text-marca-oscuro hover:border-marca",
};

const BASE_BOTON =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function Boton({
  tono = "principal",
  ocupado,
  ancho,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tono?: Tono; ocupado?: boolean; ancho?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || ocupado}
      aria-busy={ocupado || undefined}
      className={`${BASE_BOTON} ${TONOS[tono]} ${ancho ? "w-full" : ""} ${ocupado ? "cursor-wait" : ""}`}
    >
      {children}
    </button>
  );
}

/** El de siempre, para los formularios de acceso. */
export function BotonPrincipal({ children, ocupado }: { children: ReactNode; ocupado?: boolean }) {
  return (
    <Boton type="submit" ocupado={ocupado} ancho>
      {children}
    </Boton>
  );
}

export function BotonEnlace({
  a,
  tono = "secundario",
  children,
  ...props
}: { a: string; tono?: Tono; children: ReactNode } & { className?: string }) {
  return (
    <Link to={a} {...props} className={`${BASE_BOTON} ${TONOS[tono]} ${props.className ?? ""}`}>
      {children}
    </Link>
  );
}

// ─── Avisos, etiquetas y superficies ──────────────────────────────

export function Aviso({ tono = "error", children }: { tono?: "error" | "info" | "exito"; children: ReactNode }) {
  const estilos = {
    error: "border-marca/30 bg-marca-suave text-marca-oscuro",
    info: "border-linea bg-superficie text-texto",
    exito: "border-exito/30 bg-exito/10 text-exito",
  }[tono];
  return (
    <p
      role={tono === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm font-semibold ${estilos}`}
    >
      {children}
    </p>
  );
}

export type TonoEtiqueta = "neutro" | "marca" | "aviso" | "exito" | "tinta";

const TONOS_ETIQUETA: Record<TonoEtiqueta, string> = {
  neutro: "bg-fondo text-texto-suave",
  marca: "bg-marca-suave text-marca-oscuro",
  aviso: "bg-aviso/10 text-aviso",
  exito: "bg-exito/10 text-exito",
  tinta: "bg-tinta text-white",
};

export function Etiqueta({ tono = "neutro", children }: { tono?: TonoEtiqueta; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${TONOS_ETIQUETA[tono]}`}>
      {children}
    </span>
  );
}

/** Una superficie con su título: la unidad con la que se arman las pantallas. */
export function Bloque({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo?: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-linea bg-superficie">
      {titulo ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-linea px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-tinta">{titulo}</h2>
            {descripcion ? <p className="mt-1 text-sm text-texto-suave">{descripcion}</p> : null}
          </div>
          {acciones}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

/**
 * Lo que se enseña cuando no hay nada. Dice qué es esto y cuál es el siguiente
 * paso: un «no hay datos» a secas deja a la persona sin saber qué hacer.
 */
export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <p className="text-lg font-bold text-tinta">{titulo}</p>
      {children ? <p className="max-w-sm text-texto-suave">{children}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}
