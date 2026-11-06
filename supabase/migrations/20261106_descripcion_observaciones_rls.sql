-- =============================================================================
-- Migración 2026-11-06 — ejecutar UNA vez en Supabase > SQL Editor (es idempotente)
--
-- 1. Agrega las columnas descripcion / observaciones que la app ya usa
--    (sin ellas no se puede guardar ningún gasto).
-- 2. Permite los tipos de comprobante actuales.
-- 3. Cierra el acceso público directo a la tabla: la app accede solo desde el
--    servidor con la service-role key (que ignora RLS), así que la política
--    "Allow all operations" ya no es necesaria y dejaba la tabla abierta a
--    cualquiera con la anon key.
-- =============================================================================

ALTER TABLE gastos ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS observaciones TEXT;

ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_tipo_comprobante_check;
ALTER TABLE gastos ADD CONSTRAINT gastos_tipo_comprobante_check
  CHECK (tipo_comprobante IN ('factura', 'factura_ieee', 'factura_personal', 'recibo'));

ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON gastos;

-- La vista de resumen hereda permisos del dueño; restringirla también.
REVOKE ALL ON resumen_categorias FROM anon, authenticated;

-- Refresca la caché de esquema de la API (PostgREST)
NOTIFY pgrst, 'reload schema';
