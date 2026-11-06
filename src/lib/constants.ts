export const CATEGORIAS = [
  { value: 'catering', label: 'Catering / Coffee Break', icon: '☕', color: '#F59E0B' },
  { value: 'transporte', label: 'Transporte Ponentes', icon: '🚗', color: '#3B82F6' },
  { value: 'imprenta', label: 'Imprenta y Kits', icon: '🖨️', color: '#8B5CF6' },
  { value: 'hackathon', label: 'Premios / Hackathon', icon: '🏆', color: '#10B981' },
  { value: 'materiales', label: 'Materiales / Varios', icon: '📦', color: '#EF4444' },
] as const;

export const TIPOS_COMPROBANTE = [
  { value: 'factura_ieee', label: 'Factura Oficial (NIT IEEE Sección Bolivia)' },
  { value: 'factura_personal', label: 'Factura Oficial (C.I. Ivan Mendoza)' },
  { value: 'recibo', label: 'Recibo de Caja' },
] as const;

export const PRESUPUESTO_INICIAL = 13618.08; // BOB

/** Bolivianos por dólar usados para el equivalente en USD de la rendición. */
export const TIPO_CAMBIO_USD = 11.58;

export type CategoriaValue = typeof CATEGORIAS[number]['value'];
export type TipoComprobanteValue = typeof TIPOS_COMPROBANTE[number]['value'] | 'factura';

export function getTipoComprobanteLabel(value: string): string {
  if (value === 'factura' || value === 'factura_ieee') return 'Factura Oficial (NIT IEEE)';
  if (value === 'factura_personal') return 'Factura Oficial (C.I. Ivan Mendoza)';
  if (value === 'recibo') return 'Recibo de Caja';
  return value;
}

export function getCategoriaLabel(value: string): string {
  return CATEGORIAS.find(c => c.value === value)?.label ?? value;
}

export function getCategoriaColor(value: string): string {
  return CATEGORIAS.find(c => c.value === value)?.color ?? '#6B7280';
}

export function getCategoriaIcon(value: string): string {
  return CATEGORIAS.find(c => c.value === value)?.icon ?? '📋';
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
