/**
 * Iconos del panel. Mismo trazo (1.75) y misma rejilla (24) que los del sitio
 * público, para que se lean como una familia, pero en su propio archivo a
 * propósito: el panel y el sitio público no comparten ni un módulo de interfaz,
 * y así navegar el sitio no descarga nada del panel (PLAN §11.1, criterio 8 de
 * F3). Son cuatro glifos repetidos; el aislamiento vale más que las líneas.
 *
 * Nunca emojis: un emoji lo dibuja el sistema operativo y cambia de estilo,
 * de peso y de color en cada máquina.
 */

import type { ReactNode } from "react";

type Props = { className?: string };

const trazo = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Marco({ className, children }: Props & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className ?? "h-5 w-5"} {...trazo}>
      {children}
    </svg>
  );
}

// ─── Secciones ────────────────────────────────────────────────────

/** Un tablero, no una casa: al lado de «Casas» dos casas se leen igual. */
export const IconoInicio = ({ className }: Props) => (
  <Marco className={className}>
    <rect x="3.75" y="3.75" width="7" height="7" rx="1.75" />
    <rect x="13.25" y="3.75" width="7" height="7" rx="1.75" />
    <rect x="3.75" y="13.25" width="7" height="7" rx="1.75" />
    <rect x="13.25" y="13.25" width="7" height="7" rx="1.75" />
  </Marco>
);

export const IconoCasas = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M4 20.25V9.5l6-4.5 6 4.5v10.75" />
    <path d="M16 12.5h4v7.75M2.75 20.25h18.5" />
    <path d="M8.5 20.25v-4.5h3v4.5" />
  </Marco>
);

export const IconoFotos = ({ className }: Props) => (
  <Marco className={className}>
    <rect x="3" y="4.75" width="18" height="14.5" rx="2.25" />
    <circle cx="8.75" cy="10" r="1.6" />
    <path d="m3.5 17 4.6-4.2a1.8 1.8 0 0 1 2.4 0l3.4 3.1M13 14.6l2.1-1.9a1.8 1.8 0 0 1 2.4 0l3 2.7" />
  </Marco>
);

export const IconoContenido = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M5 3.75h14v16.5H5z" />
    <path d="M8.25 8h7.5M8.25 11.5h7.5M8.25 15h4.5" />
  </Marco>
);

/** Un regalo: al entregar una casa se lleva un obsequio y se toma la foto. */
export const IconoEntregas = ({ className }: Props) => (
  <Marco className={className}>
    <rect x="3.75" y="8.5" width="16.5" height="4" rx="1" />
    <path d="M5.5 12.5v7.75h13V12.5M12 8.5v11.75" />
    <path d="M12 8.5c-1.6-3.6-5.4-3.9-5.4-1.6 0 1.3 2 1.6 5.4 1.6Zm0 0c1.6-3.6 5.4-3.9 5.4-1.6 0 1.3-2 1.6-5.4 1.6Z" />
  </Marco>
);

export const IconoConfiguracion = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
    <circle cx="9" cy="7" r="2.1" />
    <circle cx="15" cy="12" r="2.1" />
    <circle cx="8" cy="17" r="2.1" />
  </Marco>
);

export const IconoUsuarios = ({ className }: Props) => (
  <Marco className={className}>
    <circle cx="9.5" cy="8.5" r="3.25" />
    <path d="M3.75 20c0-3.2 2.6-5.25 5.75-5.25S15.25 16.8 15.25 20" />
    <path d="M16 6.1a3.25 3.25 0 0 1 0 6.3M17.5 15.2c1.7.7 2.75 2.2 2.75 4.8" />
  </Marco>
);

export const IconoBitacora = ({ className }: Props) => (
  <Marco className={className}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 7.5V12l3 1.8" />
  </Marco>
);

export const IconoCuenta = ({ className }: Props) => (
  <Marco className={className}>
    <circle cx="12" cy="8.25" r="3.5" />
    <path d="M5 20c0-3.6 3.1-5.75 7-5.75S19 16.4 19 20" />
  </Marco>
);

export const IconoSistema = ({ className }: Props) => (
  <Marco className={className}>
    <circle cx="12" cy="12" r="2.75" />
    <path d="M12 3.25v2.4M12 18.35v2.4M4.8 7.9l2.1 1.2M17.1 14.9l2.1 1.2M4.8 16.1l2.1-1.2M17.1 9.1l2.1-1.2" />
  </Marco>
);

export const IconoProspectos = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M4 6.5h16v11H8.5L4 20.5z" />
    <path d="M8 10.5h8M8 13.5h5" />
  </Marco>
);

/** Barras, que es como se ven las métricas aquí: cifras, no gráficas. */
export const IconoMetricas = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M3.75 20.25h16.5" />
    <path d="M7 20V12M12 20V5.5M17 20v-5.5" />
  </Marco>
);

// ─── Interfaz ─────────────────────────────────────────────────────

export const IconoMenuPanel = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
  </Marco>
);

export const IconoSalir = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M14.5 4.75H6.5a1.75 1.75 0 0 0-1.75 1.75v11a1.75 1.75 0 0 0 1.75 1.75h8" />
    <path d="M16 8.5 19.5 12 16 15.5M19.5 12h-8" />
  </Marco>
);

export const IconoAdelante = ({ className }: Props) => (
  <Marco className={className}>
    <path d="m9.5 6 6 6-6 6" />
  </Marco>
);

export const IconoAtras = ({ className }: Props) => (
  <Marco className={className}>
    <path d="m14.5 6-6 6 6 6" />
  </Marco>
);

/** La foto que encabeza la casa. */
export const IconoPortada = ({ className }: Props) => (
  <Marco className={className}>
    <path d="m12 4.4 2.4 4.85 5.35.78-3.87 3.77.91 5.33L12 16.6l-4.79 2.52.91-5.33-3.87-3.77 5.35-.78z" />
  </Marco>
);

export const IconoMas = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M12 5.25v13.5M5.25 12h13.5" />
  </Marco>
);

export const IconoBuscarPanel = ({ className }: Props) => (
  <Marco className={className}>
    <circle cx="10.5" cy="10.5" r="6.75" />
    <path d="m15.4 15.4 4.85 4.85" />
  </Marco>
);

export const IconoAtencion = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M12 4.75 21 19.25H3z" />
    <path d="M12 10v4M12 16.75v.5" />
  </Marco>
);

export const IconoListo = ({ className }: Props) => (
  <Marco className={className}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="m8.5 12.25 2.5 2.5 4.5-5" />
  </Marco>
);
