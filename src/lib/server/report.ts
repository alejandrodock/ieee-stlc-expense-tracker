import 'server-only';
import ExcelJS from 'exceljs';
import {
  CATEGORIAS, MONTO_ASIGNADO_USD, PRESUPUESTO_INICIAL, RESPONSABLE_PERFIL, TIPO_CAMBIO_USD,
  getCategoriaLabel, getTipoComprobanteLabel, type Lang,
} from '@/lib/constants';
import type { Gasto } from '@/lib/types';

const EVENT = 'IEEE Student Tech Leadership Conference';
const VENUE = 'Universidad Mayor de San Andrés · La Paz, Bolivia · 2026';

const T = {
  es: {
    sheet: 'Rendición STLC 2026',
    report: 'RENDICIÓN DE FONDOS',
    generated: 'Generado el',
    holder: 'DATOS DEL RESPONSABLE DE FONDOS',
    name: 'Nombre', role: 'Cargo', member: 'N° de membresía IEEE', ci: 'N° de C.I.', email: 'Correo electrónico', phone: 'N° de celular',
    assignedUsd: 'Monto total asignado (USD)', assignedBob: 'Monto total asignado (Bs)', rate: 'Tipo de cambio',
    rateValue: `${TIPO_CAMBIO_USD.toFixed(2).replace('.', ',')} Bs por USD`,
    summary: 'RESUMEN DE EJECUCIÓN',
    spentBob: 'Total ejecutado (Bs)', spentUsd: 'Total ejecutado (USD)', balBob: 'Saldo (Bs)', balUsd: 'Saldo (USD)',
    pct: '% de ejecución', count: 'N° de gastos registrados', withDoc: 'Gastos con comprobante', noDoc: 'Gastos sin comprobante',
    byCat: 'RESUMEN POR CATEGORÍA',
    cat: 'Categoría', nItems: 'N° de gastos', share: '% del total',
    detail: 'DETALLE DE GASTOS',
    cols: ['N°', 'Fecha', 'Categoría', 'Proveedor o concepto', 'Descripción de los elementos', 'Observaciones', 'Tipo de comprobante', 'Monto (Bs)', 'Monto (USD)', 'Comprobante'],
    total: 'TOTAL', view: 'Ver PDF', none: 'Sin comprobante', noExpenses: 'No hay gastos registrados.',
    signTitle: 'FIRMA DEL RESPONSABLE',
    signHere: 'Firma digital',
    declaration:
      'Declaro que la información contenida en esta rendición es verdadera y que los gastos detallados fueron realizados ' +
      'exclusivamente para las actividades del evento, con los comprobantes adjuntos en cada registro.',
    date: 'Fecha', place: 'Lugar', placeValue: 'La Paz, Bolivia',
    dateFmt: 'dd/mm/yyyy',
    file: 'Rendicion_STLC_2026_IEEE.xlsx',
  },
  en: {
    sheet: 'STLC 2026 Expense Report',
    report: 'EXPENSE REPORT',
    generated: 'Generated on',
    holder: 'FUND HOLDER INFORMATION',
    name: 'Name', role: 'Position', member: 'IEEE Membership No.', ci: 'National ID No. (C.I.)', email: 'Email', phone: 'Mobile number',
    assignedUsd: 'Total allocated amount (USD)', assignedBob: 'Total allocated amount (BOB)', rate: 'Exchange rate',
    rateValue: `${TIPO_CAMBIO_USD.toFixed(2)} BOB per USD`,
    summary: 'EXECUTION SUMMARY',
    spentBob: 'Total spent (BOB)', spentUsd: 'Total spent (USD)', balBob: 'Balance (BOB)', balUsd: 'Balance (USD)',
    pct: 'Execution rate', count: 'Expenses recorded', withDoc: 'Expenses with receipt', noDoc: 'Expenses without receipt',
    byCat: 'SUMMARY BY CATEGORY',
    cat: 'Category', nItems: 'No. of expenses', share: '% of total',
    detail: 'EXPENSE DETAIL',
    cols: ['No.', 'Date', 'Category', 'Vendor or item', 'Item description', 'Notes', 'Receipt type', 'Amount (BOB)', 'Amount (USD)', 'Receipt'],
    total: 'TOTAL', view: 'View PDF', none: 'No receipt', noExpenses: 'No expenses recorded.',
    signTitle: 'FUND HOLDER SIGNATURE',
    signHere: 'Digital signature',
    declaration:
      'I declare that the information in this report is true and that the expenses listed were incurred exclusively ' +
      'for the activities of the event, with the supporting documents attached to each record.',
    date: 'Date', place: 'Place', placeValue: 'La Paz, Bolivia',
    dateFmt: 'yyyy-mm-dd',
    file: 'Expense_Report_STLC_2026_IEEE.xlsx',
  },
} as const;

export const reportFilename = (lang: Lang) => T[lang].file;

// Palette (ARGB)
const NAVY = 'FF0B2A45';
const BLUE = 'FF00629B';
const SOFT = 'FFEFF4F8';
const LINE = 'FFC9D4DE';
const MUTED = 'FF5F7489';
const WHITE = 'FFFFFFFF';
const MONEY = '#,##0.00';

const thin = { style: 'thin' as const, color: { argb: LINE } };
const medium = { style: 'medium' as const, color: { argb: BLUE } };
const allThin = { top: thin, left: thin, bottom: thin, right: thin };

const round2 = (n: number) => Math.round(n * 100) / 100;

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function buildReport(gastos: Gasto[], lang: Lang, origin: string): Promise<Buffer> {
  const t = T[lang];
  const wb = new ExcelJS.Workbook();
  wb.creator = RESPONSABLE_PERFIL.nombre;
  wb.created = new Date();
  const ws = wb.addWorksheet(t.sheet, {
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: { oddFooter: `&L${EVENT}&R&P / &N` },
    views: [{ showGridLines: false }],
  });
  ws.columns = [6, 12, 24, 26, 40, 30, 32, 15, 14, 16].map((width) => ({ width }));

  const totalBob = round2(gastos.reduce((s, g) => s + Number(g.monto_bob), 0));
  // USD por gasto = el guardado en cada registro; todos los totales suman esos mismos valores.
  const usdOf = (g: Gasto) => (g.monto_usd != null ? Number(g.monto_usd) : round2(Number(g.monto_bob) / TIPO_CAMBIO_USD));
  const totalUsd = round2(gastos.reduce((s, g) => s + usdOf(g), 0));

  /** Draws an outer border around a cell rectangle, keeping inner borders. */
  const outline = (r1: number, c1: number, r2: number, c2: number, edge: Partial<ExcelJS.Border>) => {
    for (let row = r1; row <= r2; row++) {
      for (let col = c1; col <= c2; col++) {
        const cell = ws.getRow(row).getCell(col);
        const b: Partial<ExcelJS.Borders> = { ...(cell.border ?? {}) };
        if (row === r1) b.top = edge;
        if (row === r2) b.bottom = edge;
        if (col === c1) b.left = edge;
        if (col === c2) b.right = edge;
        cell.border = b;
      }
    }
  };
  const conDoc = gastos.filter((g) => g.pdf_url || g.drive_url).length;

  /** Merge a range and style it as a section bar. */
  const sectionBar = (row: number, text: string, from = 'A', to = 'J') => {
    ws.mergeCells(`${from}${row}:${to}${row}`);
    const c = ws.getCell(`${from}${row}`);
    c.value = text;
    c.font = { bold: true, size: 10, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(row).height = 20;
  };

  // ── Encabezado ──────────────────────────────────────────────
  ws.mergeCells('A1:J1');
  Object.assign(ws.getCell('A1'), {
    value: EVENT,
    font: { bold: true, size: 16, color: { argb: WHITE } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } },
    alignment: { vertical: 'middle', indent: 1 },
  });
  ws.getRow(1).height = 30;
  ws.mergeCells('A2:J2');
  Object.assign(ws.getCell('A2'), {
    value: VENUE,
    font: { size: 10, color: { argb: WHITE } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } },
    alignment: { vertical: 'middle', indent: 1 },
  });
  ws.mergeCells('A3:J3');
  const generated = new Intl.DateTimeFormat(lang === 'es' ? 'es-BO' : 'en-US', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'America/La_Paz',
  }).format(new Date());
  Object.assign(ws.getCell('A3'), {
    value: `${t.report}  ·  ${t.generated} ${generated}`,
    font: { bold: true, size: 9, color: { argb: 'FFB8C7D6' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } },
    alignment: { vertical: 'middle', indent: 1 },
  });
  ws.getRow(3).height = 18;

  // ── Carimbo: responsable (A–F) + resumen (G–J) ─────────────
  let r = 5;
  sectionBar(r, t.holder, 'A', 'F');
  sectionBar(r, t.summary, 'G', 'J');
  r++;

  const holder: [string, string | number, string?][] = [
    [t.name, RESPONSABLE_PERFIL.nombre],
    [t.role, RESPONSABLE_PERFIL.cargo],
    [t.ci, Number(RESPONSABLE_PERFIL.ci), '0'],
    [t.member, Number(RESPONSABLE_PERFIL.membresiaIeee), '0'],
    [t.email, RESPONSABLE_PERFIL.correo],
    [t.phone, RESPONSABLE_PERFIL.celular],
    [t.assignedUsd, MONTO_ASIGNADO_USD, MONEY],
    [t.assignedBob, PRESUPUESTO_INICIAL, MONEY],
    [t.rate, t.rateValue],
  ];
  const summary: [string, number, string][] = [
    [t.spentBob, totalBob, MONEY],
    [t.spentUsd, totalUsd, MONEY],
    [t.balBob, round2(PRESUPUESTO_INICIAL - totalBob), MONEY],
    [t.balUsd, round2(MONTO_ASIGNADO_USD - totalUsd), MONEY],
    [t.pct, PRESUPUESTO_INICIAL ? totalBob / PRESUPUESTO_INICIAL : 0, '0.0%'],
    [t.count, gastos.length, '0'],
    [t.withDoc, conDoc, '0'],
    [t.noDoc, gastos.length - conDoc, '0'],
  ];

  const stampTop = r;
  holder.forEach(([label, value, fmt], i) => {
    const row = r + i;
    ws.mergeCells(`A${row}:C${row}`);
    ws.mergeCells(`D${row}:F${row}`);
    const l = ws.getCell(`A${row}`);
    l.value = label;
    l.font = { bold: true, size: 9, color: { argb: MUTED } };
    l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
    l.alignment = { vertical: 'middle', indent: 1 };
    const v = ws.getCell(`D${row}`);
    v.value = value;
    v.font = { size: 10, bold: i === 0 || i >= 5, color: { argb: 'FF14283E' } };
    v.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    if (fmt) v.numFmt = fmt;
    ws.getRow(row).height = i === 1 ? 30 : 18;
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) ws.getCell(`${col}${row}`).border = allThin;
  });
  summary.forEach(([label, value, fmt], i) => {
    const row = r + i;
    ws.mergeCells(`G${row}:H${row}`);
    ws.mergeCells(`I${row}:J${row}`);
    const l = ws.getCell(`G${row}`);
    l.value = label;
    l.font = { bold: true, size: 9, color: { argb: MUTED } };
    l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
    l.alignment = { vertical: 'middle', indent: 1 };
    const v = ws.getCell(`I${row}`);
    v.value = value;
    v.numFmt = fmt;
    v.font = { size: 10, bold: i < 4 };
    v.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    for (const col of ['G', 'H', 'I', 'J']) ws.getCell(`${col}${row}`).border = allThin;
  });
  // marco del carimbo
  const stampBottom = r + holder.length - 1;
  for (let row = stampTop; row <= stampBottom; row++) {
    ws.getCell(`A${row}`).border = { ...allThin, left: medium };
    ws.getCell(`J${row}`).border = { ...allThin, right: medium };
  }
  for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
    const c = ws.getCell(`${col}${stampBottom}`);
    c.border = { ...(c.border ?? allThin), bottom: medium };
  }
  r = stampBottom + 2;

  // ── Resumen por categoría ──────────────────────────────────
  sectionBar(r, t.byCat);
  r++;
  const catHeader = ws.getRow(r);
  ws.mergeCells(`A${r}:E${r}`);
  catHeader.getCell(1).value = t.cat;
  catHeader.getCell(6).value = t.nItems;
  catHeader.getCell(7).value = t.share;
  catHeader.getCell(8).value = t.cols[7];
  catHeader.getCell(9).value = t.cols[8];
  styleHeaderRow(catHeader, [1, 6, 7, 8, 9]);
  r++;
  const catFirst = r;
  for (const cat of CATEGORIAS) {
    const items = gastos.filter((g) => g.categoria === cat.value);
    const bob = round2(items.reduce((s, g) => s + Number(g.monto_bob), 0));
    const row = ws.getRow(r);
    ws.mergeCells(`A${r}:E${r}`);
    row.getCell(1).value = getCategoriaLabel(cat.value, lang);
    row.getCell(6).value = items.length;
    row.getCell(7).value = totalBob ? bob / totalBob : 0;
    row.getCell(7).numFmt = '0.0%';
    row.getCell(8).value = bob;
    row.getCell(8).numFmt = MONEY;
    row.getCell(9).value = round2(items.reduce((s, g) => s + usdOf(g), 0));
    row.getCell(9).numFmt = MONEY;
    styleBodyRow(row, [1, 2, 3, 4, 5, 6, 7, 8, 9], r % 2 === 0);
    row.getCell(1).alignment = { indent: 1 };
    row.getCell(6).alignment = { horizontal: 'center' };
    r++;
  }
  const catTotal = ws.getRow(r);
  ws.mergeCells(`A${r}:E${r}`);
  catTotal.getCell(1).value = t.total;
  catTotal.getCell(6).value = { formula: `SUM(F${catFirst}:F${r - 1})`, result: gastos.length };
  catTotal.getCell(7).value = totalBob ? 1 : 0;
  catTotal.getCell(7).numFmt = '0.0%';
  catTotal.getCell(8).value = { formula: `SUM(H${catFirst}:H${r - 1})`, result: totalBob };
  catTotal.getCell(8).numFmt = MONEY;
  catTotal.getCell(9).value = { formula: `SUM(I${catFirst}:I${r - 1})`, result: totalUsd };
  catTotal.getCell(9).numFmt = MONEY;
  styleTotalRow(catTotal, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  catTotal.getCell(6).alignment = { horizontal: 'center' };
  r += 2;

  // ── Detalle de gastos ──────────────────────────────────────
  sectionBar(r, t.detail);
  r++;
  const head = ws.getRow(r);
  t.cols.forEach((h, i) => (head.getCell(i + 1).value = h));
  styleHeaderRow(head, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  head.height = 22;
  r++;

  const detFirst = r;
  if (gastos.length === 0) {
    ws.mergeCells(`A${r}:J${r}`);
    ws.getCell(`A${r}`).value = t.noExpenses;
    ws.getCell(`A${r}`).font = { italic: true, color: { argb: MUTED } };
    r++;
  }
  gastos.forEach((g, i) => {
    const row = ws.getRow(r);
    const bob = Number(g.monto_bob);
    const usd = usdOf(g);
    const href = g.pdf_url ? `${origin}${g.pdf_url}` : g.drive_url;
    row.values = [
      i + 1,
      toDate(g.fecha),
      getCategoriaLabel(g.categoria, lang),
      g.proveedor,
      g.descripcion ?? '',
      g.observaciones ?? '',
      getTipoComprobanteLabel(g.tipo_comprobante, lang),
      bob,
      usd,
      href ? { text: t.view, hyperlink: href } : t.none,
    ];
    row.getCell(2).numFmt = t.dateFmt;
    row.getCell(8).numFmt = MONEY;
    row.getCell(9).numFmt = MONEY;
    styleBodyRow(row, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], i % 2 === 1);
    for (const c of [3, 4, 5, 6, 7]) row.getCell(c).alignment = { vertical: 'top', wrapText: true };
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'top', horizontal: 'center' };
    row.getCell(10).alignment = { vertical: 'top', horizontal: 'center' };
    row.getCell(10).font = href ? { color: { argb: BLUE }, underline: true, size: 9 } : { color: { argb: 'FFB45309' }, size: 9 };
    r++;
  });
  const detTotal = ws.getRow(r);
  ws.mergeCells(`A${r}:G${r}`);
  detTotal.getCell(1).value = t.total;
  detTotal.getCell(8).value = { formula: `SUM(H${detFirst}:H${Math.max(detFirst, r - 1)})`, result: totalBob };
  detTotal.getCell(8).numFmt = MONEY;
  detTotal.getCell(9).value = { formula: `SUM(I${detFirst}:I${Math.max(detFirst, r - 1)})`, result: totalUsd };
  detTotal.getCell(9).numFmt = MONEY;
  styleTotalRow(detTotal, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  ws.autoFilter = { from: { row: detFirst - 1, column: 1 }, to: { row: Math.max(detFirst, r - 1), column: 10 } };
  r += 3;

  // ── Carimbo de firma ───────────────────────────────────────
  const signTop = r;
  sectionBar(r, t.signTitle);
  r++;
  // Declaración (A–E) | recuadro para la firma (F–J) con línea de firma al pie
  const boxRows = 6;
  const boxTop = r;
  ws.mergeCells(`A${r}:E${r + boxRows - 1}`);
  Object.assign(ws.getCell(`A${r}`), {
    value: t.declaration,
    font: { size: 9, italic: true, color: { argb: 'FF14283E' } },
    alignment: { vertical: 'middle', wrapText: true, indent: 1 },
  });
  ws.mergeCells(`F${r}:J${r + boxRows - 2}`);
  ws.getCell(`F${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBFCFE' } };
  ws.mergeCells(`F${r + boxRows - 1}:J${r + boxRows - 1}`);
  Object.assign(ws.getCell(`F${r + boxRows - 1}`), {
    value: t.signHere,
    font: { size: 8, color: { argb: MUTED } },
    alignment: { vertical: 'middle', horizontal: 'center' },
  });
  for (let i = 0; i < boxRows; i++) ws.getRow(r + i).height = i === boxRows - 1 ? 16 : 20;
  outline(boxTop, 6, boxTop + boxRows - 1, 10, thin);
  // línea de firma
  for (let col = 7; col <= 9; col++) {
    const c = ws.getRow(boxTop + boxRows - 2).getCell(col);
    c.border = { ...(c.border ?? {}), bottom: { style: 'thin', color: { argb: 'FF14283E' } } };
  }
  r += boxRows;

  const signRows: [string, string | number][] = [
    [t.name, RESPONSABLE_PERFIL.nombre],
    [t.role, RESPONSABLE_PERFIL.cargo],
    [t.ci, Number(RESPONSABLE_PERFIL.ci)],
    [t.member, Number(RESPONSABLE_PERFIL.membresiaIeee)],
    [t.place, t.placeValue],
    [t.date, ''],
  ];
  signRows.forEach(([label, value], i) => {
    const row = r + i;
    ws.mergeCells(`A${row}:C${row}`);
    ws.mergeCells(`D${row}:J${row}`);
    Object.assign(ws.getCell(`A${row}`), {
      value: label,
      font: { bold: true, size: 9, color: { argb: MUTED } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } },
      alignment: { vertical: 'middle', indent: 1 },
    });
    Object.assign(ws.getCell(`D${row}`), {
      value,
      font: { size: 10, bold: i === 0 },
      numFmt: '0',
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 },
    });
    ws.getRow(row).height = i === 1 ? 28 : 18;
  });
  const signBottom = r + signRows.length - 1;

  // Bordes del carimbo de firma
  for (let row = boxTop + boxRows; row <= signBottom; row++) {
    for (let col = 1; col <= 10; col++) ws.getRow(row).getCell(col).border = allThin;
  }
  outline(signTop + 1, 1, signBottom, 10, medium);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function styleHeaderRow(row: ExcelJS.Row, cols: number[]) {
  for (const c of cols) {
    const cell = row.getCell(c);
    cell.font = { bold: true, size: 9, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = allThin;
  }
}

function styleBodyRow(row: ExcelJS.Row, cols: number[], zebra: boolean) {
  for (const c of cols) {
    const cell = row.getCell(c);
    cell.font = { size: 9, ...(cell.font ?? {}) };
    cell.border = allThin;
    if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7FAFC' } };
  }
}

function styleTotalRow(row: ExcelJS.Row, cols: number[]) {
  for (const c of cols) {
    const cell = row.getCell(c);
    cell.font = { bold: true, size: 10, color: { argb: NAVY } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE8F2' } };
    cell.border = { ...allThin, top: medium, bottom: medium };
  }
  row.getCell(1).alignment = { horizontal: 'right', indent: 1 };
  row.height = 20;
}
