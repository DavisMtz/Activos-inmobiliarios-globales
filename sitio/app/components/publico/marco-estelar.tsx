import type { ReactNode } from "react";

/**
 * La orilla del panel recorrida por un destello: la señal de que el buscador
 * está entendiendo —o ya entendió— una frase. Va en el BORDE y no en una nota
 * debajo (pedido del 20/09/2026): lo que hay que leer no es «se usó la IA»,
 * sino los filtros con los que se quedó, y esos ahora van ARRIBA del buscador
 * («Así lo entendimos», `entendido.tsx`).
 *
 * Adaptado del `StarBorder` de React Bits (variante JS + CSS, sin ninguna
 * dependencia). Lo que cambió del original, y por qué:
 * - El original ES un `<button>` negro con el texto centrado. Aquí envuelve un
 *   panel que ya trae su borde, su fondo y sus campos dentro, así que el
 *   contenedor es un `div` y el panel conserva sus propias clases.
 * - Sus colores (blanco sobre negro) no son de esta marca: el destello es el
 *   rojo `--color-marca` y el halo quieto, `--color-marca-suave`.
 * - El `overflow: hidden` que hace falta para que las manchas no se salgan
 *   recorta la sombra del panel, así que la sombra se pasa al marco de afuera
 *   (`marco`), que es el que la dibuja.
 *
 * Cómo está hecho: dos manchas redondas (`radial-gradient`) más anchas que el
 * panel se deslizan de un extremo al otro, una por arriba y otra por abajo. El
 * panel va encima y es opaco, así que de las manchas solo se ve lo que asoma
 * por la orilla. Todo el movimiento es CSS (`app.css`, `.marco-estelar`): no se
 * ejecuta JavaScript para animarlo.
 *
 * Con «menos movimiento» las manchas no se dibujan y queda el halo quieto: la
 * señal se conserva sin que nada se mueva.
 */
export function MarcoEstelar({
  activo,
  velocidad = "5s",
  marco = "",
  className = "",
  children,
}: {
  /** Encendido mientras el buscador entiende, y mientras lo entendido siga puesto. */
  activo: boolean;
  /** Lo que tarda el destello en cruzar de un lado al otro. */
  velocidad?: string;
  /** Clases del marco de afuera: márgenes, sombra y la entrada de la portada. */
  marco?: string;
  /** Clases del panel de adentro: borde, fondo y relleno. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`marco-estelar ${marco}`} data-activo={activo || undefined}>
      {activo ? (
        <>
          <span aria-hidden className="destello destello-arriba" style={{ animationDuration: velocidad }} />
          <span aria-hidden className="destello destello-abajo" style={{ animationDuration: velocidad }} />
        </>
      ) : null}
      <div className={`marco-estelar-panel ${className}`}>{children}</div>
    </div>
  );
}
