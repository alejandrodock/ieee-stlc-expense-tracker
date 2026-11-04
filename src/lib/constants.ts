export const CATEGORIAS = [
  { value: 'catering', label: 'Catering / Coffee Break', icon: '☕', color: '#F59E0B' },
  { value: 'transporte', label: 'Transporte Ponentes', icon: '🚗', color: '#3B82F6' },
  { value: 'imprenta', label: 'Imprenta y Kits', icon: '🖨️', color: '#8B5CF6' },
  { value: 'hackathon', label: 'Premios / Hackathon', icon: '🏆', color: '#10B981' },
  { value: 'materiales', label: 'Materiales / Varios', icon: '📦', color: '#EF4444' },
] as const;

export const TIPOS_COMPROBANTE = [
  { value: 'factura', label: 'Factura Oficial (NIT IEEE Sección Bolivia)' },
  { value: 'recibo', label: 'Recibo de Caja' },
] as const;

export const PRESUPUESTO_INICIAL = 13618.08; // BOB

export const TIPO_CAMBIO_USD = 6.96; // BOB per USD (approximate)

export type CategoriaValue = typeof CATEGORIAS[number]['value'];
export type TipoComprobanteValue = typeof TIPOS_COMPROBANTE[number]['value'];

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
