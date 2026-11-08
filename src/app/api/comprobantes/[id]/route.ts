import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server/supabase';
import { isUuid } from '@/lib/server/validation';
import { COMPROBANTES_BUCKET, comprobantePath } from '@/lib/server/storage';
import { generatePdfFilename } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * Stable link to an expense's receipt (used by the app and the Excel export).
 * Redirects to a short-lived signed URL of the private bucket, or to the legacy
 * Google Drive link for older records.
 *
 * `?descargar=1` forces a download named after the expense data
 * (e.g. `20261107_Catering_Coffee_Break_Hipermaxi_150_00BOB.pdf`).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const download = req.nextUrl.searchParams.get('descargar') === '1';

  try {
    const supabase = getServerSupabase();
    const { data: gasto, error } = await supabase
      .from('gastos')
      .select('id, fecha, categoria, proveedor, monto_bob, pdf_url, drive_url')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!gasto) return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });

    if (gasto.pdf_url) {
      const filename = generatePdfFilename(gasto.fecha, gasto.categoria, gasto.proveedor, Number(gasto.monto_bob));
      const { data, error: signError } = await supabase.storage
        .from(COMPROBANTES_BUCKET)
        .createSignedUrl(comprobantePath(id), 60 * 10, download ? { download: filename } : undefined);
      if (!signError && data?.signedUrl) {
        return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'no-store' } });
      }
    }
    if (gasto.drive_url) return NextResponse.redirect(gasto.drive_url, 302);

    return NextResponse.json({ error: 'Este gasto no tiene comprobante' }, { status: 404 });
  } catch (error) {
    console.error('GET comprobante error:', error);
    return NextResponse.json({ error: 'No se pudo abrir el comprobante' }, { status: 500 });
  }
}
