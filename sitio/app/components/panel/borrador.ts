/**
 * Copia local de lo que se está capturando, para que cerrar la pestaña de golpe
 * no cueste media hora de trabajo.
 *
 * **Es caché, no almacén.** Lo que vale es lo que está en la base; esto solo
 * evita perder lo que todavía no se ha guardado. Si el navegador no deja
 * escribir (modo privado, cuota llena), se cae a memoria y la pantalla sigue
 * funcionando igual: nunca se rompe el formulario por no poder copiar.
 *
 * Por qué aquí y no en el servidor: §11.2 pide guardado automático «cada pocos
 * segundos», y cada uno contra D1 sería una escritura y una fila de bitácora
 * por tecleo, con lo que la bitácora dejaría de servir para saber quién cambió
 * qué. El servidor escribe cuando la persona dice «Guardar».
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Subir la versión purga lo viejo sin escribir ninguna migración. */
const PREFIJO = "aig:panel:v1:casa:";
const DIAS = 14;
const FRENO_MS = 800;

export type Valores = Record<string, string>;
type Guardado = { cuando: number; datos: Valores };

/** Cuando `localStorage` no está disponible, esto hace su papel en memoria. */
const enMemoria = new Map<string, string>();

function leerCrudo(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return enMemoria.get(clave) ?? null;
  }
}

function escribirCrudo(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    enMemoria.set(clave, valor);
  }
}

function borrarCrudo(clave: string): void {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    enMemoria.delete(clave);
  }
}

/** Tira lo caducado, lo corrupto y lo de versiones anteriores. */
function purgar(): void {
  try {
    const vencido = Date.now() - DIAS * 86_400_000;
    for (const clave of Object.keys(window.localStorage)) {
      if (!clave.startsWith("aig:panel:")) continue;
      if (!clave.startsWith(PREFIJO)) {
        window.localStorage.removeItem(clave);
        continue;
      }
      try {
        const guardado = JSON.parse(window.localStorage.getItem(clave) ?? "") as Guardado;
        if (!guardado?.cuando || guardado.cuando < vencido) window.localStorage.removeItem(clave);
      } catch {
        window.localStorage.removeItem(clave);
      }
    }
  } catch {
    // Sin almacenamiento no hay nada que purgar.
  }
}

/** Lo que el formulario tiene ahora mismo, como texto. */
export function valoresDe(formulario: HTMLFormElement): Valores {
  const valores: Valores = {};
  for (const [nombre, valor] of new FormData(formulario).entries()) {
    if (typeof valor !== "string") continue;
    // `que` dice qué botón se pulsó y el texto pegado no es un campo de la casa.
    if (nombre === "que" || nombre === "texto_facebook") continue;
    valores[nombre] = valor;
  }
  return valores;
}

const mismoContenido = (a: Valores, b: Valores): boolean => {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const clave of claves) if ((a[clave] ?? "") !== (b[clave] ?? "")) return false;
  return true;
};

/** Escribe en los campos del formulario lo que traía la copia. */
export function aplicarValores(formulario: HTMLFormElement, valores: Valores): void {
  for (const [nombre, valor] of Object.entries(valores)) {
    const campo = formulario.elements.namedItem(nombre);
    if (campo instanceof HTMLInputElement) {
      if (campo.type === "checkbox") campo.checked = valor === "on" || valor === "1";
      else campo.value = valor;
    } else if (campo instanceof HTMLTextAreaElement || campo instanceof HTMLSelectElement) {
      campo.value = valor;
    }
  }
}

export type BorradorEnMarcha = {
  /** Lo guardado que NO coincide con lo que trajo el servidor. */
  pendiente: { cuando: number } | null;
  recuperar: () => void;
  descartar: () => void;
  /** Cada tecleo: guarda con freno. */
  marcar: () => void;
  /** Al guardar bien: la copia ya no hace falta. */
  limpiar: () => void;
};

export function usarBorrador({
  id,
  formulario,
  servidor,
  activo = true,
}: {
  /** El id de la casa, o «nueva» mientras no exista. */
  id: string;
  /**
   * Cómo llegar al `<form>` ya pintado. Es una función y no una ref a secas
   * porque el formulario lo dibuja un componente de React Router: si su ref no
   * llegara, esto se quedaría sin nodo y el borrador no guardaría nada, en
   * silencio.
   */
  formulario: () => HTMLFormElement | null;
  /** Lo que el servidor acaba de mandar: con esto se decide si hay algo que recuperar. */
  servidor: Valores;
  activo?: boolean;
}): BorradorEnMarcha {
  const clave = `${PREFIJO}${id}`;
  const [pendiente, setPendiente] = useState<{ cuando: number } | null>(null);
  const guardadoRef = useRef<Guardado | null>(null);
  const relojRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guardarYa = useCallback(() => {
    const nodo = formulario();
    if (!activo || !nodo) return;
    escribirCrudo(clave, JSON.stringify({ cuando: Date.now(), datos: valoresDe(nodo) } satisfies Guardado));
  }, [activo, clave, formulario]);

  // Al abrir: purgar y, solo si la copia DIFIERE de lo que trajo el servidor,
  // ofrecer recuperarla. Si coinciden se tira en silencio; por eso «no salió el
  // aviso» casi nunca es un fallo.
  useEffect(() => {
    if (!activo) return;
    purgar();
    const crudo = leerCrudo(clave);
    if (!crudo) return;
    try {
      const guardado = JSON.parse(crudo) as Guardado;
      if (!guardado?.datos || mismoContenido(guardado.datos, servidor)) {
        borrarCrudo(clave);
        return;
      }
      guardadoRef.current = guardado;
      setPendiente({ cuando: guardado.cuando });
    } catch {
      borrarCrudo(clave);
    }
    // `servidor` cambia de identidad en cada render; la casa es la que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, clave]);

  // `beforeunload` no se dispara al cerrar la pestaña en el celular: los que de
  // verdad cubren «se cerró de golpe» son estos dos.
  useEffect(() => {
    if (!activo) return;
    const volcar = () => guardarYa();
    window.addEventListener("pagehide", volcar);
    document.addEventListener("visibilitychange", volcar);
    return () => {
      window.removeEventListener("pagehide", volcar);
      document.removeEventListener("visibilitychange", volcar);
      if (relojRef.current) clearTimeout(relojRef.current);
    };
  }, [activo, guardarYa]);

  return {
    pendiente,
    marcar: useCallback(() => {
      if (relojRef.current) clearTimeout(relojRef.current);
      relojRef.current = setTimeout(guardarYa, FRENO_MS);
    }, [guardarYa]),
    recuperar: useCallback(() => {
      const nodo = formulario();
      if (nodo && guardadoRef.current) aplicarValores(nodo, guardadoRef.current.datos);
      setPendiente(null);
    }, [formulario]),
    descartar: useCallback(() => {
      borrarCrudo(clave);
      setPendiente(null);
    }, [clave]),
    limpiar: useCallback(() => {
      borrarCrudo(clave);
      // Una casa nueva se guarda bajo «nueva» y, al crearse, bajo su id: se
      // tiran las dos, o al abrirla volvería a ofrecer lo de antes.
      borrarCrudo(`${PREFIJO}nueva`);
      setPendiente(null);
    }, [clave]),
  };
}
