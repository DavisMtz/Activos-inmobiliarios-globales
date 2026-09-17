-- Panel para el equipo (F3). Tres cambios, ninguno destructivo.

-- 1. Cambio de clave desde «Mi cuenta», en DOS pasos (PLAN §17).
--    Dos PBKDF2 en la misma petición revientan el CPU del Worker, así que
--    confirmar la clave actual y guardar la nueva son peticiones distintas. El
--    primer paso no guarda la contraseña: guarda el SHA-256 de «token:clave»,
--    que sin el token de la cookie no le sirve a nadie, y hasta cuándo vale.
--    El segundo compara esa huella (gratis) y deriva UNA sola vez la nueva.
ALTER TABLE sesiones ADD COLUMN huella_clave_actual TEXT;
ALTER TABLE sesiones ADD COLUMN clave_confirmada_hasta TEXT;

-- 2. `prospectos.propiedad_id` no tenía índice, así que cada upsert de la
--    siembra comprobaba su clave foránea con un SCAN de la tabla. Hoy no cuesta
--    (0 prospectos), pero en cuanto haya prospectos reales se paga en filas
--    leídas, que es lo que tumbó a la cuenta en F1.5 (PLAN §17).
CREATE INDEX IF NOT EXISTS idx_prospectos_propiedad ON prospectos (propiedad_id);

-- 3. La bitácora se consulta por persona en `/panel/bitacora`; su único índice
--    era por entidad. Sin esto, filtrar por quién lee toda la tabla.
CREATE INDEX IF NOT EXISTS idx_bitacora_usuario ON bitacora (usuario_id, creado_en);
