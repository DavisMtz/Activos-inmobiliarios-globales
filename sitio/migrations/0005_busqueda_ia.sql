-- El buscador que entiende frases (PLAN §10.5). Dos tablas nuevas y una fila
-- de configuración; nada destructivo, y el sitio funciona igual si esto todavía
-- no se aplicó (todo lo que lee estas tablas degrada al buscador de siempre).

-- 1. Lo ya interpretado. Una frase se le pregunta al modelo UNA vez: la
--    siguiente persona que escriba «casa con alberca en altozano» no espera ni
--    gasta. La llave es la huella SHA-256 de la frase normalizada más la versión
--    de las instrucciones: aquí NO se guarda lo que la gente escribe, y cambiar
--    las instrucciones o el modelo invalida solo lo suyo.
CREATE TABLE IF NOT EXISTS ia_cache (
  clave TEXT PRIMARY KEY,                       -- sha-256 en hexadecimal
  valor TEXT NOT NULL,                          -- JSON de lo que contestó el modelo, ya saneado
  expira TEXT NOT NULL                          -- ISO 8601 UTC
);
CREATE INDEX IF NOT EXISTS idx_ia_cache_expira ON ia_cache (expira);

-- 2. El gasto, por día de Morelia. Es con lo que se aplica el tope diario y lo
--    que enseña el panel: cuántas consultas, cuántas fallaron, cuánto tardaron.
--    Los Neurons los cuenta Cloudflare y no se pueden leer desde el Worker; por
--    eso el tope va en CONSULTAS, y los tokens se guardan para estimarlos.
CREATE TABLE IF NOT EXISTS ia_uso (
  dia TEXT PRIMARY KEY,                         -- 2026-09-20 (hora de Morelia, UTC-6)
  consultas INTEGER NOT NULL DEFAULT 0,         -- llamadas al modelo (con sus reintentos)
  fallos INTEGER NOT NULL DEFAULT 0,            -- tardó de más, o contestó algo que no sirve
  de_cache INTEGER NOT NULL DEFAULT 0,          -- frases resueltas sin preguntar
  ms INTEGER NOT NULL DEFAULT 0,                -- tiempo total esperando al modelo
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_salida INTEGER NOT NULL DEFAULT 0
);

-- 3. El interruptor. Nace ENCENDIDO: se apaga desde Panel › Configuración.
--    Sin esta fila (o con el JSON dañado) el código lo da por apagado.
INSERT OR IGNORE INTO configuracion (clave, valor, actualizado_por, actualizado_en)
VALUES ('busqueda_ia', '{"activa":true,"modelo":"","tope_diario":300}', NULL, '2026-09-20T00:00:00.000Z');
