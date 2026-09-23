# Traspaso · para quien siga

Escrito el 20/09/2026 al cerrar una sesión y puesto al día el 23/09/2026 (el panel en el teléfono, en producción; el CRM anotado como lo que sigue tras F6). Es el **punto de retoma**: qué hay, qué falta y cómo se trabaja aquí. No repite `PLAN.md`; dice por dónde entrarle. Si algo de aquí contradice a `PLAN.md`, manda `PLAN.md` (y corrige este archivo).

> El repositorio es **público**: aquí no va ninguna clave, contraseña ni dato de una persona real.

## 1. Dónde está todo, hoy

| | |
|---|---|
| **Sitio** | https://activos-inmobiliarios.logidma.workers.dev (`MODO_DEMO=1`: `noindex`, sin correos, sin analítica) |
| **Worker** | `activos-inmobiliarios`, versión activa **`b328a05c`** (23/09/2026: el panel en el teléfono, §5). **`main` está empujada y desplegada: no hay nada pendiente de subir** |
| **Reversión** | la anterior es `5bdc97d4`: `npx wrangler rollback 5bdc97d4-3108-4af9-9e2b-294af045395a` (devuelve el panel de antes, con Métricas en gráficas). Antes, `4ba9e535`, `d71de42b`, `020cc1b9`, `2168665c` y `ecb59d6c`. Ninguna migración estorba |
| **Código** | rama `main`, empujada y desplegada. **No hay nada fuera de `main`**: la rama `worktree-f5-formularios-y-guion` ya está unida (0 commits propios) |
| **Base** | D1 `activos-inmobiliarios-db`, migraciones `0001`–`0005` aplicadas en local **y en remoto** (la `0005`, del buscador, se aplicó el 20/09/2026 antes de desplegarlo) |
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

## 5. Lo último que se hizo (19-23/09/2026)

**El panel en el teléfono, primera mano (23/09/2026 · EN PRODUCCIÓN, Worker `b328a05c`,
commit `22e9139`)** — desplegado a pedido del usuario («despliega»), con el `git push`; antes,
worktrees, ramas y `deployments list` revisados (la activa era `5bdc97d4`, la esperada) y
**ninguna migración**. Pedido: «que el panel tenga un mejor aspecto, sea fácil de entender y
que esté preparado para usarse en teléfonos». Refinar, no rediseñar: misma tipografía, mismos
colores, mismo menú sobre tinta. `PLAN.md` §19 tiene las cifras; aquí, dónde vive cada cosa:

| Archivo | Qué guarda |
|---|---|
| `app/routes/panel/prospectos.tsx` | `FichaProspecto` (compacta: quién, estado, casa, mensaje y los botones para contestar) y `Seguimiento`, el `<details>` con el estado a mano, la asignación y las `Notas`. Los formularios siguen mandando los mismos `que`/`name` |
| `app/components/panel/piezas.tsx` | `FiltrosDeLista`: en el teléfono, buscador + botón «Filtros» (casilla escondida sin `name` y `peer-checked`, abre sin JS); en escritorio, un renglón. La usan Casas y Prospectos; Bitácora no (dos desplegables, cabe) |
| `app/components/panel/fotos.tsx` | «Quitar» con icono, y en el teléfono seis fotos y «Ver las N fotos» (`data-todas`) |
| `app/components/panel/iconos.tsx` | Iconos nuevos: mensaje, teléfono, correo, filtros, abajo y basura |
| `app/routes/panel/marco.tsx` | `FranjaDemo`: arriba en el teléfono, dentro de la columna de contenido en escritorio (arriba de todo cortaba «Salir») |

**Cómo se miró:** `metricas:muestra -- --local` para tener 72 prospectos, y un guion de CDP que
retrata cada pantalla a página entera en 390 y 1440 px (vive en el directorio temporal de la
sesión; es `capturar.mjs` con un bucle y `Emulation.setDeviceMetricsOverride` al alto real).
Capturas de antes y ahora, y las cuatro maquetas de navegación, en
`Escritorio\portada-propuestas\panel-23-09\`.

> ⚠ **El criterio 8 ya vigila el trozo de Prospectos** («Solo los que faltan por cerrar» en
> `MARCAS`): 5 trozos. Si cambias ese texto del filtro, cambia también la frase.

**Métricas con gráficas: el tablero (21-22/09/2026 · EN PRODUCCIÓN, Worker `5bdc97d4`,
commits `2593612` y `d70f16b`)** — desplegado a pedido del usuario («Despliega»), con el `git
push`; antes, worktrees, ramas y `deployments list` revisados (la activa era `4ba9e535`, la
esperada) y **ninguna migración**. Con él subió el ajuste de Contacto (`62a2db4`). Pedido:
«que en panel de administración el apartado de métricas tenga gráficos y demás métricas de
forma visual para poder ver el desempeño de todo». Vio las capturas de la primera versión
(con datos de muestra inventados, en local) y contestó «Despliega». **Medido en producción:**
`verificar:f4` 54/54, `f3-navegador` 17/17 (criterio 8 vigilando ya el trozo de Métricas, ver
§7), `f2` 39/39, `contacto` 28/28, `movimiento` sin nada invisible y la base y la nube en
ceros. `PLAN.md` §19 tiene el detalle y las cifras; aquí, dónde vive cada cosa:

| Archivo | Qué guarda |
|---|---|
| `app/components/panel/graficas.tsx` | Las piezas, hechas a mano y sin biblioteca: tarjeta con cambio y tendencia, la serie en el tiempo (vistas arriba, contactos abajo, un globo para las dos, flechas del teclado), barra partida, «lo que hay contra lo que se ve», el mapa de horas y la tabla plegada de cada una. Los colores y el porqué, en su comentario de cabecera |
| `app/components/panel/cifras.ts` | Cómo se escriben cifras, fechas, porcentajes y cambios, y el tope de un eje. Sin JSX, para que `tests/` lo importe |
| `app/routes/panel/metricas.tsx` | La pantalla: qué pieza va dónde, según el rol |
| `server/db/panel/metricas.ts` | Las consultas (un `db.batch`, con `INDEXED BY idx_eventos_fecha` si hay ventana) y cómo se arma todo en JavaScript sobre el catálogo |
| `server/metricas.ts` · `server/fechas.ts` | La ventana en días de Morelia y el periodo anterior (mismo largo, cortado a la misma hora), las cubetas, los rangos de precio, la rejilla de horas y la mediana. `diaDeMorelia` se mudó aquí desde `server/ia/uso.ts`, que la reexporta |
| `scripts/sembrar-metricas-demo.mjs` | `npm run metricas:muestra -- --local`: cuatro meses de datos INVENTADOS para mirar la pantalla, con sesiones de maestro, asesora y contenido en `%TEMP%\aig-metricas-demo.json`. **Se niega a correr en remoto** y `--limpiar` deja la base como estaba |
| `scripts/verificar-f4.mjs` (4b) | Cada gráfica contra un `SELECT` a mano; la casa de prueba ya entra a las 25 aunque haya tráfico |

> ⚠ **Si cambias la ventana** (qué son «30 días»), cámbiala en `ventanaDeMetricas` y en
> ningún otro lado: `verificar:f4` la importa de ahí para su `COUNT(*)` a mano. Contada
> aparte, la prueba deja de cuadrar sin que nada esté mal.

**Contacto: el mostrador y un formulario que avisa junto al campo (21/09/2026 · EN
PRODUCCIÓN, Worker `4ba9e535`, commit `450da0c`)** — desplegado a pedido del usuario
(«Despliegas»), con el `git push`; antes, worktrees, ramas y `deployments list` revisados (la
activa era `d71de42b`, la esperada) y **ninguna migración**. Pedido: «micro interacciones y
animaciones así como una mejor composición profesional». Se le enseñaron **cuatro composiciones
retratadas sobre la página real** (`Escritorio\portada-propuestas\contacto-21-09\`: A mostrador ·
B índice · C carta · D casa, más `antes-y-ahora.png` y el GIF `contacto-en-movimiento.gif`
filmado en producción) y **quedó puesta la A**.

| Archivo | Qué guarda |
|---|---|
| `app/routes/publico/contacto.tsx` | La página entera: el `Mostrador` (tinta, WhatsApp y su número, los datos de la oficina cuando existan, con «Copiar», y el dibujo de asesoría), el `FormularioContacto` (avisa al salir del campo y al mandar; mientras se escribe solo QUITA errores), el `Gracias` y el FLIP de la hoja |
| `shared/validacion.ts` | **La regla** de los tres formularios con prospecto (`problemasDeProspecto`): la usan el servidor (`revisarProspecto`, que devuelve el primero) y el navegador (que los marca todos). Ahí vive la regla nueva «sin teléfono y sin correo no se acepta» (`SIN_FORMA_DE_CONTESTAR`) |
| `shared/contacto.ts` | «¿Qué necesitas?»: cada opción con su tipo de prospecto (`vender` y `credito` ya existían en el esquema y nadie los llenaba) y su frase para el mensaje |
| `shared/whatsapp.ts` | `numeroParaLeer`: «524434922197» → «443 492 2197» |
| `app/styles/app.css` (bloque «Contacto», al final) | Todo el movimiento, en CSS: el hilo rojo del foco, la palomita, la casilla, las estelas de «Enviar», los puntos del dibujo que escriben una vez por gesto y la llegada del gracias. El comentario del bloque explica cada decisión |
| `app/routes/publico/marco.tsx` | `/contacto` sin botón flotante (tapaba el formulario en el teléfono) |
| `scripts/verificar-contacto.mjs` | La prueba que **pulsa**: `npm run verificar:contacto -- --base … --local` (32) o `--remote` (28, no escribe nada: solo envíos inválidos y la trampa) |

**Para cambiar a B, C o D:** el formulario es el mismo en las cuatro; cambia solo el envoltorio
de `Contacto()` y el `Mostrador`. Las maquetas (`_maquetas\vB.js`…) dicen qué va dónde. **Si
quiere quitar «¿Qué necesitas?»:** se borra el `fieldset` y en la `action` el tipo vuelve a
`"general"`; lo ya guardado como `vender`/`credito` sigue siendo válido.

> ⚠ **Si cambias el texto del aviso «Déjanos un teléfono o un correo…»**, cámbialo SOLO en
> `SIN_FORMA_DE_CONTESTAR`: la página lo reconoce por ese texto para pintarlo debajo del par.


**Redes desde el panel y el pie ordenado (20/09/2026, al cierre · EN PRODUCCIÓN, Worker
`d71de42b`, commit `503e9d5`)** — desplegado a pedido del usuario («Sube a producción»), con el
`git push` en la misma orden; antes, worktrees, ramas y `deployments list` revisados (la activa
era la esperada) y **ninguna migración** en el cambio. Pedido: «actualizar el pie… dame
propuestas y añade la opción de añadir más redes como tiktok, instagram, x y más desde el
panel».

**Comprobado EN PRODUCCIÓN, que era lo único que podía romperse:** la fila vieja
(`{facebook, instagram}`) se sigue leyendo y el pie enseña las dos redes con sus enlaces reales.
`verificar:f2 --remote` 39/39 y `verificar:movimiento` sin nada invisible.

> **`npm run verificar:redes -- --remote` NO se ha corrido contra producción.** Crearía una
> cuenta de dirección y **sobrescribiría temporalmente la fila `redes`** (la restaura al final,
> pero si muere a medias se pierde). Se le ofreció al usuario: **pregunta antes de correrlo en
> remoto.** En local pasa 10/10.

| Archivo | Qué guarda |
|---|---|
| `shared/redes.ts` | **El catálogo y LA REGLA.** Las ocho redes con su etiqueta, y `redesDeBolsa` (leer) y `revisarRedes` (guardar), que son la misma regla aplicada por las dos puntas. Solo datos: el panel no puede importar interfaz del sitio (criterio 8) |
| `app/routes/publico/marco.tsx` | `ICONO_DE_RED` —qué dibujo le toca a cada clave— y el `Pie` entero |
| `app/components/publico/iconos.tsx` | Los dibujos: TikTok, X, YouTube, LinkedIn y Threads son nuevos |
| `app/routes/panel/configuracion.tsx` | El bloque «Redes»: ocho renglones con desplegable y enlace, y la conversión de renglones a lista en el `action` |
| `tests/redes.test.ts` · `scripts/verificar-redes.mjs` | 12 pruebas puras · y la de verdad, que **pulsa el botón** |

**No hubo migración** y no hace falta: la tabla `configuracion` guarda JSON libre. La clave
`redes` pasó de `{facebook, instagram}` a `{lista:[{red,url}]}`, y **la fila que hay en
producción sigue siendo la vieja**: se convierte al leer y se moderniza sola la primera vez que
alguien guarde desde el panel. Si algún día se quita esa conversión, el pie se queda sin las dos
redes del negocio sin que nadie haya tocado nada.

**Para agregar una red** hacen falta tres cosas: su renglón en `REDES` (`shared/redes.ts`), su
dibujo en `iconos.tsx` **y** su entrada en `ICONO_DE_RED`. Y luego **mirarla en grande**: un
icono de marca sacado de memoria sale torcido y en el código no se nota. Aquí se cayeron dos a
la primera —Threads salía como un caracol y la X como el aspa de «cerrar»— y se vieron en una
hoja de contactos, no leyendo el `path`.

**El pie** pasó a cuatro columnas parejas —marca · Sitio · Redes · Escríbenos—: antes la marca
se quedaba con un tercio del ancho para dos renglones y dejaba ~300 px de hueco bajo el lema.
Las redes van con su NOMBRE junto al icono. La cuarta columna es **Contacto** cuando haya datos
capturados y, mientras no, la invitación a escribir por WhatsApp. Se le enseñaron **cuatro
pies** (`Escritorio\portada-propuestas\pie-20-09\opciones-de-pie.png`) y quedó puesta la D.

> ⚠ **Al probar el pie, no busques `footer a[target="_blank"]`:** ahora el botón de WhatsApp
> también lo es y no es una red. Hay que buscar dentro de la sección cuyo `h2` dice «Redes».
> Esa trampa ya hizo fallar dos comprobaciones de `verificar:redes`.


**La composición de la portada, ordenada (20/09/2026, al cierre · EN PRODUCCIÓN, Worker
`020cc1b9`, commit `d658f0f`)** — desplegado a pedido del usuario («sube y despliega»), con el
`git push` en la misma orden. Antes: worktrees, ramas y `deployments list` revisados (la activa
era la esperada, `2168665c`), y **ninguna migración** en el cambio.
Pedido: «Revisa la index… ayúdame a hacer que todos los contenidos estén
armónicamente ordenados… le falta una última pulida a la composición de los componentes».
**Nada de esto rediseña: todos los componentes siguen siendo los que él aprobó.** Solo cambia
inicio.tsx.

| Qué se arregló | Cómo se midió |
|---|---|
| **«Encuentra tu propiedad» flotaba.** La columna iba centrada contra una vitrina de 600 px: 260 px de vacío arriba y 230 abajo. Ahora `lg:items-stretch` y el enlace al pie (`lg:mt-auto`); los accesos por tipo son un **índice en renglones** (el patrón de Servicios) y debajo van las **cinco colonias con más casas**, las mismas de `listado.tsx` | `difArriba` y `difAbajo` = **0 px** a 1024, 1280, 1440 y 1920 |
| **El aire de esa sección era el único propio** (40/48 y 64/48 contra `py-14 sm:py-20` de todas) | huecos **160/160/160** en escritorio |
| **La casa del héroe y la primera tarjeta de la vitrina eran la misma**, misma foto y mismo precio a 900 px | la vitrina arranca en la segunda (`casasEnVitrina`); la del héroe cierra el ciclo |
| **Las tres cifras caían 2+1 en el teléfono** («precio desde» sola en un tercer renglón) | `grid grid-cols-3` hasta `lg`; el pie del héroe mide **38 px menos** |
| El enlace repetía el texto del botón del buscador; el párrafo del cierre partía «una a / la medida» | «Ver todo el catálogo»; `max-w-2xl` |

**Falta que él elija:** se le enseñaron **cuatro maquetas de esa columna** (A píldoras como
antes · B índice · C píldoras + colonias · **D índice + colonias, la que quedó puesta**), en
`Escritorio\portada-propuestas\columna-20-09\` como `variante-a…d.png`. Si pide **la B**, se
borra el bloque de colonias; si pide **la A**, el markup viejo de las píldoras está en
`git show d658f0f^:sitio/app/routes/publico/inicio.tsx`.

**Comprobado sin JavaScript** (`curl` y los `<script>` fuera): el HTML servido enseña el héroe
con AIG-0188 y la primera tarjeta de la vitrina con **AIG-0184** —la clave del héroe no sale
dos veces a la vista—, que es justo lo que se buscaba con la rotación.

⚠ **En las colonias salen «Lomalta» y «Lomalta, Tres Marías» como dos píldoras distintas**, con
5 casas cada una. Es **un dato de la base** (una colonia capturada con coma), no del código: el
listado la enseña igual desde siempre. Se limpia donde vive la colonia, no aquí.

**El héroe NO se tocó** (velo, foto, `--text-portada`, `pb`) ni el pie de página, que es de
todas las páginas. Verificado con el preview en el 5180: 341 pruebas, `tsc`, `verificar:f2`
39/39, `verificar:vitrina` 22/22, `verificar:listado` 24/24 y `verificar:movimiento` sin nada
invisible. **Y otra vez EN PRODUCCIÓN al desplegar:** `verificar:f2 --remote` 39/39,
`verificar:vitrina` 22/22, `verificar:movimiento` sin nada invisible, y la portada retratada
(`desbordeX` 0). En producción la página mide 308 px más que en local porque **allá sí hay una
pregunta frecuente publicada** y la sección existe; con una sola pregunta se ve despoblada a la
derecha, y eso se arregla escribiendo más en Panel › Contenido, no en el código.

> **Parte de la «falta de armonía» no es código:** «Lo que dicen los clientes» y las preguntas
> frecuentes **no salen porque no hay nada publicado**, y el antetítulo y el renglón bajo el
> titular tampoco, porque «Saludo» y «Lema» están vacíos en Panel › Contenido. Eso lo llena él.


**La portada que vende (20/09/2026, al cierre del día · EN PRODUCCIÓN, `2168665c`)** — pedido: «la portada
como que aún no me gusta, quiero que sea atractiva y que se vea profesional enfocada en ventas y con una
excelente composición». **Se le enseñaron CUATRO composiciones capturadas sobre la página real y eligió la 2**
(«Me gusto la dos»). La foto de la casa **llena la primera pantalla** y en su pie van el titular, la casa con su
precio, las tres cifras y el buscador en un renglón; la segunda pantalla lleva el rótulo, los accesos por tipo y
la vitrina de siempre. Se fue el riel de 1.9 pantallas: el buscador estaba a **1 400 px de scroll**.

| Archivo | Qué guarda |
|---|---|
| `app/components/publico/escenario-portada.tsx` | El héroe: la foto a pantalla completa, su desplazamiento al bajar (`translate`, nunca `scale`: la foto mide 112 % y se mueve un 5.5 %) y el `data-heroe` del `<html>` |
| `app/styles/app.css` (`.escenario`, `.escenario-pie`, `.escenario-ficha`) | El velo **atado al pie** y con paradas en rem —un velo por porcentajes deja el titular del teléfono sobre 0.34 de tinta— y la píldora del precio |
| `app/routes/publico/inicio.tsx` | `BuscadorPortada` (el mismo panel, en renglón desde `lg` con `lg:contents`), `FichaDeLaFoto` y `CifraClara` |
| `app/routes/publico/marco.tsx` | El botón flotante de WhatsApp se aparta con `in-data-[heroe=dentro]`: en la primera pantalla su esquina se encimaba con la de «Ver las 188 propiedades» |

**Para enseñarle opciones, la receta está en `PLAN.md` §19** («Cómo se enseñan cuatro composiciones sin tocar el
repo»): la página de producción bajada con `curl`, sin `<script>` y con `<base href>`, y un guion de DOM por
variante. Las maquetas y sus capturas quedaron en `Escritorio\portada-propuestas\` (fuera del repo).

**Sin JavaScript la portada se ve igual** (todo el reposo es CSS) y `verificar:vitrina` necesita
`--base http://localhost:5180`: su valor por omisión es el 4180 y sin él informa «0 montadas», como si la
vitrina estuviera rota.

**La portada abre con un escenario, y el buscador dice solo que entendió (20/09/2026, tarde)**
> ⚠ **El ESCENARIO de este apartado lo sustituyó, el mismo día, la portada de arriba.** Se conserva entero
> porque `npx wrangler rollback ecb59d6c-…` lo devuelve, porque sus lecciones de método siguen valiendo y
> porque el `StarBorder` del buscador y `entendido.tsx` **siguen vivos tal cual**. Lo que ya NO es cierto va
> marcado «YA NO» ahí donde está.

Son dos piezas de React Bits copiadas A MANO (variante JS + CSS, **sin dependencias**; el `npx shadcn add` del registro no aplica
aquí: no hay `components.json`). En producción desde el 20/09/2026, Worker **`ecb59d6c`** (para revertir,
`20cd3c29`; antes, `bd0fe253`, `18878e94` y `0791a369`).

**El color y la tipografía del escenario costaron TRES vueltas, y la que sirvió fue enseñarle opciones.**
Tinta → «el color negro no queda»; vino → «ni la fuente ni el color de fondo». A la tercera se le enseñaron
**cuatro propuestas capturadas sobre la página real** y eligió en un mensaje. Las capturas se hicieron
**inyectando CSS con CDP** sobre la página ya compilada y bajando las fuentes candidatas de Google Fonts: sin
instalar ni recompilar nada, y solo la elegida se instaló de verdad. **Con este usuario, para color y
tipografía: enseñar cuatro, no proponer una.**

Lo que quedó: campo **crema** (el papel de la casa) —**YA NO:** no hay campo, la foto llena la pantalla—, el
velo de la foto **aclara en vez de oscurecer** porque el titular es de tinta —**YA NO:** oscurece, y el
titular es blanco—, y **Playfair Display** importada SOLO en `inicio.tsx` —la única página que la usa— y
precargada desde ahí: las demás no bajan sus 38 KB. **La cuesta de la escala la fija el teléfono:** a 390 px
«Comercialización,» es la palabra más ancha y con 48 px dejaba 4 px de aire a cada lado; con
`clamp(2.4rem, 1.46rem + 5.05vw, 6rem)` quedan 20 px y el escritorio se queda en 96 px. **YA NO:** ese token
(`--text-portada`) **se conserva SIN USO a propósito**, por si vuelve aquella composición; el que manda hoy es
`--text-portada-pie`, `clamp(2.05rem, 1.3rem + 3.1vw, 3.75rem)`. No lo borres por «token muerto». El tamaño de un
titular sobre una foto se decide en una CAPTURA y se mide en seis anchos, no a ojo.

| Archivo | Qué guarda |
|---|---|
| `app/components/publico/marco-estelar.tsx` | El `StarBorder`: el destello que recorre la orilla del buscador mientras entiende, y mientras lo entendido siga puesto. Envuelve un panel (no es un botón negro), el destello es `--color-marca` sobre un halo de **2 px**, y la sombra va al marco de afuera porque el `overflow: hidden` la recortaba |
| ~~`app/components/publico/escenario-portada.tsx`~~ **YA NO** (lo sustituyó el héroe de arriba; el archivo es el mismo, el contenido no) | El `ScrollExpand`: la foto de la casa principal encuadrada en un campo de tinta, el titular centrado encima, y la foto abriéndose al bajar. La foto sigue siendo `vitrina[0].fotoGrande` —la **casa elegida en Panel › Contenido** o la más reciente— en la variante `galeria` que ya existía: **no se tocó ni el panel ni la base** |
| `app/styles/app.css` (`.marco-estelar`, `.escenario`) | Todo el movimiento, en CSS. Con «menos movimiento» el destello no se dibuja y queda el halo quieto |
| `app/components/publico/entendido.tsx` | «Así lo entendimos» subió ARRIBA del formulario y su rótulo va en un solo renglón |

**Lo que hubo que medir, y no repetir:**

- **El `ScrollExpand` original no existe sin JavaScript:** el alto de la escena y del riel se los pone el guión.
  Aquí los trae el CSS y el guión solo los afina.
- **Su velo va al revés aquí:** entero al principio y al 45 % al abrirse. Con el velo del original (de 0 a 0.45)
  el titular blanco no se leía sobre la fachada blanca de la casa de portada. (**Hoy** el velo no anima: va
  atado al pie y con paradas en rem — `.escenario-pie` en `app.css`. La trampa de fondo es la misma: sobre esa
  fachada blanca, un velo flojo se come el titular.)
- **La escena empezaba debajo de la cabecera** y su pie —la seña de «baja»— caía fuera de la primera pantalla.
  Sube 4.75rem (`pt-3` + `h-16`) y la píldora del menú flota sobre la foto.
- **El encuadre del 42 % en un teléfono de 390 px es una estampilla de 164 px:** se mide por ancho.
- **Dos guiones se arreglaron, no el diseño.** `verificar:f2` tomaba por desbordada la foto que su escena
  RECORTA (ahora exime también `overflow-x: hidden`); `verificar:vitrina` y `verificar:movimiento` veían la
  vitrina quieta porque **se detiene fuera de la pantalla a propósito** y ahora nace dos pantallas abajo: la
  llevan a la vista antes de mirarla. (**Hoy nace UNA pantalla abajo**, y `verificar:vitrina` además tabula
  hasta la casa en vez de contar pasos fijos.)
- **Aquí no hay configuración de Prettier:** un `npx prettier --write` reformatea a 80 columnas y deja un diff
  enorme de ruido. No se corre sobre archivos del proyecto.
- **Un emoji escrito como pareja de subrogados en un guión de Python dejó `PLAN.md` en CERO bytes** a media
  escritura, y el vacío entró a un commit. En estos guiones, texto plano.


**El buscador que entiende frases (20/09/2026)** — `PLAN.md` §10.5 lo explica entero; aquí, dónde vive cada cosa. La portada y el listado aceptan «casa de 3 recamaras en altosano hasta 4 millones con alberca» y el loader de `/propiedades` **redirige** a los filtros de siempre (`?tipo=casa&q=Altozano&precio_max=4000000&recamaras=3&con=alberca&frase=…`): nada se aplica «por debajo», así que la página 2, el scroll, la API y un enlace compartido no dependen de la IA.

| Archivo | Qué guarda |
|---|---|
| `shared/parecido.ts` | Cómo suena una palabra (`s/z/c`, `b/v`, `h` muda…) y cuántos errores se le perdonan según su largo |
| `shared/frase.ts` · `shared/dinero.ts` | **La capa que no gasta:** operación, tipo, orden, recámaras, baños, clave, los rasgos más pedidos y **los precios** (monto por aritmética, papel por comparador: al modelo ni se le preguntan, no sabe sumar). Lo que sobra (`resto`) decide si se pregunta al modelo |
| `shared/lugares.ts` | Qué lugar del catálogo es («altosano» → «Altozano»). El lugar va a `q`, **no** a `zona`: la misma zona está repartida en muchas colonias |
| `shared/rasgos.ts` | `?con=alberca`: se busca en título, resumen y descripción, en JavaScript, con sinónimos, plural y corrección |
| `shared/intencion.ts` | Lo que se le pide al modelo (instrucciones y esquema) y `validarIntencion`, que no le cree nada que la frase no sostenga |
| `server/busqueda/entender.ts` · `corpus.ts` | El orden de las tres capas, la regla de que **la frase manda sobre el formulario** y la redirección · el catálogo en memoria un minuto |
| `server/ia/motor.ts` · `uso.ts` | **Única puerta a Workers AI:** modelos medidos, las dos familias, el reloj de 3.5 s · tope diario, memoria por huella y la cuenta del día |
| `app/components/publico/entendido.tsx` | «Así lo entendimos» y los rasgos que se quitan con un toque |
| `app/routes/panel/configuracion.tsx` | El bloque «Buscador inteligente»: interruptor, modelo, tope y gasto de la semana (permiso `configuracion.buscador`: maestro y director) |
| `migrations/0005_busqueda_ia.sql` | `ia_cache`, `ia_uso` y la fila `busqueda_ia`, que nace encendida |

**El modelo de fábrica es el más chico del catálogo (Granite 4.0 Micro)** porque su trabajo se hizo chico: sacar el lugar y los rasgos. Si se le devuelve trabajo (precios, tipo), deja de ser el bueno. **Para cambiar el modelo de fábrica o las instrucciones:** `npm run medir:ia` primero (65 frases × los modelos candidatos; la tabla del 20/09 está en §19), y al cambiar las instrucciones subir `VERSION_DE_INSTRUCCIONES` en `entender.ts`, que invalida la memoria. Una frase nueva que el buscador no entienda se agrega a `scripts/lib/frases-de-prueba.mjs` **antes** de arreglarla.

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

> **Punto de retoma del 23/09/2026 (el panel en el teléfono, en producción).** Todo está **empujado y
> desplegado** (Worker `b328a05c`); el árbol quedó limpio salvo `Plan_CRM_Inmobiliario_AIG.md`, la base local sin datos de muestra
> y el `vite preview` apagado. Lo primero de la lista es lo que el usuario dejó abierto, no un
> arreglo pendiente de código.

0.quinquies **Del panel en el teléfono (en producción desde el 23/09/2026), esperando SU palabra:**
   - **Elegir cómo se navega en el teléfono:** cuatro maquetas retratadas sobre la página real en
     `Escritorio\portada-propuestas\panel-23-09\navegacion-en-telefono-4-opciones.png` — A menú
     plegable (hoy), B barra inferior (Inicio · Casas · Prospectos con su número · Métricas ·
     Más), C barra oscura con «Subir casa» al centro, D accesos deslizables bajo la cabecera. El
     agente recomendó la B; **no contestó antes de pedir el despliegue**, así que sigue la A.
     La maqueta vive en `maqueta-nav.mjs` (temporal de la sesión): inyecta la barra por CDP.
   - **Seguir con el resto:** Contenido y Configuración (páginas largas: un índice de anclas
     arriba ayudaría), Cuentas (en el teléfono el alta va antes que la lista) y Bitácora
     («el prospecto #68» en vez del nombre, y la etiqueta «estado» suelta en cada renglón).
   - **`Plan_CRM_Inmobiliario_AIG.md`** sigue sin commit en la raíz (el repo es público y trae
     su nombre completo); se le preguntó si subirlo o sacarlo y no contestó. `PLAN.md` F8 lo
     menciona por nombre.

0.quater **De Métricas con gráficas (en producción desde el 22/09/2026), lo que queda abierto:**
   - **En producción se ve casi vacío:** una semana de visitas (~100, casi todas del equipo: en
     modo propuesta no llega nadie más) y un prospecto. Es lo esperado; con datos de muestra se
     ve como en las capturas de `Escritorio\portada-propuestas\metricas-21-09\`.
   - **Las verificaciones también cuentan como visitas:** `f2`, `movimiento` y `f3-navegador`
     abren fichas con Chrome sin cabeza y cada corrida deja una o dos `ficha_vista` (medido el
     22/09: las 07:35 y 07:37 UTC, en `casa-en-el-prado-4`). Pasaba desde antes; ahora se ve en
     las gráficas, igual que las visitas del propio equipo. Arreglo posible, decisión suya: que
     `POST /api/eventos` ignore a los robots (`isbot` ya está en el proyecto) y a quien traiga
     la cookie del panel (`__Host-aig_sesion`). No se hizo.
   - **Decisiones del agente que son suyas:** (1) teléfono y «compartir» ocultos mientras no
     haya ninguno, porque **ninguna página los emite**; si quiere medirlos, se cablea
     `telefono_click` en los `tel:` de `marco.tsx` (pie) y `contacto.tsx`, y de paso el WhatsApp
     GENERAL (botón flotante, Contacto, pie), que hoy tampoco se cuenta: solo el de las fichas;
     (2) 10 casas a la vista de 25; (3) 4 tipos y 6 colonias nombradas, el resto en una línea;
     (4) el último punto punteado «en curso»; (5) mediana y no promedio para el tiempo de
     atención; (6) tinta para lo que se ve y rojo para lo que se convierte. Si pide otro color o
     composición, **enséñale cuatro retratadas**, como siempre: las piezas toman los colores de
     `COLOR` y las rampas de `graficas.tsx`.

0.ter **De Contacto (21/09/2026), esperando SU palabra** (ninguna es un fallo):
   - ~~Subir el ajuste de los renglones de contacto~~ **Hecho:** `62a2db4` subió con Métricas
     (Worker `5bdc97d4`, 22/09/2026); `verificar:contacto --remote` 28/28.
   - **La composición:** quedó puesta la A (el mostrador); las otras tres están retratadas en
     `Escritorio\portada-propuestas\contacto-21-09\` (§5 dice cómo se cambia).
   - **Dos decisiones que tomó el agente y son suyas:** la lista de «¿Qué necesitas?» (Comprar,
     Rentar, Vender, Poner en renta, Crédito) y la regla **«sin teléfono y sin correo no se
     acepta»** (antes bastaba el nombre).
   - **Capturar teléfono, correo, dirección y horario** en Panel › Configuración: el mostrador los
     enseña solos (con «Copiar» y «Abrir en Mapas»). Hoy en producción no hay ninguno.
   - **Probar en el Safari del iPad:** `field-sizing` (el mensaje que crece al escribir) es solo
     de Chrome —en Safari se queda en 4 renglones—; `:has()` y la animación de alto van desde
     Safari 15.4 y 13.1.
   - **El «Me interesa» de la ficha** sigue con sus campos de antes: podría usar el mismo campo
     (`Campo` de `contacto.tsx`) y la misma regla compartida, si lo pide.

0.bis **De esta sesión, esperando SU palabra** (ninguna es un fallo):
   - **Elegir la columna de «Encuentra tu propiedad»:** quedó puesta la D (índice de tipos +
     colonias). Las cuatro maquetas están en `Escritorio\portada-propuestas\columna-20-09\`.
     Para volver a la A, el markup viejo está en `git show d658f0f^:sitio/app/routes/publico/inicio.tsx`.
   - **Elegir el pie:** quedó puesto el de cuatro columnas (opción D de
     `Escritorio\portada-propuestas\pie-20-09\opciones-de-pie.png`).
   - **Pegar los enlaces de TikTok, X, YouTube… en Panel › Configuración › Redes.** Hasta que lo
     haga, producción enseña solo Facebook e Instagram, que es lo correcto.
   - **Capturar teléfono, correo y dirección** en Panel › Configuración: la columna «Escríbenos»
     del pie se convierte sola en «Contacto» (hay captura de cómo se verá en `pie-20-09\`).
   - **Escribir «Saludo» y «Lema»** en Panel › Contenido, y **más preguntas frecuentes**: la
     sección existe en producción con UNA sola y se ve despoblada. Nada de eso se inventa aquí.
   - **`npm run verificar:redes -- --remote`**: no se corrió; sobrescribe temporalmente la fila
     `redes` de producción. Preguntar antes.


0. **De la portada que vende** (en producción, §5), lo que el usuario dejó abierto:
   - **El movimiento.** El «se abre al bajar» lo pidió y aprobó él por la mañana y se fue con la composición
     nueva; eligió la 2 mirando una captura QUIETA, se le avisó al cerrar y **no contestó**. Si lo pide de
     vuelta, va sobre la composición de ahora (la foto ya empieza abierta: sería otro movimiento, no aquel
     riel de 1.9 pantallas).
   - **La foto de portada.** Hoy es AIG-0188, la imagen más visible del sitio, y trae alambre de púas a la
     izquierda y una obra de ladrillo a la derecha. Se cambia en Panel › Contenido, «Casa de la foto
     principal». Ya se le dijo dos veces: es decisión suya, no se toca la base por un agente.
   - **«Saludo» y «Lema» están vacíos** en Panel › Contenido. El antetítulo con su filete y el renglón bajo el
     titular existen en el código y no salen por eso. Los escribe él: aquí no se inventa contenido del negocio.
   - **Medir Lighthouse móvil otra vez.** El LCP sigue siendo la foto de 1600 px —ahora a pantalla completa y
     con `fetchPriority="high"`— y F2 venía con 82 contra la meta de 90. Y verlo en el Safari del iPad: usa
     `100svh` (el `clip-path` animado ya no existe).

1. **Del buscador que entiende frases** (en producción desde el 20/09/2026, §5): probarlo en el Safari del iPad, que es donde el usuario mira el sitio; mirar en Panel › Configuración cuánto se usa de verdad (si casi nadie llega al modelo, el tope de 300 sobra; si el modelo falla seguido, cambiarlo ahí mismo); y en F6, que la etiqueta `canonical` no lleve `frase` ni `literal`. Tres decisiones que tomó el agente y el usuario puede cambiar: nace encendido, lo apagan maestro y director, y el buscador de casas del PANEL no usa el modelo.

2. **Dos cuentas de prueba activas en producción:** `entregas-contenido@ejemplo.invalid` y `entregas-asesor@ejemplo.invalid`, del 19/09/2026 21:31 UTC, que dejó una corrida de `verificar:entregas`. No son un hueco (contraseña aleatoria por corrida, no está en el repo, y el acceso frena a 8 por minuto), pero rompen el «cero cuentas de prueba». Se limpian con `npm run verificar:entregas -- --base https://activos-inmobiliarios.logidma.workers.dev --remote` **sin** `--dejar`, y después se mira la base. Se le ofreció al usuario y no contestó: **pregunta antes**, es producción.
3. **Probar en el Safari del iPad.** Es donde el usuario mira el sitio, y todo lo medido fue en Chrome. En los dibujos, lo que más puede diferir: `transform-box: fill-box` en los gestos, `pathLength` en la entrada y `:has()` en el megáfono.
4. **Decisiones que el usuario tiene abiertas:** llevar los dibujos, en chico, a la franja oscura de servicios de la portada (se le ofreció; ojo: sobre tinta el rojo `#A0051C` no contrasta, haría falta el claro del isotipo, `#F5515F`); y el guion de la demo (`verificacion/guion-demo.md`) todavía no menciona Servicios.
5. **F2, criterio 5:** Lighthouse móvil 82/74/78 contra 90. El techo medido es el FCP con ~1 MB bajo 4G, no el servidor. **Lighthouse en local no sirve para comparar** versiones aquí: solo producción contra producción, el mismo día. El CSS de los dibujos sumó +1.06 KB gzip a todas las páginas.
6. **Del dueño o de su abogado, no de un agente:** el aviso de privacidad tiene que mencionar las fotos y comentarios de las Entregas. Aquí no se redacta texto legal.
7. **Menores, anotados en §19:** el lema sigue escrito en el código; `/entregas` no está en el `sitemap` (en F6, solo si hay alguna publicada).
8. **F5, lo que queda:** crear los usuarios reales **solo cuando el usuario lo pida**, y revisar con el equipo la lista de avisos de la migración.
9. **F6 espera a los consultores** (`PEDIR-A-CONSULTORES.md`) y nada de F6 se hace sin que el usuario lo pida. **El dominio vence el 06/12/2026.**
10. **DESPUÉS DE F6, EL SIGUIENTE PASO ES EL CRM** (`Plan_CRM_Inmobiliario_AIG.md`, en la raíz; decidido por el usuario el 23/09/2026). `PLAN.md` §15 «F8» tiene la revisión contra el código y lo que le falta al plan. No se empieza antes de cerrar F6 ni sin su palabra.

## 7. Verificar

Con `npm run build` y `npx vite preview --port 5180 --strictPort` levantado. Contra producción, cambia la `--base` y `--local` por `--remote`.

| Comando | Qué cubre |
|---|---|
| `npm test` · `npx tsc -b` | 382 pruebas · tipos |
| `npm run verificar:f2 -- --base http://localhost:5180 --local` | El sitio público: 39 comprobaciones |
| `npm run verificar:listado -- --base http://localhost:5180` | El listado y **volver de una ficha** (su apartado 3). Sin `--base` apunta al puerto 4180 |
| `npm run verificar:vitrina -- --base http://localhost:5180` | La vitrina de la portada. Misma trampa del 4180 |
| `npm run verificar:movimiento -- --base http://localhost:5180` | Que nada quede invisible, con y sin «menos movimiento». Incluye `/servicios` y `/contacto`, y **prueba el botón de pausa** |
| `npm run verificar:contacto -- --base http://localhost:5180 --local [--capturas carpeta]` | Contacto **pulsando los botones**: errores en su campo, el camino sin JavaScript, el gracias con la trampa y, solo en local, un envío real que queda como `vender` y se borra, y los renglones de la oficina con datos sembrados (devuelve la fila). 39 en local; con `--remote` no escribe nada (28) |
| `npm run verificar:f3 -- --base http://localhost:5180 --local` | El panel, por API |
| `npm run verificar:f3-navegador -- --base http://localhost:5180 --local` | El panel pulsando botones, el campo «Dibujo» y, **solo en `--remote`**, el criterio 8. Ese criterio reconoce los trozos del panel por FRASES que solo existen ahí (`MARCAS`): **una pantalla nueva del panel necesita su frase en la lista**, o su trozo pasa sin que nadie lo mire (le pasó a Métricas hasta el 22/09/2026) |
| `npm run verificar:f4 -- --base http://localhost:5180 --local` | Prospectos y métricas: 54 comprobaciones, con cada gráfica del tablero contra un `SELECT` a mano (su sección 4b) |
| `npm run metricas:muestra -- --local [--limpiar]` | No verifica: siembra en LOCAL cuatro meses de datos inventados para MIRAR Métricas (sesiones de maestro, asesora y contenido en `%TEMP%\aig-metricas-demo.json`, para `capturar` con `AIG_COOKIE`). **Ciérralo siempre con `--limpiar`**: F3 y F4 esperan la base sin cuentas de prueba. En remoto se niega |
| `npm run verificar:entregas -- --base http://localhost:5180 --local` | Entregas. Con `--dejar` NO limpia (es para capturas): la corrida siguiente sin la bandera sí |
| `npm run verificar:redes -- --base http://localhost:5180 --local` | Las redes del pie **pulsando «Guardar las redes»** en el panel: el desplegable, lo que queda en la base, lo que sale en el pie y que vaciar el enlace quita la red. Crea una cuenta de dirección y la borra; devuelve la fila a como estaba |
| `npm run verificar:busqueda -- --base http://localhost:5180 --local [--ia]` | El buscador: lo que entiende sin modelo, la frase tecleada en la portada, el interruptor del panel y, con `--ia`, el modelo de verdad (gasta unas consultas). **En local el binding `AI` va a la nube:** también gasta |
| `npm run medir:ia` | No verifica el sitio: compara modelos de Workers AI con 65 frases (`--sin-modelo` dice cuántas se resuelven sin preguntar). Necesita la sesión de wrangler con ámbito `ai` |

Los que crean cuentas chocan con el freno de acceso (8 por minuto desde una misma IP) y reintentan solos a los 65 s: no es un fallo.

**Herramientas para mirar** (nuevas, 20/09/2026):

- `npm run capturar -- <url> salida.png [ancho] [alto] [movil]` — una captura.
- `npm run filmar -- servicios carpeta/` y `py scripts/armar-gif.py carpeta/ salida.gif` — la página moviéndose, a velocidad real. Necesita Pillow.
- `npm run hoja:dibujos -- salida.png` — los dibujos en grande y en reposo.
- **Fuera del repo**, en `Escritorio\portada-propuestas\_maquetas\` (su `LEEME.txt` explica cada uno):
  `node medir-heroe.mjs` mide la primera pantalla en 390/768/1024/1280/1366/1920 —dónde acaba el héroe, el
  renglón más ancho del titular, el buscador y el desborde horizontal— y es lo que cerró la composición de
  hoy; `node scroll-capturar.mjs` la retrata a varias alturas de scroll; `sh rehacer.sh` cierra el preview,
  reconstruye y lo vuelve a levantar. Ahí están también las cuatro maquetas que se le enseñaron.

## 8. El worktree

`.claude/worktrees/f5-formularios-y-guion` es la copia de trabajo de otra sesión. Su rama ya está unida a `main` y no tiene nada propio, pero **no la borres sin preguntar**: puede haber alguien usándola. Está en `.gitignore` para que un `git add .` no la meta al repositorio.
