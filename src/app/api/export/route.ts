import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getServerSupabase } from '@/lib/server/supabase';
import { getCategoriaLabel, getTipoComprobanteLabel, TIPO_CAMBIO_USD } from '@/lib/constants';
import { GASTO_COLUMNS, type Gasto } from '@/lib/types';

export const dynamic = 'force-dynamic';

const HEADERS = [
  'N°', 'Fecha', 'Categoría', 'Proveedor / Concepto', 'Descripción / Items', 'Observaciones',
  'Tipo Comprobante', 'Monto (BOB)', 'Monto (USD)', 'Enlace Comprobante',
] as const;

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await getServerSupabase()
      .from('gastos')
      .select(GASTO_COLUMNS)
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    const gastos = (data ?? []) as Gasto[];

    const origin = new URL(req.url).origin;
    const link = (g: Gasto) => (g.pdf_url ? `${origin}${g.pdf_url}` : g.drive_url ?? 'Sin comprobante');

    const rows: (string | number)[][] = [HEADERS.slice()];
    gastos.forEach((g, i) => {
      rows.push([
        i + 1,
        g.fecha,
        getCategoriaLabel(g.categoria),
        g.proveedor,
        g.descripcion ?? '',
        g.observaciones ?? '',
        getTipoComprobanteLabel(g.tipo_comprobante),
        Number(g.monto_bob),
        g.monto_usd != null ? Number(g.monto_usd) : '',
        link(g),
      ]);
    });

    const totals = new Map<string, number>();
    for (const g of gastos) {
      const cat = getCategoriaLabel(g.categoria);
      totals.set(cat, (totals.get(cat) ?? 0) + Number(g.monto_bob));
    }
    const totalGeneral = gastos.reduce((s, g) => s + Number(g.monto_bob), 0);
    const blank = () => Array<string>(HEADERS.length).fill('');
    const summaryRow = (label: string, bob: number | '', usd: number | '' = '') => {
      const r: (string | number)[] = blank();
      r[2] = label; r[7] = bob; r[8] = usd;
      return r;
    };

    rows.push(blank());
    rows.push(summaryRow('RESUMEN POR CATEGORÍA', ''));
    for (const [cat, total] of totals) rows.push(summaryRow(cat, round2(total), round2(total / TIPO_CAMBIO_USD)));
    rows.push(summaryRow('TOTAL GENERAL', round2(totalGeneral), round2(totalGeneral / TIPO_CAMBIO_USD)));
    rows.push(summaryRow(`Tipo de cambio: ${TIPO_CAMBIO_USD} Bs/USD`, ''));

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [5, 12, 25, 28, 40, 32, 34, 14, 12, 55].map((wch) => ({ wch }));
    // Make receipt links clickable
    gastos.forEach((g, i) => {
      const href = link(g);
      if (href.startsWith('http')) {
        const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 9 })];
        if (cell) cell.l = { Target: href };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rendición STLC 2026');
    const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Rendicion_STLC_2026_IEEE.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'No se pudo generar el reporte' }, { status: 500 });
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
