export type Lang = 'es' | 'en';

export const CATEGORIAS = [
  // `value` es lo que se guarda en la base de datos: no cambiar los existentes.
  { value: 'catering', label: 'Catering de coffee break', labelEn: 'Coffee break catering', color: '#C9A45C' },
  { value: 'catering_hackathon', label: 'Catering de hackathon', labelEn: 'Hackathon catering', color: '#D4875F' },
  { value: 'almuerzo_ponentes', label: 'Almuerzo de ponentes', labelEn: 'Speaker lunch', color: '#B58FC4' },
  { value: 'transporte', label: 'Transporte de ponentes', labelEn: 'Speaker transportation', color: '#5AA9D6' },
  { value: 'imprenta', label: 'Imprenta y papelería', labelEn: 'Printing and stationery', color: '#9AA6D8' },
  { value: 'marketing', label: 'Marketing y difusión', labelEn: 'Marketing and outreach', color: '#D77FA1' },
  { value: 'hackathon', label: 'Premios de hackathon', labelEn: 'Hackathon prizes', color: '#6BBFA5' },
  { value: 'materiales', label: 'Materiales varios', labelEn: 'Miscellaneous materials', color: '#A3A86B' },
  { value: 'operativos', label: 'Gastos operativos', labelEn: 'Operating expenses', color: '#8FB0C4' },
] as const;

/** Todas las facturas y recibos se emiten a nombre del responsable de fondos. */
export const RESPONSABLE = 'Ivan Alejandro Mendoza';

/** Datos del responsable de fondos (carimbo del reporte de rendición). */
export const RESPONSABLE_PERFIL = {
  nombre: RESPONSABLE,
  cargo: 'Conference Chair – IEEE Student Tech Leadership Conference, Universidad Mayor de San Andrés, 2026',
  ci: '14229290',
  membresiaIeee: '99693391',
  correo: 'iamendoza@ieee.org',
  celular: '+591 68108299',
} as const;

export const TIPOS_COMPROBANTE = [
  { value: 'factura_personal', label: `Factura (C.I. ${RESPONSABLE})`, labelEn: `Invoice (ID ${RESPONSABLE})` },
  { value: 'recibo', label: `Recibo (a nombre de ${RESPONSABLE})`, labelEn: `Receipt (issued to ${RESPONSABLE})` },
  { value: 'sin_comprobante', label: 'Sin factura ni recibo (gasto menor)', labelEn: 'No invoice or receipt (minor expense)' },
] as const;

/** Fotos o videos de respaldo por gasto (además del comprobante PDF). */
export const MAX_MEDIA = 3;
/** Límite por archivo (el plan gratuito de Supabase Storage admite hasta 50 MB). */
export const MAX_MEDIA_MB = 50;

/** Bolivianos por dólar usados para el equivalente en USD de la rendición. */
export const TIPO_CAMBIO_USD = 11.58;

/** Monto total asignado al evento, en dólares. */
export const MONTO_ASIGNADO_USD = 1176;

/** Presupuesto en bolivianos: 1176 USD × 11,58 = 13.618,08 Bs. */
export const PRESUPUESTO_INICIAL = Math.round(MONTO_ASIGNADO_USD * TIPO_CAMBIO_USD * 100) / 100;

export type CategoriaValue = typeof CATEGORIAS[number]['value'];
export type TipoComprobanteValue = typeof TIPOS_COMPROBANTE[number]['value'] | 'factura';

export function getTipoComprobanteLabel(value: string, lang: Lang = 'es'): string {
  // Registros antiguos ('factura', 'factura_ieee') también se emitieron a nombre del responsable.
  const v = value === 'factura' || value === 'factura_ieee' ? 'factura_personal' : value;
  const t = TIPOS_COMPROBANTE.find((x) => x.value === v);
  if (!t) return value;
  return lang === 'en' ? t.labelEn : t.label;
}

export function getCategoriaLabel(value: string, lang: Lang = 'es'): string {
  const c = CATEGORIAS.find((x) => x.value === value);
  if (!c) return value;
  return lang === 'en' ? c.labelEn : c.label;
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
