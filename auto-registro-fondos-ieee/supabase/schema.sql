-- =============================================
-- IEEE STLC ExpenseTracker - Supabase Schema
-- =============================================
-- Run this SQL in the Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create gastos table
CREATE TABLE IF NOT EXISTS gastos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  fecha DATE NOT NULL,
  categoria TEXT NOT NULL, -- valores válidos: CATEGORIAS en src/lib/constants.ts
  proveedor TEXT NOT NULL,
  descripcion TEXT,
  observaciones TEXT,
  tipo_comprobante TEXT NOT NULL CHECK (tipo_comprobante IN ('factura', 'factura_ieee', 'factura_personal', 'recibo', 'sin_comprobante')),
  monto_bob DECIMAL(12, 2) NOT NULL CHECK (monto_bob > 0),
  monto_usd DECIMAL(12, 2),
  pdf_url TEXT,
  drive_file_id TEXT,
  drive_url TEXT,
  imagen_original TEXT
);

-- In case the table already exists, ensure the new columns and constraint are updated:
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS observaciones TEXT;
ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_tipo_comprobante_check;
ALTER TABLE gastos ADD CONSTRAINT gastos_tipo_comprobante_check CHECK (tipo_comprobante IN ('factura', 'factura_ieee', 'factura_personal', 'recibo', 'sin_comprobante'));
ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_categoria_check;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos(categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_created_at ON gastos(created_at DESC);

-- Row Level Security ON with no policies: the anon key gets no access.
-- The app only talks to the table from the server with the service-role key
-- (which bypasses RLS). Receipts live in the private Storage bucket "comprobantes",
-- created automatically by the app on first upload.
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON gastos;

-- Create a view for summary by category
CREATE OR REPLACE VIEW resumen_categorias AS
SELECT 
  categoria,
  COUNT(*) as total_gastos,
  SUM(monto_bob) as total_bob,
  SUM(monto_usd) as total_usd,
  MIN(fecha) as primera_fecha,
  MAX(fecha) as ultima_fecha
FROM gastos
GROUP BY categoria
ORDER BY total_bob DESC;

-- Not exposed through the public API
REVOKE ALL ON resumen_categorias FROM anon, authenticated;

-- Fotos y videos de cada gasto (máx. 3, controlado por la app).
-- Archivos en el bucket privado "evidencias" (creado automáticamente por la app).
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
ALTER TABLE gasto_media ENABLE ROW LEVEL SECURITY;
