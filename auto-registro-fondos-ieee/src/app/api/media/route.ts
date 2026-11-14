import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server/supabase';
import { isUuid } from '@/lib/server/validation';
import {
  MEDIA_BUCKET, MAX_MEDIA_BYTES, ensureMediaBucket, isAllowedMediaType, mediaPath,
} from '@/lib/server/media';
import { MAX_MEDIA, MAX_MEDIA_MB } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Two-step upload of a photo / video for an expense:
 *  1. { action: 'prepare', gasto_id, mime_type, size } -> { media_id, signedUrl }
 *     The browser PUTs the file straight to Supabase Storage (no 4.5 MB Vercel limit).
 *  2. { action: 'confirm', gasto_id, media_id, mime_type, size, nombre } -> media row
 */
export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return bad('JSON inválido');
  }
  if (!isUuid(b.gasto_id)) return bad('gasto_id inválido');
  if (!isAllowedMediaType(b.mime_type)) return bad('Formato no admitido: usa fotos (JPG, PNG, WEBP, HEIC) o videos (MP4, MOV, WEBM).');
  const size = Number(b.size);
  if (!Number.isFinite(size) || size <= 0) return bad('Tamaño inválido');
  if (size > MAX_MEDIA_BYTES) return bad(`El archivo supera ${MAX_MEDIA_MB} MB.`);

  const supabase = getServerSupabase();
  try {
    const { data: gasto, error: gErr } = await supabase.from('gastos').select('id').eq('project_id', 'STLC').eq('id', b.gasto_id).maybeSingle();
    if (gErr) throw gErr;
    if (!gasto) return bad('Gasto no encontrado', 404);

    const { count, error: cErr } = await supabase
      .from('gasto_media')
      .select('id', { count: 'exact', head: true })
      .eq('gasto_id', b.gasto_id);
    if (cErr) throw cErr;
    if ((count ?? 0) >= MAX_MEDIA) return bad(`Cada gasto admite como máximo ${MAX_MEDIA} fotos o videos.`, 409);

    if (b.action === 'prepare') {
      await ensureMediaBucket();
      const mediaId = crypto.randomUUID();
      const { data, error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUploadUrl(mediaPath(b.gasto_id, mediaId, b.mime_type), { upsert: true });
      if (error || !data) throw error ?? new Error('Sin URL firmada');
      return NextResponse.json({ media_id: mediaId, signedUrl: data.signedUrl });
    }

    if (b.action === 'confirm') {
      if (!isUuid(b.media_id)) return bad('media_id inválido');
      const path = mediaPath(b.gasto_id, b.media_id, b.mime_type);
      const { data: exists } = await supabase.storage.from(MEDIA_BUCKET).exists(path);
      if (!exists) return bad('El archivo no se subió correctamente');
      const nombre = typeof b.nombre === 'string' ? b.nombre.trim().slice(0, 200) || null : null;
      const { data, error } = await supabase
        .from('gasto_media')
        .insert([{ id: b.media_id, gasto_id: b.gasto_id, path, nombre, mime_type: b.mime_type, size_bytes: Math.round(size) }])
        .select('id, nombre, mime_type, created_at')
        .single();
      if (error) throw error;
      return NextResponse.json(data, { status: 201 });
    }

    return bad('Acción desconocida');
  } catch (error) {
    console.error('Media upload error:', error);
    return bad('No se pudo procesar el archivo', 500);
  }
}
