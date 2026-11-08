import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server/supabase';
import { isUuid } from '@/lib/server/validation';
import { MEDIA_BUCKET } from '@/lib/server/media';

export const dynamic = 'force-dynamic';

async function findMedia(id: string) {
  const { data, error } = await getServerSupabase()
    .from('gasto_media')
    .select('id, path, nombre')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; path: string; nombre: string | null } | null;
}

/** GET /api/media/<id>[?descargar=1] -> redirect to a short-lived signed URL. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    const media = await findMedia(id);
    if (!media) return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    const download = req.nextUrl.searchParams.get('descargar') === '1';
    const { data, error } = await getServerSupabase().storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(media.path, 60 * 30, download ? { download: media.nombre ?? true } : undefined);
    if (error || !data) throw error ?? new Error('Sin URL firmada');
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, max-age=600' } });
  } catch (error) {
    console.error('GET media error:', error);
    return NextResponse.json({ error: 'No se pudo abrir el archivo' }, { status: 500 });
  }
}

/** DELETE /api/media/<id> -> removes the row and the stored file. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    const media = await findMedia(id);
    if (!media) return NextResponse.json({ success: true });
    const supabase = getServerSupabase();
    const { error } = await supabase.from('gasto_media').delete().eq('id', id);
    if (error) throw error;
    const { error: sErr } = await supabase.storage.from(MEDIA_BUCKET).remove([media.path]);
    if (sErr) console.warn('Media file cleanup failed (non-fatal):', sErr.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE media error:', error);
    return NextResponse.json({ error: 'No se pudo eliminar el archivo' }, { status: 500 });
  }
}
