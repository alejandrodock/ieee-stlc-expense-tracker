-- Permite el texto personalizado que ya aceptan el formulario y la API.
-- Conserva todos los tipos y registros anteriores. Se puede ejecutar de nuevo.
BEGIN;

ALTER TABLE public.gastos DROP CONSTRAINT IF EXISTS gastos_tipo_comprobante_check;
ALTER TABLE public.gastos ADD CONSTRAINT gastos_tipo_comprobante_check
  CHECK (char_length(btrim(tipo_comprobante)) BETWEEN 1 AND 100);

COMMIT;
