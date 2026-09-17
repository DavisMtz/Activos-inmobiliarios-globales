import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

/** Piezas pequeñas del panel. Nada de aquí se usa en el sitio público. */

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

type CampoProps = InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string };

export function Campo({ etiqueta, ayuda, ...props }: CampoProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-tinta">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
        className="h-12 rounded-xl border border-linea bg-superficie px-4 text-base text-tinta transition-colors outline-none placeholder:text-texto-suave/70 focus:border-marca"
        {...props}
      />
      {ayuda ? (
        <p id={`${id}-ayuda`} className="text-sm text-texto-suave">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

/** Campo de contraseña con botón para verla: en el celular se escribe a ciegas. */
export function CampoClave(props: Omit<CampoProps, "type">) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const { etiqueta, ayuda, ...resto } = props;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-tinta">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
          className="h-12 w-full rounded-xl border border-linea bg-superficie pr-20 pl-4 text-base text-tinta transition-colors outline-none focus:border-marca"
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
      {ayuda ? (
        <p id={`${id}-ayuda`} className="text-sm text-texto-suave">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

export function Aviso({ tono = "error", children }: { tono?: "error" | "info"; children: ReactNode }) {
  const estilos =
    tono === "error" ? "border-marca/30 bg-marca-suave text-marca-oscuro" : "border-linea bg-superficie text-texto";
  return (
    <p role={tono === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${estilos}`}>
      {children}
    </p>
  );
}

export function BotonPrincipal({ children, ocupado }: { children: ReactNode; ocupado?: boolean }) {
  return (
    <button
      type="submit"
      disabled={ocupado}
      className="h-12 w-full rounded-xl bg-marca px-5 text-base font-extrabold text-white transition-colors hover:bg-marca-oscuro disabled:cursor-wait disabled:opacity-70"
    >
      {children}
    </button>
  );
}
