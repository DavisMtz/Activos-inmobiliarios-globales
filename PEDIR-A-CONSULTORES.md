# Lo que hay que pedir a los consultores

Guía para conseguir de **MARC Consultores Web** (y de los proveedores del sitio actual) todo lo que hace falta para mudar la página **sin perder el correo, las estadísticas ni lo que Google ya conoce**.

- **La propuesta no depende de nada de esto.** Se construye y se enseña con los datos públicos del sitio. Esto solo se necesita para la **salida a producción** (fase F6 de `PLAN.md`).
- **Todo lo que llegue entra cambiando configuración, no código.** La última sección dice dónde entra cada cosa.
- Datos verificados el 16/09/2026 con consultas públicas (RDAP, DNS e IP). Detalle en `analisis/ANALISIS.md` §2 y §11.9.

---

## 1. Lo urgente

| Qué | Dato | Por qué importa |
|---|---|---|
| **Vencimiento del dominio** | `activosinmobiliariosglobales.com` está registrado en **Neubox Internet S.A. de C.V.** desde el 06/12/2024 y **vence el 06/12/2026** | Si no se renueva, se caen la página **y el correo `info@`**. Hay que renovarlo pase lo que pase con la página nueva |
| **A nombre de quién está** | No es público | El dominio debe estar **a nombre del negocio o del dueño**, no de los consultores. Si está a nombre de ellos, pedir que lo transfieran a una cuenta de Neubox del negocio |

---

## 2. Mensaje listo para enviar

> Ajusta el saludo y la firma según quién lo mande (el dueño o David en su nombre). Es cordial a propósito: la página actual debe seguir funcionando mientras se hace la transición.

---

**Asunto:** Accesos y respaldo del sitio activosinmobiliariosglobales.com

Hola, buen día:

Les escribo de parte de Activos Inmobiliarios Globales. Estamos organizando la documentación y los accesos de nuestros servicios digitales y les agradeceríamos su apoyo con lo siguiente:

1. **Dominio:** confirmar a nombre de quién está registrado `activosinmobiliariosglobales.com` en Neubox, la fecha de vencimiento y los accesos a la cuenta donde se administra. Nos interesa que quede a nombre de la empresa y asegurar su renovación antes del 6 de diciembre de 2026.
2. **DNS y hosting:** la lista completa de registros DNS del dominio (incluidos MX, SPF, DKIM y DMARC) y los datos de acceso al panel del hosting.
3. **Correo:** cómo está configurado el correo `info@activosinmobiliariosglobales.com`, cuántas cuentas existen y desde qué programas se consultan.
4. **Respaldo:** un respaldo completo del sitio (base de datos y carpeta `wp-content/uploads`, con todas las fotos).
5. **Google:** acceso de administrador a Google Analytics (medición `G-R1K372MV0S`) y, si existe, a Google Search Console.
6. **Formularios:** a qué correo llegan hoy los mensajes de los formularios del sitio.
7. **Licencias:** la lista de licencias o suscripciones que se pagan para el sitio (por ejemplo Elementor Pro, Crocoblock/Jet, Astra Pro) y sus fechas de vencimiento.

Quedamos atentos. Muchas gracias por su apoyo.

Saludos,
*[Nombre]*
*Activos Inmobiliarios Globales*

---

## 3. Lista de lo que hay que conseguir

Marca cada casilla cuando llegue y anota dónde quedó guardado. **Nunca pegues contraseñas en este archivo.**

| ✔ | Qué | A quién | Prioridad | Para qué sirve | Dónde quedó |
|---|---|---|---|---|---|
| ☐ | Titular del dominio y acceso a la cuenta de **Neubox** | Consultores | 🔴 Urgente | Renovar y, al final, conectar el dominio a la página nueva | |
| ☐ | **Renovación** del dominio pagada | Dueño / consultores | 🔴 Urgente (antes del 06/12/2026) | Que no se caigan la página ni el correo | |
| ☐ | **Lista completa de registros DNS** (captura o archivo de zona) | Consultores / HostDime | 🔴 Alta | Copiarlos idénticos a Cloudflare **antes** de mudar; si no, deja de llegar el correo | |
| ☐ | Dónde vive el **correo `info@`**, cuántas cuentas hay y cómo se consultan | Consultores | 🔴 Alta | No perder correo al mudar | |
| ☐ | **Respaldo completo** de WordPress (base de datos + `wp-content/uploads`) | Consultores | 🟠 Media | Fotos con la mejor calidad disponible, casas no publicadas y datos que la página pública no muestra (amenidades) | |
| ☐ | Acceso de administrador a **Google Analytics** `G-R1K372MV0S` | Consultores | 🟠 Media | Conservar el historial de visitas | |
| ☐ | Acceso a **Google Search Console** (si existe) | Consultores | 🟠 Media | Avisar a Google de la mudanza y vigilar errores | |
| ☐ | A dónde llegan los **mensajes del formulario** (y, si se puede, el historial) | Consultores | 🟡 Normal | Saber si se perdieron contactos; opcional importarlos | |
| ☐ | **Licencias** pagadas y vencimientos | Consultores | 🟡 Normal | No renovarlas después de la mudanza | |
| ☐ | Acceso de panel al **hosting** (HostDime) | Consultores | 🟡 Normal | Solo si el correo se queda ahí | |
| ☐ | **Logotipo en vector** (SVG, AI o PDF) y colores oficiales | Dueño o consultores | 🟡 Normal | Logo nítido en la página nueva | |
| ☐ | Administración de la **página de Facebook** e **Instagram** | Dueño | 🟡 Normal | Enlaces correctos y, más adelante, publicar desde el panel | |

---

## 4. Lo que ya se sabe del sitio actual

| Pieza | Dato verificado |
|---|---|
| Registrador del dominio | Neubox Internet S.A. de C.V. (IANA 1483) · alta 06/12/2024 · **vence 06/12/2026** · bloqueo de transferencia activo (normal) |
| Servidores DNS | `dizinc.com`, que operan los servidores de HostDime (DimeNOC). El registro de Neubox delega en `dns31884/dns31885.dizinc.com` y la zona se anuncia con `dns32532/dns32533.dizinc.com`: ambos son de HostDime y suele ser normal. Basta con que lo confirmen al mandar la lista de DNS |
| Servidor de la página | IP `201.131.125.10`, de **HostDime.com.mx S.A. de C.V.** (Apache) |
| Correo | El registro MX apunta **al mismo servidor de la página** |
| Analítica | Google Analytics 4 · `G-R1K372MV0S` |
| Quién lo hizo | «Sitio Creado por MARC Consultores Web ® 2025» |

---

## 5. Dónde entra cada cosa en la página nueva

Así la mudanza es cambiar configuración, no reprogramar. Detalle técnico en `PLAN.md` §6.

| Cuando llegue… | Qué se hace | Dónde |
|---|---|---|
| Acceso al dominio | Se conecta el dominio a la página nueva y se apaga el modo propuesta | Cloudflare (dominio propio del Worker por API) + variables `SITIO_URL` y `MODO_DEMO=0` |
| Registros DNS | Se copian **idénticos** a Cloudflare, sobre todo MX, SPF, DKIM y DMARC | Zona DNS en Cloudflare |
| Datos del correo | Se decide si el correo se queda en HostDime, pasa a Google Workspace o se reenvía con Cloudflare. Después se activan los avisos de clientes nuevos | Variables `CORREO_PROVEEDOR` y `CORREO_AVISOS_A`, y secreto `BREVO_API_KEY` |
| Respaldo de WordPress | Se reimportan fotos y datos desde el respaldo en lugar del sitio público | `scripts/sembrar-desde-wordpress.mjs --respaldo <ruta>` |
| Google Analytics | Se pone el mismo identificador para no perder el historial | Variable `GA4_ID` |
| Search Console | Se verifica el dominio y se envía el sitemap nuevo | Registro TXT en DNS |
| Historial de formularios | (Opcional) se importa como clientes interesados | Tabla `prospectos` |
| Logotipo en vector | Se reemplazan los PNG | `sitio/public/marca/` |
| Dirección, teléfonos y redes correctos | **No hace falta programador**: los cambia el director desde el panel | Panel → Configuración |

---

## 6. Orden de la mudanza (cuando todo esté listo)

1. **Renovación del dominio confirmada.**
2. **Copia completa de los DNS actuales.**
3. Crear la zona en Cloudflare con **los mismos** registros de correo.
4. Probar que el correo **envía y recibe** antes de seguir.
5. Conectar el dominio a la página nueva y quitar el modo propuesta.
6. Verificar las redirecciones de las direcciones viejas (`/properties/…` → `/propiedades/…`).
7. Enviar el sitemap nuevo a Google Search Console.
8. Vigilar errores durante una semana.
9. **Solo entonces** pedir que se dé de baja el WordPress y no renovar las licencias.

**No hacer:**

- No cambiar los servidores DNS sin haber copiado antes los registros de correo.
- No dejar que borren el WordPress hasta tener el respaldo **y** haber comprobado que abre.
- No cancelar el hosting mientras el correo siga viviendo ahí.

---

## 7. Si no responden

- **Dominio:** Neubox atiende al **titular registrado**. Si el titular es el negocio o el dueño, puede recuperar la cuenta directamente con Neubox acreditando su identidad, sin pasar por los consultores.
- **Página y fotos:** lo esencial (las 188 casas con precios, características y fotos) **ya se obtuvo del sitio público** para la propuesta. El respaldo mejora la calidad, pero la mudanza no depende de él.
- **Google Analytics:** si no dan acceso, se crea una medición nueva. Solo se pierde el historial.
- **Correo:** es lo único delicado. Antes de mover DNS hay que conocer los registros MX; se pueden consultar públicamente, pero conviene la confirmación de ellos para no perder buzones.
