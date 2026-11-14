import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase no está configurado.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const HART_BUCKET = 'hart-comprobantes';
export const MAX_RECEIPT_BYTES = 20 * 1024 * 1024;
export const receiptPath = (id: string) => `${id}/original`;
export const reportPath = (id: string) => `${id}/report.pdf`;
export const EXPENSE_COLUMNS = 'id,project_id,fecha,categoria,proveedor,descripcion,original_amount,original_currency,exchange_rate,amount_usd,has_receipt,signer_name,rate_source,rate_date,pdf_url,created_at';
export async function ensureBucket(client: ReturnType<typeof db>) {
  const { data, error } = await client.storage.getBucket(HART_BUCKET);
  if (data) return;
  const result = await client.storage.createBucket(HART_BUCKET, {
    public: false, fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
  });
  if (result.error && !/already exists/i.test(result.error.message)) throw result.error ?? error;
}
