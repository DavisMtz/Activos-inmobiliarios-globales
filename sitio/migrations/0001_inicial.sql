-- Esquema inicial (PLAN §7).
--
-- Reglas de D1 que mandan sobre todo lo de abajo:
--   · No hay transacciones interactivas: los cambios que van juntos viajan en
--     un solo db.batch(), y lo que no puede pasar dos veces va en un UPDATE
--     condicional, nunca tras un SELECT suelto.
--   · D1 SÍ aplica las claves foráneas, pero no se confía en ON DELETE CASCADE:
--     se borra en orden explícito, de las hojas a la raíz.
--   · Fechas en texto ISO 8601 UTC (new Date().toISOString()). Nunca
--     datetime('now'), que usa otro formato y rompe las comparaciones de texto.

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
  -- Solo en sesiones de cambio obligatorio: SHA-256 de «token:clave temporal».
  -- Deja comprobar que la clave nueva no repite la temporal SIN un segundo
  -- PBKDF2 en la misma petición (dos de 100 000 iteraciones rebasan el CPU de
  -- un Worker). Sin el token, que solo vive en la cookie, no sirve de nada.
  huella_temporal TEXT,
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
