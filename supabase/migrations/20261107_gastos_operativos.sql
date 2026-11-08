-- Gastos operativos (taxis, pasajes) y gastos menores sin factura ni recibo.
-- Ejecutar una vez en Supabase → SQL Editor.

ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_categoria_check;
ALTER TABLE gastos ADD CONSTRAINT gastos_categoria_check
  CHECK (categoria IN ('catering', 'transporte', 'imprenta', 'hackathon', 'materiales', 'operativos'));

ALTER TABLE gastos DROP CONSTRAINT IF EXISTS gastos_tipo_comprobante_check;
ALTER TABLE gastos ADD CONSTRAINT gastos_tipo_comprobante_check
  CHECK (tipo_comprobante IN ('factura', 'factura_ieee', 'factura_personal', 'recibo', 'sin_comprobante'));
