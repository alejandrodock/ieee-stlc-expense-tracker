import ExcelJS from 'exceljs';
import { categoryLabel, DEFAULT_BUDGET_USD, type Expense } from './domain.ts';

export async function buildHartReport(expenses: Expense[], origin: string, budget = DEFAULT_BUDGET_USD) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IEEE HART 2026';
  const summary = wb.addWorksheet('Resumen HART');
  summary.addRows([
    ['IEEE HART 2026 — Rendición de fondos'],
    ['Presupuesto (USD)', budget],
    ['Total gastado (USD)', { formula: "SUM('Gastos HART'!F2:F1048576)", result: expenses.reduce((s, e) => s + Number(e.amount_usd), 0) }],
    ['Saldo (USD)', { formula: 'B2-B3', result: budget - expenses.reduce((s, e) => s + Number(e.amount_usd), 0) }],
    [], ['Categoría', 'Total (USD)'],
  ]);
  const categories = [...new Set(expenses.map(e => e.categoria))];
  for (const key of categories) summary.addRow([categoryLabel(key), expenses.filter(e => e.categoria === key).reduce((s, e) => s + Number(e.amount_usd), 0)]);
  summary.getColumn(1).width = 55;
  summary.getColumn(2).width = 22;
  summary.getColumn(2).numFmt = '#,##0.00';
  const ws = wb.addWorksheet('Gastos HART', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    ['Proyecto', 15], ['Fecha', 14], ['Monto Original', 19], ['Moneda', 12], ['Tipo de Cambio', 20], ['Total (USD)', 18],
    ['Categoría', 45], ['Proveedor', 30], ['Enlace Comprobante', 28], ['Descripción', 50], ['Respaldo', 22], ['Origen tasa', 18], ['Fecha tasa', 26],
  ].map(([header, width]) => ({ header: String(header), width: Number(width) }));
  expenses.forEach(e => ws.addRow([
    'HART', e.fecha, Number(e.original_amount), e.original_currency, Number(e.exchange_rate), Number(e.amount_usd),
    categoryLabel(e.categoria), e.proveedor,
    { text: e.has_receipt ? 'Ver comprobante' : 'Ver declaración firmada', hyperlink: `${origin}/api/hart/comprobantes/${e.id}` },
    e.descripcion, e.has_receipt ? 'Factura / recibo' : 'Declaración jurada', e.rate_source, e.rate_date ?? '',
  ]));
  ws.autoFilter = 'A1:M1';
  for (const index of [3, 6]) ws.getColumn(index).numFmt = '#,##0.00';
  ws.getColumn(5).numFmt = '0.000000000000';
  for (const sheet of [ws, summary]) {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00629B' } };
    sheet.getRow(1).height = 30;
  }
  return wb.xlsx.writeBuffer();
}
