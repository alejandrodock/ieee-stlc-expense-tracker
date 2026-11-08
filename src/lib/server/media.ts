import 'server-only';
import { getServerSupabase } from './supabase';
import { MAX_MEDIA_MB } from '@/lib/constants';

/** Private bucket with photos / videos of each expense: `<gasto id>/<media id>.<ext>`. */
export const MEDIA_BUCKET = 'evidencias';
export const MAX_MEDIA_BYTES = MAX_MEDIA_MB * 1024 * 1024;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp', 'video/x-matroska': 'mkv',
};

export const isAllowedMediaType = (mime: unknown): mime is string => typeof mime === 'string' && mime in EXT;
export const mediaPath = (gastoId: string, mediaId: string, mime: string) => `${gastoId}/${mediaId}.${EXT[mime]}`;

let bucketReady = false;

/** Creates the private bucket on first use (idempotent). */
export async function ensureMediaBucket(): Promise<void> {
  if (bucketReady) return;
  const supabase = getServerSupabase();
  const { data } = await supabase.storage.getBucket(MEDIA_BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(MEDIA_BUCKET, {
      public: false,
      fileSizeLimit: MAX_MEDIA_BYTES,
      allowedMimeTypes: Object.keys(EXT),
    });
    if (error && !/already exists/i.test(error.message)) throw new Error(`No se pudo crear el bucket: ${error.message}`);
  }
  bucketReady = true;
}

/** Removes every stored file of an expense (used when the expense is deleted). */
export async function removeGastoMediaFiles(gastoId: string): Promise<void> {
  const storage = getServerSupabase().storage.from(MEDIA_BUCKET);
  const { data } = await storage.list(gastoId);
  if (data?.length) await storage.remove(data.map((f) => `${gastoId}/${f.name}`));
}
