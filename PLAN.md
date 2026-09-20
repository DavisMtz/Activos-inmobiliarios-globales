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
| D12 | Git desde el primer día, con remoto **público** en `github.com/DavisMtz/Activos-inmobiliarios-globales` (rama `main`). Se sube a mano al cerrar cada paso verificado; **no** hay hook de auto-push | Plan (memoria `autopush-riesgo-parches`); repo indicado por el usuario el 16/09/2026 |
| D13 | **Diseño:** los colores de siempre (rojo `#A0051C`, vino `#760415`, negro `#111111`) y la información real del sitio actual, con **animación GSAP profesional para que se vea premium** (reemplaza el «movimiento discreto con CSS» original de §10.4) | Usuario, 16/09/2026 |
| D14 | La persona de **contenido sí publica** (tal como dice la matriz de §9) | Usuario lo confirmó el 16/09/2026 |

---

## 3. Lo que tiene que hacer el usuario (el agente no puede)

| # | Acción | Bloquea | Mientras tanto |
|---|---|---|---|
| U1 | ✅ **Resuelto el 16/09/2026 con la nube `srz5sh9l`** que dio el usuario. **Ojo:** no es una cuenta a nombre del negocio, es la personal que ya comparten Cuponera, `un` y la Biblioteca (plan gratuito, 25 créditos al mes, 9 % usado al 16/09). Todo lo de este proyecto va en la carpeta `aig/`. Si después quiere una cuenta propia del negocio: §13.5 `--forzar-desde-cuenta-actual` | — | — |
| U2 | ✅ **Resuelto el 16/09/2026 (F0):** credenciales en `sitio/.dev.vars` y en los secretos del Worker con `wrangler secret bulk` | Igual que U1 | — |
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
    │   ├── busqueda/             el buscador que entiende frases (§10.5): entender.ts, corpus.ts
    │   ├── ia/                   ÚNICA puerta a Workers AI: motor.ts (modelos medidos, reloj), uso.ts (tope y memoria)
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
    │   ├── parecido.ts, frase.ts, intencion.ts, lugares.ts, rasgos.ts   leer una frase del buscador (§10.5)
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

**Bindings** (no son variables; van en `wrangler.jsonc` y también los reparte `server/config.ts`): `DB` (D1), `LIMITE_ACCESO` y `LIMITE_FORMULARIOS` (frenos por IP, `namespace_id` 2001 y 2002), y desde el 20/09/2026 **`AI`** (Workers AI, el intérprete del buscador) y **`LIMITE_IA`** (2003: 10 consultas al modelo por minuto y por persona). Declarar `AI` no cuesta: se cobra cada inferencia, en Neurons. Tras tocar los bindings, `npm run cf-typegen` (§17).

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
| `busqueda_ia` | `{"activa": true, "modelo": "", "tope_diario": 300}` (la siembra la migración `0005`). El interruptor del buscador que entiende frases (§10.5): sin fila, con el JSON dañado o con cualquier cosa que no sea un `true`, está **apagado**. `modelo` vacío = el de fábrica | director, maestro (`configuracion.buscador`) |

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
  huella_temporal TEXT,                         -- (añadida en F0) SHA-256 de «token:temporal»; ver §17
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

**Migración `0005_busqueda_ia.sql` (20/09/2026, §10.5).** Aditiva: `ia_cache (clave, valor, expira)` —lo que ya contestó el modelo, por la **huella SHA-256** de la frase normalizada: no se guarda lo que la gente escribe—, `ia_uso (dia, consultas, fallos, de_cache, ms, tokens_entrada, tokens_salida)` —el gasto por día de Morelia, con el que se aplica el tope— y la fila `busqueda_ia` de `configuracion`. Todo lo que lee estas tablas degrada al buscador de siempre si no existen.

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
| Buscador inteligente: encenderlo o apagarlo, modelo y tope diario (§10.5) | ✅ | ✅ | ❌ | ❌ |
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
| `/` | Buscador arriba (operación, zona, tipo, precio), destacadas (`destacada=1`; si no hay, las 6 más recientes), accesos por tipo con conteos reales, los 6 servicios, franja de confianza **solo con datos reales** y llamada a WhatsApp. **Desde el 18/09/2026:** vitrina que pasa sola por 5 casas (abre la «Casa de la foto principal» del panel), y testimonios y preguntas frecuentes de Panel › Contenido, solo los marcados «Se ve en el sitio» (§19, F5) |
| `/propiedades` | Listado con filtros **en la URL**: `operacion`, `tipo`, `zona` (slug), `precio_min`, `precio_max`, `recamaras` (mínimo), `banos` (mínimo), `orden` (`recientes`, `precio_asc`, `precio_desc`, `m2_desc`) y `pagina`. 12 por página. El rango de precio sale de los datos (`MIN/MAX` de las publicadas por operación), **nunca fijo**. Contador «38 propiedades». Sin resultados: mensaje y botón «quitar filtros». **Desde el 20/09/2026** el buscador entiende frases («casa de 3 recámaras en altosano hasta 4 millones con alberca») y las convierte en estos mismos filtros, más `con` (rasgos que se buscan en el texto de la ficha: `?con=alberca,una+planta`), `frase` (solo para enseñar «Así lo entendimos») y `literal=1` (buscar el texto tal cual): §10.5. **Con JavaScript sigue cargando al bajar** (scroll infinito, de 12 en 12, 18/09/2026): la paginación con `?pagina=N` se queda para quien no tiene JavaScript y para los buscadores, y la URL no cambia al cargar (§19, F5) |
| `/propiedades/:slug` | Galería táctil (portada + miniaturas + pantalla completa), precio, operación, estado («Apartada» o «Vendida» si aplica), clave, recámaras, baños, estacionamientos, m² de construcción **y** de terreno, zona, descripción normalizada, **WhatsApp con la casa precargada**, formulario «Me interesa» (crea prospecto `tipo='propiedad'`), compartir y similares (misma zona o tipo, precio ±25 %) |
| `/servicios` | Los 6 servicios (desde `servicios`) |
| `/nosotros` | Historia, misión, visión (si existe) y valores |
| `/contacto` | Datos de `configuracion.contacto`, formulario general y enlace a mapas (sin iframe pesado) |
| `/aviso-de-privacidad` | Texto de `configuracion.aviso_privacidad` |
| `/entregas` | Las entregas **publicadas** (F5): la foto del día y el comentario, con «Laura M.». Sin ninguna publicada da **404** y ni el menú ni la portada la ofrecen; con alguna, la portada enseña las 3 más recientes («Ya estrenaron casa») |
| `/entrega/:token` | El **enlace personal** que el equipo le manda al cliente: ve la foto de su entrega, escribe su comentario, da **dos permisos por separado** (comentario y fotos) y puede agregar hasta 6 fotos suyas. Token de 64 hex (solo su SHA-256 en la base), 30 días, un solo uso; falso o caducado → 404. `no-store`, `no-referrer`, `noindex` y fuera del motor de redirecciones |
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
  - GSAP solo en las rutas públicas (nunca en `root.tsx` ni en el panel) y dentro del tope de 150 KB gzip de JS público (core + ScrollTrigger + SplitText ≈ 45–50 KB).
  - **Medido en F0:** React 19 + React Router 8 ya pesan ~113 KB gzip en la carga pública (entry.client 67 + components 29 + errorBoundaries 12 + lib 4). Con GSAP estático se pasaría de 150. Por eso **GSAP se carga con `import()` después de hidratar**, dentro de un efecto de las rutas públicas: no cuenta en la carga inicial y, de paso, garantiza que el HTML del servidor nunca nazca oculto.
- **Metas de rendimiento** (Lighthouse 12 móvil contra el `workers.dev`): rendimiento ≥ 90 en portada, listado y ficha; LCP < 2.5 s; JavaScript público ≤ 150 KB gzip. El panel es otro paquete y no cuenta.

### 10.5 El buscador que entiende frases (20/09/2026)

Pedido: que los buscadores de la portada y del listado usen Workers AI («las Neurons de Cloudflare») para buscar con palabras clave, con pequeños errores al escribir o en lenguaje natural, y que se pueda apagar desde el panel.

**Lo entendido acaba SIEMPRE en la URL, como filtros de siempre.** El loader de `/propiedades` convierte la frase y **redirige**: `?q=casa de 3 recamaras en altosano hasta 4 millones con alberca` → `?tipo=casa&q=Altozano&precio_max=4000000&recamaras=3&con=alberca&frase=…`. No se aplica «por debajo»: la página 2, el scroll infinito (que pide `/api/propiedades`), el enlace compartido y el botón «atrás» trabajan con filtros explícitos y dan lo mismo hoy, mañana y con la IA apagada. El formulario aparece lleno con lo que se entendió y la página lo dice («Así lo entendimos», con «busca ese texto tal cual» → `literal=1`). La API nunca interpreta.

**Tres capas, de la más barata a la más cara; cada una solo si la anterior no alcanzó** (`server/busqueda/entender.ts`):

1. **Vocabulario** (`shared/frase.ts`, gratis): operación, tipo, orden («barato», «más grande», «de lujo»), recámaras, baños, clave («aig 42»), los rasgos más pedidos («alberca», «una planta», «roof garden») y **los precios**, con los errores de oído y de dedo perdonados por `shared/parecido.ts` (`s/z/c`, `b/v`, `h` muda, `k/c/qu`, letra doblada y trasposición): «kasa en benta 3 rrecamaras» se lee entera sin preguntarle a nadie. **El precio es entero del código** (`shared/dinero.ts`): el monto por aritmética («2 millones 251 mil», «3 millones y medio», «de 10 a 20 mil», «18mil», «800k»; metros, años y pisos no son dinero) y el papel por su comparador («menos de», «que no pase de», «más de», «no menos de», «entre… y…»; una cifra suelta es un tope; «al mes» es una renta). Al modelo ni se le pregunta: medido, leyó «2 millones 251 mil» como $2,010,000 y a «casa de 2 millones y medio» le puso un mínimo.
2. **El catálogo** (`shared/lugares.ts` + `server/busqueda/corpus.ts`, una consulta de 188 filas en memoria un minuto): qué lugar es, corrigiendo «altosano». **El lugar va a `q` (texto), no a `zona`:** el catálogo tiene la misma zona repartida en muchas colonias («Altozano», «Club de Golf Altozano», «Coto Mirlos, Altozano»…: 16 casas, de las que la colonia «Altozano» tiene 8). Solo se corrige la palabra que NO existe en ningún texto del catálogo («cocina» se parece a La Colina tanto como «altosano» a Altozano), y una palabra suelta que es un rasgo («jardín») o genérica («ciudad») no es un lugar.
3. **El modelo** (`server/ia/motor.ts`), solo si quedó algo sin explicar: rasgos fuera de lista («vista al lago», «cava de vinos», «cancha de pádel») y lugares que el catálogo no reconoció. Devuelve **solo** `lugar`, `recamaras`, `banos` y `palabras`; **nunca casas**. Operación, tipo, orden y precios **no se le preguntan**: medido, el modelo chico ponía `operacion: "venta"` en 9 de 15 frases que no lo decían. `validarIntencion` (`shared/intencion.ts`) exige que cada dato salga de la frase: el número de recámaras tiene que estar escrito, y lugar y rasgos solo pueden salir de palabras que el vocabulario no explicó. De las 65 frases de prueba, **solo 14 necesitan al modelo**; las demás se resuelven en las capas 1 y 2, al instante y sin gastar.

**La frase manda sobre el formulario.** Tras entender una frase el formulario queda lleno con lo entendido, y si ahí mismo se teclea otra, esos valores viajan de nuevo: lo que la frase NUEVA dice gana, y lo que no menciona se conserva (así «En renta» elegido en la portada + «casa en altozano» funciona). El precio es una sola afirmación («más de 10 millones» sobre un «hasta 3 millones» viejo no es un rango); los rasgos de la frase reemplazan a los que había (sumarlos daba cero casas); y un lugar en la frase suelta la colonia o la ciudad elegidas. Lo heredado se ve en «Así lo entendimos», donde **cada filtro se quita con un toque**.

**Los rasgos (`con=`)** se buscan en título, resumen y descripción, **en JavaScript** (`shared/rasgos.ts`) y no con `LIKE`: el truco de `_` por vocal (`shared/busqueda.ts`) da falsos positivos en un texto largo («cochera» → `___h_r_` casa con «hermosa»). Sin acentos, con plural y género libres («amueblada»), sinónimos («un piso» = «una planta», «piscina» = «alberca»), corrección del mal escrito («alverca») y la terminación libre pero solo la terminación («plano» no es «planta»). A la consulta llegan como `p.id IN (…)`. El sitio anterior tenía 30 amenidades en el filtro y ninguna capturada; aquí no se captura nada: se busca donde el equipo ya lo escribe (alberca 8 casas, jardín 79, roof garden 28, terraza 47).

**Candados del gasto:** interruptor y **tope diario de consultas** (300 de fábrica) en Panel › Configuración; **memoria** de 7 días por huella de la frase (`ia_cache`: una frase se pregunta una vez); freno de 10 consultas por minuto y por persona (`LIMITE_IA`); **3.5 s de reloj** (si no contesta, queda lo de las capas 1 y 2); ni robots ni precargas del navegador pagan inferencia; frases de más de 160 caracteres no se interpretan. Los Neurons no se pueden leer desde el Worker: el tope va en consultas y el panel estima los Neurons con los tokens.

**El modelo se eligió midiendo** (`npm run medir:ia`: 65 frases reales × 2 vueltas contra la API, con las mismas instrucciones y el mismo validador que el Worker). Resultados del 20/09/2026 en §19. De fábrica, **`@cf/ibm-granite/granite-4.0-h-micro`**, el más chico y barato del catálogo: con su trabajo reducido a sacar el lugar y los rasgos, acierta lo mismo que el de 70B a 1 Neuron por búsqueda. El panel deja cambiar entre los cinco medidos. Hay dos familias de modelo y el motor habla con las dos (§17).

**Apagado** (o sin presupuesto, o lento), el buscador conserva las capas 1 y 2: sigue entendiendo «casa en renta en altosano con alberca hasta 4 millones»; deja de entender los rasgos fuera de lista, que sin modelo se buscan solo si el catálogo usa esa palabra.

**Pendiente para F6:** cuando exista la etiqueta `canonical`, no debe incluir `frase` ni `literal` (no cambian los resultados). El buscador del panel no usa el modelo (nadie lo pidió); hereda gratis la capa de vocabulario si algún día se conecta.

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
| `/panel/contenido` | Portada, servicios (ordenar y ocultar), nosotros y preguntas | contenido |
| `/panel/entregas` | Crear la entrega, subir la foto del día, mandar el enlace por WhatsApp (se enseña **una sola vez**; «Generar enlace nuevo» si se pierde), revisar la respuesta, publicar/quitar, dejar fuera una foto, corregir el nombre público y borrar (base y nube). Reemplaza a los «testimonios» de `/panel/contenido` | contenido |
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

**Hecho en F1 (la limpieza, pasos 1 y 4; la extracción de datos del paso 2 queda para F3):** `normalizarDescripcion` además quita emojis de adorno (las viñetas quedan como «• ») para la ficha premium de D13, las frases con teléfono y los renglones que solo repiten el precio, porque los dos viven en sus campos y una descripción con el número viejo desmentiría al panel. Del bloque final de «Informes y citas» se va el contacto y el nombre del asesor, pero se conserva un aviso legal («Precio sujeto a disponibilidad…»). `asesorMencionado` rescata ese nombre como aviso para asignar la casa. `resumenDe` descarta encabezados y direcciones (más de la mitad de las palabras con mayúscula).

> **Trampa de las herramientas de edición:** no escribas escapes Unicode (barra invertida + `u` + cifras) en el código con Write/Edit, porque llegan al archivo como el carácter real (memoria `escapes-unicode-herramienta-edit`). Usa `normalize("NFKC")` y rangos con `String.fromCodePoint`, o genera esa línea con un script de Node.

### 11.4 Bitácora (`server/bitacora.ts`)

Se registra: crear, editar (diferencias campo por campo), publicar/despublicar, cambio de estado, papelera y restauración, fotos (subir, ordenar, borrar), cambios de configuración y contenido, usuarios (crear, rol, activar, clave temporal generada **sin la clave**), accesos correctos y fallidos, y cambios de estado de prospectos. Se escribe en el **mismo `db.batch()`** que el cambio.

---

## 12. API

Formato: JSON. Errores: `{ "error": "codigo_legible", "mensaje": "Texto para la persona" }`. Toda entrada se valida en el servidor (esquemas con Zod o validación a mano, pero en un solo lugar por endpoint).

**Pública**

| Método y ruta | Uso |
|---|---|
| `GET /api/propiedades` | Mismos parámetros que `/propiedades` (incluido `con`); devuelve `{ total, pagina, items, rangos }`. **Nunca interpreta frases**: `q` es texto tal cual (§10.5) |
| `GET /api/propiedades/:slug` | Ficha (solo publicadas, apartadas, vendidas y rentadas) |
| `POST /api/prospectos` | Formularios; límite + trampa (+ Turnstile si hay llave) |
| `POST /api/eventos` | `ficha_vista` (uno por sesión de navegador y casa), `whatsapp_click`, `telefono_click`, `compartir` |
| `POST /api/entregas/:token/firma` · `POST /api/entregas/:token/fotos` · `DELETE /api/entregas/:token/fotos/:id` | Fotos del cliente desde su enlace. **El enlace es el freno** (vivo, sin contestar, tope de 6), no el límite por IP: cuatro fotos son ocho peticiones y el límite son 8 por minuto |

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
| `GET/PATCH /api/panel/configuracion/:clave` | Configuración. En `busqueda_ia`, lo que el `PATCH` no traiga se conserva: mandar solo el tope no apaga el buscador |
| `GET/POST/PATCH/DELETE /api/panel/servicios`, `/preguntas` | Contenido |
| `POST /api/panel/entregas/:id/firma` · `POST /api/panel/entregas/:id/fotos` · `DELETE /api/panel/entregas/fotos/:id` | Fotos de una entrega (solo antes de que conteste el cliente: él autoriza lo que ve). Lo demás va por la acción de `/panel/entregas` |
| `GET /api/panel/prospectos` · `PATCH /api/panel/prospectos/:id` · `POST /api/panel/prospectos/:id/notas` · `GET /api/panel/prospectos.csv` | Prospectos |
| `GET/POST /api/panel/usuarios` · `PATCH /api/panel/usuarios/:id` · `POST /api/panel/usuarios/:id/clave-temporal` | Usuarios |
| `GET /api/panel/bitacora` | Bitácora |
| `GET /api/panel/metricas` | Vistas, clics y prospectos por casa (filtrados por rol) |
| `GET/PUT/DELETE /api/panel/redirecciones` | Sistema |

---

## 13. Fotos y Cloudinary

### 13.1 Organización

- **`public_id`:** `aig/propiedades/<clave>/<8 caracteres aleatorios>` para lo que se suba desde el panel. **Las fotos migradas de WordPress (F1.5)** llevan en su lugar los 8 primeros caracteres hexadecimales del SHA-256 de `url_origen`, para que repetir la migración no duplique nada (§13.5). Otras carpetas: `aig/sitio/…` (portada, logotipos) y `aig/usuarios/<id>`.
- **La nube tiene carpetas dinámicas** (`folder_mode: dynamic`, medido en F1.5). En una subida firmada, `folder` queda como carpeta del Media Library **y** como prefijo del `public_id`: `folder=aig/propiedades/AIG-0001` con `public_id=998fa0de` da `aig/propiedades/AIG-0001/998fa0de`. La Biblioteca, en la misma nube, se comporta igual. Siempre se guarda el `public_id` que devuelve la respuesta.
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

**Ya no aplica desde F1.5:** las 3,241 fotos están en Cloudinary y cada variante sale de su transformación. Se conserva la nota por si alguna foto vuelve a depender del puente. **Medido en F1:** hoy `urlFoto()` devuelve el **original** para todas las variantes. Con 12 tarjetas de ~1,200 px por página, el listado no llega a Lighthouse ≥ 90. Los tamaños que WordPress ya generó están en `analisis/crudo/medios/*.json` (`media_details.sizes`): `large` (1,024 px de lado mayor) en 2,971 de las 3,241 fotos, `medium_large` (768 px de ancho) en 2,922 y `medium` (300 px) en 3,175. 61 fotos no tienen registro en `medios` y se quedan con el original. El nombre del archivo no se puede calcular con fiabilidad (redondeo de WordPress y originales `-scaled`), así que conviene guardar la URL: `0002` con una columna para el tamaño intermedio, que la siembra llena al re-correrla (es idempotente), y `urlFoto` la usa para `tarjeta` y `miniatura`.

### 13.5 `scripts/migrar-fotos-a-cloudinary.mjs`

`npm run fotos:migrar -- --remote|--local [--limite N] [--concurrencia 3] [--seco] [--verificar]`

- **Qué sube:** las fotos con `public_id IS NULL`, en orden de clave y de foto.
- **Cómo sube:** **por URL** (`file=<url_origen>`), con subida firmada sobre `folder`, `overwrite=false`, `public_id` y `timestamp`. Cloudinary le pide la foto a WordPress y el archivo no pasa por la máquina. Las llaves salen de `.dev.vars`. El servidor de WordPress sí le entrega las fotos a Cloudinary (medido).
- **Idempotente sin bandera `--reanudar`:** el `public_id` es determinista (§13.1). Con `overwrite=false`, repetir una subida devuelve `existing: true` sin guardar otra copia. Se probó borrando el registro: 3 de 3 respondieron «ya estaba» y en la nube siguieron 3.
- **Registro:** cada subida se anota en `seed/generado/fotos-cloudinary.jsonl` (ignorado por git), junto con `public_id`, medidas y `bytes`. La D1 se actualiza desde ahí en lotes de 100, **buscando la foto con el índice de su casa** (`WHERE id = (SELECT … INDEXED BY idx_fotos_propiedad …)`): ~17 filas leídas por foto. La primera versión filtraba por `public_id IS NULL` y leyó 5.6 millones de filas (§17). Una sola subida sirve a las dos bases: primero `--remote`; luego `--local` toma todo del registro y no sube nada.
- **`url_origen` se conserva:** la siembra la usa para no duplicar fotos y `comparar` la necesita.
- **`--verificar`:** cruza la D1 con la Admin API (faltantes, huérfanas bajo `aig/propiedades/`, medidas distintas) y falla si hay alguna o si queda una foto sin subir. Gasta ~1 llamada por cada 500 fotos; la Admin API tiene un tope de 500 llamadas por hora, por eso nunca se consulta foto por foto.
- **Se detiene solo** si Cloudinary rechaza las llaves (401 o 403), si devuelve un `public_id` fuera de la carpeta, o tras 10 fallos seguidos. Reintenta 3 veces y espera 60 s ante 420 o 429.
- **Los 31 videos no se migran** en la propuesta.
- **Pendiente: `--forzar-desde-cuenta-actual`.** Serviría para cambiar de cuenta: con las variables nuevas, volvería a subir desde `https://res.cloudinary.com/<nube-anterior>/image/upload/<public_id>` con el mismo `public_id` y `overwrite=false`. No se construyó en F1.5 porque no hay una segunda nube donde probarlo.

**Costo medido (corrige la estimación previa a F1.5):**

- **Subir no genera ninguna transformación:** solo almacenamiento, ~450 MB ≈ 0.44 créditos al mes. Nada de `eager` ni de «calentar» URLs recorriendo el catálogo.
- **Las transformaciones se generan por ficha vista, una por variante y formato.** Abrir la ficha de F0 en Chrome creó 1 derivado (galería en WebP; Chrome headless no recibió AVIF). `fetch` desde Node creó otro (JPG). El `og` crea 1 cuando lo pide un rastreador o WhatsApp.
- **Los «15 a 30 créditos» eran el peor caso:** el catálogo entero, visto en todas las variantes y formatos.
- **Para F2:** abrir una casa completa en un solo tipo de navegador cuesta ~2 derivados por foto (galería + miniatura). Recorrer las 188 casas así sería ~6,500 ≈ 6.5 créditos, y cada formato o ancho de `srcset` distinto que se llegue a pedir suma otra vez. **Pocos anchos.**
- **`GET /usage` es un corte diario** (`last_updated`): lo de hoy se ve mañana.

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
- **Heredado de F1 (medido):**
  - **Fotos:** ~~usar los tamaños intermedios de WordPress~~. Resuelto en F1.5: las 3,241 están en Cloudinary. Lo que queda para F2 es el **costo por ficha vista** (§13.5): pocos anchos en `srcset` y nada de precargar la galería entera.
  - **Datos al cliente:** el loader de la ficha provisional de F0 devuelve la fila completa y manda en la hidratación columnas que no se pintan (`portada_public_id`, `portada_url_origen`). Todas son públicas, pero en F2 cada loader debe devolver solo lo que se pinta.
  - **Zonas:** hay 123 zonas para 188 casas; 115 son de Morelia y 93 de esas tienen una sola casa. Solo 22 zonas tienen dos o más. Un filtro `zona` con todas las opciones no sirve. Hay que decidir el diseño: agrupar por ciudad más las colonias con 2 o más casas, o buscar por texto. Para depurar las colonias adivinadas, F3 quizá necesite «fusionar zonas», que §11.2 no tiene.

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
- «Vende o renta tu casa», calculadora de crédito, favoritos y comparar, ficha en PDF, alertas, páginas por fraccionamiento, «Equipo» con asesores visibles, compartir en redes (1080×1350) y reseñas de Google. (Las opiniones de clientes con permiso ya existen: son las «Entregas» de F5.)

---

## 16. Verificación y pruebas

- **Vitest:** `shared/texto.ts` (15+ casos reales), `shared/permisos.ts` (matriz completa, generada desde la tabla de §9), `shared/fotos.ts`, `shared/whatsapp.ts` (codificación de acentos y `¿`), `server/auth/clave.ts` (compatibilidad con el script), reglas de redirección y parámetros de filtros.
- **Pruebas contra la app** (`wrangler dev` o `vite dev` con D1 local): script `npm run verificar` que hace peticiones reales para los «listo cuando» de API y permisos.
- **Visual:** Chrome headless a 390 y 1366 px (memoria `verificacion-visual-chrome-headless`: perfil nuevo por corrida, `Start-Process -Wait`, iframe de 390 px para el ancho real de móvil). Guardar las capturas en `sitio/verificacion/capturas/`.
- **Rendimiento:** `npx lighthouse@12 <url> --preset` móvil y escritorio, con reportes JSON en `sitio/verificacion/lighthouse/`.
- **El buscador (§10.5):** `npm run verificar:busqueda -- --base … --local|--remote [--ia]`: lo que se entiende sin modelo (con agente de robot: determinista y gratis), la frase tecleada en la portada con un navegador de verdad, el interruptor del panel pulsado con una cuenta de director desechable y, con `--ia`, el modelo real. `npm run medir:ia` compara modelos antes de cambiar el de fábrica o las instrucciones.
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
| **El limitador de Cloudflare es permisivo en producción.** En local el 429 llega exacto en el 9.º intento; en `workers.dev` una ráfaga dejó pasar 18 y bloqueó desde el 19 (dos mediciones iguales). Cloudflare lo documenta: contadores por máquina, sincronizados en segundo plano | Aceptado: el freno llega y se mantiene. `npm run verificar -- --remote` exige 429 antes de 40 intentos y ninguno que pase después; en local exige el 9.º exacto | medido en F0 (16/09/2026) |
| **Cloudflare rechaza con `403 error code: 1000` cualquier petición de fuera que traiga `cf-connecting-ip`** | Los scripts solo mandan esa cabecera contra `localhost` | idem |
| `wrangler d1 execute --remote --file` va por la API de importación: **no devuelve las filas de un SELECT** e imprime líneas de avance antes del JSON aunque se pida `--json` | Lecturas con `--command`; escrituras con archivo temporal y el JSON se lee desde la primera línea que empieza con `[` (`scripts/lib/d1.mjs`) | idem |
| Una D1 recién creada puede responder `code: 7403` («account is not valid or is not authorized») a las consultas durante unos minutos | Esperar y reintentar; no es de permisos | idem |
| **Dos PBKDF2 en la misma petición = una de 200 000 iteraciones**, que revienta por CPU | Un solo PBKDF2 por petición. «La nueva no repite la temporal» se comprueba con `sesiones.huella_temporal` (SHA-256 de `token:temporal`). Cambiar la clave desde «Mi cuenta» (F3) irá en dos pasos: confirmar la actual y después guardar la nueva | diseño de F0 |
| El build copia `.dev.vars` a `build/server/` (para `vite preview`) | `build/` está en `.gitignore`; `wrangler deploy` no lo sube como secreto. Nunca versionar `build/` | idem |
| React mete `<!-- -->` entre textos contiguos del HTML del servidor («Hola, <!-- -->David») | Las pruebas que buscan texto en el HTML lo quitan antes de comparar | idem |
| `public/_headers` solo lo aplica Cloudflare; el servidor de Vite no lo lee | La cabecera `noindex` de los estáticos se verifica solo en remoto | idem |
| **El editor de WordPress escribe `<br data-start="…" />` con atributos**: un `/<br\s*\/?>/` no los ve y las listas salen pegadas («Bodega• Cuarto•») | `htmlATexto` usa `/<br\b[^>]*>/` y trata `<hr>` como párrafo | medido en F1 |
| **El id de cada foto de la galería viene en base64 dentro del visor de Elementor** (`data-e-action-hash`, `settings=…` → `{"id":12490,…}`) | Con ese id se sacan de `medios/` la URL original y las medidas exactas; el nombre de archivo es el respaldo | idem |
| **Dos fichas no tienen galería**, solo foto de portada; una comprobación de descarga que exija «Galería» las rechaza | La descarga exige «Especificaciones»; la siembra guarda la portada como única foto | idem |
| **Un slug de WordPress viene con `%c2%b2` («m²»)** | Se limpia a `terreno-de-2942m2` y las dos formas de la URL vieja quedan en `redirecciones` | idem |
| Las descripciones usan como viñetas emojis con selector de variación (U+FE0F), banderas (pares de «indicadores regionales», que NO son pictogramas) y frases de contacto con teléfono pegadas a otra frase («…2197¡Agenda…») | `shared/texto.ts` quita pegamento, pictogramas y banderas, convierte viñetas en «• » y borra solo la FRASE con teléfono | idem |
| **El tope gratuito de D1 (5 millones de filas LEÍDAS al día) es de TODA la cuenta** (Cuponera, la Biblioteca, «un», la consola y este proyecto), y cuentan las filas que recorre cada consulta, no las consultas. El 17/09/2026 la primera versión de la migración F1.5 leyó **5,643,116 filas** con ~3,241 `UPDATE … WHERE public_id IS NULL AND url_origen = …`: SQLite resolvió el `IS NULL` con el autoíndice UNIQUE de `public_id` y cada UPDATE recorrió todas las fotos pendientes. **A las 03:27–03:31 UTC fallaba toda consulta que lee filas en esta base, Cuponera y la Biblioteca** (`code: 7500`; `SELECT 1` sí pasaba; la ficha daba 500). **A las 03:28:26 UTC el usuario pasó la cuenta a Workers Paid** (registro de auditoría: «Create Subscriptions») y a las 03:39 las tres volvían a leer. Desde entonces el tope es **mensual** (25 mil millones de filas leídas, excedente a 0.001 USD por millón): un escaneo así ya no tira el servicio, pero se paga | Antes de repetir un `UPDATE`/`DELETE` cientos de veces contra la D1 remota, pasarle `EXPLAIN QUERY PLAN` en **local** (gratis): `USING INTEGER PRIMARY KEY` o `idx_fotos_propiedad` está bien; un autoíndice sobre `IS NULL` no. Forzar el índice con `INDEXED BY` (si no puede usarlo, falla en vez de recorrer). La D1 local de wrangler no reporta `rows_read`: medir en remoto con `wrangler d1 info <base>` (`rows_read_24h`) o por hora con `~\.claude\scripts\d1-uso.ps1` | memoria `d1-limite-lecturas-cuenta`; medido en F1.5 (17/09/2026) |
| El DELETE de fotos de la siembra tenía el mismo plan (autoíndice de `public_id`): en una base nueva habrían sido 188 × 3,241 ≈ 609 mil filas por siembra | Corregido con `INDEXED BY idx_fotos_propiedad` y probado en local con las 3,241 pendientes | idem |
| El upsert de `propiedades` de la siembra comprueba la llave foránea de `prospectos` con **SCAN** (no hay índice por `propiedad_id`) | Hoy no cuesta (0 prospectos). **En F4**, antes de re-sembrar en remoto con prospectos reales: `CREATE INDEX idx_prospectos_propiedad ON prospectos (propiedad_id)` | idem |
| **`GET /usage` de Cloudinary es un corte diario** (`last_updated`): lo que se sube o transforma hoy no aparece hasta mañana | Medir con los `bytes` de cada respuesta y con `derived` de la Admin API (`resources/image/upload/<public_id>`); el crédito se confirma al día siguiente | medido en F1.5 (16/09/2026) |
| **La nube `srz5sh9l` tiene carpetas dinámicas:** `folder` queda como carpeta **y** como prefijo del `public_id` | Guardar el `public_id` de la respuesta y comprobar que empieza con la carpeta (§13.1) | idem |
| **Pedir a Cloudinary el original sin transformación (`/image/upload/<public_id>`) creó un derivado** con transformación vacía, y cada derivado cuenta | Para verificar, comparar medidas y `bytes` con la Admin API (`--verificar`), no descargando originales | idem |
| **D1 rechaza los patrones de `LIKE`/`GLOB` de más de ~50 caracteres** con «LIKE or GLOB pattern too complex» (medido: 50 pasa, 62 falla; los comodines no cuentan aparte). Un `GLOB` con una clase por letra para ignorar acentos (`[aáAÁ]`) mide **75 caracteres** para «tres marias» y D1 lo rechaza entero, así que la consulta falla en vez de devolver de más | Buscar con `LIKE`, que además **ya ignora mayúsculas y minúsculas en ASCII**, y comparar con `_` la letra que pueda venir acentuada: «marias» → `%m_r__s%` encuentra «Marías» y «Marias» (`shared/busqueda.ts`, tope propio de 48). El plan es un `SCAN` de 188 filas: aceptable | medido en F2 (17/09/2026) |
| **Un `<button type="submit">` no envía NADA si el formulario tiene campos `required` vacíos**: el navegador cancela en silencio, y en headless ni la burbuja de validación se ve. «Leer el texto» se pulsa justo cuando el título y la ciudad están vacíos, y el síntoma era que no pasaba absolutamente nada: ni petición, ni error, ni mensaje | Los botones que **no guardan** llevan `formNoValidate` | medido en F3 (17/09/2026) |
| **Un `PATCH` que no trae un campo lo BORRA**, si el servidor arma el registro entero desde el cuerpo: guardar una casa sin `asesor_id` la dejaba sin asesor, y con eso su dueño perdía el permiso de editarla | Los campos cuya ausencia no significa «vacío» se conservan cuando no vienen (`editarPropiedad`, opción `asignarAsesor`) | idem |
| **Borrar una cuenta falla con `FOREIGN KEY constraint failed`** si algo la referencia: `configuracion.actualizado_por`, `usuarios.creado_por`, `propiedades.creada_por` y `propiedades.asesor_id` | Soltar esas referencias con `UPDATE … SET … = NULL` antes de borrar (`soltarReferencias`, en los dos guiones de verificación de F3) | idem |
| **En producción todas las peticiones salen de la MISMA IP** y el freno de acceso son 8 por minuto (§8.4): preparar cuatro cuentas seguidas lo llena, y el 429 parece un fallo de la prueba | Reintentar tras 65 s al recibir 429. En local cada petición manda su propia `cf-connecting-ip` y esto nunca espera | idem |
| **Los trozos del build del panel NO se distinguen por su nombre**: `routes/publico/marco.tsx` y `routes/panel/marco.tsx` producen archivos que se llaman igual | Para el criterio 8 se identifican por su **contenido** (textos que solo existen en el panel) y se comprueba que ninguno se pida al navegar el sitio público | idem |
| **Una verificación que limpia la base deja basura en la NUBE**: borrar la fila de `fotos` con SQL no borra el archivo de Cloudinary. El recorrido de F3 dejó **40 huérfanas** bajo `aig/propiedades/AIG-0189/` (la casa de prueba ya ni existía), que `fotos:migrar --verificar` reporta como error y que se pagan como almacenamiento | Quitar las fotos **por el mismo camino que usa la app** (`DELETE /api/panel/fotos/:id`, que sí llama a `destroy`) antes de borrar la casa, y cerrar toda verificación con `npm run fotos:migrar -- --remote --verificar` en ceros. Lo mismo con las **zonas** que crea la prueba: se borran con `NOT EXISTS (SELECT 1 FROM propiedades WHERE zona_id = zonas.id)` | medido al cerrar F3 (17/09/2026) |
| **SQLite resuelve los nombres de un `HAVING` contra las COLUMNAS DE ORIGEN antes que contra los alias del `SELECT`.** En la consulta de métricas, `HAVING vistas + whatsapp + telefono + compartir > 0` tomó `whatsapp` y `telefono` de la tabla **`usuarios`** —que entra por el `LEFT JOIN` del asesor y tiene esas dos columnas—, casi siempre NULL: la suma entera daba NULL, la tabla de casas salía **vacía** y **no hubo ningún error**, ni en la consulta ni en la pantalla | Filtrar con una expresión que no pueda chocar con una columna: `HAVING COUNT(e.id) > 0`. Medido contra la base: con los alias, **0** casas; con `COUNT(e.id)`, **1**, habiendo 6 eventos | medido en F4 (17/09/2026) |
| **`Response.text()` descarta el BOM UTF-8** al decodificar (lo manda el estándar de Fetch): una comprobación que busque el BOM en el texto dice que no está aunque el archivo sí lo lleve, y se «arregla» un CSV que ya estaba bien | Comprobar el CSV en **bytes** (`arrayBuffer()` → `EF BB BF`); en Vitest, `csv.charCodeAt(0) === 0xfeff` | idem |
| **`wa.me` exige el número con clave de país**: quien llena el formulario teclea diez cifras y `wa.me/4431112233` no abre ningún chat (falla en silencio, ya en WhatsApp) | `numeroInternacionalMX` antepone el 52 a las de diez cifras y deja las que ya la traen (`shared/whatsapp.ts`). El enlace se arma en el **servidor**, así el panel no descarga nada nuevo | idem |
| **Una celda de CSV que empieza por `=`, `+`, `-` o `@` la ejecuta Excel como fórmula** al abrir el archivo, y el nombre y el mensaje los escribe cualquiera desde el sitio público | Los campos de texto libre salen con un apóstrofo delante (`shared/csv.ts`, recomendación de OWASP). El teléfono y las fechas no lo llevan —un `+52…` legítimo empieza por `+`—, **y por eso el teléfono sale solo con cifras** (`numeroLimpio`): exenta, esa única columna anula la neutralización de todas las demás, porque `=cmd|' /C calc'!A04431112233` tiene 11 cifras y 28 caracteres y pasa entero la validación del formulario público | idem |
| **Un `evento` impide borrar la casa de prueba, y la deja PUBLICADA en el sitio.** El recorrido de F3 publica una casa y después la abre en el sitio público; esa visita escribe un `ficha_vista` con su `propiedad_id`. La limpieza revienta entonces con «FOREIGN KEY constraint failed» **después** de haber borrado sus fotos y su bitácora, y como el guion termina con un volcado de Node y no con un ✖, el fallo no sale en la lista de comprobaciones. Al desplegar F4 dejó `AIG-0189` «Casa de recorrido F3» **publicada en producción**, visible en el listado, y su cuenta de prueba viva. Lo mismo hace `notas_prospecto.usuario_id` con una cuenta que anotó algo | Borrar de las hojas a la raíz: **`eventos` y `prospectos` primero**, luego `notas_prospecto`, `fotos`, `bitacora` y al final la casa (ya lo hacen los dos guiones de F3 y el de F4). Y cerrar toda verificación **mirando la base**, no solo la salida del guion: 188 casas, 0 cuentas `@ejemplo.invalid`, 0 zonas de prueba y `fotos:migrar --verificar` en ceros | medido al desplegar F4 (17/09/2026) |
| **En Tailwind 4, `scale-*`, `scale-x-*`, `translate-*` y `rotate-*` no escriben `transform`: son las propiedades CSS `scale`, `translate` y `rotate`, que el navegador MULTIPLICA con el `transform` que escribe GSAP.** Una barra con `scale-x-0` seguiría en cero aunque GSAP la llenara a `scaleX(1)` | En lo que anima GSAP, el estado de reposo va con propiedad arbitraria (`[transform:scaleX(0)]`), que el `transform` en línea de GSAP sí reemplaza (`vitrina.tsx`) | diseño de la vitrina (18/09/2026) |
| **Detener con `TaskStop` un `vite preview` lanzado en segundo plano cierra el shell pero deja vivo su `node`**, que sigue sirviendo en el 4180 y bloquea `build/`: `npm run build` y `npm run deploy` fallan con `EBUSY: resource busy or locked, rmdir … build\client` | Cerrar ese proceso por su puerto antes de compilar (`Get-NetTCPConnection -LocalPort 4180`, comprobando que su línea de comandos sea la de este proyecto). Si ya está verificada la compilación de ESE commit, `npx wrangler deploy` la sube sin recompilar | medido al desplegar la vitrina (18/09/2026) |
| **Un enlace a un ancla (`href="#…"`) crea otra entrada del historial**, sin estado, y React Router le da otra `location.key`: todo lo que dependa de esa llave (un componente con `key={location.key}`, lo guardado por entrada) se reinicia sin que haya cambiado nada | La lista infinita se reinicia por la BÚSQUEDA (`key={search}`) y guarda por llave de entrada; «Volver a los filtros» es un botón que desplaza (`scrollIntoView`), no un ancla | medido con el scroll infinito (18/09/2026): «Saltar al contenido» (`#contenido`) llevó el historial de 3 a 4 entradas con `history.state` en `null`, y la lista siguió con sus 24 casas |
| **Otra sesión puede estar trabajando en un WORKTREE del mismo repo y desplegando desde ahí.** El 19/09/2026 `main` iba en `1130228` y la rama `worktree-f5-formularios-y-guion` (en `.claude/worktrees/`) llevaba 16 commits más —cabecera isla, vitrina, scroll infinito, Jost, preguntas— **y era la que estaba en producción**. Un `wrangler deploy` desde `main` dejó el sitio sin todo eso: `git status` estaba limpio y nada lo advertía | **Antes de desplegar**, `git worktree list`, `git branch -a` y `npx wrangler versions list`: si la última versión no es la que salió de este árbol, parar y unir primero. Para volver atrás, `wrangler rollback <version>` (la versión anterior sigue en Cloudflare). Nada se pierde si cada rama está empujada | medido el 19/09/2026 |
| **El sitio pasa a minúsculas toda ruta** (`normalizarRuta`, para los enlaces viejos de WordPress) **y redirige con 301**: un enlace con token en base64 (con mayúsculas) llegaba roto a la página del cliente | Tokens de URL en **hexadecimal en minúsculas**, y las rutas con llave (`/entrega/`) fuera del motor de redirecciones (`esRutaDeSistema`) | medido en F5 (19/09/2026) |
| **SQLite reutiliza los `id` que se borran, y la base local y la de producción comparten la MISMA nube de Cloudinary**: con carpetas `aig/entregas/<id>/`, una entrega nueva caía en la carpeta de otra ya borrada, y la entrega 1 local y la 1 de producción habrían compartido carpeta | Carpeta con nombre **al azar** guardado en la fila (`testimonios.carpeta`, 16 hex). Vale para cualquier recurso nuevo en la nube: nunca nombrar carpetas por id | idem |
| **Limpiar una prueba ANTES de tener sesión deja huérfanas en la nube**: sin sesión el guion no puede borrar por la app (la que llama a `destroy`) y cae al SQL directo | En los guiones, primero las sesiones y después la limpieza de restos; cerrar mirando la nube por carpeta (`verificar:entregas` lo hace) | idem |
| **Git Bash convierte en ruta de Windows todo argumento que empieza por «/»**: a un guion que recibe una RUTA del sitio, `/servicios` le llega como `C:/…/Git/servicios` y la URL sale inválida. Los que reciben una URL entera (`capturar`) no lo notan; PowerShell y `cmd` tampoco | Los guiones que reciben una ruta la aceptan SIN la barra inicial y, si les llega una de Windows, lo dicen (`scripts/filmar.mjs`, `normalizar`). Alternativa: anteponer `MSYS_NO_PATHCONV=1` | 20/09/2026, al probar `filmar` |
| **Las capturas por CDP no tardan lo mismo**: ~180 ms con la página a media animación y ~110 en reposo. Filmando a paso fijo, la entrada de los dibujos parecía ir al doble de velocidad y los tiempos del CSS «no cuadraban» con lo escrito | `scripts/filmar.mjs` guarda la hora real de cada fotograma (`tiempos.json`) y `armar-gif.py` usa esas duraciones. Antes de dudar del CSS, dudar del reloj | 20/09/2026, los dibujos de Servicios |
| **Una casilla sin marcar NO viaja en el formulario**, y una función que lee su ausencia como «no me dijeron nada» la da por marcada: desde Panel › Contenido era imposible ocultar un servicio o una pregunta, y la API —que manda `visible: false`— nunca falló | En la acción del formulario, `visible: formulario.has("visible")`; la función de la base conserva su lectura para la API. Es el tercer caso de «lo que la gente pulsa no es la API» | 19/09/2026, al probar el campo «Dibujo» con navegador |
| **Workers AI tiene DOS familias de modelo y no se les habla igual.** Los «clásicos» (Llama, Granite, Qwen3) reciben `response_format: {type: "json_schema", json_schema: <esquema>}` y contestan en `response`; los compatibles con OpenAI (GLM, Gemma 4, gpt-oss) lo quieren envuelto (`json_schema: {name, schema, strict}`), contestan en `choices[0].message.content` y **razonan en voz alta si no se les apaga**: Qwen3 gastó sus 220 tokens «pensando» y contestó vacío en 32 de 32 frases. `llama-3.1-8b-instruct-fp8` rechaza JSON Schema (403, código 5025) | `server/ia/motor.ts` guarda la familia de cada modelo, manda `chat_template_kwargs: {enable_thinking: false}` a los que razonan y lee la respuesta venga donde venga. Antes de sumar un modelo: `npx wrangler ai models schema <modelo>` y `npm run medir:ia` | medido el 20/09/2026 (§10.5) |
| **Un modelo toma los ejemplos de las instrucciones como lista CERRADA.** Con «rasgos (alberca, jardín, roof garden…)» los seis modelos medidos ignoraban «estudio», «elevador» o «infonavit»: parecía un fallo del validador y era del mensaje | Decir «CUALQUIERA que sea», variar los ejemplos y medir con frases que NO estén en las instrucciones. Cambiar las instrucciones es volver a medir (y subir `VERSION_DE_INSTRUCCIONES`, que invalida la memoria) | idem |
| **Un modelo chico «completa» lo que nadie dijo**: `operacion: "venta"` en 9 de 15 frases que no lo decían, `banos: 3` al leer «3 recámaras», una colonia llamada «benta» | Lo que es vocabulario (operación, tipo, orden) no se le pregunta: lo lee `shared/frase.ts`. Y todo lo que contesta tiene que salir de la frase (`validarIntencion`): ese número escrito, alguna cantidad para un precio, y lugar y rasgos solo de palabras que el vocabulario no explicó | idem |
| **`isbot` toma por robot cualquier agente inventado** («Mozilla/5.0 prueba», `curl/8`, HeadlessChrome) y el buscador no le paga inferencia a los robots: una prueba con un agente así nunca llega al modelo y parece que «la IA no funciona», sin error ni registro | Para probar el modelo, un agente de navegador completo; para probar SIN gastar, uno de robot a propósito. `verificar:busqueda` usa los dos | idem |
| **El token OAuth de wrangler se renueva solo y el anterior muere**: un guion largo que lo leyó al arrancar recibe 401 a media corrida en cuanto otra orden de wrangler (u otra sesión) lo renueva | `scripts/medir-ia.mjs` relee `~/.wrangler/config/default.toml` y reintenta una vez ante un 401. El token nunca se imprime ni se guarda (repo público) | idem |
| **`shared/filtros.ts` viaja al navegador.** Importar ahí el vocabulario del buscador duplicó su trozo (641 → 1,301 B gzip) sin que nada avisara; y un módulo que trabaja al cargarse (un `Map` llenado con un `for`) tampoco se poda | Lo que LEE la URL, en `filtros.ts` y sin dependencias; lo que busca, en módulos que solo importa el servidor. Se comprueba buscando una palabra del vocabulario en `build/client/assets` | idem |
| **Buscar una raíz como prefijo confunde palabras**: de «plano» sale la raíz «plan», que casaba con «planta» | Terminación libre, pero SOLO la terminación: `raíz + (a\|o\|e)(s)?` y fin de palabra; a una palabra de menos de 5 letras solo se le perdona el plural (`shared/rasgos.ts`) | idem |
| **El truco de `LIKE` con `_` por vocal no sirve en textos largos**: «cochera» se vuelve `___h_r_`, que casa con «hermosa». Sirve para títulos y colonias (§10.1), no para descripciones | Los rasgos se comparan en JavaScript contra el texto de las 188 fichas, en memoria un minuto, y a SQL llegan como `p.id IN (…)` escrito (D1 admite 100 parámetros por consulta y pueden ser 188) | idem |
| **El `<details>` de «Más filtros» se abre solo con 3 filtros o más**, y una frase entendida casi siempre los trae: en el celular empujaba la primera casa dos pantallas abajo | Tras entender una frase se queda plegado: lo aplicado ya lo dice «Así lo entendimos» | idem |
| **Teclear en un campo antes de que React lo hidrate se pierde** (y el formulario se enviaría recargando): la prueba del buscador con navegador falló una de cada tres corridas esperando «2.5 s» | Esperar a la hidratación de verdad: el elemento ya tiene una propiedad `__reactProps$…`. Y comprobar el valor del campo antes de pulsar Intro | idem |
| **Un modelo de lenguaje no sabe sumar ni sigue la regla del papel.** El de fábrica leyó «menos de 2 millones 251 mil» como $2,010,000 (con «3 millones 488 mil» había acertado tres veces), y a «casa de 2 millones y medio» dos modelos le pusieron `precio_min` con las instrucciones diciendo que una cifra suelta es un tope. Un precio equivocado esconde casas sin avisar | El precio es entero del código (`shared/dinero.ts`): monto por aritmética, papel por comparador. Al modelo ni se le pregunta. Regla general: **lo que se pueda calcular no se le pide a un modelo** | medido el 20/09/2026 |
| **El mejor modelo depende del trabajo que se le deje.** Con todo encima (operación, tipo, precios), Granite 4.0 Micro fue el peor (76 de 102) y el de 70B el mejor. Con el vocabulario y los precios en código, el chico empata con el de 70B (128 de 130) a 1 Neuron contra 20. Y el que iba a ser de fábrica, GLM 4.7 Flash, tiene la mediana más rápida y una cola que no perdona: 5 de 130 consultas esperando más de 10 s | Achicar el trabajo del modelo ANTES de elegirlo, y elegirlo por su p90 y su máximo, no por su mediana. Repetir `npm run medir:ia` al cambiar instrucciones o catálogo de modelos | idem |
| **Una llave en el `<Form>` de React Router duplicó el formulario**: para que los campos no controlados reflejaran la dirección tras navegar sin recargar se probó `key={search}` en el `<Form>`, y React montó el nuevo SIN quitar el viejo (dos `#filtros` en la página, el de arriba con los valores viejos; consola limpia). Antes de eso el defecto era otro y llevaba ahí desde F2: los `<select>` con `defaultValue` no cambian al cambiar la dirección, así que tras pulsar una colonia o «quitar filtros» seguían enseñando lo anterior | La llave va en CADA campo, con su valor (`key={`tipo:${filtros.tipo}`}`): se monta de nuevo solo el que cambió. `verificar:busqueda` lo comprueba tecleando una segunda frase y contando formularios | idem |

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
| F0 · Cimientos | ✅ listo | 16/09/2026 | **Plan A** (React Router 8.4 en modo framework con SSR sobre `@cloudflare/vite-plugin`; Hono delante para `/api/*`, `robots.txt` y `sitemap.xml`). Versiones reales: React 19.3, Vite 8.3, TS 7.0.2, Wrangler 4.133, Tailwind 4.3, Vitest 5.0.1. Worker `activos-inmobiliarios` en https://activos-inmobiliarios.logidma.workers.dev · D1 `3d5a913b-bb03-468f-8bfd-0300ac51f73f` (WNAM) con `0001_inicial.sql` en local y remoto · secretos de Cloudinary con `secret bulk`. **Medido:** (1) `npm run dev` (puerto 5180), `build` y `deploy` funcionan; la ficha de prueba salió por `curl`, sin JS, con título, precio y `og:image` leídos de D1. (2) `noindex` en páginas, API, `robots.txt` y estáticos. (3) En producción el maestro desechable entró con temporal, fue obligado a cambiarla, salió, volvió a entrar con la nueva (por API y por el formulario) y se borró con su rastro. (4) Sesión de solo cambio → `GET /api/panel/propiedades` 403. (5) Freno: local 429 exacto en el 9.º; **producción 429 en el 19.º** (ver §17), bloqueo sostenido. (6) `/panel` sin sesión → 302 y `/api/panel/*` → 401. (7) Vitest 95/95 (matriz completa de §9 y hash Node ↔ `clave.ts` ↔ `node:crypto`). `npm run verificar`: **40/40 local, 41/41 producción**. `npm run verificar:navegador` (Chrome con JavaScript: formularios hidratados por `fetch` a `/panel/entrar.data`, cambio obligatorio, salir, cookie no legible desde JS): **10/10 en producción**. Capturas por CDP a 390 y 1366 px de `/panel/entrar` y `/`, sin desbordes, en `sitio/verificacion/capturas/f0/`. **Cambios al plan:** columna `sesiones.huella_temporal` (§17, dos PBKDF2); la sesión de solo cambio dura 60 min; con esa sesión también se permiten `GET /api/panel/mi-cuenta` y `DELETE /api/panel/sesion`. **Pendiente para F3:** cambiar la clave desde «Mi cuenta» (dos pasos). Al cerrar se generó la temporal real de `davismartinesad@gmail.com` con `--remote` |
| F1 · Datos reales | ✅ listo | 16/09/2026 | **Fichas:** las 188 descargadas a `analisis/crudo/fichas/` (`npm run fichas:descargar`, reanudable). 186 traen una galería de WordPress; **2 no tienen galería** (solo portada: `casa-en-club-campestre-erandeni-3`, `casa-en-centro-historico-4`). **Siembra** (`npm run sembrar -- --local\|--remote`): 188 propiedades, **3,241 fotos** (1 a 65 por casa, mediana 16; ~450 MB; ancho mediano 1,200 px; 1,117 de menos de 1,000 px), 123 zonas, 6 servicios y las 6 claves de configuración. Claves AIG-0001…AIG-0188 por fecha de alta. **Comprobaciones de §14: 7/7 en local y 7/7 en remoto.** **Idempotencia probada en local:** una casa editada en el panel, una foto con `public_id`, una casa creada en el panel y un servicio renombrado quedaron intactos al re-sembrar, y las claves no cambiaron. **Contra el sitio actual (pedido en vivo, `npm run comparar`):** 5 fichas (El Prado 4, Chapultepec Oriente con 65 fotos, Torre Cielo, Lomalta M2-35 con m² de terreno y construcción, y Centro Histórico 4 sin galería) coinciden en precio, recámaras, baños, m², número y **orden exacto** de fotos y portada. La ficha F0 en producción ya sirve una casa real con su `og:image`. Vitest: 116/116 (21 nuevas de `shared/texto.ts`, una pasa sobre las 188 descripciones reales). **Avisos para el equipo** (`seed/generado/reporte.md`, copia en `sitio/verificacion/f1-reporte-siembra.md`): colonia adivinada 164 y no detectada 24, sin resumen 11, preventa detectada 6, asesor nombrado en el texto 6, falta precio de renta 5, tipo «Inmueble» 3, ciudad supuesta 2, operación supuesta 2, dirección cambiada 1 (`terreno-de-2942m²` → `terreno-de-2942m2`, con sus redirecciones guardadas). |
| F1.5 · Fotos a Cloudinary | ✅ listo · ⚠ incidente de D1 | 17/09/2026 | **Migración** (`npm run fotos:migrar`): 3,241 fotos en la nube `srz5sh9l` bajo `aig/propiedades/<clave>/`, **465.3 MB** (≈ 0.45 créditos de almacenamiento al mes). Tardó 23 min a concurrencia 3 y las fotos no pasaron por la máquina. **Verificado:** `--verificar` en remoto y en local da 0 sin subir, 0 faltantes en Cloudinary, 0 huérfanas y 0 medidas distintas. Las 3 primeras son idénticas byte a byte a WordPress (SHA-256); 3,153 pesan exactamente lo que WordPress registró al recibirlas; las 86 sin peso registrado se descargaron y están completas e iguales. Repetir la subida sin registro devolvió `existing` (no duplica). Re-sembrar después de migrar dejó las 3,241 intactas (7/7), también con las 3,241 pendientes y la consulta corregida. En producción, `/propiedades/puerta-centro` y `/propiedades/casa-en-torremolinos` sirven `<img>` y `og:image` desde `res.cloudinary.com` (HTTP 200); capturas a 1366 y 390 px en `sitio/verificacion/capturas/f1.5/`. **Costo medido:** subir = 0 transformaciones; abrir una ficha de F0 = 1 derivado por formato de navegador (Chrome → WebP) + 1 del `og`. **2 originales dañados en WordPress** (JPEG cortados en el servidor, sin marca de fin; el sitio actual los muestra con manchas): AIG-0094 (`casa-en-altozano-hacienda-del-monte`, plano) y AIG-0096 (`casa-en-fracc-santa-fe-sur-poniente`, baño). Se subió su tamaño intermedio sano (473×1024 y 1152×1536); si el equipo tiene los originales, conviene volver a subirlos desde el panel (F3). **Incidente:** la primera versión del UPDATE leyó 5,643,116 filas y pasó el tope de lecturas de D1 de TODA la cuenta (§17); el usuario pasó la cuenta a Workers Paid esa misma noche. Corregido y probado en local de punta a punta. **Tras el incidente, en producción:** 5 fichas (El Prado 4, Chapultepec Oriente, Real Castillejo en renta y las dos de fotos reparadas) sirven `og:image` (JPG) e `<img>` (WebP) desde Cloudinary con HTTP 200, y las 2 fotos reparadas llegan completas. `npm run comparar -- --remote` con las 5 de F1: **todo coincide** (precio, recámaras, baños, m², número y orden de fotos, portada). `--forzar-desde-cuenta-actual` sigue sin construir (§13.5) |
| F2 · Sitio público | 🟡 construida · falta el criterio 5 | 17/09/2026 | **El sitio público está completo y desplegado**, y **8 de los 9 «listo cuando» pasan en producción**: `npm run verificar:f2 -- --base https://activos-inmobiliarios.logidma.workers.dev --remote` da **39/39**, igual que en local. Rutas: portada, `/propiedades` con filtros en la URL, ficha, servicios, nosotros, contacto y aviso. **(1)** `curl` sin JavaScript a una ficha trae título único (título · zona · recámaras · precio), clave, precio y `og:image` en JPG 1200×630 desde Cloudinary; una inexistente da 404. **(2)** Cinco combinaciones de filtros dan lo mismo que un `COUNT(*)` escrito a mano en el script, no derivado del código que cuenta: 156, 8, 71, 66 y 8. **(3)** El rango llega a **$65,000,000** y «hasta el máximo» incluye la casa más cara sin dejar ninguna fuera. **(4)** A 390 px no hay desplazamiento horizontal, nada se sale del ancho y el botón de WhatsApp no toca ninguno de los 6, 12 y 7 precios de cada página. **(6)** El enlace de WhatsApp trae título, clave y URL de esa casa. **(7)** El formulario sin JavaScript guarda el prospecto con su `propiedad_id`; sin aceptar el aviso da 400 y el campo trampa contesta 200 pero guarda 0. **(8)** Las 15 redirecciones, incluidas las **8 páginas de la plantilla «Findero»** → `/` y `/contact-us` → `/contacto`. **(9)** Cero rastros de plantilla, *Lorem ipsum* o inglés en las 7 rutas. **Decisión de zonas** (que F2 heredaba sin resolver): ciudad + colonia con 2 o más casas + búsqueda por texto; fusionar las casi duplicadas queda para F3. **Movimiento:** GSAP entra con `import()` tras hidratar y queda en trozos aparte (`gsap` 27.1 KB y `ScrollTrigger` 17.4 KB gzip), fuera del paquete inicial (~113 KB de 150). `npm run verificar:movimiento` recorre lo animado y lee su opacidad real: **29, 23 y 14 elementos animados y 0 invisibles**, con movimiento normal y forzando «menos movimiento». El isotipo se anima pieza por pieza con la coreografía del README de `DavisMtz/AIG-recursos`. **⚠ Criterio 5 NO se cumple:** Lighthouse móvil sobre el sitio desplegado da **82 (portada), 74 (listado) y 78 (ficha)**, contra el objetivo de 90; LCP 3.7 / 4.9 / 4.4 s contra < 2.5 s. Lo demás sí: accesibilidad **100 / 98 / 100**, buenas prácticas **100** y **CLS 0**; el SEO en 66 es a propósito (`MODO_DEMO=1` manda `noindex`). Dos rondas de optimización medidas lo subieron desde 78/63/64: precarga de las dos fuentes y `q_auto:eco` en la variante de tarjeta. **Diagnóstico medido, no supuesto:** TTFB 80–150 ms y TBT 0–50 ms (no es el servidor ni la CPU); el techo es el **FCP de 3.2–3.5 s** con ~1.0–1.1 MB de peso bajo la red 4G simulada. El LCP de la portada es el `<h1>`, o sea texto. Se descartó que fueran derivados en frío de Cloudinary: la segunda corrida salía igual o peor. **Lo que queda por probar** (con su costo): más anchos en el `srcset` (cada uno son derivados nuevos de Cloudinary, §13.5), bajar el peso de las fotos del listado, y los ~192 KiB de JavaScript sin usar, que son React + React Router y no se quitan sin tocar la arquitectura. Reportes en `sitio/verificacion/lighthouse/` (`*-prod.json` son los del sitio desplegado) | **Paso 1 de 9 listo: capa de datos y funciones puras.** `shared/filtros.ts` (única definición de qué se puede filtrar, siempre en la URL), `shared/busqueda.ts`, `shared/whatsapp.ts`, `shared/fotos.ts` (nuevo `fotoVista`, que resuelve `src` y `srcset` en el servidor: ningún componente ve `public_id`), `server/db/propiedades.ts` y `server/db/configuracion.ts`. **Decisión de zonas**, que F2 heredaba sin resolver (§15): filtro por **ciudad** (7) + **colonia con 2 o más casas** (21) + **búsqueda por texto**, que es lo que rescata las 93 colonias de una sola casa; **fusionar** las casi duplicadas («Lomalta» / «Lomalta, Tres Marías» / «Tres Marías») queda para F3. **Costo de Cloudinary:** `srcset` de **dos anchos** por variante (tarjeta 640/960, galería 800/1600) y uno solo en miniatura y `og`; cada ancho de más multiplica los derivados (§13.5). **Medido en la D1 local:** «tres marias» → 18 casas, «altozano» → 16, «erandeni» → 9, «jesus del monte» → 4, «AIG-0094» → 1, «no existe esta colonia» → 0. `EXPLAIN QUERY PLAN`: el listado usa `idx_prop_listado`, la ficha el índice de `slug` (covering) y las fotos `idx_fotos_propiedad`; la búsqueda por texto es un `SCAN` de 188 filas, aceptable. Vitest **149/149** (33 nuevas) y `tsc -b` limpio. **Trampa nueva:** el tope de ~50 caracteres de los patrones de D1 (§17). **Falta:** marco público, listado, ficha, portada, páginas de contenido, API/prospectos/eventos, redirecciones y sitemap, diseño con GSAP y la verificación de los 9 «listo cuando» |
| F3 · Panel | ✅ listo | 17/09/2026 | **Las nueve pantallas de §11.2 y los 8 «listo cuando» pasan EN PRODUCCIÓN:** `npm run verificar:f3 -- --remote` da **30/30** y `npm run verificar:f3-navegador -- --remote` da **14/14** (en local, 30/30 y 11/11). **(1)** La matriz de §9, casilla por casilla, con cuatro cuentas desechables (una por rol): **72 casillas**, con las respuestas esperadas **escritas a mano** y no derivadas de `shared/permisos.ts`; cubre «solo las suyas» (el asesor edita su casa y recibe 403 en la ajena) y que el director NO puede crear otro director. **(2)** Recorrido completo a 390 px con Chrome por CDP: pega el texto real de una publicación, «Leer el texto» llena los campos vacíos, guarda, **sube cinco fotos** por el selector de archivos, publica, y la casa sale en el sitio público; sin desplazamiento horizontal y con la copia local guardada mientras tanto. **(3)** Lo que sube un asesor nace en `revision`, él no puede publicarlo y el director sí, pero solo cuando tiene precio y foto (antes se rechaza diciendo qué falta). **(4)** El teléfono que guarda el director aparece en la portada y en Contacto sin JavaScript; el guion lo restaura al terminar. **(5)** El alta entrega la temporal **una sola vez**; con esa sesión solo se puede cambiar la clave (403 en lo demás) y después entra con la suya. **(6)** Desactivar a alguien le da 401 en su siguiente petición y ya no puede volver a entrar. **(7)** La bitácora registra crear, editar y estado, con quién y cuándo, y **ninguna contraseña** aparece ni en la respuesta ni en la tabla. **(8)** Los trozos del panel se identifican **por su contenido** —no por su nombre: `routes/publico/marco.tsx` y `routes/panel/marco.tsx` producen archivos que se llaman igual— y ninguno de los 3 se pide en las 89 peticiones de portada, listado y ficha. **Cambios al plan:** el guardado automático es **local** (`localStorage`, 14 días, freno de 800 ms y volcado en `pagehide`/`visibilitychange`) y el servidor escribe solo al pulsar Guardar, porque una escritura por tecleo llenaría la bitácora y la dejaría inservible (§11.4); «Mi cuenta» se construyó en el paso 3 y no en el 7, porque el cambio de clave en dos pasos ya estaba hecho. **Tres defectos que la verificación destapó, ya corregidos:** (a) «Leer el texto» no hacía NADA al pulsarlo, porque el navegador cancelaba el envío en silencio al estar vacíos el título y la ciudad, que son obligatorios (se arregla con `formNoValidate`, §17); (b) guardar una casa sin mandar el campo `asesor_id` la dejaba sin asesor sin decirlo, y con eso su dueño perdía el permiso de editarla (ahora, si el campo no viene, se conserva); (c) el formulario buscaba su propio nodo solo por la ref de `<Form>`, de la que dependían el pegado y el borrador; y (d) **la verificación misma dejaba 40 fotos huérfanas en Cloudinary**, porque borrar la fila de `fotos` no borra el archivo de la nube (§17): ahora el recorrido las quita por el mismo camino que usa el equipo (`DELETE /api/panel/fotos/:id`, que llama a `destroy`) y eso es la comprobación 14.ª. **Estado de producción al cerrar la fase, medido:** 14/14, `npm run fotos:migrar -- --remote --verificar` en **ceros** (3,241 en la nube = 3,241 en D1), sin zonas ni cuentas ni casas de prueba, y 188 casas / 3,241 fotos. Capturas a 390 y 1366 px en `sitio/verificacion/capturas/f3/` |
| F4 · Prospectos y métricas | ✅ listo | 17/09/2026 | **Construido:** bandeja `/panel/prospectos` (estados, asignación, notas, contestar por WhatsApp y CSV), pantalla `/panel/metricas`, su API (`GET /api/panel/prospectos`, `GET /:id`, `PATCH /:id`, `POST /:id/notas`, `GET /api/panel/prospectos.csv`, `GET /api/panel/metricas`) y la migración `0003` con dos índices (`notas_prospecto` por prospecto y `eventos` por fecha; `EXPLAIN QUERY PLAN` en local confirma que el de fecha entra como **índice cubriente** y que la bandeja recorre el rowid hacia atrás sin ordenar). **Medido:** `npm run verificar:f4 -- --local --capturas` da **46/46**, `tsc -b` limpio y Vitest **237/237** (25 nuevas, de `shared/csv.ts` y del número internacional). **(1)** Las **40 casillas** de la matriz de §9 para prospectos y métricas, con las respuestas esperadas **escritas a mano**. **(2)** Con tres prospectos —uno suyo, uno ajeno y uno sin dueño—, el asesor ve **exactamente 1**; el que no tiene dueño tampoco es suyo, y el ajeno le responde **403 y no 404**, que sería decirle que no existe algo que sí existe. **(3)** El **CSV** empieza por `EF BB BF`, devuelve «Martínez Ñandú» intacto, **neutraliza** la celda `=HYPERLINK(…)` y **también el teléfono**, que era el agujero: la columna del teléfono es la única exenta del apóstrofo (un `+52…` legítimo empieza por `+`), así que sale con `numeroLimpio` y solo cifras, porque `=cmd|' /C calc'!A04432223344` tiene 28 caracteres y 11 cifras y **pasa la validación del formulario público** tal cual. Acaba en CRLF, trae un renglón por prospecto —contando los que empiezan por la columna Id, no las líneas del archivo, que un mensaje con salto de línea ocupa dos— y obedece los filtros de la pantalla; se manda como `text/csv; charset=utf-8` con `Content-Disposition`. **(4)** Las **métricas cuadran con `eventos`**: la casa de prueba da 5 vistas, 2 clics de WhatsApp y 1 de teléfono, iguales a un `COUNT(*)` escrito aparte; la ventana de 30 días **deja fuera** las 3 vistas de hace 40 días y «Todo» las incluye (8); el asesor solo ve su casa y no recibe la tabla por asesor; el rol **contenido** ve las vistas con **todo lo comercial en cero**. **(5)** La bitácora registra `asignar`, `estado` y `nota` **sin** nombre, teléfono ni mensaje de la persona. **(6)** Los tres formularios que el equipo pulsa se envían **de verdad** contra la acción de React Router (no por la API de JSON, que es otra puerta): los tres contestan 302 al mismo renglón (`#p-<id>`) y la base lo confirma —estado «cita», el huérfano asignado y la nota guardada—. Se comprueba porque en F3 «Leer el texto» no hacía nada y el código se veía bien. Capturas a 390 y 1366 px en `verificacion/capturas/f4/`, tomadas con los prospectos de prueba en pantalla (`--capturas`; `capturar.mjs` ahora planta la cookie de sesión por CDP con `AIG_COOKIE`, que es lo que faltaba para retratar el panel). **Cambios al plan:** `/panel/metricas` es una **pantalla nueva** (§11.2 no la listaba, aunque §12 sí daba su API); la bandeja **no** tiene pantalla de detalle —las notas van en un `<details>` por ficha y toda la página trae las suyas en **una sola** consulta—; y los prospectos **no se auto-asignan** al asesor de la casa, porque §9 dice que asigna el maestro o el director: queda como decisión abierta para el dueño. Para el asesor, «sus» métricas son las de **sus casas** (la bandeja, en cambio, son los prospectos asignados a él). **Cuatro trampas nuevas, en §17:** el `HAVING` cuyos alias los pisan las columnas de `usuarios` (dejaba la tabla vacía **sin error**), el BOM que `Response.text()` se come, `wa.me` sin clave de país y la inyección de fórmulas en el CSV. **En PRODUCCIÓN** (versión `8b0a020b`, desplegada el 17/09/2026 después de empujar `main`): `npm run verificar:f4 -- --remote --capturas` da **46/46** —las capturas de `verificacion/capturas/f4/` son del sitio desplegado, no del local— y `npm run verificar:f3-navegador -- --remote` vuelve a dar **14/14**, con el criterio 8 medido sobre **88 peticiones** de portada, listado y ficha. **Estado final, medido contra la base y la nube:** 188 casas (las 188 publicadas), 3,241 fotos, **una sola cuenta —la real—**, 0 prospectos, 0 notas, 0 cuentas ni zonas de prueba, y `npm run fotos:migrar -- --remote --verificar` en **ceros** (3,241 = 3,241, 465.3 MB). Los 14 `eventos` que quedan son visitas reales de las propias verificaciones sobre casas reales. **Incidente al cerrar, ya corregido:** la primera corrida de `verificar-f3-navegador` en producción **reventó en la limpieza** con «FOREIGN KEY constraint failed» y dejó `AIG-0189` «Casa de recorrido F3» **publicada y visible en el sitio**, con su cuenta de prueba viva —el propio recorrido abre la casa en el sitio público y esa visita escribe un `ficha_vista` que la referencia (§17)—; además el guion murió con un volcado de Node, así que el fallo **no salía** en la lista de comprobaciones. Se limpió a mano, se corrigió el orden de borrado en los **dos** guiones de F3 (`eventos` y `prospectos` antes que la casa, `notas_prospecto` antes que la cuenta) y se volvió a correr entero: **14/14**, esta vez con «no queda rastro del recorrido» |
| F5 · Pulido para la presentación | 🟡 en curso | 17/09/2026 | **Vista de PC — EN PRODUCCIÓN** (commits `8641d8f` y `2226b22`; Worker versión `e63d1762`, desplegada el 17/09/2026 a pedido del usuario). **Medido en producción:** `verificar:f2 --remote` **39/39**, `verificar:movimiento` 29/23/14 animados y **0 invisibles** (también con «menos movimiento»), titular sin desborde a 1024/1280/1366/1920, y en la ficha a 1366 la foto y la tarjeta del precio arrancan a la misma altura (129 px) y la tarjeta se queda fija a 96 px al bajar con ventana de 1000 px de alto. La descripción larga va en 2 columnas **sin** `break-inside-avoid`: AIG-0047 tiene un párrafo de 10 de sus 15 renglones y sin poder partirlo las columnas quedaban descompensadas; ahora arrancan a la misma altura (El Prado 2738/2712 px, AIG-0047 1516/1490). Pedido: «que la vista de PC aproveche bien los espacios». Solo se tocó cómo se reparte el espacio: mismas fuentes, colores y piezas (el rediseño de la Cinta sigue descartado). **Medido antes, en producción:** el marco público era `max-w-6xl` (72rem) y a 1920 px dejaba ~400 px vacíos por lado; en la ficha, a **1366×768 el precio y WhatsApp quedaban bajo el pliegue** (la galería ocupaba la pantalla y la tarjeta iba debajo); el panel iba en un `max-w-7xl` centrado y a 1920 su menú oscuro flotaba como isla con 320 px vacíos por lado. **Cambios:** token `--container-sitio: 90rem` (`max-w-sitio`, con `px-5 lg:px-10`) y los párrafos conservan sus topes en `ch`; **ficha** con la tarjeta de precio/WhatsApp/formulario AL LADO de la galería desde arriba (columna de 24rem), los datos en un renglón (`auto-fit` de 9rem) y la descripción en **dos columnas desde 1280 px** cuando pasa de 14 renglones —181 de 188 fichas; mediana 26— partida en párrafos para que la columna corte ENTRE párrafos; la tarjeta solo se pega (`sticky`) con ventanas de ≥54rem de alto, porque mide ~725 px y más baja dejaba «Enviar» inalcanzable hasta el final de la descripción; **listado** a 4 columnas desde 1536 px (a 1366 sigue en 3: el precio aprieta); **Servicios** en 3 columnas desde 1280; **Nosotros** con la historia junto al nombre y los valores en un renglón; **Contacto** con el titular frente al formulario; **cierre de la portada** con texto a la izquierda y botones a la derecha; **pie** con marca y columnas en un renglón desde 1280; **panel** sin tope de ancho (menú al borde, tablas a lo ancho; los formularios conservan su `max-w-3xl/4xl`). **Defecto viejo que salió al medir:** entre 1024 y 1280 px la palabra «financiamiento» del titular (8.4 veces su cuerpo: 513 px) se salía de su columna de 444; ahora el texto se lleva 3/5 hasta 1280 y nunca menos de 36rem después: medido sin desborde a 1024, 1100, 1200, 1280, 1366, 1440 y 1920. **El pie ya no enseña «Contacto» vacío**: en D1 `contacto` está en blanco (teléfono, correo, dirección y horario), no se inventa y lo llena el equipo en Configuración. **Costo de fotos:** los `sizes` se ajustaron sin anchos nuevos en Cloudinary (tarjeta 28rem → sigue 640/960; galería 58rem → 1600 como antes); el héroe pasa a pedir la de 960 en escritorio (antes 640), solo desde 1280 px. **Verificado en local:** `tsc -b` limpio, Vitest 237/237, `verificar:f2` **39/39 dos veces contra la versión compilada** (`vite preview`), `verificar:movimiento` 0 invisibles con y sin «menos movimiento», `verificar:f3-navegador --local` **12/12**. **Celular intacto, medido píxel a píxel** a 390 px antes/después en las 6 páginas: idéntico salvo (a) el pie sin la columna vacía (−76 px) y (b) un salto de renglón en la descripción porque cada párrafo es ahora un `<p>` y hereda `text-wrap: pretty`. **Trampa nueva:** `verificar:f2` contra `npm run dev` dio una vez 33/39 con `scroll 4809` en las tres rutas: el servidor de desarrollo sirvió la página SIN estilos un instante (el logotipo tomó su `width={4801}`), justo después de un `git stash pop`; no era el diseño. Se mide contra `vite preview`. Capturas de antes y después en `sitio/verificacion/capturas/pc/`. **Héroe de la portada potenciado (17/09/2026, pedido «usa las nuevas skills y potencia su aspecto»; EN PRODUCCIÓN, versión `5205a524`).** Skills usadas: `taste-skill:redesign-skill` (auditoría), `ui-ux-pro-max` (patrón «marketplace»: el buscador es la acción principal) y `motion-design` (personalidad «premium», sin rebote). **Se descartó a propósito** lo que contradice decisiones cerradas: cambiar de fuente, grano/ruido y vidrio esmerilado (lo que bajó Lighthouse en la Cinta) y la paleta «azul confianza + dorado» que la skill propone para inmobiliarias. **Cambios:** el isotipo deja de ir suelto sobre el titular y encabeza la frase «Casas en venta y renta en Morelia» (la del título de la página); el buscador va en su panel; tres cifras que salen de la base (propiedades, ciudades, precio desde) sustituyen la frase suelta; la foto es ahora una **vitrina**: la casa con operación, precio, nombre, colonia y clave sobre un velo de tinta, con un bloque vino desfasado detrás (profundidad sin filtros) y sigue en 4:3 (variante `tarjeta`). «Lo más reciente» ya no repite la casa de la vitrina (se piden 7 y se enseñan las 6 siguientes) y ninguna tarjeta pide prioridad de carga. **Entrada en CSS, no GSAP:** GSAP llega 1-2 s después del primer pintado y animar lo que ya se ve parpadea; son `@keyframes` en el `@theme` usados con `motion-safe:`, curva `cubic-bezier(0.16,1,0.3,1)`, todo termina antes de 1.2 s; el titular SOLO se desliza (es el LCP y Chrome no cuenta un elemento en opacidad 0). **Medido contra `vite preview`:** `verificar:f2` 39/39, `verificar:movimiento` 0 invisibles, las 11 piezas con entrada terminan en opacidad 1 y sin transformación (y con «menos movimiento» no se anima ninguna), Vitest 237/237. **Lighthouse móvil, portada, en PRODUCCIÓN el mismo día:** antes 76/77 → con el héroe **69/70** → con GSAP diferido **71/73/71** → con la bienvenida **76/76/79** (LCP 3.9-4.4 s; control: el listado, que no se tocó, da 70-71 hoy contra 74 en F2). **Por qué bajó y cómo se arregló:** el primer pintado se retrasó 150 ms (850 → 1002 ms) y los 111 KB de `gsap` + `ScrollTrigger`, que se pedían al hidratar (~850 ms), quedaron antes del titular; la simulación de Lighthouse los sumó al LCP (4.6 → 6.2 s). Ahora GSAP baja tras `load` + `requestIdleCallback`, lo que ya está a la vista cuando llega no se vuelve a esconder, y el isotipo de la primera pantalla va `quieto` (solo CSS: GSAP lo volvía a armar ~1 s después). **La comparación en local NO sirvió:** las dos versiones daban LCP simulado 6458 ms porque esta máquina satura la simulación con otra cosa; aquí solo cuenta producción contra producción, mismo día y misma herramienta. El peso sube de 1053 a 1109 KB (la primera tarjeta ya no es la foto de la vitrina y Chrome precarga las diferidas cercanas). **Bienvenida animada** (`components/publico/bienvenida.tsx`, pedida el mismo día): telón de tinta donde el isotipo se arma en CSS (ventana «encendida» y cantos en vino, porque su negro se pierde sobre la tinta), sale el nombre con el lema y el telón sube; ~1.6 s y el héroe corre su entrada con `--rb` de retraso. Solo si la primera página abierta es la portada (`useState` en el marco), una vez por pestaña (`sessionStorage`, marcado por un guion en línea antes del primer pintado) y nunca con «menos movimiento»; sin JavaScript también corre. Comprobado en producción: primera visita sale y termina oculta, recargar no la repite, volver a `/` navegando tampoco, entrar por `/propiedades` no la monta y con «menos movimiento» no existe. Capturas y GIF de la entrada en `sitio/verificacion/capturas/heroe/`. **Formularios del panel en dos columnas (18/09/2026; EN PRODUCCIÓN con la versión `99efd6d4`).** Solo clases con prefijo `xl:` (desde 1280 px). **Casa** (subir y editar): la rejilla va DENTRO del mismo `<Form>` —el borrador y «Leer el texto» leen `nodo.elements`; partirlo en dos formularios los rompería—: lo que falta | pegar texto (este a todo lo ancho si no hay avisos, como al subir), Lo básico | Características, y la descripción, la publicación y la barra de Guardar a todo lo ancho (un texto largo se corrige mejor con renglones largos); la página pasa de `max-w-4xl` a `xl:max-w-7xl` y las fotos, a 6 columnas desde 1280 para que no se inflen. **Configuración:** Contacto | WhatsApp y Redes | Aviso de privacidad, con `items-start`. `Bloque` y `Aviso` aceptan `className` solo para colocarse en la rejilla. **Medido contra `vite preview`** con una cuenta maestro desechable (se borró): alto de página a 1366 — subir 2568 → 2173 px, editar El Prado 4485 → 3537, Configuración 2764 → 1824 —; 0 px de desborde a 390/1280/1366/1920 en las tres; **a 390 px, idénticas píxel a píxel** subir y Configuración, y editar con 29 y 104 valores de color distintos (dos corridas) solo en las franjas de la rejilla de fotos de Cloudinary, con la misma altura (la misma maquetación, a la vista igual). **Medido en el borde, a 1280:** en «Características» a tres columnas, «Año de construcción» se partía en dos renglones y descuadraba su campo; ese bloque va a 2 columnas hasta `2xl` (1536) y vuelve a 3 después. `tsc -b` limpio, Vitest **237/237**, `verificar:f3-navegador --local` **12/12**. Capturas en `sitio/verificacion/capturas/f5-formularios/`. **Guion de la demostración** en `sitio/verificacion/guion-demo.md`: 10 minutos, solo lo medido en §19, con la preparación (incógnito para la bienvenida, el WhatsApp configurado es un número real), lo que hay que decidir con el equipo y la limpieza (el panel no borra prospectos: el de prueba se marca «descartado»). **Monitores grandes (18/09/2026, pedido «sigue sin aprovechar los espacios… que se aprovechen al máximo»; EN PRODUCCIÓN, versión `99efd6d4`, desplegada el 18/09/2026 a pedido del usuario: «Sube a produccion»).** **Medido en producción:** `verificar:f2 --remote` **39/39**, marco al 100 % a 1920 y 2560 con las mismas medidas que en local (titular 85/90 px, 0 desbordes) y la vitrina con `w_1600` desde 1920 y `w_960` a 390/1366. **Trampa nueva:** el dueño ve el sitio en un monitor de **2560 px**, y todas las mediciones de F5 habían llegado hasta 1920; su captura, reducida a 1920, enseñaba el marco de 90rem en el 53 % del ancho. **Medido antes, contra `vite preview`:** a 2560 el marco llenaba el **56 %** en las 6 páginas (1440 px) y el titular topaba en 68 px; a 1920, el 75 %. **Cambios:** `--container-sitio` de 90rem a **160rem**; cortes nuevos `3xl` (120rem) y `4xl` (150rem); desde 1920 la **letra base crece** a 17 px y desde 2400 a 18 px (todo lo que va en rem crece en proporción; los cortes no se mueven porque se miden en px de pantalla); **portada:** columna de texto fija de 44rem y titular de 5rem desde `3xl` («financiamiento» mide 42rem: cabe), la vitrina con todo lo demás en **16:10** y con la foto de la variante `galeria` (1600, ya existe: no es un derivado nuevo) vía `<picture>` solo desde 1920; «Lo más reciente» en 6 columnas desde `4xl`; **listado** en 5 columnas desde `4xl`; **ficha** con la tarjeta lateral de 28rem y la descripción larga en 3 columnas desde `3xl`; **Contacto** con el titular grande y el formulario de 48rem; **Nosotros** con la misión en tamaño de título. **Medido después:** marco al **100 %** a 1920 y 2560 en las 6 páginas, 0 px de desborde y 0 elementos fuera de pantalla; titular de 85 px a 1920 y 90 px a 2560 sin salirse de su columna; **390 y 1366 idénticas píxel a píxel** al antes en las 6 páginas (12 de 12 capturas, 0 valores distintos); la vitrina baja `w_960` (tarjeta) a 390 y 1366 como antes y `c_limit,w_1600` a 1920 (966×604) y 2560 (1551×969). `tsc -b` limpio, `verificar:f2` **39/39**, `verificar:movimiento` 0 invisibles con y sin «menos movimiento». El panel también crece de letra desde 1920 (es la misma regla en `html`). Contacto sigue con aire a la izquierda porque teléfono, correo, dirección y horario están vacíos en D1: se llenan en Configuración. Capturas de la primera pantalla, antes y después, a 1920 y 2560 en `sitio/verificacion/capturas/ancho/` (las de 390/1366 y las de página completa se rehicieron y compararon, pero no se versionan: 64 MB). **Cabecera rediseñada (18/09/2026, pedido «más moderno, animado, responsivo, con animaciones y microinteracciones»; EN PRODUCCIÓN, versión `ec26df8c`, desplegada el 18/09/2026 a pedido del usuario: «a produccion»).** **Medido en producción:** recorrido de la cabecera **15/15**, `verificar:f2 --remote` **39/39** y `verificar:movimiento` 0 invisibles con y sin «menos movimiento». Skill usada: `motion-design` (personalidad «premium»: la curva de firma `--ease-entrada` que ya usa el héroe, hover de 200 ms, panel de 350 ms, escalonado de 50 ms; sin rebote). **Todo en CSS** (sin GSAP, sin `backdrop-filter`); JavaScript solo pone `data-bajado`/`data-oculta` y cierra el menú. **Cambios:** al bajar, borde + `shadow-tarjeta` y el logotipo a 0.92 por `scale` (lo decide un `IntersectionObserver` sobre una sentinela, no el scroll); se esconde por `translate` al bajar pasados 480 px y vuelve al subir, nunca con el menú abierto ni con el foco dentro; enlaces con píldora `marca-suave` que crece desde el 85 % y punto rojo bajo el activo; botón «Escríbenos» (WhatsApp) desde `lg` con el icono que «saluda»; en el celular, hamburguesa que se vuelve X, panel a lo ancho con los cuatro enlaces en serif numerados y escalonados, WhatsApp abajo y velo que cierra al tocarlo; línea roja de lo leído con `animation-timeline: scroll()` (sin soporte o con «menos movimiento», no sale). En la ficha la cabecera no lleva el WhatsApp general (como el flotante): ahí va el de la casa. **Defecto viejo que salió al medir:** el menú del celular **se quedaba abierto en la página siguiente** (el marco no se remonta y `<details open>` persistía), y ni Esc ni tocar fuera lo cerraban: 10/13 en el recorrido antes, **15/15 después**. **Trampa nueva:** Chrome esconde lo de un `<details>` cerrado con `content-visibility`, que CONSERVA sus medidas: el panel cerrado «se salía» del ancho a 390 px y `verificar:f2` bajó a 33/39 (también porque el primer `wa.me` de la ficha era el de la cabecera); con `hidden group-open:block` y sin el WhatsApp general en la ficha, **39/39**. **Medido contra `vite preview`:** la caja de la cabecera no cambia de alto al bajar (73 px a 1366, 82 a 2560; antes 65/73: la sube el botón de 44 px, lo mismo que ya medía en el celular); la tarjeta de la ficha sigue pegada a 96 px con la cabecera escondida y visible (esta termina en 73); 0 desbordes a 390, 767, 1366 y 2560 con el menú abierto y cerrado; sin JavaScript el menú abre; `verificar:movimiento` 0 invisibles con y sin «menos movimiento»; `tsc -b` limpio y Vitest 237/237. Capturas en `sitio/verificacion/capturas/cabecera/`. **Cabecera, segunda versión: «isla» (18/09/2026, pedido «dame otra opción más premium, que se vea moderna, porque esta no me gustó mucho»; EN PRODUCCIÓN, versión `4afbdc55`, desplegada el 18/09/2026 a pedido del usuario: «Sube a producción»).** **Medido en producción:** recorrido de la cabecera **15/15**, la píldora viaja a «Servicios» (4 → 125 px, texto blanco) con el ratón real, `verificar:f2 --remote` **39/39** y `verificar:movimiento` 0 invisibles. Se descartó la franja de la primera versión con su barra de lectura y el esconderse al bajar: lo premium aquí es contención. **Ahora:** una cápsula blanca `rounded-full` que flota a 12 px del borde (el `<header>` es transparente y `pointer-events-none`: la página pasa por detrás de sus orillas y se puede pulsar); al bajar se recoge de `max-w-sitio` a 76rem y gana `shadow-alzada`, por `max-width` (el alto no cambia); los enlaces van en un carril gris con una **píldora de tinta que viaja** al que tiene el puntero o el foco (`translate` + `width`, medida con `offsetLeft` y un `ResizeObserver`) y vuelve a la sección activa, con su texto en blanco; hasta que la píldora está puesta (sin JavaScript o antes de hidratar) el activo va en rojo, porque en blanco no se vería; «Escríbenos» en rojo con un círculo blanco cuya flecha sale por la derecha y entra otra por la izquierda; en el celular, la cápsula con un botón de tinta de dos rayas que se cruzan en X y el menú como **tarjeta de tinta** bajo la cápsula (`rounded-[2rem]`), enlaces en serif blanca escalonados 50 ms y WhatsApp en rojo, con velo que cierra al tocarlo. Se conservan el `<details>`, el cierre al navegar/Esc/tocar fuera y `hidden` + `group-open:block`. Se quitaron del CSS `barra-lectura` y `saludo`. **Medido contra `vite preview`:** recorrido de la cabecera **15/15** (la caja mide 76 px a 1366 y 86 a 2560, igual arriba que al bajar; la tarjeta de la ficha sigue a 96 px con la cabecera hasta 76); con un movimiento real del ratón sobre «Servicios» la píldora pasa de 4 px/121 px a 125 px/98 px, «Servicios» a blanco y «Propiedades» (la activa) a rojo; con el menú abierto lo que hay sobre el botón flotante de WhatsApp es el velo (cabecera en z 50); `verificar:f2` **39/39**, `verificar:movimiento` 0 invisibles, `tsc -b` limpio y Vitest 237/237. Capturas `isla-*` en `sitio/verificacion/capturas/cabecera/` (las `despues-*` son de la primera versión). **Vitrina que pasa sola (18/09/2026, pedido «que esta tarjeta vaya cambiando mostrando diferentes propiedades durante algunos segundos y luego pase a la siguiente, usa las skills de animaciones»; EN PRODUCCIÓN, versión `b5b2ceb6`, desplegada el 18/09/2026 a pedido del usuario: «Despliegas»).** **Medido en producción:** `verificar:f2 --remote` **39/39**, `verificar:movimiento` 0 invisibles con la vitrina incluida (con movimiento cambia sola y en reposo queda UNA casa entera; con «menos movimiento» no cambia ni hay botón de pausa) y el recorrido nuevo `verificar:vitrina` **22/22**; en producción rotan El Prado, Lomas del Sur, Defensores de Puebla, Gertrudis Sánchez y Agustín Arriaga Rivera. Skills: `motion-design` (personalidad «premium», la entrada más larga que la salida, tres capas, pausa para lo que se mueve más de 5 s, «menos movimiento» = sin autoplay), `gsap-animation`, `gsap-react`, `gsap-timeline` y `gsap-performance`. **Cómo es:** 5 casas, 7 s cada una (la primera, 5 s desde que arranca el ciclo). El cambio es una cortina de `clip-path` que se corre en el sentido del cambio con la curva del telón de la bienvenida (`power3.inOut`); la foto nueva llega corrida 3 % y al 106 % y se asienta durante toda su permanencia; la vieja cede 4 % (contramovimiento); los renglones de la casa que se va suben y salen (0.4 s, ease-in) y los de la nueva suben desde su máscara, escalonados 70 ms (`expo.out` ≈ `--ease-entrada`); en el celular todo dura 15 % menos. Debajo, botón de pausa y una barra por casa que se llena con su tiempo (40 px de alto para el dedo), con tope de ancho: a lo ancho de la vitrina su final quedaba bajo el botón flotante de WhatsApp a 1366×768. **Cómo se sostiene:** el servidor pinta solo la primera casa (sin JavaScript es la portada de antes, con el lugar de los controles reservado e invisible); las demás se montan una por delante y solo con la vitrina a la vista, y no se cambia a una casa hasta que su foto está decodificada; el ciclo arranca después de `load`, con el navegador libre y terminada la entrada CSS del héroe; GSAP entra con `import()` (trozo de 0.95 KB gzip que comparte el de `gsap` con `movimiento.ts`) y solo escribe estilos mientras algo se mueve: al asentarse los borra (`clearProps`) y el reposo lo deciden las clases de React. Se pausa con el puntero encima, con el foco del teclado dentro (no el del botón de pausa, o «Reanudar» no reanudaría), con la pestaña oculta (termina la cortina al instante: red de seguridad) y fuera de pantalla; elegir una casa o deslizar con el dedo la detiene; con «menos movimiento» se elige casa y cambia sin animación, y ni se baja GSAP. Patrón «carrusel» de la APG (`aria-roledescription`, un grupo por casa, `aria-live` apagado mientras pasa sola). **Reparto nuevo** (`shared/portada.ts`, 6 pruebas): primero las destacadas tal cual y luego las más recientes UNA POR COLONIA; medido: las 4 más recientes eran «Casa en El Prado» y la vitrina habría pasado cuatro veces por el mismo nombre. «Lo más reciente» sigue sin repetir ninguna. `destacadas()` pasó a ser `casasDePortada()`: pide 40 candidatas y al navegador solo viajan las 11 que se pintan; pedir 40 no lee más filas que 11 (`EXPLAIN QUERY PLAN`: une todas las visibles y las ordena en un árbol temporal antes de cortar). La insignia dice «Apartada» si la casa lo está (antes decía «En venta»). **Trampas nuevas:** (1) en Tailwind 4 `scale-x-*` y `translate-*` son las propiedades CSS `scale` y `translate`, que se MULTIPLICAN con el `transform` que escribe GSAP: la barra usa `[transform:scaleX(…)]`; (2) la sonda de desbordes de `verificar:f2` mide cajas y no recortes: la cortina es `clip-path` (no mueve la caja) y la foto nunca pasa del 6 % entre escala y corrimiento (a 390 px la vitrina tiene 32 px hasta el borde); (3) detener con `TaskStop` un `vite preview` lanzado en segundo plano deja vivo su `node`, que bloquea `build/` (`EBUSY` al compilar): se desplegó con `wrangler deploy` la compilación ya verificada del mismo commit; (4) el recorrido bloquea `/api/eventos`, porque abrir una ficha en producción contaría como visita real en las métricas. **Medido antes/después contra `vite preview`:** 0 desbordes a 390/1366/1920/2560; a 1366 y 1920 la foto sube ~20 px (se centra con la fila de controles) y nada de abajo se mueve; a 390 y 2560 la página crece 44-45 px. `tsc -b` limpio, Vitest **243/243** (6 nuevas). Capturas antes/después y GIF del cambio a 1366 y 390 en `sitio/verificacion/capturas/vitrina/`. **Lighthouse 12.8.2 móvil en producción, ya desplegada (18/09/2026 ~22:15):** portada **75/72/77** (LCP 3.95/4.71/3.97 s y sigue siendo el titular; TBT ≤ 12 ms; CLS 0) y el listado de control **70/70**. No hay medición del mismo día sin la vitrina: la última de la portada (17/09, con la bienvenida) daba 76/76/79 con el listado en 70-71, y desde entonces también cambiaron la cabecera y el ancho para monitores grandes, así que la diferencia no se le puede atribuir sola. Lo que la vitrina agrega a la carga sí está medido: la segunda foto (52 KB) termina a los 3.2-4.1 s y el trozo `vitrina-movimiento` (2 KB) a los 3.1-4.0 s, los dos después del LCP. El peso pasó de 1109 KB (17/09, con la bienvenida) a 1325 KB. Contra el único reporte guardado del 17/09 (`portada-prod.json`, 1044 KB, anterior también al héroe y a la cabecera), lo que más creció son las fotos (343 → 553 KB; 52 KB son la segunda de la vitrina y «Lo más reciente» enseña ahora otras casas), y después CSS (+27 KB), JS (+22 KB) y HTML (+21 KB), estos de varios cambios del día; no se desglosó más. Reportes medianos en `sitio/verificacion/lighthouse/portada-vitrina-prod.json` y `listado-vitrina-prod.json`. **Scroll infinito en Propiedades (18/09/2026, pedido «ayúdame a hacer que en el apartado de propiedades avance por paginación tipo scroll infinito»; EN PRODUCCIÓN, versión `2cfa2acd`, desplegada el 18/09/2026 a pedido del usuario: «despliegues»).** **Medido en producción:** `verificar:listado` **21/21**, `verificar:f2 --remote` **39/39** y `verificar:movimiento` 0 invisibles. `verificar:f2` y `verificar:movimiento` ahora también bloquean `/api/eventos`: abrían una ficha en producción y cada corrida sumaba una visita falsa a las métricas del panel (las ya contadas no se distinguen de las reales y se dejaron). **Cómo es:** mejora progresiva sobre la paginación (`components/publico/lista-infinita.tsx`). El servidor sigue pintando «Anterior / Página N de M / Siguiente» con enlaces reales: sin JavaScript y para los buscadores no cambia nada. Con JavaScript, ese mismo «Siguiente» se vuelve el botón «Ver más propiedades»: tocarlo trae las 12 siguientes en el mismo lugar, y se dispara solo cuando queda a una pantalla (`IntersectionObserver`, `rootMargin` de 100 %). Lleva «Mostrando 24 de 188» (región viva para el lector de pantalla), una barra de cuánto del catálogo se lleva visto, una fila de esqueletos mientras llega la tanda y una entrada en CSS escalonada 40 ms para las recién llegadas (las primeras 12 las sigue animando GSAP); al final, «Ya viste las N propiedades» y «Volver a los filtros». Con el teclado, el foco pasa a la primera casa nueva; si falla la red, «No se pudieron cargar. Reintentar». Las páginas salen de `GET /api/propiedades` (mismas funciones que el loader) y se anexan por clave, sin repetir. **La URL no cambia al cargar:** lo cargado se guarda en `sessionStorage` por entrada del historial (skill `webapp-storage-cache`: prefijo con versión `aig:v1:listado:`, 30 min, tope de 8 entradas, todo en `try/catch`); al volver de una ficha entra en el primer pintado (nunca durante la hidratación) y `ScrollRestoration` devuelve el scroll a su lugar; al recargar se agrega en cuanto termina la hidratación y se vuelve al mismo scroll. La lista arranca de cero al cambiar la búsqueda o el orden (`key={search}`, ver §17). **Medido contra `vite preview`:** recorrido nuevo `verificar:listado` **21/21**: sin JavaScript, `rel=next` a `?pagina=2`, que trae 12 casas distintas de las de la 1; al bajar llegan 12 más sin repetir, con la URL igual y una sola petición por tanda; al volver de la ficha de la casa 20 siguen las 24 y la casa 20 queda donde estaba; al recargar vuelven las 36 y el mismo scroll; otro orden vuelve a 12; con los 16 departamentos llegan todas, sale el mensaje final y no se pide nada más; sin red sale «Reintentar», y con red las trae; Enter en «Ver más» lleva el foco a la casa 13; a 390 px carga y nada se sale del ancho; con «menos movimiento» también carga; 0 errores de consola. Además `verificar:f2` **39/39**, `verificar:movimiento` 0 invisibles (en `/propiedades` ahora cuenta 47 elementos porque su recorrido baja y carga dos tandas), `tsc -b` limpio y Vitest 243/243. En D1, cada tanda hace las mismas consultas que ya hacía pasar de página (catálogo, cuenta y página). **Ojo con Lighthouse:** el listado dejó de ser el control «que no se tocó»; en adelante el control es la ficha. Capturas en `sitio/verificacion/capturas/listado/`. **Pendiente:** probarlo en el Safari del iPad (todo lo medido fue en Chrome). **Títulos en Jost y sin el renglón de Morelia (18/09/2026, pedidos «busca una mejor composición… quita el logo… Casas en venta y renta en Morelia se ve repetitivo» y «esa fuente no me está gustando, busca otra»; EN PRODUCCIÓN, versión `600185ab`).** Se le enseñaron cuatro fuentes puestas sobre su portada de producción (Instrument Serif, Bodoni Moda, Playfair Display y Jost) y eligió **Jost**, sans geométrica ligera: sustituye a Fraunces en todos los títulos del sitio público (autoalojada con `@fontsource-variable/jost`, 27 KB latin frente a los 36 KB de Fraunces, que se desinstaló). Pesos por papel: titular del héroe 300, títulos de página 400, de sección 500; tarjetas y cifras conservan su seminegrita o negrita. Se quitó el renglón «Casas en venta y renta en Morelia» con su isotipo: el logotipo ya va siempre en la cabecera y el negocio es para toda la República. El texto del titular sigue saliendo del panel, sin renglones forzados. **Medido contra `vite preview`:** `verificar:f2` 39/39, `verificar:movimiento` 0 invisibles, `verificar:vitrina` 22/22, `verificar:listado` 21/21 y 0 desbordes en las 6 páginas a 390/1366/2560. **Contenido del panel, campo por campo (18/09/2026, pedido «añadí una pregunta frecuente y un testimonio y no los veo en la portada… analiza si es funcional y si no, hazlo funcional»; EN PRODUCCIÓN, versión `f020c7c6`).** Auditoría de Panel › Contenido: el **saludo**, la **casa de la foto principal**, los **testimonios** y las **preguntas frecuentes** se guardaban y ninguna página los leía; titular, lema, presentación, «antes de los servicios» (en /servicios), nosotros y servicios sí llegaban. Ahora: el saludo va arriba del titular como antetítulo (Jost espaciada con raya vino), solo si está lleno; la casa de la foto principal abre la vitrina (regla 0 de `shared/portada.ts`, 2 pruebas nuevas; se lee en la MISMA ida a la base que las candidatas con `json_extract`, tolerante a un JSON dañado, y si la casa es vieja se pide aparte por su clave única); «antes de los servicios» también sale en la franja oscura de la portada; los **testimonios** (los 3 más recientes visibles) y las **preguntas** (las visibles, en su orden) son dos secciones nuevas de la portada (`components/publico/contenido-portada.tsx`): citas grandes en Jost ligera con comilla roja (la comilla va en la serif del sistema: la de Jost, recta, se leía «//») y un acordeón de `<details name>` que abre sin JavaScript, una a la vez, con el «+» que gira a «×» y apertura suave en CSS (`interpolate-size` + `::details-content`, progresivo); entradas con `data-animar`/`data-animar-lista`. Sin nada marcado «Se ve en el sitio», la sección no existe. El título de la pestaña sale del titular (ya no dice «en Morelia»). Las ayudas del panel dicen dónde sale cada campo. **Medido contra `vite preview` con datos de prueba LOCALES (ya borrados):** vitrina abierta por AIG-0042 escrita en minúsculas, saludo, 2 testimonios y 3 preguntas visibles sin los ocultos, abrir la segunda cierra la primera, 0 desbordes a 1366 y 390, 0 errores; `verificar:movimiento` 0 invisibles con 36 elementos animados en la portada. **Medido en producción (`f020c7c6`):** `verificar:f2 --remote` **39/39**, `verificar:movimiento` 0 invisibles (33 animados en la portada), `verificar:vitrina` **22/22**, `verificar:listado` **21/21**; en el HTML salen su pregunta y su testimonio; la configuración de la portada en producción está vacía desde las 05:28 UTC del 19/09 (se vació en el panel), así que sale el titular por omisión y ningún saludo. **Lighthouse 12.8.2 móvil en producción:** portada **72/73** (LCP 4.7 s, el titular; TBT ≤ 7 ms; CLS 0) y ficha, el control, **74/75** (LCP 4.9-5.0 s; CLS 0); reportes en `sitio/verificacion/lighthouse/portada-contenido-prod.json` y `ficha-contenido-prod.json`. Capturas de producción en `sitio/verificacion/capturas/contenido/`. **Pendientes:** el lema del pie y de la bienvenida sigue escrito en el código («Donde cada propiedad cuenta una historia», que también es el del logotipo); la descripción de la portada y el título del listado dicen «Morelia y Michoacán» (son los datos del catálogo); el único testimonio visible es de prueba («David Martínez»); probar en el Safari del iPad. **Queda para el usuario:** fusionar la rama `worktree-f5-formularios-y-guion` a `main`, crear los usuarios reales cuando el dueño lo diga y revisar los avisos de la migración con el equipo Transición entre páginas (19/09/2026, SOLO LOCAL, commit `53f3c50`):** View Transitions nativas con `viewTransition` de React Router en los enlaces del sitio público (no en filtros ni paginación, nunca en el panel); 0 KB de JS y la primera carga no cambia. Cabecera quieta, página que sale y sube, y la foto de la tarjeta pulsada viaja a la galería de la ficha; hilo rojo de carga si tarda más de 150 ms. Grabada a cámara lenta en 4 recorridos (terminan `ok`, 0 errores); dos defectos que salieron así y ya corregidos: la cabecera enseñaba su estado VIEJO toda la transición y el menú del celular viajaba abierto. **Entregas (19/09/2026, SOLO LOCAL; migración `0004` sin aplicar en remoto).** Pedido: «mi padre entrega la casa con un obsequio y les toma una fotografía; si el cliente acepta, publicar sus comentarios y sus fotos». Decidido con el usuario: el **cliente contesta desde un enlace personal**, **dos permisos por separado**, sale como **«Laura M.»**, y se ve en una **sección de la portada y la página `/entregas`**. El equipo sube la foto del día en el panel ANTES de mandar el enlace (el cliente autoriza lo que ve). Reemplaza a los testimonios de `/panel/contenido`; el único que había en producción (capturado sin permiso) queda oculto y **no se puede publicar**. `npm run verificar:entregas -- --local` da **33/33**, con fotos reales a Cloudinary y el formulario del cliente enviado de verdad: el asesor no entra (403); sin nada publicado `/entregas` da 404 y el menú no la ofrece; la base guarda solo la huella del enlace; falso, mal formado o caducado → 404; `no-store` + `no-referrer` + `noindex`; firma inventada y foto de otra carpeta rechazadas; tope de 6 fotos del cliente en el servidor; sin ningún permiso no se guarda nada; un solo uso; respondida pero sin publicar no se ve; **sin permiso de fotos, las del cliente se borran y ninguna foto sale**; en el HTML público no aparece ni el apellido ni el nombre que capturó el equipo; «Quitar del sitio» la quita; al cerrar, 0 filas de prueba y **0 fotos en la nube** por carpeta. Regresión: Vitest **249/249** (12 nuevas de `shared/entrega.ts`), `verificar:f2` 39/39, `f3` 30/30, `f4` 42/42, `f3-navegador` 12/12 (el criterio 8 se sostiene: la subida vive en `components/comun/subida.ts`, no en `panel/`), movimiento 0 invisibles; cabecera con 5 enlaces sin desborde desde 768 px. Capturas revisadas a 390 y 1366: la entrega **sin fotos autorizadas** se pinta como cita sobre vino (como tarjeta blanca quedaba una caja vacía) y el WhatsApp flotante se oculta en la página del cliente (tapaba los campos). Tres trampas nuevas en §17 (tokens en minúsculas por el 301, carpetas al azar porque los id se reutilizan y la nube es compartida, y limpiar con sesión). **⚠ ORDEN AL DESPLEGAR: primero `wrangler d1 migrations apply activos-inmobiliarios-db --remote` y DESPUÉS `deploy`.** El marco público consulta `testimonios.estado` en TODAS las páginas: con el Worker nuevo sobre la base sin la `0004`, se cae el sitio público entero, no solo las páginas nuevas. **GSAP sobre lo nuevo, medido con entregas publicadas** (`verificar:entregas --dejar` → `verificar:movimiento`, que ahora incluye `/entregas` cuando responde 200): portada 42 animados, `/entregas` 13, **0 invisibles** con y sin «menos movimiento». **Pendiente menor:** `/entregas` no está en el `sitemap` (en F6 debe entrar solo si hay alguna publicada, porque sin ninguna da 404), y la portada suma una consulta a D1: medir Lighthouse producción contra producción tras desplegar, con el listado como control. **Pendiente para el dueño/abogado:** el aviso de privacidad debe mencionar las fotos y comentarios de las entregas (se edita en Configuración; aquí no se redacta texto legal) y revisar la redacción de los dos permisos (`shared/entrega.ts`, versión `2026-09-19`). **Pendiente de F5:** los formularios largos del panel (subir/editar casa, Configuración) en dos columnas en pantallas anchas; el guion de la demostración **UNIDO con la rama paralela y EN PRODUCCIÓN (19/09/2026, versión `47b76723`, `main` en `f60ae55`).** El trabajo se había partido en dos desde `1130228`: esta línea (transiciones + Entregas) y `worktree-f5-formularios-y-guion` (cabecera isla, vitrina, scroll infinito, Jost, preguntas, formularios del panel y el guion), que era la que estaba desplegada. Un `deploy` desde `main` la pisó y se revirtió con `wrangler rollback` en minutos; **nada se perdió**, las dos ramas estaban empujadas (trampa nueva en §17). Ya unidas: se conserva todo lo de la rama y **«Lo que dicen de nosotros» se alimenta de las Entregas** (decisión del usuario), con la foto cuando el cliente la autorizó; los testimonios que escribía el equipo desaparecen de Contenido, que ahora remite a Entregas, y `leerTestimonios` se borró. **La cortinilla de bienvenida sale en la PRIMERA página que se abra, sea cual sea** (antes solo entrando por la portada), una vez por pestaña. **Medido contra `vite preview`:** Vitest 257/257, `tsc -b` limpio, f2 39/39, f3 30/30, f3-navegador 12/12, f4 42/42, entregas 33/33, vitrina 22/22, listado 21/21 y movimiento 0 invisibles con y sin «menos movimiento». **En producción:** f2 **39/39**, vitrina **22/22**, listado **21/21**, las 7 rutas públicas y el panel en 200, y `/entregas` en 404 mientras no haya ninguna publicada. **Ojo:** la portada ya no enseña «Lo que dicen de nosotros» hasta que se publique la primera entrega (el testimonio de prueba quedó oculto y sin permiso registrado, no se puede publicar). **Trampa nueva:** `verificar:vitrina` y `verificar:listado` apuntan por omisión al puerto **4180**; contra `vite preview` en 5180 hay que pasarles `--base`. **Volver al catálogo sin perder el lugar — EN PRODUCCIÓN (19/09/2026, commit `a15b650`, Worker versión `14e28560`, a pedido del usuario: «Sube a producción»).** Antes de desplegar se hicieron los tres pasos de §17: `git worktree list` (la rama del worktree ya unida, nada pendiente), `git branch -a` (local = `origin/main` = `a3b8058`, nadie empujó nada) y `wrangler versions list` (activa `1c69c421`, anotada como punto de reversión). Además se **comprobó qué era esa versión**, porque la memoria registraba `47b76723`: los 15 archivos JS que servía producción en `/`, `/propiedades` y una ficha están todos en una compilación de `a3b8058` —que solo toca `PLAN.md`, o sea idéntico en código a `f60ae55`—, así que no había trabajo desconocido encima y desplegar era un superconjunto. **Medido EN PRODUCCIÓN:** `verificar:f2 --remote` **39/39**, `verificar:listado` **24/24**, `verificar:vitrina` **22/22** y `verificar:movimiento` 0 invisibles con y sin «menos movimiento». La prueba del formulario **no ensució la base remota**: `prospectos` sigue con 0 filas de prueba (el campo trampa contesta que sí antes de escribir). Detalle de lo que se arregló: Pedido: «al volver al catálogo que nos regrese al punto donde estábamos». **Medido primero, y cambió el diagnóstico:** el botón «atrás» del navegador SIEMPRE funcionó (celular y escritorio, con y sin filtros: `y=2789 → 2789`). Lo que fallaba era el migajón «← Todas las propiedades» de la ficha, que era un enlace normal a `/propiedades`, o sea una entrada NUEVA del historial: con llave nueva no hay nada que restaurar —`ScrollRestoration` guarda por `location.key`, y la lista larga por esa misma llave— y encima perdía la búsqueda (escritorio: `y=3539` con 36 casas → `y=0` con 12 y sin filtros). **Arreglo:** la tarjeta le cuelga a la ficha de dónde viene (`state`, en `app/components/publico/volver.ts`) y el migajón **retrocede por el historial** (`navigate(-saltos)`) en vez de empujar una entrada nueva, así que el regreso pasa a ser el mismo POP que ya se restauraba solo. Sigue siendo un enlace de verdad y ahora su `href` lleva la búsqueda: en otra pestaña, con el botón de en medio o sin JavaScript también conserva los filtros, que antes se perdían siempre. Los saltos se cuentan porque desde una ficha se abre otra en «Propiedades parecidas» (la galería es estado local y no toca el historial, así que una ficha es exactamente una entrada). **Trampa:** `history.state` no existe en el servidor, así que el destino y el texto del migajón solo pueden cambiar **después** de hidratar (`useYaHidrato`, movido a `hidratacion.ts`); sin eso, recargar la ficha deja una diferencia de hidratación. **Segunda trampa, que casi se escapa: mandar «Me interesa» borraba el camino de regreso.** La acción del formulario **reemplaza** la entrada del historial (`history.length` no cambia, 3 → 3) y la entrada nueva nace sin `state`: medido, `history.state.usr` quedaba en `null` y el migajón volvía a ser «← Todas las propiedades» a `/propiedades`. O sea que **quien más interés mostraba era justo el que perdía la búsqueda**. Se arregla con `state` en el `<Form>` de `Acciones`; como reemplaza y no empuja, los saltos no cambian. **Medido contra `vite preview`:** `verificar:listado` **24/24** (tres comprobaciones nuevas dentro del §3, que antes no cubrían este camino), `verificar:f2 --local` 39/39, `verificar:movimiento` 0 invisibles con y sin «menos movimiento», Vitest 257/257 y `tsc -b` limpio; y a mano, 17/17: celular con filtros `y=2789 → 2789`, escritorio con 36 casas `y=3539 → 3539`, la cadena catálogo→ficha→parecida→migajón salta las dos fichas, llegar de fuera (WhatsApp) deja el enlace de siempre, y recargar la ficha no deja ninguna queja en la consola. La prueba del formulario llena el **campo trampa** (`empresa`), con lo que la acción contesta que sí sin escribir en la base ni gastar el limitador: comprobado, `prospectos` sigue en 0. **Servicios, con dibujos animados — EN PRODUCCIÓN (20/09/2026, commits `888d0b2` y `b8ff527`, Worker versión `0ed0ddcf`, a pedido del usuario: «Despliegas»; `main` empujado).** Antes de desplegar: los tres pasos de §17 (la rama del worktree ya unida, local = `origin/main`, y la versión activa seguía siendo la `14e28560` de la tarea anterior, o sea que nadie más había desplegado), sin migraciones pendientes **ni necesarias** —no hay `0005`: la columna `icono` ya existía y lo automático sale del título—, y los títulos de la base REMOTA leídos antes de subir (los seis sembrados, `icono` en NULL: el caso que cubre la prueba unitaria). **Medido EN PRODUCCIÓN:** `verificar:f2 --remote` **39/39**, `verificar:movimiento` con `/servicios` (gestos, pausa que se recuerda; con «menos movimiento», quietos y sin botón), y `verificar:f3-navegador --remote` **17/17**, que estrenó dos cosas: el selector «Dibujo» guardando de verdad en producción y `/servicios` dentro del criterio 8 (113 peticiones en 4 páginas, ninguna del panel). En `/servicios` los seis salen cada uno con su dibujo sin haber tocado la base. **Cerrado mirando la base y la nube, no la salida del guion:** 6 servicios (0 de prueba, 6 visibles), 188 casas (0 de prueba), 0 zonas de prueba, y `fotos:migrar --remote --verificar` en ceros (3,241 fotos). **Ojo, ajeno a esta tarea:** quedan en producción 2 cuentas `@ejemplo.invalid` activas (`entregas-contenido` y `entregas-asesor`, creadas el 19/09/2026 21:31 UTC por `verificar:entregas`); su contraseña es aleatoria por corrida y no está en el repositorio, así que no es un hueco, pero rompen el «0 cuentas de prueba» con el que se cierra; se limpian con una corrida de `verificar:entregas -- --remote` sin `--dejar`. **Peso del CSS nuevo, que viaja a TODAS las páginas** (medido construyendo el commit anterior): `root-*.css` 12.0 → 13.1 KB gzip, **+1.06 KB**; se queda en `app.css`. Dos casos que las capturas no cubrían y se arreglaron antes de subir: con «Antes de los servicios» escrita, en el celular el botón le dejaba al párrafo ~226 px (ahora baja a su línea), y con la lista vacía salía un botón de pausa sobre nada. Detalle de lo que se hizo: Pedido: «hazlo más visual… añade elementos visuales para cada una de las cosas ya existentes», conservando la lista (que le gusta) y que se siga editando desde el panel. La primera mano fueron iconos de 6rem y, viendo las capturas, pidió más: «más detalle o algo más compuesto y que estén animados». **Lo que quedó:** siete ESCENAS de línea (`app/components/publico/dibujos-servicio.tsx`, lienzo 200×150), una por servicio más la casa de reserva, que son una familia porque salen del isotipo: el suelo inclinado lleva el ángulo de la pierna de la «A» (61°), las píldoras son sus estelas (monedas, voz del megáfono), la ventana cuadrada es la de todas las casas, y cada una lleva UNA pieza roja maciza que además cuenta la historia (el letrero, el llavero, la moneda que llega, el sello, la respuesta, la voz). Cuatro capas: suelo, relleno de papel (sin él el rosa se transparentaba a través de las casas), tinta en dos grosores y la pieza roja. La lista sigue siendo lista: el dibujo entra en el hueco del título, sin tarjetas (de 1024 a 1280 px, renglones de dibujo · título · texto). **Movimiento, solo CSS** (van sobre el pliegue: en la pantalla del dueño caben los seis y GSAP los volvería a esconder): (1) la ENTRADA, una vez: el suelo se tiende, la tinta se dibuja con `pathLength=1` —con curva propia, porque con la de asentamiento del sitio el 90 % de la línea salía en el primer tercio y se veía disparada, no dibujada—, el papel la rellena y la pieza roja se posa; es `backwards`, así que al acabar suelta el elemento y el estado natural es el dibujo entero; (2) la VIDA: cada pieza roja repite SU gesto (el letrero se mece, el llavero oscila, cae una moneda, el sello estampa y suelta un anillo de tinta, los puntos «escriben», el megáfono emite), 1.5 s de gesto y 3 de reposo, por turnos: con seis a la vista se mueven dos a la vez —el tercio justo— barriendo las columnas, y en el celular el que se ve cobra vida cada 4.5 s (la primera prueba, 9 s con seis turnos, lo dejaba 7.5 s quieto). **Lo que se mueve solo se puede parar (WCAG 2.2.2, la regla que ya le puso pausa a la vitrina):** la vida NO arranca desde el CSS sino cuando la página la enciende (`data-vida`), que es lo mismo que pinta el botón «Pausar»; sin JavaScript queda la entrada, que dura dos segundos; quien pausa lo encuentra pausado al volver (`localStorage`), al pausar la pieza vuelve a su estado natural en vez de congelarse a medio gesto (podía dejar la moneda invisible), con «menos movimiento» no hay ni gestos ni botón, y los dibujos fuera de la vista esperan (`IntersectionObserver`). **El panel:** cuál dibujo le toca a cada servicio lo decide `shared/servicios.ts` —solo datos: el panel no puede importar ni un módulo de interfaz del sitio (criterio 8)—: el que se escogió en Panel › Contenido («Dibujo») o, con «Automático», el que sugiere el título; por eso los seis de hoy tienen el suyo SIN migración y uno nuevo («Avalúos», «Administración de rentas») nace con uno que le queda. La columna es `servicios.icono`, que existía desde `0001` y nadie leía. **Dos fallos del panel que destapó la prueba, los dos del camino del formulario y no de la API:** (a) la ficha nunca mandaba `icono` y `guardarElemento` lo escribía siempre, así que cada «Guardar» lo dejaba en blanco —inofensivo mientras nadie lo leía—; (b) **desmarcar «Se ve en el sitio» no hacía nada**: una casilla sin marcar no viaja en el formulario y el servidor leía su ausencia como «visible» (medido: se desmarcó y la base guardó `visible = 1`), o sea que desde el panel era imposible ocultar un servicio o una pregunta. **Medido contra `vite preview`:** Vitest **267/267** (10 nuevas: los seis títulos reales dan seis dibujos distintos, lo escogido manda, la basura en la columna no cuenta), `tsc -b` limpio, `verificar:f2 --local` 39/39, `verificar:f3 --local` 30/30, `verificar:f3-navegador --local` **15/15** (tres nuevas: el dibujo llega a la base, guardar otra cosa ya no lo borra, «Automático» lo vacía; usa un servicio OCULTO que se borra al final) y `verificar:movimiento` con `/servicios` dentro: con gestos, en pausa quedan enteros, la pausa se recuerda, y con «menos movimiento» quietos y sin botón. El detector de `impeccable` sobre los cuatro archivos: sin hallazgos. Peso: los trazos van SOLO en el trozo de `/servicios` (3.9 KB gzip) y el catálogo de nombres solo en el del panel; el trozo público no importa ninguno del panel, y `/servicios` quedó añadida a las rutas que vigila el criterio 8. Revisado a 390, 1100, 1366, 2560 y fotograma a fotograma (hubo que guardar la hora real de cada captura: durante la entrada tardan ~180 ms y no los 113 supuestos, y los tiempos parecían no cuadrar). **Trampa nueva:** un trazo de largo cero igual pinta su punta redonda: mientras cada línea esperaba su turno había decenas de puntitos sueltos; se arregla con opacidad 0 dentro del `@keyframes` hasta el 1 %. |
| F5 · Buscador que entiende frases (Workers AI) | 🟡 construido y medido en local | 20/09/2026 | Pedido: que los buscadores usen las Neurons de Cloudflare para entender palabras clave, errores al escribir y lenguaje natural, con interruptor en el panel. Diseño en **§10.5**; trampas en §17. **Tres capas:** vocabulario y precios por código, el catálogo para el lugar, y el modelo solo para lo que sobra; lo entendido acaba siempre en la URL (redirección), así que la página 2, el scroll, la API y un enlace compartido no dependen de la IA. **El modelo se eligió midiendo** (`npm run medir:ia`, 65 frases reales × 2 vueltas contra la API de Workers AI, con las instrucciones y el validador del Worker; «perfecta» = todos los campos bien y ninguno de más): **`granite-4.0-h-micro` 128/130** (p50 1.29 s · p90 1.65 s · máx 3.0 s · **~1.1 Neurons** por búsqueda ≈ 9,400 búsquedas dentro de los 10,000 Neurons diarios), **`llama-3.3-70b-instruct-fp8-fast` 128/130** (1.13 s · 1.51 s · ~19.6 Neurons), `gemma-4-26b-a4b-it` 124/130 (1.20 s · ~4.9), `glm-4.7-flash` 123/130 (0.87 s de mediana, pero **5 de 130 consultas colgadas más de 10 s**) y `llama-3.2-3b-instruct` 117/130 (0.38 s; toma por colonia palabras que no lo son). `qwen3-30b-a3b-fp8` contesta vacío (razona) y `llama-3.1-8b-fp8` no acepta JSON Schema. **De fábrica, Granite Micro.** La primera medición, con el modelo cargando también con operación, tipo y precios, había dado lo contrario (Granite 76/102, GLM 100/102): achicar el trabajo cambió al ganador (§17). **Sin modelo se resuelven 51 de las 65 frases**; solo 14 (rasgos fuera de lista) llegan a preguntar. **Medido en local contra `vite preview` y el binding real:** `npm run verificar:busqueda -- --local --ia` **56/56**, tres corridas seguidas: lo que se entiende sin modelo (incluidos los precios: «menos de 2 millones 251 mil» → $2,251,000, rangos, mínimos, y que los metros no son dinero), que la frase manda sobre lo que quedó en el formulario, lo que no se reinterpreta (`literal`, `frase`, página 2, la API, un texto de 300 caracteres, una frase con `<script>`), la frase **tecleada en la portada con Chrome y enviada con Intro** (navega sin recargar), quitar filtros con un toque, una **segunda frase tecleada en el listado** (un solo formulario y los selectores al día), el interruptor **pulsado en el panel** con un director desechable (apaga y enciende, cambia la portada, queda en la bitácora, y un `PATCH` que solo trae el tope no lo apaga) y el modelo de verdad (un rasgo fuera de lista con cifra al azar, la memoria —la segunda vez en mayúsculas sale igual y sube `de_cache`—, un robot que no gasta, y la memoria sin texto de nadie). Vitest **341/341** (74 nuevas: parecido, frase, dinero, intención, lugares, rasgos), `tsc -b` limpio, y todo lo anterior sin cambios: `verificar:f2` 39/39, `listado` 24/24, `vitrina` 22/22, `movimiento` 0 invisibles, `f3` 30/30, `f3-navegador` 15/15, `f4` 42/42, `entregas` 33/33. El paquete público no cargó con el vocabulario (trozo de filtros: 641 B gzip, igual que antes). De paso se arregló un defecto que venía de F2: los selectores del listado no reflejaban la dirección tras navegar sin recargar. **Migración `0005`: va PRIMERO al desplegar.** |
| F6 · Producción | ⏸ espera consultores | | |
