-- Fotos y videos por gasto (máx. 3, controlado por la app) + categorías libres.
-- Ejecutar una vez en Supabase → SQL Editor. Es seguro ejecutarlo más de una vez.

-- 1) Categorías: la lista válida la controla la app (incluido en la migración anterior).
ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_categoria_check;

-- 2) Multimedia de cada gasto. Los archivos viven en el bucket privado "evidencias"
--    (la app lo crea sola en la primera subida).
CREATE TABLE IF NOT EXISTS gasto_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gasto_id UUID NOT NULL REFERENCES gastos(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,
  nombre TEXT,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gasto_media_gasto ON gasto_media(gasto_id);

-- Solo el servidor (service role) accede: RLS activo sin políticas.
ALTER TABLE gasto_media ENABLE ROW LEVEL SECURITY;
