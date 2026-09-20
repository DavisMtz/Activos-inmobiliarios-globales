# Traspaso · para quien siga

Escrito el 20/09/2026 al cerrar una sesión. Es el **punto de retoma**: qué hay, qué falta y cómo se trabaja aquí. No repite `PLAN.md`; dice por dónde entrarle. Si algo de aquí contradice a `PLAN.md`, manda `PLAN.md` (y corrige este archivo).

> El repositorio es **público**: aquí no va ninguna clave, contraseña ni dato de una persona real.

## 1. Dónde está todo, hoy

| | |
|---|---|
| **Sitio** | https://activos-inmobiliarios.logidma.workers.dev (`MODO_DEMO=1`: `noindex`, sin correos, sin analítica) |
| **Worker** | `activos-inmobiliarios`, versión activa **`0ed0ddcf`** (20/09/2026) |
| **Reversión** | la anterior es `14e28560`: `npx wrangler rollback 14e28560-2b14-4aed-a4b5-f7b140b514dc` |
| **Código** | rama `main`, empujada. **No hay nada fuera de `main`**: la rama `worktree-f5-formularios-y-guion` ya está unida (0 commits propios) |
| **Base** | D1 `activos-inmobiliarios-db`, migraciones `0001`–`0004` aplicadas en local y en remoto. **No hay `0005`** |
| **Fases** | F0–F4 listas y en producción · F2 con su criterio 5 abierto · F5 en curso · F6 en espera de los consultores |

La app vive en `sitio/`. Todo comando de abajo se corre desde ahí.

## 2. Por dónde empezar

1. `CLAUDE.md` — las reglas, en una pantalla.
2. Este archivo.
3. `PLAN.md`: **§2** decisiones cerradas (no se reabren sin preguntar), **§15** fases con su «listo cuando», **§17** trampas ya pagadas y **§19** el registro medido. El §19 es largo a propósito: cada celda dice qué se midió, con qué número y qué trampa salió. Léelo antes de tocar la zona que vayas a tocar.

## 3. Reglas que aquí ya costaron algo

- **Desplegar necesita la palabra explícita del usuario en la conversación** («Sube a producción», «Despliegas»). Vale para esa tarea, no para la siguiente. Lo mismo el `git push` si no lo pidió. El commit local sí se hace al cerrar cada paso verificado.
- **Antes de CUALQUIER deploy** (§17): `git worktree list`, `git branch -a`, `npx wrangler deployments list`. Si la versión activa no es la que esperabas, **no despliegues encima a ciegas**: compara los `.js` que sirve producción contra una compilación del commit que sospechas (receta en §19, «Volver al catálogo»). Ya pasó que otra sesión desplegaba desde un worktree y un deploy desde `main` le borró el trabajo del sitio.
- **Si hay migración, va PRIMERO.** El marco público consulta la base en todas las páginas: sin la columna, se cae el sitio entero.
- **Una verificación se cierra mirando la base y la nube, no la salida del guion.** Un guion que muere a media limpieza no lo dice. Al terminar en remoto: casas 188, servicios 6, cero `… de recorrido F3%`, cero cuentas `@ejemplo.invalid`, y `npm run fotos:migrar -- --remote --verificar` en ceros.
- **Lo que la gente pulsa no es la API.** Dos veces un botón no hacía nada y el código «se veía bien»; la última, el 19/09 (abajo, §5). Lo que toque un formulario se prueba con navegador de verdad, pulsando el botón.
- **Medir contra `vite preview`, no contra `npm run dev`** (el dev sirve un instante sin CSS y las medidas salen absurdas). El preview **bloquea `build/client`**: hay que cerrarlo antes de reconstruir o `npm run build` muere con `rmdir`. Y matar el proceso deja vivos `node`/`workerd` en el puerto 5180.
- **Git Bash convierte en ruta de Windows todo argumento que empieza por «/»**: `/servicios` llega como `C:/…/Git/servicios`. Los guiones que reciben una URL entera no lo notan; `filmar` acepta la ruta sin barra.
- **`analisis/` es de solo lectura** y **no se inventa contenido del negocio** (testimonios, cifras, textos legales).

## 4. Cómo se trabaja aquí

Lo que mejor ha funcionado, por si ayuda:

- **Medir antes de construir.** «Al volver al catálogo nos regresa al inicio» parecía un fallo de scroll; medido, el botón «atrás» SIEMPRE había funcionado y el culpable era un enlace. El arreglo fue otro y más chico.
- **Enseñar una pantalla real en cuanto exista.** El dueño mira las capturas mientras trabajas y corrige pronto: a la primera mano de los dibujos contestó «más detalle… y que estén animados» antes de que se puliera nada. Un rediseño entero se descartó por enseñarlo al final (§19, «La Cinta»): **no se rehace ni se propone de nuevo**.
- **«Me gusta» es una orden de conservar.** Refinar no es rediseñar: la lista de Servicios sigue siendo lista.
- **Registrar con números** en `PLAN.md` §19 al cerrar, incluidas las trampas nuevas.

## 5. Lo último que se hizo (19-20/09/2026)

**Volver al catálogo sin perder el lugar** — `app/components/publico/volver.ts`. El migajón de la ficha era un enlace nuevo a `/propiedades`: perdía el scroll, las casas cargadas y los filtros. Ahora la tarjeta le cuelga a la ficha de dónde viene (`state`) y el migajón retrocede por el historial. De paso: mandar «Me interesa» borraba ese rastro (la acción reemplaza la entrada y la nueva nace sin `state`).

**Servicios, con un dibujo animado por servicio** — siete escenas de línea sacadas del isotipo, con entrada dibujada y un gesto que se repite por turnos. Dónde vive cada cosa:

| Archivo | Qué guarda |
|---|---|
| `shared/servicios.ts` | El catálogo de claves y **la regla que elige**: lo escogido en el panel o, en «Automático», lo que sugiere el título. Solo datos: el panel no puede importar interfaz del sitio (criterio 8) |
| `app/components/publico/dibujos-servicio.tsx` | Los trazos. Cuatro capas: suelo, relleno de papel, tinta en dos grosores y la pieza roja |
| `app/styles/app.css` (`.dibujo-*`, `vida-*`) | Todo el movimiento, en CSS. El comentario del bloque explica cada decisión |
| `app/routes/publico/servicios.tsx` | La página, los turnos, el botón «Pausar» y la pausa fuera de la vista |
| `app/routes/panel/contenido.tsx` | El campo «Dibujo» de la ficha de un servicio |
| `tests/servicios.test.ts` | Qué título da qué dibujo |

**Para agregar un dibujo:** clave y etiqueta en el catálogo (y su raíz en `POR_TITULO`, si aplica) → la escena en `DIBUJOS`, con **un trazo por `<path>`** y todos con `pathLength={1}` → su gesto en `app.css`, que ocupe **el primer tercio de la vuelta** y **empiece y acabe en el estado natural** → la prueba unitaria → `npm run hoja:dibujos` para verlo en grande y `npm run filmar` para verlo moverse.

**Dos fallos viejos del panel, arreglados** (los destapó probar con navegador; la API estaba bien): cada «Guardar» de un servicio borraba su columna `icono`, y **desmarcar «Se ve en el sitio» no ocultaba nada** —una casilla sin marcar no viaja en el formulario y el servidor leía su ausencia como «visible»—, o sea que desde el panel era imposible ocultar un servicio o una pregunta.

## 6. Pendientes, por orden

1. **Dos cuentas de prueba activas en producción:** `entregas-contenido@ejemplo.invalid` y `entregas-asesor@ejemplo.invalid`, del 19/09/2026 21:31 UTC, que dejó una corrida de `verificar:entregas`. No son un hueco (contraseña aleatoria por corrida, no está en el repo, y el acceso frena a 8 por minuto), pero rompen el «cero cuentas de prueba». Se limpian con `npm run verificar:entregas -- --base https://activos-inmobiliarios.logidma.workers.dev --remote` **sin** `--dejar`, y después se mira la base. Se le ofreció al usuario y no contestó: **pregunta antes**, es producción.
2. **Probar en el Safari del iPad.** Es donde el usuario mira el sitio, y todo lo medido fue en Chrome. En los dibujos, lo que más puede diferir: `transform-box: fill-box` en los gestos, `pathLength` en la entrada y `:has()` en el megáfono.
3. **Decisiones que el usuario tiene abiertas:** llevar los dibujos, en chico, a la franja oscura de servicios de la portada (se le ofreció; ojo: sobre tinta el rojo `#A0051C` no contrasta, haría falta el claro del isotipo, `#F5515F`); y el guion de la demo (`verificacion/guion-demo.md`) todavía no menciona Servicios.
4. **F2, criterio 5:** Lighthouse móvil 82/74/78 contra 90. El techo medido es el FCP con ~1 MB bajo 4G, no el servidor. **Lighthouse en local no sirve para comparar** versiones aquí: solo producción contra producción, el mismo día. El CSS de los dibujos sumó +1.06 KB gzip a todas las páginas.
5. **Del dueño o de su abogado, no de un agente:** el aviso de privacidad tiene que mencionar las fotos y comentarios de las Entregas. Aquí no se redacta texto legal.
6. **Menores, anotados en §19:** el lema sigue escrito en el código; `/entregas` no está en el `sitemap` (en F6, solo si hay alguna publicada).
7. **F5, lo que queda:** crear los usuarios reales **solo cuando el usuario lo pida**, y revisar con el equipo la lista de avisos de la migración.
8. **F6 espera a los consultores** (`PEDIR-A-CONSULTORES.md`) y nada de F6 se hace sin que el usuario lo pida. **El dominio vence el 06/12/2026.**

## 7. Verificar

Con `npm run build` y `npx vite preview --port 5180 --strictPort` levantado. Contra producción, cambia la `--base` y `--local` por `--remote`.

| Comando | Qué cubre |
|---|---|
| `npm test` · `npx tsc -b` | 267 pruebas · tipos |
| `npm run verificar:f2 -- --base http://localhost:5180 --local` | El sitio público: 39 comprobaciones |
| `npm run verificar:listado -- --base http://localhost:5180` | El listado y **volver de una ficha** (su apartado 3). Sin `--base` apunta al puerto 4180 |
| `npm run verificar:vitrina -- --base http://localhost:5180` | La vitrina de la portada. Misma trampa del 4180 |
| `npm run verificar:movimiento -- --base http://localhost:5180` | Que nada quede invisible, con y sin «menos movimiento». Incluye `/servicios` y **prueba el botón de pausa** |
| `npm run verificar:f3 -- --base http://localhost:5180 --local` | El panel, por API |
| `npm run verificar:f3-navegador -- --base http://localhost:5180 --local` | El panel pulsando botones, el campo «Dibujo» y, **solo en `--remote`**, el criterio 8 |
| `npm run verificar:f4 -- --base http://localhost:5180 --local` | Prospectos y métricas |
| `npm run verificar:entregas -- --base http://localhost:5180 --local` | Entregas. Con `--dejar` NO limpia (es para capturas): la corrida siguiente sin la bandera sí |

Los que crean cuentas chocan con el freno de acceso (8 por minuto desde una misma IP) y reintentan solos a los 65 s: no es un fallo.

**Herramientas para mirar** (nuevas, 20/09/2026):

- `npm run capturar -- <url> salida.png [ancho] [alto] [movil]` — una captura.
- `npm run filmar -- servicios carpeta/` y `py scripts/armar-gif.py carpeta/ salida.gif` — la página moviéndose, a velocidad real. Necesita Pillow.
- `npm run hoja:dibujos -- salida.png` — los dibujos en grande y en reposo.

## 8. El worktree

`.claude/worktrees/f5-formularios-y-guion` es la copia de trabajo de otra sesión. Su rama ya está unida a `main` y no tiene nada propio, pero **no la borres sin preguntar**: puede haber alguien usándola. Está en `.gitignore` para que un `git add .` no la meta al repositorio.
