import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server/supabase';
import { isUuid } from '@/lib/server/validation';
import { COMPROBANTES_BUCKET, comprobantePath, ensureComprobantesBucket, MAX_PDF_BYTES } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

/**
 * POST { id } -> one-time signed upload URL for `<id>.pdf`.
 * The browser PUTs the PDF straight to Supabase Storage, so large receipts never
 * pass through the serverless function (Vercel caps request bodies at 4.5 MB).
 */
export async function POST(req: NextRequest) {
  let id: unknown;
  try {
    ({ id } = await req.json());
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!isUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  try {
    await ensureComprobantesBucket();
    const { data, error } = await getServerSupabase()
      .storage.from(COMPROBANTES_BUCKET)
      .createSignedUploadUrl(comprobantePath(id), { upsert: true });
    if (error || !data) throw error ?? new Error('Sin URL firmada');
    return NextResponse.json({ signedUrl: data.signedUrl, maxBytes: MAX_PDF_BYTES });
  } catch (error) {
    console.error('Signed upload URL error:', error);
    return NextResponse.json({ error: 'No se pudo preparar la subida' }, { status: 500 });
  }
}
