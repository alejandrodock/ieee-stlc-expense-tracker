import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '../domain';
import { db, ensureBucket, HART_BUCKET, receiptPath, reportPath, MAX_RECEIPT_BYTES } from './db';

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!isUuid(b?.id) || !['image/jpeg', 'image/png', 'application/pdf'].includes(b.mime_type) || !Number.isFinite(b.size) || b.size <= 0 || b.size > MAX_RECEIPT_BYTES) return NextResponse.json({ error: 'Usa un PDF, JPG o PNG de hasta 20 MB.' }, { status: 400 });
    const client = db();
    // A receipt for a finalized expense must never be replaced through upload preparation.
    const existing = await client.from('gastos').select('id').eq('project_id', 'HART').eq('id', b.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return NextResponse.json({ error: 'Gasto ya registrado.' }, { status: 409 });
    await ensureBucket(client);
    const { data, error } = await client.storage.from(HART_BUCKET).createSignedUploadUrl(receiptPath(b.id), { upsert: true });
    if (error || !data) throw error;
    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (e) {
    console.error('HART upload:', e);
    return NextResponse.json({ error: 'No se pudo preparar el comprobante.' }, { status: 400 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
  try {
    const client = db();
    const { data: expense, error } = await client.from('gastos').select('id').eq('project_id', 'HART').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!expense) return NextResponse.json({ error: 'Comprobante HART no encontrado.' }, { status: 404 });
    const { data, error: signedError } = await client.storage.from(HART_BUCKET).createSignedUrl(reportPath(id), 600,
      req.nextUrl.searchParams.has('descargar') ? { download: `HART_${id}.pdf` } : undefined);
    if (signedError || !data) throw signedError;
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('HART receipt:', e);
    return NextResponse.json({ error: 'No se pudo abrir el comprobante.' }, { status: 500 });
  }
}
