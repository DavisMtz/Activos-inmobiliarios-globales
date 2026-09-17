-- Prospectos y métricas (F4). Dos índices; nada destructivo.

-- 1. Las notas de un prospecto se leen siempre por su prospecto. Sin índice,
--    abrir una ficha de la bandeja lee la tabla entera, y las filas leídas se
--    pagan (PLAN §17). Se ordena por `id`, que es el rowid y va en el índice.
CREATE INDEX IF NOT EXISTS idx_notas_prospecto ON notas_prospecto (prospecto_id, id);

-- 2. Las métricas se piden por ventana de tiempo («los últimos 30 días»). El
--    único índice de `eventos` empieza por `propiedad_id`, así que recortar por
--    fecha recorría toda la tabla: es la que más crece de la base (una fila por
--    ficha vista).
CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos (creado_en);
