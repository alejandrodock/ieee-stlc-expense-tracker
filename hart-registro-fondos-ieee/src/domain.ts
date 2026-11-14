export const PROJECT = 'HART' as const;
export const DEFAULT_BUDGET_USD = 9000;
export const CURRENCIES = ['USD', 'EUR', 'BOB'] as const;
export type Currency = typeof CURRENCIES[number];
export const CATEGORIES = [
  ['vuelos', 'Pasajes y Vuelos Internacionales'],
  ['alojamiento', 'Alojamiento e Hospedaje'],
  ['transporte', 'Transporte Local y Trenes'],
  ['alimentacion', 'Alimentación y Dieta'],
  ['inscripcion', 'Inscripción y Registros IEEE/ISICAS'],
  ['materiales', 'Materiales, Prototipo y Componentes'],
  ['seguros', 'Seguros de Viaje y Visados'],
  ['menores', 'Gastos Menores / Imprevistos (<$25 USD)'],
] as const;
export const categoryLabel = (key: string) => CATEGORIES.find(([id]) => id === key)?.[1] ?? key;
export const money = (n: number, currency = 'USD') => new Intl.NumberFormat('es-BO', { style: 'currency', currency }).format(n);
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function convertedUsd(amount: number, rate: number): number {
  return Math.round((amount * rate + Number.EPSILON) * 100) / 100;
}
export type ExpenseInput = {
  id: string; fecha: string; categoria: string; proveedor: string; descripcion: string;
  original_amount: number; original_currency: Currency; exchange_rate: number;
  has_receipt: boolean; signer_name: string; signature?: string;
  rate_source: 'api' | 'manual'; rate_date: string | null;
};
export type Expense = Omit<ExpenseInput, 'signature'> & {
  project_id: 'HART'; amount_usd: number; pdf_url: string; created_at: string;
};
export function validateExpense(value: unknown): ExpenseInput & { amount_usd: number } {
  if (!value || typeof value !== 'object') throw new Error('Datos inválidos.');
  const b = value as Record<string, unknown>;
  if (b.project_id !== undefined && b.project_id !== PROJECT) throw new Error('Proyecto inválido.');
  if (!isUuid(b.id)) throw new Error('Identificador inválido.');
  const date = typeof b.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? new Date(b.fecha + 'T00:00:00Z') : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== b.fecha) throw new Error('Fecha inválida.');
  if (!CATEGORIES.some(([id]) => id === b.categoria)) throw new Error('Categoría inválida.');
  if (!CURRENCIES.includes(b.original_currency as Currency)) throw new Error('Moneda inválida.');
  const original_amount = b.original_amount;
  const exchange_rate = b.exchange_rate;
  if (typeof original_amount !== 'number' || !Number.isFinite(original_amount) || original_amount <= 0 || original_amount > 10_000_000 || Math.abs(original_amount * 100 - Math.round(original_amount * 100)) > 0.00001) throw new Error('Monto inválido; usa hasta dos decimales.');
  if (typeof exchange_rate !== 'number' || !Number.isFinite(exchange_rate) || exchange_rate <= 0 || exchange_rate > 10000) throw new Error('Tipo de cambio inválido.');
  if (b.original_currency === 'USD' && exchange_rate !== 1) throw new Error('USD debe usar una tasa de 1.');
  const amount_usd = convertedUsd(original_amount, exchange_rate);
  if (amount_usd <= 0 || amount_usd > 10_000_000) throw new Error('El total USD está fuera del rango permitido.');
  if (typeof b.has_receipt !== 'boolean') throw new Error('Indica si tienes comprobante.');
  if (!b.has_receipt && amount_usd >= 25) throw new Error('Desde 25,00 USD se requiere factura o recibo.');
  if (b.categoria === 'menores' && amount_usd >= 25) throw new Error('Gastos menores solo admite montos inferiores a 25,00 USD.');
  const text = (key: string, max: number, required = false) => {
    const v = b[key] === undefined ? '' : b[key];
    if (typeof v !== 'string' || v.trim().length > max || (required && !v.trim())) throw new Error(`Campo inválido: ${key}.`);
    return v.trim();
  };
  const proveedor = text('proveedor', 200, true);
  const descripcion = text('descripcion', 2000, !b.has_receipt);
  const signer_name = text('signer_name', 200, !b.has_receipt);
  const signature = typeof b.signature === 'string' ? b.signature : undefined;
  if (!b.has_receipt && (!signature || signature.length > 750000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(signature))) throw new Error('Firma tu declaración antes de guardar.');
  if (b.rate_source !== 'api' && b.rate_source !== 'manual') throw new Error('Origen de tasa inválido.');
  const rate_date = typeof b.rate_date === 'string' ? b.rate_date : null;
  if (rate_date && (rate_date.length > 40 || !Number.isFinite(Date.parse(rate_date)))) throw new Error('Fecha de tasa inválida.');
  return { id: b.id, fecha: b.fecha as string, categoria: b.categoria as string, proveedor, descripcion,
    original_amount, original_currency: b.original_currency as Currency, exchange_rate, amount_usd,
    has_receipt: b.has_receipt, signer_name, signature, rate_source: b.rate_source, rate_date };
}
