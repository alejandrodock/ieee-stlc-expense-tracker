import 'server-only';
import { getServerSupabase } from './supabase';

/** Private bucket that stores one PDF per expense: `<gasto id>.pdf`. */
export const COMPROBANTES_BUCKET = 'comprobantes';
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export const comprobantePath = (id: string) => `${id}.pdf`;
export const comprobanteUrl = (id: string) => `/api/comprobantes/${id}`;

let bucketReady = false;

/** Creates the private bucket on first use (idempotent). */
export async function ensureComprobantesBucket(): Promise<void> {
  if (bucketReady) return;
  const supabase = getServerSupabase();
  const { data, error } = await supabase.storage.getBucket(COMPROBANTES_BUCKET);
  if (!data) {
    const { error: createError } = await supabase.storage.createBucket(COMPROBANTES_BUCKET, {
      public: false,
      fileSizeLimit: MAX_PDF_BYTES,
      allowedMimeTypes: ['application/pdf'],
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw new Error(`No se pudo crear el bucket: ${createError.message} (${error?.message ?? ''})`);
    }
  }
  bucketReady = true;
}

export async function comprobanteExists(id: string): Promise<boolean> {
  const { data } = await getServerSupabase().storage.from(COMPROBANTES_BUCKET).exists(comprobantePath(id));
  return Boolean(data);
}
