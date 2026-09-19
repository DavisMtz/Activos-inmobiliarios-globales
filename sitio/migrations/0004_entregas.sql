-- Entregas: el comentario y las fotos del cliente al recibir su casa (F5).
-- Todo aditivo sobre `testimonios`, que ya existía (y en producción ya tiene
-- una fila capturada desde el panel); nada se borra.
--
-- Cómo funciona: el equipo crea la entrega en el panel, sube la foto que se
-- tomó ese día y le manda al cliente un enlace personal. El cliente escribe su
-- comentario y da DOS permisos por separado (publicar el comentario, publicar
-- las fotos), y puede agregar fotos suyas. Nada se ve en el sitio hasta que
-- alguien del equipo lo aprueba.

-- Solo la huella SHA-256 del enlace: con la base en la mano no se puede
-- rearmar ningún enlace vivo.
ALTER TABLE testimonios ADD COLUMN token_hash TEXT;
ALTER TABLE testimonios ADD COLUMN token_expira TEXT;
-- Cuándo contestó el cliente. Con valor, el enlace ya no admite cambios.
ALTER TABLE testimonios ADD COLUMN enviado_en TEXT;
-- «Laura M.»: lo ÚNICO del nombre que sale al sitio. `nombre` queda para el
-- equipo (a quién se le entregó).
ALTER TABLE testimonios ADD COLUMN nombre_publico TEXT;
ALTER TABLE testimonios ADD COLUMN acepta_texto INTEGER NOT NULL DEFAULT 0;
ALTER TABLE testimonios ADD COLUMN acepta_fotos INTEGER NOT NULL DEFAULT 0;
-- Constancia del permiso: cuándo y con qué versión del texto de consentimiento.
ALTER TABLE testimonios ADD COLUMN aceptado_en TEXT;
ALTER TABLE testimonios ADD COLUMN consentimiento_version TEXT;
-- invitado → respondido → aprobado | oculto. Solo `aprobado` sale al sitio.
ALTER TABLE testimonios ADD COLUMN estado TEXT NOT NULL DEFAULT 'invitado';
-- La casa que se entregó (opcional: no todas las entregas son del catálogo).
ALTER TABLE testimonios ADD COLUMN propiedad_id INTEGER REFERENCES propiedades(id);
ALTER TABLE testimonios ADD COLUMN creado_por TEXT REFERENCES usuarios(id);
ALTER TABLE testimonios ADD COLUMN aprobado_en TEXT;
-- La carpeta de Cloudinary de sus fotos: 16 caracteres al azar, NO el id.
-- SQLite reutiliza los id que se borran, y la base local y la de producción
-- comparten la misma nube: con el id, dos entregas distintas caían en la misma
-- carpeta (medido el 19/09/2026 con fotos de una prueba anterior).
ALTER TABLE testimonios ADD COLUMN carpeta TEXT;

-- Lo que existía antes (texto capturado por el equipo) NO tiene constancia de
-- permiso: queda como respondido y oculto hasta que alguien lo revise. Nunca
-- se publica solo por haber sido `visible = 1` en la versión anterior.
UPDATE testimonios
   SET estado = 'oculto',
       nombre_publico = nombre,
       enviado_en = creado_en,
       acepta_texto = 0
 WHERE token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_testimonios_token ON testimonios (token_hash);
-- El sitio pide siempre «las aprobadas, la más reciente primero».
CREATE INDEX IF NOT EXISTS idx_testimonios_estado ON testimonios (estado, aprobado_en);

CREATE TABLE IF NOT EXISTS fotos_entrega (
  id INTEGER PRIMARY KEY,
  testimonio_id INTEGER NOT NULL REFERENCES testimonios(id),
  public_id TEXT NOT NULL UNIQUE,               -- aig/entregas/<id>/<8 hex>
  ancho INTEGER,
  alto INTEGER,
  -- 'equipo' = la foto que se tomó en la entrega; 'cliente' = la subió él.
  subida_por TEXT NOT NULL,
  -- El equipo puede dejar fuera una foto concreta sin borrarla.
  visible INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  creada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fotos_entrega ON fotos_entrega (testimonio_id, orden);
