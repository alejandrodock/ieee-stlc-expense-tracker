import { NextResponse } from 'next/server';
import { getFirmaPng } from '@/lib/server/firma';

export const dynamic = 'force-dynamic';

/** GET /api/firma -> signature PNG used on the expense declaration PDF (404 if not configured). */
export async function GET() {
  const png = getFirmaPng();
  if (!png) return NextResponse.json({ error: 'Firma no configurada' }, { status: 404 });
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}
