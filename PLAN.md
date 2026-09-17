# Plan de construcción · Sitio y panel de Activos Inmobiliarios Globales

- **Fecha del plan:** 16 de septiembre de 2026
- **Para quién es:** el agente que va a construir. Se escribió para que no tenga que volver a investigar nada.
- **Qué se construye:** una **propuesta funcional** del sitio nuevo de la inmobiliaria (con las 188 casas reales) y su **panel privado**, lista para enseñársela al dueño. Debe poder convertirse en el sitio definitivo **sin reescribirla**: todo lo que hoy falta (dominio, correo, cuentas) entra después cambiando configuración.
- **Contexto completo:** `analisis/ANALISIS.md` (qué hace hoy el sitio, qué está mal y por qué se propone esto).
- **Documentos para personas:** `PARA-MI-PAPA.md` (para hablar con el dueño) y `PEDIR-A-CONSULTORES.md` (lo que hay que pedir a los consultores y dónde entra cada cosa).

---

## 0. Cómo usar este plan

1. Lee este archivo completo y después `analisis/ANALISIS.md` §4, §5 y §11. El análisis es el **porqué**; este plan es el **qué** y el **cómo**. Si se contradicen, **manda este plan** (se escribió después, con las decisiones ya tomadas).
2. Trabaja por fases (§15). Cada fase tiene un **«listo cuando»** verificable: no avances sin comprobarlo **contra la app corriendo**, no solo con pruebas unitarias.
3. Al cerrar cada fase, actualiza el **registro de avance** (§19) con lo hecho, lo pendiente y cualquier trampa nueva.
4. **No inventes contenido del negocio.** Nada de testimonios, cifras («+500 casas vendidas»), premios, fotos de equipo ni textos legales definitivos. Lo que no exista se oculta o se marca «pendiente» en el panel.
5. Las decisiones de §2 **no se reabren** sin preguntarle al usuario.

---

## 1. Objetivo de la propuesta

El usuario (David) le va a presentar a su papá, dueño del negocio, un sitio que ya funciona para convencerlo de dejar el WordPress que manejan unos consultores externos. La propuesta debe demostrar tres cosas:

1. **El sitio público es mucho mejor:** rápido en celular, buscador que sí funciona, ficha clara y contacto por WhatsApp que ya dice qué casa interesa. Todo con **sus casas reales**.
2. **El equipo lo puede administrar solo:** un panel privado donde el director, los asesores y la persona de contenido suben y cambian casas, fotos y textos, cada quien con su rol.
3. **Mudarse es seguro:** todo lo que depende de los consultores está identificado y se conecta después sin rehacer nada.

**Mínimo para enseñarlo:** fases F0 a F3. **Ideal:** también F4.

---

## 2. Decisiones tomadas (no reabrir)

| # | Decisión | Origen |
|---|---|---|
| D1 | **React** con TypeScript | Usuario |
| D2 | Todo corre en **un solo Worker de Cloudflare** (sitio público, API y panel) | Usuario |
| D3 | **Cloudinary** para fotos, videos y documentos | Usuario |
| D4 | **Cloudflare D1** como base de datos (propiedades, contenido, usuarios, prospectos) | Usuario aprobó el 16/09/2026 |
| D5 | Panel **privado**: no enlazado, `noindex` y solo con sesión | Usuario |
| D6 | Acceso al panel con **correo y contraseña** (no Cloudflare Access, no enlace mágico) | Usuario, 16/09/2026 |
| D7 | **Acceso maestro:** `davismartinesad@gmail.com` (rol `maestro`) | Usuario |
| D8 | Los demás usuarios entran con una **contraseña temporal** que **deben cambiar en su primer acceso** | Usuario |
| D9 | Roles: **maestro** (David), **director** (el papá), **asesor** (asesores), **contenido** (la hermana, que sube casas y textos) | Usuario; permisos detallados en §9 |
| D10 | Mientras no haya dominio, la propuesta vive en `*.workers.dev` y **no se indexa** en Google | Plan (evita contenido duplicado con el sitio vivo) |
| D11 | **Ninguna función depende de mandar correos** en la propuesta (claves temporales, avisos). El correo entra en F6 | Plan (ver §17, Brevo) |
| D12 | Git local desde el primer día. **No** instalar hook de auto-push | Plan (memoria `autopush-riesgo-parches`); el usuario decide después |
| D13 | **Diseño:** los colores de siempre (rojo `#A0051C`, vino `#760415`, negro `#111111`) y la información real del sitio actual, con **animación GSAP profesional para que se vea premium** (reemplaza el «movimiento discreto con CSS» original de §10.4) | Usuario, 16/09/2026 |
| D14 | La persona de **contenido sí publica** (tal como dice la matriz de §9) | Usuario lo confirmó el 16/09/2026 |

---

## 3. Lo que tiene que hacer el usuario (el agente no puede)

| # | Acción | Bloquea | Mientras tanto |
|---|---|---|---|
| U1 | ✅ **Resuelto el 16/09/2026 con la nube `srz5sh9l`** que dio el usuario. **Ojo:** no es una cuenta a nombre del negocio, es la personal que ya comparten Cuponera, `un` y la Biblioteca (plan gratuito, 25 créditos al mes, 9 % usado al 16/09). Todo lo de este proyecto va en la carpeta `aig/`. Si después quiere una cuenta propia del negocio: §13.5 `--forzar-desde-cuenta-actual` | — | — |
| U2 | Pegar esas credenciales en `sitio/.dev.vars` (local) y dejar que el agente las suba con `wrangler secret bulk` | Igual que U1 | — |
| U3 | Cambiar la contraseña temporal del acceso maestro en su primer inicio de sesión | Nada | — |
| U4 | Pedir a los consultores lo de `PEDIR-A-CONSULTORES.md` | Solo F6 (salida a producción) | La propuesta no lo necesita |
| U5 | **Asegurar la renovación del dominio: vence el 06/12/2026** (registrador Neubox) | Todo, a partir de esa fecha | — |

---

## 4. Arquitectura y stack

### 4.1 Una sola pieza

```
navegador ──► Worker «activos-inmobiliarios» (Cloudflare)
                ├─ /api/*            Hono: API pública y API del panel
                ├─ /panel/*          React (SSR) — privado, con sesión
                ├─ /sitemap.xml, /robots.txt, redirecciones 301
                └─ todo lo demás     React (SSR) — sitio público
                     │
                     ├─ D1 «activos-inmobiliarios-db» (binding DB)
                     ├─ Rate limiting (bindings LIMITE_ACCESO, LIMITE_FORMULARIOS)
                     └─ Cloudinary (API firmada desde el Worker; entrega por CDN)
```

### 4.2 Versiones (las mismas que `Desktop\Proyectos\un`, que ya compila en esta máquina)

| Pieza | Versión de referencia |
|---|---|
| Node | 24.19 portable en `C:\Users\seguimientos\.local\node` |
| React / React DOM | 19.2.x |
| React Router | 8.3.x |
| Hono | 4.13.x |
| Vite | 8.2.x + `@vitejs/plugin-react` 6.x |
| `@cloudflare/vite-plugin` | 1.54.x |
| Wrangler | 4.127.x (ya autenticado por OAuth con `davismartinesad@gmail.com`, permisos de Workers y D1) |
| TypeScript | 7.0.x |
| Estilos | Tailwind CSS 4 con `@tailwindcss/vite` y tokens en `@theme` |
| Pruebas | Vitest (funciones puras) + scripts de verificación contra `wrangler dev` |

### 4.3 Render en servidor: arranque con prueba corta (spike)

Las fichas tienen que llegar **con contenido y metadatos en el HTML** para Google y para la vista previa de WhatsApp. En esta máquina ningún proyecto usa todavía React Router en modo framework sobre Workers, así que:

- **Plan A (preferido):** React Router en **modo framework con SSR** sobre `@cloudflare/vite-plugin`. La entrada del Worker (`workers/app.ts`) monta Hono para `/api/*`, `sitemap.xml`, `robots.txt` y redirecciones, y le pasa todo lo demás al request handler de React Router. Punto de partida posible: `npm create cloudflare@latest -- --framework=react-router`, ajustado a las versiones de §4.2.
- **Prueba de aceptación del spike (máximo ~2 horas):** con `npm run dev`, `curl` a `/propiedades/<slug>` devuelve un HTML que **sin JavaScript** ya contiene el título y el precio leídos de D1 y `<meta property="og:image">`. `npm run build` y `wrangler deploy` también funcionan.
- **Plan B (si el spike falla):** el patrón de `un`: SPA con React Router en modo biblioteca, `assets.run_worker_first: true`, y el Worker **inyecta** en `index.html` el `<title>`, los metadatos OG, el JSON-LD y un HTML mínimo de la ficha (ver `Desktop\Proyectos\un\src\worker\lib\seo.ts`). Anota en §19 que se usó el Plan B y por qué.

---

## 5. Estructura de carpetas

```
activos-inmobiliarios-globales/
├── CLAUDE.md                     instrucciones cortas para cualquier agente
├── PLAN.md                       este archivo
├── PARA-MI-PAPA.md               para el dueño (sin tecnicismos)
├── PEDIR-A-CONSULTORES.md        lo que hay que pedir y dónde entra
├── analisis/                     análisis del sitio actual + datos crudos (NO tocar crudo/)
└── sitio/                        ← la app (créala aquí)
    ├── package.json
    ├── wrangler.jsonc
    ├── vite.config.ts
    ├── react-router.config.ts    (Plan A)
    ├── .dev.vars                 secretos locales (en .gitignore)
    ├── .dev.vars.example         nombres de las variables, sin valores
    ├── migrations/               0001_inicial.sql, 0002_…  (D1)
    ├── seed/
    │   ├── configuracion.json    datos de contacto, textos y servicios de la demo (§6.3)
    │   └── generado/             SQL generado por el script de siembra (en .gitignore)
    ├── workers/app.ts            entrada del Worker (Hono + React Router)
    ├── app/                      React Router (Plan A)
    │   ├── root.tsx
    │   ├── routes.ts
    │   ├── routes/publico/…      portada, listado, ficha, servicios, nosotros, contacto, aviso
    │   ├── routes/panel/…        entrar, cambiar-clave, inicio, propiedades, contenido…
    │   ├── components/
    │   └── styles/app.css        Tailwind + tokens
    ├── server/                   solo servidor
    │   ├── config.ts             lee y valida env (única puerta a vars y secretos)
    │   ├── db/                   consultas por módulo (propiedades.ts, usuarios.ts…)
    │   ├── auth/                 clave.ts, sesion.ts, guardia.ts
    │   ├── api/                  publica.ts, panel/*.ts
    │   ├── cloudinary.ts         firma, verificación, borrado
    │   ├── correo.ts             interfaz + implementación nula (demo) y Brevo (F6)
    │   ├── antispam.ts           honeypot + límite (demo); Turnstile (F6)
    │   ├── bitacora.ts
    │   └── seo.ts                títulos, OG, JSON-LD, canonical
    ├── shared/                   cliente y servidor
    │   ├── permisos.ts           ÚNICA matriz de roles (§9)
    │   ├── fotos.ts              urlFoto(foto, variante) (§13)
    │   ├── whatsapp.ts           enlace con la casa precargada
    │   ├── formato.ts            precios MXN, m², fechas
    │   ├── texto.ts              normalizar descripciones de Facebook
    │   └── tipos.ts
    ├── scripts/
    │   ├── sembrar-desde-wordpress.mjs
    │   ├── migrar-fotos-a-cloudinary.mjs
    │   └── crear-maestro.mjs
    ├── public/                   logotipos, favicon
    └── tests/
```

`.gitignore` de la raíz: `node_modules`, `sitio/.dev.vars`, `sitio/.wrangler`, `sitio/dist`, `sitio/build`, `sitio/seed/generado`, `analisis/crudo/html`, `analisis/crudo/lh`, `analisis/crudo/fichas`. **Sí se versionan** `analisis/crudo/api_*.json`, `medios/`, `inventario_propiedades.json` y los scripts, porque la siembra los necesita.

---

## 6. Configuración: fácil de cambiar después

### 6.1 Principios (obligatorios)

1. **Nada del negocio en el código.** Teléfonos, WhatsApp, correo, dirección, horario, redes, textos de portada, servicios y «nosotros» viven en la tabla `configuracion` y se editan desde el panel.
2. **Todo lo técnico por entorno.** `server/config.ts` es el único lugar que lee `env`: valida y aplica valores por defecto. Ningún otro archivo toca `env` directamente.
3. **Un solo dominio de verdad:** `SITIO_URL` alimenta canonical, `og:url`, sitemap y los enlaces de WhatsApp.
4. **Fotos detrás de `urlFoto()`.** Cambiar de WordPress a Cloudinary, o de una cuenta de Cloudinary a otra, no toca componentes.
5. **Correo, antispam y analítica detrás de interfaces** con implementación «apagada» para la demo.
6. **Roles en un solo archivo** (`shared/permisos.ts`), aplicado en el servidor y reflejado en la interfaz.

### 6.2 Variables y secretos

| Nombre | Tipo | Valor en la propuesta | Valor en producción (F6) |
|---|---|---|---|
| `SITIO_URL` | var | `https://activos-inmobiliarios.<subdominio>.workers.dev` | `https://activosinmobiliariosglobales.com` |
| `MODO_DEMO` | var | `"1"`: `noindex` en todo, `robots.txt` con `Disallow: /`, aviso «modo propuesta» dentro del panel, correos apagados | `"0"` |
| `NOMBRE_NEGOCIO` | var | `Activos Inmobiliarios Globales` | igual |
| `GA4_ID` | var | `""` (vacío = no se carga la etiqueta; **no** ensuciar la analítica real con la demo) | `G-R1K372MV0S` (o la que den los consultores) |
| `CLOUDINARY_CLOUD_NAME` | var | el de la cuenta nueva (U1); vacío mientras no exista | igual |
| `CLOUDINARY_CARPETA` | var | `aig` | `aig` |
| `CLOUDINARY_API_KEY` | secreto | U1 | igual |
| `CLOUDINARY_API_SECRET` | secreto | U1 | igual |
| `CORREO_PROVEEDOR` | var | `nulo` | `brevo` (u otro) |
| `CORREO_AVISOS_A` | var | `""` | correo del director |
| `BREVO_API_KEY` | secreto | — | F6 |
| `TURNSTILE_SITE_KEY` | var | `""` (vacío = honeypot + límite) | F6 |
| `TURNSTILE_SECRET` | secreto | — | F6 |

Secretos al Worker: **siempre** con `wrangler secret bulk <archivo.json>` (borrar el archivo después). `wrangler secret put` por tubería de PowerShell añade un salto de línea al valor.

### 6.3 Configuración editable (tabla `configuracion`, semilla en `sitio/seed/configuracion.json`)

Valores tomados del sitio actual (`analisis/ANALISIS.md` §1). Lo dudoso se marca `"por_confirmar": true`; el panel lo muestra como aviso y el sitio público lo muestra igual.

| Clave | Contenido de la demo | Quién lo edita |
|---|---|---|
| `contacto` | teléfono `443 298 3138`; correo `info@activosinmobiliariosglobales.com`; dirección `Batalla de Casa Mata #799, int. 9, Chapultepec Sur, Morelia, Mich.` con **`por_confirmar: true`** (el pie del sitio actual dice otra); horario vacío (se oculta) | director, maestro |
| `whatsapp` | número `524434922197`; plantilla `Hola, me interesa {titulo} ({clave}): {url}`; plantilla general `Hola, quisiera información sobre sus propiedades.` | director, maestro |
| `redes` | Facebook `https://www.facebook.com/profile.php?id=61569927005730`; Instagram `https://www.instagram.com/activosinmobiliariosglobales/` | director, maestro |
| `portada` | titular `Comercialización, renta y financiamiento de inmuebles`; lema `Donde cada propiedad cuenta una historia`; imagen: portada de una casa destacada (no la foto de catálogo actual) | director, contenido |
| `nosotros` | historia (fundados el 1 de diciembre de 2024 en Michoacán…), misión y los 4 valores del sitio actual; **visión vacía** (hoy es copia de la misión) | director, contenido |
| `servicios` | tabla `servicios`: los 6 del sitio actual con sus textos | director, contenido |
| `aviso_privacidad` | **borrador marcado «pendiente de revisión legal»**; no se presenta como definitivo | director |

### 6.4 Lo que depende de los consultores: dónde entra cada cosa

Esta tabla es la «ruta» que pidió el usuario. Detalle y mensaje para enviar en `PEDIR-A-CONSULTORES.md`.

| Dato | Valor en la propuesta | Quién lo da | Dónde se conecta | Fase |
|---|---|---|---|---|
| Acceso al dominio (Neubox; vence 06/12/2026) | `*.workers.dev` | consultores o dueño | Dominio propio del Worker con `PUT /accounts/{id}/workers/domains` (**no** con `routes` en `wrangler.jsonc`, §17) + `SITIO_URL` + `MODO_DEMO=0` | F6 |
| Registros DNS actuales (sobre todo **MX, SPF, DKIM, DMARC**) | — | consultores / HostDime | Copiar tal cual a la zona en Cloudflare **antes** de cambiar los servidores DNS | F6 |
| Dónde vive el correo `info@` y cuántas cuentas hay | correos apagados | consultores | `CORREO_PROVEEDOR`, `CORREO_AVISOS_A`, `BREVO_API_KEY` | F6 |
| Respaldo de WordPress (base de datos + `wp-content/uploads`) | datos leídos del sitio público (`analisis/crudo`) | consultores | `sembrar-desde-wordpress.mjs --respaldo <ruta>`: fotos originales, casas no publicadas y amenidades | F6 (opcional antes) |
| Acceso a Google Analytics | `GA4_ID` vacío | consultores | `GA4_ID` | F6 |
| Search Console | — | consultores | registro TXT en DNS + sitemap nuevo | F6 |
| Historial de mensajes del formulario | — | consultores | importación opcional a `prospectos` | F6 |
| Logotipo en vector (SVG/AI/PDF) | PNG del sitio actual | dueño o consultores | `sitio/public/` | cuando llegue |
| Licencias pagadas y vencimientos | — | consultores | nada que conectar: no renovarlas tras la mudanza | F6 |

---

## 7. Modelo de datos (D1) · `migrations/0001_inicial.sql`

Reglas de D1 que aplican (ver §17): **no hay transacciones interactivas** (usar `db.batch()` y `UPDATE` condicionales), y **no confiar en `ON DELETE CASCADE`** (borrar en orden, de las hojas a la raíz). Fechas en texto ISO 8601 UTC.

```sql
-- ─── Usuarios y sesiones ──────────────────────────────────────────
CREATE TABLE usuarios (
  id TEXT PRIMARY KEY,                          -- crypto.randomUUID()
  correo TEXT NOT NULL UNIQUE,                  -- normalizado: trim + minúsculas
  nombre TEXT NOT NULL,
  telefono TEXT,
  whatsapp TEXT,                                -- para mostrarlo en sus casas (opcional)
  rol TEXT NOT NULL CHECK (rol IN ('maestro','director','asesor','contenido')),
  clave_hash TEXT NOT NULL,                     -- pbkdf2$100000$<sal b64>$<hash b64>
  debe_cambiar_clave INTEGER NOT NULL DEFAULT 1,
  clave_temporal_expira TEXT,                   -- NULL cuando ya eligió la suya
  activo INTEGER NOT NULL DEFAULT 1,
  foto_public_id TEXT,
  visible_en_sitio INTEGER NOT NULL DEFAULT 0,  -- sale en «Equipo» (fase 2)
  creado_por TEXT REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  ultimo_acceso TEXT
);

CREATE TABLE sesiones (
  id_hash TEXT PRIMARY KEY,                     -- SHA-256 (hex) del token de la cookie
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  solo_cambio_clave INTEGER NOT NULL DEFAULT 0, -- 1 mientras la clave sea temporal
  expira_en TEXT NOT NULL,
  agente TEXT,
  creada_en TEXT NOT NULL
);
CREATE INDEX idx_sesiones_usuario ON sesiones (usuario_id);

-- ─── Configuración y contenido editable ────────────────────────────
CREATE TABLE configuracion (
  clave TEXT PRIMARY KEY,                       -- 'contacto','whatsapp','redes','portada','nosotros','aviso_privacidad'
  valor TEXT NOT NULL,                          -- JSON validado con un esquema por clave
  actualizado_por TEXT REFERENCES usuarios(id),
  actualizado_en TEXT NOT NULL
);

CREATE TABLE servicios (
  id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, descripcion TEXT NOT NULL,
  icono TEXT, orden INTEGER NOT NULL, visible INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE testimonios (
  id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, texto TEXT NOT NULL, foto_public_id TEXT,
  visible INTEGER NOT NULL DEFAULT 0, creado_en TEXT NOT NULL
);
CREATE TABLE preguntas (
  id INTEGER PRIMARY KEY, pregunta TEXT NOT NULL, respuesta TEXT NOT NULL,
  orden INTEGER NOT NULL, visible INTEGER NOT NULL DEFAULT 1
);

-- ─── Catálogo ─────────────────────────────────────────────────────
CREATE TABLE zonas (
  id INTEGER PRIMARY KEY,
  ciudad TEXT NOT NULL,                         -- Morelia, Pátzcuaro…
  colonia TEXT,                                 -- El Prado, Altozano… (NULL = toda la ciudad)
  slug TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  lat REAL, lng REAL,                           -- centro aproximado (fase 2: mapa)
  UNIQUE (ciudad, colonia)
);

CREATE TABLE propiedades (
  id INTEGER PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,                   -- AIG-0001: la que se dice por teléfono y va en WhatsApp
  slug TEXT NOT NULL UNIQUE,                    -- se conserva el de WordPress
  wp_id INTEGER UNIQUE,                         -- solo para migración y redirecciones
  titulo TEXT NOT NULL,
  operacion TEXT NOT NULL CHECK (operacion IN ('venta','renta','venta_renta')),
  tipo TEXT NOT NULL CHECK (tipo IN ('casa','departamento','terreno','local','oficina','bodega','edificio','otro')),
  condicion TEXT CHECK (condicion IN ('nueva','preventa','seminueva','remodelada','usada')),
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','revision','publicada','apartada','vendida','rentada','pausada')),
  precio INTEGER,                               -- venta, en pesos
  precio_renta INTEGER,                         -- renta mensual, en pesos
  moneda TEXT NOT NULL DEFAULT 'MXN',
  recamaras INTEGER, banos_completos INTEGER, medios_banos INTEGER,
  estacionamientos INTEGER, niveles INTEGER,
  m2_terreno REAL, m2_construccion REAL, anio_construccion INTEGER,
  zona_id INTEGER REFERENCES zonas(id),
  direccion_privada TEXT,                       -- solo panel
  resumen TEXT,                                 -- ≤160 caracteres: tarjeta y meta description
  descripcion TEXT,                             -- normalizada
  descripcion_original TEXT,                    -- tal como venía de WordPress (trazabilidad)
  video_url TEXT,
  destacada INTEGER NOT NULL DEFAULT 0,
  asesor_id TEXT REFERENCES usuarios(id),
  revisar TEXT,                                 -- JSON: avisos de la migración ["colonia adivinada", …]
  creada_por TEXT REFERENCES usuarios(id),
  creada_en TEXT NOT NULL,
  actualizada_en TEXT NOT NULL,
  publicada_en TEXT,
  eliminada_en TEXT                             -- papelera (30 días)
);
CREATE INDEX idx_prop_listado ON propiedades (estado, operacion, tipo, zona_id, precio);
CREATE INDEX idx_prop_asesor ON propiedades (asesor_id);

CREATE TABLE fotos (
  id INTEGER PRIMARY KEY,
  propiedad_id INTEGER NOT NULL REFERENCES propiedades(id),
  public_id TEXT UNIQUE,                        -- NULL hasta que esté en Cloudinary
  url_origen TEXT,                              -- URL de WordPress (puente de la demo)
  ancho INTEGER, alto INTEGER,
  alt TEXT,
  orden INTEGER NOT NULL,
  es_portada INTEGER NOT NULL DEFAULT 0,
  CHECK (public_id IS NOT NULL OR url_origen IS NOT NULL)
);
CREATE INDEX idx_fotos_propiedad ON fotos (propiedad_id, orden);

CREATE TABLE amenidades (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE);
CREATE TABLE propiedad_amenidades (
  propiedad_id INTEGER NOT NULL REFERENCES propiedades(id),
  amenidad_id INTEGER NOT NULL REFERENCES amenidades(id),
  PRIMARY KEY (propiedad_id, amenidad_id)
);

-- ─── Prospectos, métricas y bitácora ──────────────────────────────
CREATE TABLE prospectos (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('general','propiedad','vender','credito')),
  propiedad_id INTEGER REFERENCES propiedades(id),
  nombre TEXT NOT NULL, telefono TEXT, correo TEXT, mensaje TEXT,
  acepto_aviso INTEGER NOT NULL DEFAULT 0,
  origen TEXT,                                  -- utm_source / referer resumido
  estado TEXT NOT NULL DEFAULT 'nuevo'
    CHECK (estado IN ('nuevo','contactado','cita','cerrado','descartado')),
  asesor_id TEXT REFERENCES usuarios(id),
  creado_en TEXT NOT NULL
);
CREATE INDEX idx_prospectos_estado ON prospectos (estado, creado_en);
CREATE INDEX idx_prospectos_asesor ON prospectos (asesor_id);

CREATE TABLE notas_prospecto (
  id INTEGER PRIMARY KEY,
  prospecto_id INTEGER NOT NULL REFERENCES prospectos(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  creado_en TEXT NOT NULL
);

CREATE TABLE eventos (                          -- métricas propias, sin datos personales
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('ficha_vista','whatsapp_click','telefono_click','compartir')),
  propiedad_id INTEGER REFERENCES propiedades(id),
  creado_en TEXT NOT NULL
);
CREATE INDEX idx_eventos ON eventos (propiedad_id, tipo, creado_en);

CREATE TABLE bitacora (
  id INTEGER PRIMARY KEY,
  usuario_id TEXT REFERENCES usuarios(id),
  entidad TEXT NOT NULL,                        -- 'propiedad','foto','configuracion','usuario','prospecto'…
  entidad_id TEXT NOT NULL,
  accion TEXT NOT NULL,                         -- 'crear','editar','publicar','estado','borrar','acceso','clave'…
  cambios TEXT,                                 -- JSON {campo: [antes, después]}; NUNCA claves ni hashes
  creado_en TEXT NOT NULL
);
CREATE INDEX idx_bitacora ON bitacora (entidad, entidad_id, creado_en);

-- ─── Redirecciones de URLs viejas ─────────────────────────────────
CREATE TABLE redirecciones (
  origen TEXT PRIMARY KEY,                      -- ruta normalizada sin barra final: '/properties/casa-en-el-prado-4'
  destino TEXT NOT NULL,
  codigo INTEGER NOT NULL DEFAULT 301
);
```

---

## 8. Autenticación (correo y contraseña)

**Referencia que ya funciona:** `Desktop\cuponeramorelia\src\lib\auth.ts` (PBKDF2, cookie `__Host-`, sesiones en D1, restablecimientos) y su bloque `ratelimits` en `wrangler.jsonc`. Léelo y adáptalo; no lo copies a ciegas (allí la sesión se guarda sin hash y no hay clave temporal).

### 8.1 Contraseñas

- **PBKDF2-SHA-256 con 100 000 iteraciones** y sal aleatoria de 16 bytes. Formato: `pbkdf2$100000$<sal>$<hash>` (base64). **No subir las iteraciones**: en Workers 200 000 revienta por CPU (medido en Cuponera). La compensación es el límite de intentos.
- Comparación en tiempo constante.
- **Si el correo no existe, igual se ejecuta una verificación contra un hash de relleno**, para que la respuesta no delate qué correos existen.
- Reglas de la clave nueva: mínimo 10 caracteres; distinta de la temporal; no puede contener la parte del correo antes de la `@`; se pide dos veces.

### 8.2 Contraseña temporal (D8)

- Solo la puede generar quien tenga `usuarios.gestionar` sobre ese usuario (§9).
- **La genera el servidor:** 12 caracteres de un alfabeto sin ambiguos (sin `0 O 1 l I`).
- Se guarda su hash con `debe_cambiar_clave = 1` y `clave_temporal_expira = ahora + 72 h`.
- **Se muestra una sola vez**, en un diálogo: «Cópiala y mándasela por WhatsApp. No se volverá a mostrar». Nunca se guarda en claro, ni en la bitácora ni en los registros.
- **Primer acceso:** si la clave es correcta y `debe_cambiar_clave = 1`, se crea una sesión con `solo_cambio_clave = 1`. Con esa sesión, cualquier ruta del panel redirige a `/panel/cambiar-clave` y cualquier endpoint que no sea el de cambiar clave responde `403 {error:"debe_cambiar_clave"}`.
- **Temporal vencida:** el acceso falla con «Tu contraseña temporal venció. Pide una nueva a quien te dio acceso».
- Al cambiarla: `debe_cambiar_clave = 0`, `clave_temporal_expira = NULL`, **se borran todas sus sesiones** y se crea una sesión normal.
- **«Olvidé mi contraseña»** (en la propuesta): el enlace explica «Pide a tu director que te genere una contraseña temporal». No hay flujo por correo (D11).

### 8.3 Sesiones

- Token de 32 bytes aleatorios en base64url dentro de la cookie `__Host-aig_sesion` (`Path=/; HttpOnly; Secure; SameSite=Lax`). **En D1 se guarda solo el SHA-256** del token.
- Duración de 7 días. Cerrar sesión borra la fila.
- **Se borran todas las sesiones de un usuario** cuando lo desactivan, le cambian el rol, le restablecen la clave o la cambia él mismo.
- `ultimo_acceso` se actualiza al iniciar sesión.
- **CSRF:** además de `SameSite=Lax`, toda petición que modifica (`POST/PUT/PATCH/DELETE`) a `/api/panel/*` exige que la cabecera `Origin` coincida con el host.

### 8.4 Freno de fuerza bruta

```jsonc
"ratelimits": [
  { "name": "LIMITE_ACCESO",      "namespace_id": "2001", "simple": { "limit": 8, "period": 60 } },
  { "name": "LIMITE_FORMULARIOS", "namespace_id": "2002", "simple": { "limit": 5, "period": 60 } }
]
```

- `LIMITE_ACCESO` se consulta dos veces por intento, con llave `ip:<ip>` y con llave `correo:<correo>`. Si cualquiera se excede: `429` con «Demasiados intentos. Espera un minuto».
- Los `namespace_id` **2001/2002 son a propósito**: Cuponera usa 1001/1002 en la misma cuenta.
- Mensaje de error único: «Correo o contraseña incorrectos». Cada fallo se anota en la bitácora (`accion:'acceso_fallido'`, sin la clave).

### 8.5 Acceso maestro (D7)

`scripts/crear-maestro.mjs`:

```
npm run maestro:crear -- --correo davismartinesad@gmail.com --nombre "David" --local|--remote [--restablecer]
```

- Genera la contraseña temporal con el mismo alfabeto, calcula el hash con **los mismos parámetros** que `server/auth/clave.ts` (Node `crypto.webcrypto`, PBKDF2 100 000) y ejecuta `wrangler d1 execute activos-inmobiliarios-db --local|--remote --file <sql temporal>`. Después borra el SQL temporal.
- Inserta `rol='maestro'`, `debe_cambiar_clave=1` y `clave_temporal_expira=+72 h`, e **imprime la contraseña una sola vez**.
- Si el correo ya existe: sin `--restablecer` aborta; con `--restablecer` pone una temporal nueva y borra sus sesiones. **Es también la vía para recuperar el acceso maestro.**
- **Las pruebas de acceso NO se hacen con la cuenta real del maestro**, porque consumirían la temporal y dejarían una clave que el usuario no conoce. Se prueban en local, o en remoto con un usuario desechable `maestro-prueba@ejemplo.invalid` que se borra al terminar (junto con sus sesiones y su rastro en la bitácora de prueba).
- **Último paso de F0:** correr `--remote` (o `--remote --restablecer` si ya existía) sobre `davismartinesad@gmail.com` y entregar al usuario **esa** contraseña temporal recién generada en el mensaje final, recordándole que el sistema le pedirá cambiarla al entrar.
- **Prueba de que hash de Node y del Worker son compatibles:** una prueba que genera el hash con el script y lo verifica con `server/auth/clave.ts`.

---

## 9. Roles y permisos · `shared/permisos.ts`

Propuesta inicial. **El director la puede ajustar con David**: cambiarla debe ser editar este archivo y nada más.

| Permiso | Maestro (David) | Director (papá) | Asesor | Contenido (hermana) |
|---|:-:|:-:|:-:|:-:|
| Ver propiedades en el panel | todas | todas | todas | todas |
| Crear propiedades | ✅ | ✅ | ✅ → quedan en **revisión** | ✅ |
| Editar datos y precio | todas | todas | **solo las suyas** | todas |
| Publicar, despublicar y destacar | ✅ | ✅ | ❌ | ✅ |
| Estado comercial (apartada, vendida, rentada) | ✅ | ✅ | solo las suyas | ✅ |
| Asignar asesor a una casa | ✅ | ✅ | ❌ | ❌ |
| Mandar a la papelera y restaurar | ✅ | ✅ | ❌ | ❌ |
| Subir, ordenar y borrar fotos | ✅ | ✅ | solo las suyas | ✅ |
| Textos del sitio (portada, servicios, nosotros, testimonios, preguntas) | ✅ | ✅ | ❌ | ✅ |
| Datos de contacto, WhatsApp y redes | ✅ | ✅ | ❌ | ❌ |
| Aviso de privacidad | ✅ | ✅ | ❌ | ❌ |
| Ver prospectos | todos | todos | **solo los asignados a él** | ❌ |
| Cambiar estado y agregar notas a prospectos | ✅ | ✅ | los suyos | ❌ |
| Asignar prospectos | ✅ | ✅ | ❌ | ❌ |
| Exportar prospectos (CSV) | ✅ | ✅ | ❌ | ❌ |
| Métricas | todo | todo | sus casas | vistas por casa |
| Crear usuarios, desactivarlos y generar clave temporal | todos los roles | **asesores y contenido** | ❌ | ❌ |
| Ver la bitácora | ✅ | ✅ | ❌ | ❌ |
| Sistema (redirecciones, modo demo, integraciones) | ✅ | ❌ | ❌ | ❌ |
| Mi cuenta (nombre, teléfono, cambiar mi clave) | ✅ | ✅ | ✅ | ✅ |

**Reglas duras (en el servidor, con pruebas):**

- Nadie cambia su propio rol ni se desactiva a sí mismo.
- **Siempre queda al menos un maestro activo**: desactivarlo, degradarlo o borrarlo se rechaza con 409.
- El director **no ve ni edita** cuentas `maestro` ni otras `director`, salvo la suya en «Mi cuenta».
- «Solo las suyas» = `propiedades.asesor_id = usuario.id`. Cuando un asesor crea una casa, queda asignado a él.
- Asesor que edita una casa suya **publicada**: el cambio se aplica y queda en la bitácora. Pasa a `revision` solo si la casa aún no se había publicado.
- La interfaz **oculta** lo que no se puede hacer, pero **quien decide es el servidor**: cada endpoint llama a `puede(usuario, permiso, recurso)`.

---

## 10. Sitio público

### 10.1 Rutas

| Ruta | Contenido |
|---|---|
| `/` | Buscador arriba (operación, zona, tipo, precio), destacadas (`destacada=1`; si no hay, las 6 más recientes), accesos por tipo con conteos reales, los 6 servicios, franja de confianza **solo con datos reales** y llamada a WhatsApp |
| `/propiedades` | Listado con filtros **en la URL**: `operacion`, `tipo`, `zona` (slug), `precio_min`, `precio_max`, `recamaras` (mínimo), `banos` (mínimo), `orden` (`recientes`, `precio_asc`, `precio_desc`, `m2_desc`) y `pagina`. 12 por página. El rango de precio sale de los datos (`MIN/MAX` de las publicadas por operación), **nunca fijo**. Contador «38 propiedades». Sin resultados: mensaje y botón «quitar filtros» |
| `/propiedades/:slug` | Galería táctil (portada + miniaturas + pantalla completa), precio, operación, estado («Apartada» o «Vendida» si aplica), clave, recámaras, baños, estacionamientos, m² de construcción **y** de terreno, zona, descripción normalizada, **WhatsApp con la casa precargada**, formulario «Me interesa» (crea prospecto `tipo='propiedad'`), compartir y similares (misma zona o tipo, precio ±25 %) |
| `/servicios` | Los 6 servicios (desde `servicios`) |
| `/nosotros` | Historia, misión, visión (si existe) y valores |
| `/contacto` | Datos de `configuracion.contacto`, formulario general y enlace a mapas (sin iframe pesado) |
| `/aviso-de-privacidad` | Texto de `configuracion.aviso_privacidad` |
| `/sitemap.xml`, `/robots.txt` | Según `MODO_DEMO` (§10.3) |

- **Casas `vendida` o `rentada`:** siguen accesibles por su URL con una franja «Vendida» y enlaces a similares, pero **no salen** en el listado ni en el sitemap. `borrador`, `revision`, `pausada` y las de la papelera responden 404.
- **Filtros sin JavaScript:** el listado funciona como formulario `GET` normal. JavaScript solo mejora (aplicar sin recargar, deslizador).

### 10.2 Contacto

- **Enlace de WhatsApp:** `https://wa.me/<numero>?text=<plantilla con {titulo} {clave} {url}>`, codificado con `encodeURIComponent`. Si la casa tiene asesor con `whatsapp`, se usa ese número. Al pulsar, se registra `eventos.whatsapp_click` con `navigator.sendBeacon`, sin bloquear la navegación.
- **Formularios:** nombre (obligatorio), teléfono (obligatorio en «Me interesa»), correo (opcional), mensaje y casilla obligatoria de aceptación del aviso de privacidad con enlace.
- **Antispam de la propuesta:** campo trampa oculto + `LIMITE_FORMULARIOS` por IP. Con `TURNSTILE_SITE_KEY` puesta, se añade Turnstile.
- **Respuesta:** «Gracias, te contactamos pronto» + botón de WhatsApp. **Con `MODO_DEMO=1` no se envía ningún correo**; el prospecto queda en el panel.

### 10.3 SEO y metadatos

- **Con `MODO_DEMO=1`:** `<meta name="robots" content="noindex,nofollow">` y cabecera `X-Robots-Tag: noindex, nofollow` en **todas** las respuestas; `robots.txt` con `Disallow: /`; `sitemap.xml` responde 404.
- **Con `MODO_DEMO=0`:** canonical con `SITIO_URL`; sitemap de publicadas, listados y páginas; JSON-LD `RealEstateListing` + `Offer` en la ficha y `RealEstateAgent` en el sitio.
- **Siempre**, en la ficha: `<title>` único (`Casa nueva en El Prado · 3 rec. · $3,000,000 | Activos Inmobiliarios Globales`), meta description desde `resumen`, `og:title`, `og:description`, `og:image` en **JPG 1200×630** (§13.3) y `og:url`.
- **Redirecciones** (antes de React, en el Worker):
  1. Normalizar: minúsculas y quitar la barra final.
  2. Buscar en la tabla `redirecciones`.
  3. Reglas: `/properties/:slug` → `/propiedades/:slug`; `/properties` y `/propiedades/` → `/propiedades`; `/purpose/venta` → `/propiedades?operacion=venta` (igual con renta); `/property-type/:t` → `/propiedades?tipo=<mapeo>`; `/location/:c` → `/propiedades?zona=<slug>`; `/type-of-housing/:x` → `/propiedades`; `/acerca` → `/nosotros`; `/contact-us` → `/contacto`; `/home`, `/faq`, `/agents`, `/single-agent`, `/inicio-sesion`, `/registration`, `/account`, `/map-listing` → `/`.
  4. Pruebas con la lista de URLs de los sitemaps viejos.

### 10.4 Diseño

- Usar la skill **`impeccable`** (y `frontend-ux-design` como apoyo). **No** las de terceros `ui-ux-pro-max` ni `taste-skill` (memoria `plugins-diseno-terceros`).
- **Marca actual:** rojo `#A0051C` (principal), vino `#760415`, negro `#111111`; tipografías Orbitron (títulos) y Nunito (texto). **El rojo se conserva**; la tipografía puede cambiar si el diseño lo justifica (Orbitron es de estilo ciencia ficción y cuesta leerla). **Ojo:** el gris de texto actual `#808080` sobre blanco no llega al contraste AA; usar uno más oscuro.
- **Logotipo:** descargar `https://activosinmobiliariosglobales.com/wp-content/uploads/2024/12/Activos-Inmobiliarios_logo-1@2x_1.png` y `…logo-2@2x_1.png` a `sitio/public/marca/`. Pedir el vector (§6.4).
- **Tipografías autoalojadas** (`@fontsource/*`), sin peticiones a Google Fonts.
- **Primero celular** (390 px) y probar también 1366 px. Botón de WhatsApp que **no tape** precios ni botones.
- **Movimiento con GSAP profesional (D13):** el usuario pidió que se vea premium. Cargar antes la skill `gsap-animation` y leer la memoria `gsap-contenido-invisible`. Reglas que no se negocian:
  - **Nada nace en `opacity:0` desde el HTML del servidor.** El contenido tiene que verse sin JavaScript (lo exige el «listo cuando» de F2); GSAP parte del estado visible con `fromTo` y se aplica solo en el cliente.
  - Todo envuelto en `gsap.matchMedia("(prefers-reduced-motion: no-preference)")`, con red de seguridad que fuerce el estado final si la pestaña está en segundo plano.
  - Nunca `transition-all` en lo que anime GSAP.
  - GSAP solo en las rutas públicas (nunca en `root.tsx` ni en el panel) y dentro del tope de 150 KB gzip de JS público (core + ScrollTrigger + SplitText ≈ 50 KB).
- **Metas de rendimiento** (Lighthouse 12 móvil contra el `workers.dev`): rendimiento ≥ 90 en portada, listado y ficha; LCP < 2.5 s; JavaScript público ≤ 150 KB gzip. El panel es otro paquete y no cuenta.

---

## 11. Panel privado (`/panel`)

### 11.1 Cómo se mantiene privado

- No hay ningún enlace al panel desde el sitio público.
- Todo `/panel*` y `/api/panel/*` responde con `X-Robots-Tag: noindex, nofollow`, y `robots.txt` incluye `Disallow: /panel` (también con `MODO_DEMO=0`).
- Sin sesión: `/panel/*` → 302 a `/panel/entrar`; `/api/panel/*` → `401`.
- El código del panel va en **rutas y paquetes separados**: la navegación pública nunca descarga JavaScript del panel. Verificarlo en la pestaña de red.
- `Cache-Control: no-store` en todo el panel y su API.

### 11.2 Pantallas

| Ruta | Qué hace | Permiso |
|---|---|---|
| `/panel/entrar` | Correo + contraseña. Enlace «¿Olvidaste tu contraseña?» con la explicación de §8.2 | — |
| `/panel/cambiar-clave` | Obligatoria si la clave es temporal; también accesible desde «Mi cuenta» | sesión |
| `/panel` | Inicio: avisos (casas con datos faltantes, casas en revisión, prospectos nuevos, datos `por_confirmar`) y accesos rápidos según el rol | sesión |
| `/panel/propiedades` | Tabla y tarjetas en celular: buscar por clave, título o colonia; filtrar por estado, asesor y «con avisos» | ver |
| `/panel/propiedades/nueva` y `/panel/propiedades/:id` | Formulario por secciones: **Básicos** (operación, tipo, condición, precio, zona); **Características**; **Descripción** con botón **«Pegar texto de Facebook»** (§11.3); **Fotos** (§13.2); **Publicación** (estado, destacada, asesor). Guardado automático del borrador cada pocos segundos. Vista previa de la ficha y de la tarjeta de WhatsApp. Avisos de datos faltantes | crear/editar |
| `/panel/prospectos` | Bandeja: nuevo → contactado → cita → cerrado/descartado; casa de origen; asignar; notas; botón para contestar por WhatsApp; exportar CSV | ver prospectos |
| `/panel/contenido` | Portada, servicios (ordenar y ocultar), nosotros, testimonios y preguntas | contenido |
| `/panel/configuracion` | Contacto, WhatsApp y plantillas, redes, aviso de privacidad | configuración |
| `/panel/usuarios` | Lista, crear (nombre, correo, rol, WhatsApp) → diálogo con la clave temporal, desactivar/activar, generar temporal nueva, cambiar rol | usuarios |
| `/panel/bitacora` | Quién cambió qué y cuándo, con filtro por usuario y entidad | bitácora |
| `/panel/mi-cuenta` | Nombre, teléfono, WhatsApp y cambiar clave | sesión |
| `/panel/sistema` | Redirecciones, estado de integraciones (¿Cloudinary configurado?) y recuento de fotos pendientes de migrar | sistema |

### 11.3 «Pegar texto de Facebook» (`shared/texto.ts`)

Hoy el equipo escribe cada casa para Facebook con un formato muy constante (ver `analisis/crudo/api_properties.json`). El botón:

1. Normaliza con `normalize("NFKC")`: las letras «negritas» matemáticas (rango U+1D400–U+1D7FF) pasan a letras normales.
2. Extrae con expresiones tolerantes: precio (`$3,000,000`), recámaras, baños (incluye «2.5 baños» → 2 completos + 1 medio), m² de terreno y de construcción, estacionamientos («cochera para 2»), niveles y colonia (línea con 📍).
3. Rellena **solo los campos vacíos** y resalta lo que llenó para que una persona lo confirme.
4. Limpia la descripción: quita líneas de `━`, hashtags y el bloque final de «Informes y citas / teléfono».

**Pruebas:** con al menos 15 descripciones reales del JSON y los valores esperados, verificados contra el inventario (`analisis/crudo/inventario_propiedades.json`, campo `specs`).

> **Trampa de las herramientas de edición:** no escribas escapes Unicode (barra invertida + `u` + cifras) en el código con Write/Edit, porque llegan al archivo como el carácter real (memoria `escapes-unicode-herramienta-edit`). Usa `normalize("NFKC")` y rangos con `String.fromCodePoint`, o genera esa línea con un script de Node.

### 11.4 Bitácora (`server/bitacora.ts`)

Se registra: crear, editar (diferencias campo por campo), publicar/despublicar, cambio de estado, papelera y restauración, fotos (subir, ordenar, borrar), cambios de configuración y contenido, usuarios (crear, rol, activar, clave temporal generada **sin la clave**), accesos correctos y fallidos, y cambios de estado de prospectos. Se escribe en el **mismo `db.batch()`** que el cambio.

---

## 12. API

Formato: JSON. Errores: `{ "error": "codigo_legible", "mensaje": "Texto para la persona" }`. Toda entrada se valida en el servidor (esquemas con Zod o validación a mano, pero en un solo lugar por endpoint).

**Pública**

| Método y ruta | Uso |
|---|---|
| `GET /api/propiedades` | Mismos parámetros que `/propiedades`; devuelve `{ total, pagina, items, rangos }` |
| `GET /api/propiedades/:slug` | Ficha (solo publicadas, apartadas, vendidas y rentadas) |
| `POST /api/prospectos` | Formularios; límite + trampa (+ Turnstile si hay llave) |
| `POST /api/eventos` | `ficha_vista` (uno por sesión de navegador y casa), `whatsapp_click`, `telefono_click`, `compartir` |

**Panel** (todas con sesión, `Origin` y permiso)

| Método y ruta | Uso |
|---|---|
| `POST /api/panel/sesion` · `DELETE /api/panel/sesion` | Entrar · salir |
| `POST /api/panel/mi-cuenta/clave` | Cambiar clave (única permitida con `solo_cambio_clave`) |
| `GET/PATCH /api/panel/mi-cuenta` | Mis datos |
| `GET/POST /api/panel/propiedades` · `GET/PATCH /api/panel/propiedades/:id` | Listar, crear, leer, editar |
| `POST /api/panel/propiedades/:id/estado` | Publicar, pausar, apartada, vendida… |
| `POST /api/panel/propiedades/:id/papelera` · `/restaurar` | Papelera |
| `POST /api/panel/fotos/firma` | Firma de subida a Cloudinary (§13.2) |
| `POST /api/panel/propiedades/:id/fotos` | Registrar foto subida (verifica firma de la respuesta) |
| `PATCH /api/panel/propiedades/:id/fotos` | Orden, portada, `alt` |
| `DELETE /api/panel/fotos/:id` | Borra de D1 y de Cloudinary |
| `POST /api/panel/texto-facebook` | Analiza el texto pegado (también puede correr en el cliente; la función es compartida) |
| `GET/PATCH /api/panel/configuracion/:clave` | Configuración |
| `GET/POST/PATCH/DELETE /api/panel/servicios`, `/testimonios`, `/preguntas` | Contenido |
| `GET /api/panel/prospectos` · `PATCH /api/panel/prospectos/:id` · `POST /api/panel/prospectos/:id/notas` · `GET /api/panel/prospectos.csv` | Prospectos |
| `GET/POST /api/panel/usuarios` · `PATCH /api/panel/usuarios/:id` · `POST /api/panel/usuarios/:id/clave-temporal` | Usuarios |
| `GET /api/panel/bitacora` | Bitácora |
| `GET /api/panel/metricas` | Vistas, clics y prospectos por casa (filtrados por rol) |
| `GET/PUT/DELETE /api/panel/redirecciones` | Sistema |

---

## 13. Fotos y Cloudinary

### 13.1 Organización

- **`public_id`:** `aig/propiedades/<clave>/<8 caracteres aleatorios>`. Otras carpetas: `aig/sitio/…` (portada, logotipos) y `aig/usuarios/<id>`.
- **D1 guarda solo `public_id`**, ancho y alto. La URL se construye al pintar.

### 13.2 Subida desde el panel (el archivo no pasa por el Worker)

1. El navegador pide `POST /api/panel/fotos/firma` con `{propiedad_id}`. El servidor comprueba `fotos.subir` sobre esa casa y responde `{cloud_name, api_key, timestamp, folder, public_id, signature}`. La firma cubre `folder`, `public_id` y `timestamp`, así que **el destino lo decide el servidor**.
2. **Antes de subir**, el navegador reduce la foto a un máximo de 2,000 px con `createImageBitmap` + canvas (JPEG calidad 0.85). Si no puede decodificarla (por ejemplo, HEIC en Chrome), sube el original: Cloudinary acepta HEIC.
3. Sube a `https://api.cloudinary.com/v1_1/<cloud>/image/upload` con barra de progreso, **tres fotos a la vez** y **reintento** de las que fallen sin repetir las que ya subieron.
4. Con la respuesta, `POST /api/panel/propiedades/:id/fotos` con `{public_id, version, signature, width, height}`. El servidor **verifica la firma de la respuesta** (SHA-1 de `public_id=…&version=…` + `api_secret`) y que el `public_id` empiece por la carpeta de esa casa. Después la guarda.
5. **Aviso** si la foto mide menos de 1,000 px de ancho: «Parece una foto de WhatsApp; si tienes la original se verá mejor».
6. Si faltan `CLOUDINARY_*`, la sección de fotos muestra «Configura Cloudinary para subir fotos» y el resto del formulario funciona.

### 13.3 Variantes (`shared/fotos.ts` → `urlFoto(foto, variante)`)

| Variante | Transformación |
|---|---|
| `tarjeta` | `c_fill,g_auto,w_640,h_480,f_auto,q_auto` (+ `srcset` 320/640/960) |
| `galeria` | `c_limit,w_1600,f_auto,q_auto` (+ `srcset` 800/1200/1600) |
| `miniatura` | `c_fill,g_auto,w_160,h_120,f_auto,q_auto` |
| `og` | `c_fill,g_auto,w_1200,h_630,f_jpg,q_auto` (**JPG**: WhatsApp y Facebook no leen bien AVIF) |
| `redes` | `c_fill,g_auto,w_1080,h_1350,f_jpg,q_auto` (fase 2: «compartir en redes») |

La marca de agua, si el dueño la quiere, es una capa en la URL (`l_<public_id del logo>`) activable desde configuración, nunca «quemada» en la foto.

### 13.4 Puente mientras no hay Cloudinary

`urlFoto()`: si la foto tiene `public_id` y hay `CLOUDINARY_CLOUD_NAME`, construye la URL de Cloudinary; si no, devuelve `url_origen` (WordPress) con el tamaño intermedio más cercano que WordPress ya generó (`-768x1024`, `-1024x768`) cuando exista. **Es solo para la demo**: depende de que el sitio viejo siga en línea.

### 13.5 `scripts/migrar-fotos-a-cloudinary.mjs`

- Toma las fotos con `public_id IS NULL`, **sube por URL** (`file=<url_origen>`, subida firmada) con `public_id` final, espera la respuesta y actualiza D1 (`public_id`, ancho, alto).
- Parámetros: `--local|--remote`, `--limite N`, `--seco` (no escribe), `--concurrencia 3` (por defecto) y `--reanudar` (idempotente).
- Al final reporta subidas, fallidas y almacenamiento aproximado. Plan gratuito: ~1.4 GB entre todo lo que hay (§6 del análisis); **los 31 videos no se migran** en la propuesta.
- **Cambiar de cuenta de Cloudinary en el futuro:** poner las variables nuevas y correr el script con `--forzar-desde-cuenta-actual`, que vuelve a subir desde las URLs de la cuenta vieja con los mismos `public_id`.

---

## 14. Siembra de datos desde el análisis · `scripts/sembrar-desde-wordpress.mjs`

**Entradas** (ya descargadas, no volver a pedírselas al sitio salvo donde se indica):

| Archivo | Qué aporta |
|---|---|
| `analisis/crudo/api_properties.json` + `api_properties_p2.json` | 188 propiedades: `id`, `slug`, `title`, `content.rendered`, `date`, `featured_media` y los ids de las taxonomías |
| `analisis/crudo/api_type-of-housing.json`, `api_property-type.json`, `api_location.json`, `api_purpose.json` | Nombres de las categorías |
| `analisis/crudo/inventario_propiedades.json` | Precio, `para` y `specs` (leídos del HTML de cada ficha). **Ojo:** `fotos` es un **número**, no URLs |
| `analisis/crudo/medios/p*.json` | 6,785 medios públicos: `id`, `post`, `source_url`, `media_details` (ancho, alto y tamaños) |
| `analisis/crudo/html/inicio.html`, `servicios.html`, `acerca.html`, `contacto.html` | Textos para `seed/configuracion.json` (ya resumidos en §6.3) |

**Galería: la fuente de verdad es el HTML de cada ficha**, no el campo `post` de los medios. JetEngine guarda la galería en un campo propio y 3,414 medios no tienen `post`, así que unir por `post` pierde fotos y no respeta el orden. Por eso:

1. **Una sola vez**, descargar el HTML de las 188 fichas a `analisis/crudo/fichas/<slug>.html`: secuencial, con ~700 ms de pausa y reanudable si el archivo ya existe. `analisis/crudo/inventario.cjs` ya tiene el patrón.
2. Extraer las imágenes **en orden** de la sección que va del encabezado «Galería:» a «Propiedades Similares». Pasar cada miniatura a su original: quitar el sufijo `-<ancho>x<alto>` y resolver `-scaled` contra `medios` por nombre de archivo.
3. **Portada** = `featured_media` (buscar su `source_url` en `medios`). Si no está en la galería, se inserta como `orden 0`.
4. Verificar a ojo 3 fichas: el orden y el número de fotos del panel contra la ficha actual.

**Mapeos**

| Origen | Destino |
|---|---|
| `purpose`: Venta · Renta · Venta / Renta; si falta, `inventario.para`; si también falta: `venta` + aviso | `operacion`: `venta` · `renta` · `venta_renta` |
| `property-type`: Casa, Departamento, Terreno, Bodega, Edificio, Oficinas, Local, Inmueble, villa | `tipo`: `casa`, `departamento`, `terreno`, `bodega`, `edificio`, `oficina`, `local`, `otro` (+ aviso), `casa` (+ aviso) |
| `type-of-housing`: Casa nueva · Casa Semi nueva · Casa remodelada · otras | `condicion`: `nueva` · `seminueva` · `remodelada` · `NULL`. Si la descripción dice «PREVENTA»: `preventa` + aviso |
| Precio del inventario (`"3,000,000.00"`) | Venta: `precio`. Renta: `precio_renta` y `precio` NULL. Venta y renta: `precio` + aviso «falta precio de renta» |
| `specs`: Habitaciones · Baños completos · Medios Baños · Estacionamientos · Cantidad de Pisos · Tamaño de la propiedad · En construcción · Año de construccion | `recamaras` · `banos_completos` · `medios_banos` · `estacionamientos` · `niveles` · **`m2_terreno`** · **`m2_construccion`** · `anio_construccion` (números sin «m²») |
| `specs["Planta baja"]` | **Se ignora**: dice «Sí» en las 188 |
| `location` | `zonas.ciudad` |
| Título «Casa en El Prado», «Casa en Fracc. Lomalta M2-35»… | `zonas.colonia` con la heurística de abajo + aviso «colonia adivinada» |
| `content.rendered` | `descripcion_original` (HTML → texto) y `descripcion` normalizada (§11.3); `resumen` = primera frase útil de ≤160 caracteres |
| `date` | `creada_en` y `publicada_en`; `clave` = `AIG-0001…` por fecha de alta ascendente |
| Todas | `estado='publicada'` y aviso «confirmar disponibilidad» (WordPress no tiene «vendida», §5.3 del análisis) |

**Heurística de colonia:** quitar del título el tipo y la preposición inicial con

```
^(Casa|Departamento|Terreno|Local|Bodega|Oficinas?|Edificio|Inmueble)\s+(en|de)\s+(.+)$
```

y del resultado (grupo 3) los prefijos `Fracc.` y `Col.` y los sufijos de lote o manzana (`M2-35`, `AL 53`). Ejemplo: «Casa en Fracc. Lomalta M2-35» → «Lomalta».

**Salida:** `sitio/seed/generado/0001_semilla.sql` (en lotes que D1 acepte) y `sitio/seed/generado/reporte.md` con conteos y la lista de avisos. Se aplica con `wrangler d1 execute … --local|--remote --file`. **Idempotente:** borra y recarga solo lo que tenga `wp_id`; nunca toca lo creado desde el panel.

**Comprobaciones al final del script (debe fallar si no se cumplen):** 188 propiedades; ninguna sin foto; ninguna descripción con caracteres U+1D400–U+1D7FF; operaciones 178/5/3 (más las 2 sin propósito resueltas); 6 servicios; configuración completa.

---

## 15. Fases

### F0 · Cimientos
- Crear `sitio/` y hacer el spike de SSR (§4.3); decidir Plan A o B y anotarlo en §19.
- `git init` en la raíz con el `.gitignore` de §5.
- Crear la D1 remota (`wrangler d1 create activos-inmobiliarios-db`), poner el id en `wrangler.jsonc`, aplicar `0001_inicial.sql` en local y remoto, y correr `npm run cf-typegen`.
- `server/config.ts`, `shared/permisos.ts`, autenticación completa (§8), `/panel/entrar`, `/panel/cambiar-clave`, un `/panel` mínimo y `crear-maestro.mjs`.
- `MODO_DEMO=1` con `noindex` y `robots.txt`. Primer `wrangler deploy`.

**Listo cuando:**
1. `npm run dev`, `npm run build` y `npm run deploy` funcionan.
2. La URL `workers.dev` responde y todo trae `X-Robots-Tag: noindex, nofollow`.
3. En **producción**, el usuario desechable `maestro-prueba@ejemplo.invalid` entra con su temporal, el sistema lo obliga a cambiarla, sale y vuelve a entrar con la nueva. Después se borra. Al final se genera la temporal **fresca** de `davismartinesad@gmail.com` (§8.5).
4. Con la sesión «solo cambio de clave», `GET /api/panel/propiedades` da 403.
5. Nueve intentos fallidos en un minuto dan 429.
6. `/panel` sin sesión redirige a `/panel/entrar`; `/api/panel/*` sin sesión da 401.
7. Pasan las pruebas de clave (hash de Node ↔ Worker) y de permisos (matriz completa, §16).

### F1 · Datos reales
- Descargar las fichas (§14.1), escribir el script de siembra, aplicarlo en local y en remoto, y generar `reporte.md`.

**Listo cuando:** se cumplen las comprobaciones de §14 en local **y** en remoto, y 3 fichas revisadas a mano coinciden con el sitio actual en precio, recámaras, m² y orden de fotos.

### F1.5 · Fotos a Cloudinary (en cuanto existan U1 y U2)
- Correr `migrar-fotos-a-cloudinary.mjs` primero con `--limite 20` (verificar a ojo) y después completo.

**Listo cuando:** `SELECT COUNT(*) FROM fotos WHERE public_id IS NULL` da 0 (sin contar videos) y las fichas cargan desde `res.cloudinary.com`.

### F2 · Sitio público
- Rutas de §10.1, filtros en la URL, ficha, contacto, WhatsApp, formularios → `prospectos`, eventos, redirecciones, metadatos y diseño (§10.4).

**Listo cuando:**
1. `curl` a una ficha devuelve **sin JavaScript** el título, el precio y `og:image` (JPG 1200×630).
2. Cinco combinaciones de filtros devuelven el mismo número que una consulta SQL directa (prueba automatizada).
3. El filtro de precio llega al máximo real (**$65,000,000**).
4. A 390 px no hay desplazamiento horizontal y el botón de WhatsApp no tapa el precio (captura con Chrome headless, memoria `verificacion-visual-chrome-headless`).
5. Lighthouse móvil ≥ 90 en portada, listado y ficha, con los reportes guardados en `sitio/verificacion/`.
6. El enlace de WhatsApp de una ficha abre el chat con el texto de la casa correcta.
7. Enviar «Me interesa» crea el prospecto con `propiedad_id`.
8. `/properties/casa-en-el-prado-4/` responde 301 a `/propiedades/casa-en-el-prado-4`, y las 9 páginas de plantilla responden 301 a `/`.
9. Ningún texto de plantilla, *Lorem ipsum* ni inglés.

### F3 · Panel para el equipo
- Pantallas de §11.2 salvo prospectos y métricas (esos van en F4): propiedades, fotos, «pegar texto de Facebook», contenido, configuración, usuarios, bitácora, mi cuenta y sistema.

**Listo cuando:**
1. **Prueba automatizada por rol:** con 4 usuarios de prueba (uno por rol), cada endpoint del panel responde 200/403 exactamente como dice la matriz de §9.
2. Recorrido de la **hermana** (`contenido`) en 390 px: crea una casa pegando un texto de Facebook real, sube 5 fotos (o, sin Cloudinary, ve el aviso), la publica y aparece en el sitio público.
3. Recorrido del **asesor**: crea una casa → queda en `revision`, no puede publicarla; el **director** la publica.
4. El director cambia el teléfono en Configuración y el cambio se ve en todo el sitio al recargar.
5. El director crea un asesor → ve la clave temporal una sola vez → el asesor entra, es obligado a cambiarla y entra con la nueva.
6. Desactivar a un usuario lo saca de inmediato: su sesión abierta recibe 401 en la siguiente petición.
7. La bitácora muestra los pasos anteriores con quién, qué y cuándo, sin claves.
8. Ningún recurso del panel se descarga al navegar el sitio público (pestaña de red).

### F4 · Prospectos y métricas
- Bandeja de prospectos (estados, asignación, notas, CSV), métricas por casa y por asesor, e inicio del panel con avisos.

**Listo cuando:** un asesor ve solo sus prospectos (prueba), el CSV abre bien en Excel con acentos (BOM UTF-8) y las métricas cuadran con la tabla `eventos`.

> **Con F0–F3 (o F4) listas, se le enseña la propuesta al papá.**

### F5 · Pulido para la presentación
- Crear en el panel los usuarios reales que diga el dueño (director, contenido, asesores) **solo cuando el usuario lo pida**.
- Revisar la lista de avisos de la migración con el equipo.
- Guion corto de demostración en `sitio/verificacion/guion-demo.md`: qué enseñar en 10 minutos.

### F6 · Salida a producción (depende de `PEDIR-A-CONSULTORES.md`)
Orden obligatorio:
1. Renovación del dominio asegurada.
2. Copia completa de los registros DNS actuales.
3. Zona en Cloudflare con **MX, SPF, DKIM y DMARC idénticos**.
4. Correo verificado enviando y recibiendo.
5. Dominio propio del Worker por API de cuenta.
6. `SITIO_URL` y `MODO_DEMO=0`.
7. `GA4_ID`.
8. Turnstile.
9. Correo de avisos.
10. Sitemap en Search Console.
11. Vigilar errores 404 durante una semana.

**Nada de esto se hace sin que el usuario lo pida.**

### F7 · Segunda fase (fuera de la propuesta)
- **Mapa por colonia:** MapLibre GL **5.9.0** (la 6.x no trae UMD) + OpenFreeMap; nunca CARTO; atribución visible (memoria `cuponera-morelia`).
- «Vende o renta tu casa», calculadora de crédito, favoritos y comparar, ficha en PDF, alertas, páginas por fraccionamiento, «Equipo» con asesores visibles, compartir en redes (1080×1350) y reseñas reales.

---

## 16. Verificación y pruebas

- **Vitest:** `shared/texto.ts` (15+ casos reales), `shared/permisos.ts` (matriz completa, generada desde la tabla de §9), `shared/fotos.ts`, `shared/whatsapp.ts` (codificación de acentos y `¿`), `server/auth/clave.ts` (compatibilidad con el script), reglas de redirección y parámetros de filtros.
- **Pruebas contra la app** (`wrangler dev` o `vite dev` con D1 local): script `npm run verificar` que hace peticiones reales para los «listo cuando» de API y permisos.
- **Visual:** Chrome headless a 390 y 1366 px (memoria `verificacion-visual-chrome-headless`: perfil nuevo por corrida, `Start-Process -Wait`, iframe de 390 px para el ancho real de móvil). Guardar las capturas en `sitio/verificacion/capturas/`.
- **Rendimiento:** `npx lighthouse@12 <url> --preset` móvil y escritorio, con reportes JSON en `sitio/verificacion/lighthouse/`.
- **Antes de declarar una fase lista:** correr todo lo anterior y anotar resultados reales en §19. Si algo falla o se saltó, se dice.

---

## 17. Trampas del entorno (ya pagadas en otros proyectos)

| Trampa | Qué hacer | Fuente |
|---|---|---|
| El sandbox de comandos puede cortar la red («Connection was reset») y parece que el sitio remoto falla | Reintentar con `dangerouslyDisableSandbox: true` para npm, wrangler y descargas | memoria `entorno-node-y-red` |
| `nodejs.org` bloqueado en la red | `registry.npmjs.org` sí responde; binarios de Node por `registry.npmmirror.com` | idem |
| Bash trunca heredocs de más de ~150 líneas | Archivos largos con la herramienta Write | idem |
| PowerShell bloquea comandos con la palabra «del» dentro de un texto, y `Remove-Item` con rutas entre comillas | Borrar con `rm` en Bash | memoria `powershell-filtro-palabra-del` |
| `wrangler secret put` por tubería mete un salto de línea | `wrangler secret bulk archivo.json` | memoria `cuponera-morelia` |
| El token de wrangler no puede atar dominios con `routes` en `wrangler.jsonc` (despliega y luego revienta con `code: 10000`) | Atar el dominio una vez con `PUT /accounts/{id}/workers/domains` | idem |
| PBKDF2 > 100 000 iteraciones revienta por CPU | 100 000 + límite de intentos | idem |
| `Date.now()` no avanza durante cómputo síncrono en Workers | No cronometrar hashes | idem |
| D1 sin transacciones interactivas | `db.batch()` y `UPDATE … WHERE` condicional | idem |
| D1 no aplica `ON DELETE CASCADE` de forma confiable | Borrar en orden explícito | idem |
| `namespace_id` de `ratelimits` compartido en la cuenta | Usar 2001/2002 (Cuponera usa 1001/1002) | idem |
| En esta máquina puede haber otro `wrangler dev` corriendo (Cuponera) | No matarlo; usar otro puerto y filtrar procesos por la ruta del proyecto | memoria `consola-equipo-logidma` |
| `worker-configuration.d.ts` se genera y sin él `tsc` no compila | `npm run cf-typegen` tras cambiar `wrangler.jsonc` | memoria `proyecto-un-cloudflare` |
| Escapes Unicode escritos con Write/Edit llegan como el carácter real | `normalize("NFKC")`, `String.fromCodePoint` o generar la línea con Node | memoria `escapes-unicode-herramienta-edit` |
| GSAP con `from({opacity:0})` + `transition-all` deja contenido invisible (Safari) | CSS primero; si hay GSAP, seguir la memoria | memorias `gsap-contenido-invisible`, `consola-equipo-logidma` |
| El único remitente de Brevo verificado es el gmail personal y la clave caduca sin avisar | Nada en la propuesta depende del correo (D11) | memoria `brevo-logidma` |
| Chrome headless: ventana mínima ~491 px; `file://` no acepta query string; el fallo es silencioso | iframe de 390 px; perfil nuevo; comprobar que el PNG existe | memoria `verificacion-visual-chrome-headless` |
| Un hook de auto-push publicaría estados a medias | No instalar ninguno (D12) | memoria `autopush-riesgo-parches` |

---

## 18. Fuera de alcance de la propuesta

- Cambiar DNS, dominio o correo del sitio real (F6, solo cuando el usuario lo pida).
- Crear el repo en GitHub o conectar CI (preguntar al usuario).
- Crear cuentas reales del equipo (F5, cuando el usuario diga quiénes).
- Migrar los 31 videos.
- Recuperación de contraseña por correo.
- Aviso de privacidad definitivo (lo revisa un abogado; en la propuesta es un borrador marcado).
- Todo lo de F7.

---

## 19. Registro de avance

Actualizar al cerrar cada fase, con resultados **medidos**.

| Fase | Estado | Fecha | Notas (qué se verificó, qué falta, trampas nuevas) |
|---|---|---|---|
| Plan | ✅ listo | 16/09/2026 | Análisis en `analisis/`; decisiones D1–D12 |
| F0 · Cimientos | 🔧 en curso | 16/09/2026 | Plan A o B: |
| F1 · Datos reales | ⏳ pendiente | | |
| F1.5 · Fotos a Cloudinary | ⏸ espera U1/U2 | | |
| F2 · Sitio público | ⏳ pendiente | | |
| F3 · Panel | ⏳ pendiente | | |
| F4 · Prospectos y métricas | ⏳ pendiente | | |
| F5 · Pulido para la presentación | ⏳ pendiente | | |
| F6 · Producción | ⏸ espera consultores | | |
