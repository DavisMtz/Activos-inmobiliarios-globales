# Guion de la demostración · 10 minutos

Para enseñarle la propuesta al dueño (PLAN §15, F5). Todo lo que se enseña aquí ya está medido en producción (PLAN §19); no hay nada que prometer que no exista.

- **Sitio:** https://activos-inmobiliarios.logidma.workers.dev
- **Panel:** https://activos-inmobiliarios.logidma.workers.dev/panel — entra con tu cuenta (maestro). Ninguna contraseña va en este archivo: el repositorio es público.

---

## Antes de empezar (5 minutos, sin el dueño)

1. **Una ventana de incógnito para el sitio** y otra normal para el panel, con la sesión ya abierta. La bienvenida animada sale **una vez por pestaña** y solo si se entra por la portada: si ya la viste, abre una pestaña de incógnito nueva.
2. **El celular a la mano** con la URL del sitio abierta: lo que más importa es cómo se ve ahí. En la computadora, el sitio y el panel aprovechan el ancho (formularios en dos columnas desde 1280 px).
3. **Tener claro que es modo propuesta** (`MODO_DEMO=1`): la franja negra de arriba lo dice, Google no lo indexa y **no se mandan correos**. Los prospectos sí se guardan en la base.
4. **El WhatsApp de la configuración es un número real** (el que dio el negocio). Si se pulsa el botón en la demostración, el mensaje le llega a esa persona: enséñalo sin enviar, o avísale antes.
5. Si vas a subir una casa en vivo, ten a la mano **el texto de una publicación de Facebook** y **dos o tres fotos** en el celular.

---

## 1. El sitio público (4 minutos)

| Min. | Qué enseñar | Qué decir |
|---|---|---|
| 0:00 | **Portada** en incógnito: la bienvenida, el buscador y la vitrina con una casa real | «Son las 188 casas de la página actual, pasadas con sus 3,241 fotos.» |
| 0:45 | **Buscar** por precio y colonia; cambiar a renta | «El buscador de hoy solo llega a un millón y 181 casas cuestan más. Este llega a $65,000,000 y los filtros quedan en la dirección, así que una búsqueda se puede mandar por WhatsApp.» |
| 1:45 | **Ficha** de una casa: galería, precio, medidas y la **clave** (AIG-0123) | «La clave sirve para identificarla por teléfono.» |
| 2:30 | El botón de **WhatsApp** (sin enviar): el mensaje ya dice título, clave y enlace | «Hoy el mensaje es genérico y no se sabe qué casa era.» |
| 3:00 | Mandar el **formulario de informes** de esa ficha con datos de prueba | «Esto llega al panel con la casa pegada.» Usa un nombre que se note que es prueba. |
| 3:30 | Pie y Contacto: **una sola dirección y un solo teléfono** (cuando el equipo los capture) | Hoy el pie y Contacto dicen dos direcciones distintas. |

## 2. El panel (5 minutos)

| Min. | Qué enseñar | Qué decir |
|---|---|---|
| 4:00 | **Inicio** del panel y el menú | «Cada quien entra con su correo; la primera vez, con una contraseña temporal que el sistema obliga a cambiar.» |
| 4:30 | **Prospectos:** el que se acaba de mandar, con su casa; asignarlo, cambiarle el estado, una nota y «Contestar por WhatsApp» | «Un asesor solo ve los suyos. Esto se descarga en Excel.» |
| 5:30 | **Subir una casa:** pegar el texto de Facebook y pulsar «Leer el texto» | «Llena precio, recámaras, baños y metros; lo que llenó queda marcado para que alguien lo confirme.» |
| 6:30 | Guardar, **subir fotos desde el celular** y **publicar** | «Lo que sube un asesor queda en revisión y lo publica el director o contenido. Sin precio o sin foto, no deja publicar y dice qué falta.» |
| 7:30 | En una casa: **marcarla como apartada o vendida** | «Deja de salir en las búsquedas; hoy no hay manera de hacerlo.» |
| 8:00 | **Métricas:** vistas y clics de WhatsApp por casa | «Se ve qué casas mueven y cuáles no.» |
| 8:30 | **Configuración:** el teléfono, el WhatsApp y las redes | «Se cambian aquí y se ven en todo el sitio, sin pedírselo a nadie.» |
| 9:00 | **Bitácora:** lo que se acaba de hacer, con quién y cuándo | «Queda registro de cada cambio de precio o de estado.» |

## 3. Cierre (1 minuto)

- «La página actual sigue funcionando igual; esto es una versión de prueba para usarla con calma.»
- Lo que se necesita de él (lista abajo).

---

## Lo que falta y hay que decidir con el equipo

- **El dominio vence el 6 de diciembre de 2026** (Neubox). Se renueva, se cambie o no de página (`PARA-MI-PAPA.md`).
- **Contacto vacío:** en la base, teléfono, correo, dirección y horario están en blanco a propósito (no se inventan). El equipo los llena en Configuración.
- **Aviso de privacidad:** es un borrador y lo tiene que revisar un abogado.
- **Quién entra:** las cuentas reales (director, contenido, asesores) se crean en Cuentas **cuando el dueño lo diga**.
- **Asignación de prospectos:** hoy los asigna el director; si prefiere que vayan solos al asesor de la casa, es decisión suya (PLAN §19, F4).
- **Avisos de la migración** (detalle en `f1-reporte-siembra.md`): las 188 casas llevan «confirmar disponibilidad»; 164 tienen la colonia adivinada del título y 24 sin colonia; 11 sin resumen; 6 en preventa; 6 mencionan a un asesor; 5 sin precio de renta; 3 con el tipo por elegir.
- **Dos fotos dañadas** en la página actual (AIG-0094, un plano, y AIG-0096, un baño): si el equipo tiene los originales, se vuelven a subir desde el panel.
- La salida a producción (dominio, correo, Google) depende de los consultores (`PEDIR-A-CONSULTORES.md`).

## Al terminar

- **Limpiar desde el panel** lo que se creó en vivo: quitar las fotos de la casa de prueba con «Quitar» y mandarla a la papelera (borrar la fila en la base **no** borra la foto de Cloudinary, PLAN §17).
- El panel **no borra prospectos**: el de prueba se marca como «descartado». Si hay que quitarlo de la base, se hace a mano con `wrangler d1 execute --remote`.
- Si se cambió algo en Configuración, dejarlo como estaba.
