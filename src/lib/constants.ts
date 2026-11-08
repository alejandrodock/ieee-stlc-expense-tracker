export const CATEGORIAS = [
  { value: 'catering', label: 'Catering / Coffee Break', color: '#C9A45C' },
  { value: 'transporte', label: 'Transporte Ponentes', color: '#5AA9D6' },
  { value: 'imprenta', label: 'Imprenta y Kits', color: '#9AA6D8' },
  { value: 'hackathon', label: 'Premios / Hackathon', color: '#6BBFA5' },
  { value: 'materiales', label: 'Materiales / Varios', color: '#C98585' },
  { value: 'operativos', label: 'Gastos operativos (taxis, pasajes)', color: '#8FB0C4' },
] as const;

/** Todas las facturas y recibos se emiten a nombre del responsable de fondos. */
export const RESPONSABLE = 'Ivan Mendoza';

export const TIPOS_COMPROBANTE = [
  { value: 'factura_personal', label: `Factura (C.I. ${RESPONSABLE})` },
  { value: 'recibo', label: `Recibo (a nombre de ${RESPONSABLE})` },
  { value: 'sin_comprobante', label: 'Sin factura ni recibo (gasto menor)' },
] as const;

export const PRESUPUESTO_INICIAL = 13618.08; // BOB

/** Bolivianos por dólar usados para el equivalente en USD de la rendición. */
export const TIPO_CAMBIO_USD = 11.58;

export type CategoriaValue = typeof CATEGORIAS[number]['value'];
export type TipoComprobanteValue = typeof TIPOS_COMPROBANTE[number]['value'] | 'factura';

export function getTipoComprobanteLabel(value: string): string {
  // Registros antiguos ('factura', 'factura_ieee') también se emitieron a nombre del responsable.
  if (value === 'factura' || value === 'factura_ieee') return `Factura (C.I. ${RESPONSABLE})`;
  return TIPOS_COMPROBANTE.find((t) => t.value === value)?.label ?? value;
}

export function getCategoriaLabel(value: string): string {
  return CATEGORIAS.find(c => c.value === value)?.label ?? value;
}

export function getCategoriaColor(value: string): string {
  return CATEGORIAS.find(c => c.value === value)?.color ?? '#93A6BA';
}

export function sanitizeFilename(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function generatePdfFilename(
  fecha: string,
  categoria: string,
  proveedor: string,
  monto: number
): string {
  const dateStr = fecha.replace(/-/g, '');
  const catStr = sanitizeFilename(getCategoriaLabel(categoria));
  const provStr = sanitizeFilename(proveedor);
  const montoStr = monto.toFixed(2).replace('.', '_');
  return `${dateStr}_${catStr}_${provStr}_${montoStr}BOB.pdf`;
}

export function formatMonto(amount: number): string {
  return new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Today's date (YYYY-MM-DD) in the device's local time zone – not UTC. */
export function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatTipoCambio(): string {
  return TIPO_CAMBIO_USD.toLocaleString('es-BO', { minimumFractionDigits: 2 });
}
