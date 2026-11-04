import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { getCategoriaLabel, getTipoComprobanteLabel } from '@/lib/constants';

export async function GET() {
  try {
    const supabase = createServerSupabase();

    const { data: gastos, error } = await supabase
      .from('gastos')
      .select('*')
      .order('fecha', { ascending: true });

    if (error) throw error;

    // Prepare data for Excel
    const rows = (gastos || []).map((g, index) => ({
      'N°': index + 1,
      'Fecha': g.fecha,
      'Categoría': getCategoriaLabel(g.categoria),
      'Proveedor / Concepto': g.proveedor,
      'Descripción / Items': g.descripcion || 'Sin detalle específico',
      'Tipo Comprobante': getTipoComprobanteLabel(g.tipo_comprobante),
      'Monto (BOB)': g.monto_bob,
      'Monto (USD)': g.monto_usd || '',
      'Enlace Comprobante': g.drive_url || 'Pendiente',
    }));

    // Calculate totals by category
    const totalsByCategory: Record<string, number> = {};
    (gastos || []).forEach(g => {
      const cat = getCategoriaLabel(g.categoria);
      totalsByCategory[cat] = (totalsByCategory[cat] || 0) + g.monto_bob;
    });

    const totalGeneral = (gastos || []).reduce((sum, g) => sum + g.monto_bob, 0);

    // Add empty row and summary
    rows.push({
      'N°': '' as unknown as number,
      'Fecha': '',
      'Categoría': '',
      'Proveedor / Concepto': '',
      'Descripción / Items': '',
      'Tipo Comprobante': '',
      'Monto (BOB)': '' as unknown as number,
      'Monto (USD)': '',
      'Enlace Comprobante': '',
    });

    rows.push({
      'N°': '' as unknown as number,
      'Fecha': '',
      'Categoría': 'RESUMEN POR CATEGORÍA',
      'Proveedor / Concepto': '',
      'Descripción / Items': '',
      'Tipo Comprobante': '',
      'Monto (BOB)': '' as unknown as number,
      'Monto (USD)': '',
      'Enlace Comprobante': '',
    });

    Object.entries(totalsByCategory).forEach(([cat, total]) => {
      rows.push({
        'N°': '' as unknown as number,
        'Fecha': '',
        'Categoría': cat,
        'Proveedor / Concepto': '',
        'Descripción / Items': '',
        'Tipo Comprobante': '',
        'Monto (BOB)': total,
        'Monto (USD)': '' as unknown as string,
        'Enlace Comprobante': '',
      });
    });

    rows.push({
      'N°': '' as unknown as number,
      'Fecha': '',
      'Categoría': 'TOTAL GENERAL',
      'Proveedor / Concepto': '',
      'Descripción / Items': '',
      'Tipo Comprobante': '',
      'Monto (BOB)': totalGeneral,
      'Monto (USD)': '' as unknown as string,
      'Enlace Comprobante': '',
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Set column widths
    ws['!cols'] = [
      { wch: 5 },   // N°
      { wch: 12 },  // Fecha
      { wch: 25 },  // Categoría
      { wch: 28 },  // Proveedor
      { wch: 35 },  // Descripción / Items
      { wch: 30 },  // Tipo Comprobante
      { wch: 15 },  // Monto BOB
      { wch: 12 },  // Monto USD
      { wch: 50 },  // Enlace
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Rendición STLC 2026');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Rendicion_STLC_2026_IEEE.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
