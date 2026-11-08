import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server/supabase';
import { buildReport, reportFilename } from '@/lib/server/report';
import { GASTO_COLUMNS, type Gasto } from '@/lib/types';
import type { Lang } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/** GET /api/export?lang=es|en -> styled Excel expense report. */
export async function GET(req: NextRequest) {
  const lang: Lang = req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'es';
  try {
    const { data, error } = await getServerSupabase()
      .from('gastos')
      .select(GASTO_COLUMNS)
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    const buffer = await buildReport((data ?? []) as Gasto[], lang, req.nextUrl.origin);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${reportFilename(lang)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'No se pudo generar el reporte' }, { status: 500 });
  }
}
