/**
 * Iconos dibujados, nunca emojis ni caracteres sueltos. Los de interfaz van
 * todos con el mismo trazo (1.75) y el mismo tamaño de rejilla (24), para que
 * se lean como una familia; los de las redes son sus marcas, que son macizas.
 *
 * Son SVG en línea y no un paquete: la ficha pinta media docena y traer una
 * biblioteca entera costaría más que estas líneas (tope de 150 KB, PLAN §10.4).
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

function Marco({ className, children, macizo = false }: Props & { children: ReactNode; macizo?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className ?? "h-5 w-5"}
      {...(macizo ? { fill: "currentColor" } : trazo)}
    >
      {children}
    </svg>
  );
}

// ─── Redes y contacto ─────────────────────────────────────────────

export const IconoWhatsApp = ({ className }: Props) => (
  <Marco className={className} macizo>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413" />
  </Marco>
);

export const IconoFacebook = ({ className }: Props) => (
  <Marco className={className} macizo>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073" />
  </Marco>
);

export const IconoInstagram = ({ className }: Props) => (
  <Marco className={className}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
  </Marco>
);

export const IconoTelefono = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M5.5 3.5h3l1.5 4-2 1.4a12.5 12.5 0 0 0 5.6 5.6l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.7a2 2 0 0 1 2-2.2Z" />
  </Marco>
);

export const IconoCorreo = ({ className }: Props) => (
  <Marco className={className}>
    <rect x="2.75" y="5" width="18.5" height="14" rx="2.5" />
    <path d="m3.5 7.5 7.4 5.2a2 2 0 0 0 2.2 0l7.4-5.2" />
  </Marco>
);

export const IconoUbicacion = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M12 21.5s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
    <circle cx="12" cy="10.2" r="2.6" />
  </Marco>
);

// ─── Interfaz ─────────────────────────────────────────────────────

export const IconoBuscar = ({ className }: Props) => (
  <Marco className={className}>
    <circle cx="10.5" cy="10.5" r="6.75" />
    <path d="m15.4 15.4 4.85 4.85" />
  </Marco>
);

export const IconoMenu = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
  </Marco>
);

export const IconoCerrar = ({ className }: Props) => (
  <Marco className={className}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Marco>
);

export const IconoFlecha = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M4.5 12h15m0 0-5.5-5.5M19.5 12 14 17.5" />
  </Marco>
);

/** El «+» de las preguntas frecuentes: girado 45° es la «×» de cerrar. */
export const IconoMas = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M12 5v14M5 12h14" />
  </Marco>
);

// Pausa y reproducir van macizos, como en cualquier reproductor: es la forma
// que la gente ya reconoce, y van chicos (14 px) dentro de su botón.
export const IconoPausa = ({ className }: Props) => (
  <Marco className={className} macizo>
    <rect x="6" y="4.5" width="4" height="15" rx="1.25" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.25" />
  </Marco>
);

export const IconoReproducir = ({ className }: Props) => (
  <Marco className={className} macizo>
    <path d="M7.5 5.6v12.8a1.1 1.1 0 0 0 1.68.93l10.1-6.4a1.1 1.1 0 0 0 0-1.86l-10.1-6.4A1.1 1.1 0 0 0 7.5 5.6Z" />
  </Marco>
);

// ─── Características de una casa ──────────────────────────────────

export const IconoRecamara = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M3 18.5v-11M3 12h18v6.5M21 18.5v-2.2" />
    <path d="M6.5 12V9.25a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5V12" />
  </Marco>
);

export const IconoBano = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M3.5 12h17v2a5 5 0 0 1-5 5h-7a5 5 0 0 1-5-5v-2Z" />
    <path d="M6.5 12V6.25A2.25 2.25 0 0 1 8.75 4a2.2 2.2 0 0 1 2.1 1.5M6.5 19.5 5.5 21m12-1.5 1 1.5" />
  </Marco>
);

export const IconoEstacionamiento = ({ className }: Props) => (
  <Marco className={className}>
    <path d="M4 16.5h16M5.5 16.5v2.25M18.5 16.5v2.25" />
    <path d="M5.2 16.5 6.8 9.8A2 2 0 0 1 8.75 8.25h6.5a2 2 0 0 1 1.95 1.55l1.6 6.7" />
    <path d="M7.75 13h8.5" />
  </Marco>
);

export const IconoSuperficie = ({ className }: Props) => (
  <Marco className={className}>
    <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="1.5" />
    <path d="M3.75 9.25h3M3.75 14.75h3M9.25 3.75v3M14.75 3.75v3" />
  </Marco>
);
