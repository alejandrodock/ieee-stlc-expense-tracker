-- Nuevas categorías: catering de hackathon, almuerzo de ponentes y marketing.
-- La lista de categorías válidas se controla en la app (src/lib/constants.ts y la
-- validación del servidor), así que se elimina la restricción de la base de datos:
-- futuras categorías ya no necesitarán SQL.
-- Ejecutar una vez en Supabase → SQL Editor.

ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_categoria_check;
