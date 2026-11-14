-- Apply BEFORE deploying the multi-project host. No existing row or file is removed.
BEGIN;
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS project_id TEXT NOT NULL DEFAULT 'STLC',
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS original_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(20,12),
  ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS has_receipt BOOLEAN,
  ADD COLUMN IF NOT EXISTS signer_name TEXT,
  ADD COLUMN IF NOT EXISTS rate_source TEXT,
  ADD COLUMN IF NOT EXISTS rate_date TIMESTAMPTZ;

-- Legacy monto_bob / monto_usd, URLs, categories and timestamps stay unchanged.
-- HART does not fabricate a BOB equivalent for USD/EUR purchases.
ALTER TABLE public.gastos ALTER COLUMN monto_bob DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gastos_project_valid' AND conrelid = 'public.gastos'::regclass) THEN
    ALTER TABLE public.gastos ADD CONSTRAINT gastos_project_valid CHECK (project_id IN ('STLC', 'HART'));
    ALTER TABLE public.gastos ADD CONSTRAINT gastos_project_amounts CHECK (
      (project_id = 'STLC' AND monto_bob IS NOT NULL AND monto_bob > 0) OR
      (project_id = 'HART' AND original_amount IS NOT NULL AND original_amount > 0
       AND original_currency IS NOT NULL AND original_currency IN ('USD','EUR','BOB')
       AND exchange_rate IS NOT NULL AND exchange_rate > 0
       AND (original_currency <> 'USD' OR exchange_rate = 1)
       AND amount_usd IS NOT NULL AND amount_usd > 0
       AND amount_usd = round(original_amount * exchange_rate, 2)
       AND has_receipt IS NOT NULL AND (has_receipt OR amount_usd < 25)
       AND (has_receipt OR (signer_name IS NOT NULL AND length(trim(signer_name)) > 0))
       AND categoria IN ('vuelos','alojamiento','transporte','alimentacion','inscripcion','materiales','seguros','menores')
       AND (categoria <> 'menores' OR amount_usd < 25)
       AND pdf_url IS NOT NULL)
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_gastos_project_fecha ON public.gastos(project_id, fecha DESC);

-- No client-side access. Project selection is NOT user authorization.
-- service_role bypasses RLS: every server query must also scope project_id.
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gasto_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations" ON public.gastos;
REVOKE ALL ON public.gastos, public.gasto_media FROM anon, authenticated;
REVOKE ALL ON public.resumen_categorias FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos, public.gasto_media TO service_role;

-- Preserve the legacy summary's STLC-only meaning.
CREATE OR REPLACE VIEW public.resumen_categorias AS
SELECT categoria, COUNT(*) AS total_gastos, SUM(monto_bob) AS total_bob,
       SUM(monto_usd) AS total_usd, MIN(fecha) AS primera_fecha, MAX(fecha) AS ultima_fecha
FROM public.gastos WHERE project_id = 'STLC'
GROUP BY categoria ORDER BY total_bob DESC;
REVOKE ALL ON public.resumen_categorias FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
