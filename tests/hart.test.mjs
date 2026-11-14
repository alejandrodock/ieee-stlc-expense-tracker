import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { validateExpense, convertedUsd } from '../hart-registro-fondos-ieee/src/domain.ts';
import { buildHartPdf } from '../hart-registro-fondos-ieee/src/pdf.ts';
import { buildHartReport } from '../hart-registro-fondos-ieee/src/report.ts';

function crc32(bytes) { let crc = -1; for (const b of bytes) { crc ^= b; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }
function chunk(type, bytes) { const body = Buffer.concat([Buffer.from(type), bytes]); const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([size, body, crc]); }
export function signaturePng() {
  const header = Buffer.alloc(13); header.writeUInt32BE(200, 0); header.writeUInt32BE(80, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(80 * (1 + 200 * 4));
  for (let y = 0; y < 80; y++) for (let x = 0; x < 200; x++) { const i = y * 801 + 1 + x * 4; if (Math.abs(y - (40 + 20 * Math.sin(x / 15))) < 2) { pixels[i] = 20; pixels[i + 1] = 30; pixels[i + 2] = 50; pixels[i + 3] = 255; } }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
const base = () => ({ id: '623ca6f5-70ca-4fa7-95a0-41aec20238cc', fecha: '2026-11-13', categoria: 'alimentacion', proveedor: 'Proveedor de prueba', descripcion: 'Alimentación durante viaje HART', original_amount: 18, original_currency: 'USD', exchange_rate: 1, has_receipt: false, signer_name: 'Voluntario de prueba', signature: `data:image/png;base64,${signaturePng().toString('base64')}`, rate_source: 'manual', rate_date: null });

test('USD 18 without receipt requires signature and produces an affidavit with an embedded image', async () => {
  const expense = validateExpense(base());
  assert.equal(expense.amount_usd, 18);
  const pdf = await PDFDocument.load(await buildHartPdf(expense));
  assert.equal(pdf.getSubject(), 'IEEE Expense Affidavit');
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(pdf.getPage(0).node.Resources().lookup(PDFName.of('XObject')).keys().length > 0);
  assert.throws(() => validateExpense({ ...base(), signature: '' }), /Firma/);
  assert.throws(() => validateExpense({ ...base(), signer_name: '' }), /signer_name/);
});
test('25 USD boundary, including rounding from other currencies, cannot bypass receipts', () => {
  assert.equal(validateExpense({ ...base(), original_amount: 24.99 }).amount_usd, 24.99);
  for (const original_amount of [25, 25.01, 100]) assert.throws(() => validateExpense({ ...base(), original_amount }), /comprobante|factura/);
  assert.throws(() => validateExpense({ ...base(), original_currency: 'EUR', original_amount: 22.72, exchange_rate: 1.1002 }), /factura/);
  assert.equal(convertedUsd(22.72, 1.1002), 25);
});
test('EUR and BOB amounts convert to USD; client totals do not override calculated totals', () => {
  assert.equal(validateExpense({ ...base(), original_currency: 'EUR', original_amount: 10, exchange_rate: 1.15, amount_usd: 1 }).amount_usd, 11.5);
  assert.equal(validateExpense({ ...base(), original_currency: 'BOB', original_amount: 100, exchange_rate: 0.14 }).amount_usd, 14);
  assert.throws(() => validateExpense({ ...base(), exchange_rate: 0.1 }), /USD/);
  assert.throws(() => validateExpense({ ...base(), original_currency: 'GBP' }), /Moneda/);
  assert.throws(() => validateExpense({ ...base(), project_id: 'STLC' }), /Proyecto/);
  assert.throws(() => validateExpense({ ...base(), original_amount: 0.001 }), /Monto/);
  assert.throws(() => validateExpense({ ...base(), fecha: '2026-02-30' }), /Fecha/);
  assert.throws(() => validateExpense({ ...base(), original_currency: 'EUR', exchange_rate: NaN }), /cambio/);
});
test('receipt is mandatory at the PDF generation boundary; valid PDFs keep their original pages', async () => {
  const expense = validateExpense({ ...base(), has_receipt: true, original_amount: 100 });
  await assert.rejects(buildHartPdf(expense), /comprobante/);
  const original = await PDFDocument.create(); original.addPage(); original.addPage();
  const pdf = await PDFDocument.load(await buildHartPdf(expense, { bytes: await original.save(), mime: 'application/pdf' }));
  assert.equal(pdf.getPageCount(), 3);
  await assert.rejects(buildHartPdf(expense, { bytes: new Uint8Array([1,2,3]), mime: 'application/pdf' }));
});
test('Excel preserves original currency, rate, USD total and project-scoped receipt links', async () => {
  const expense = { ...validateExpense({ ...base(), original_currency: 'EUR', original_amount: 10, exchange_rate: 1.15 }), project_id: 'HART', pdf_url: '/ignored', created_at: '2026-11-13' };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildHartReport([expense], 'https://example.test'));
  const ws = wb.getWorksheet('Gastos HART');
  assert.equal(ws.getCell('A2').value, 'HART');
  assert.equal(ws.getCell('C2').value, 10);
  assert.equal(ws.getCell('D2').value, 'EUR');
  assert.equal(ws.getCell('E2').value, 1.15);
  assert.equal(ws.getCell('F2').value, 11.5);
  assert.match(ws.getCell('I2').value.hyperlink, /\/api\/hart\/comprobantes\//);
  assert.equal(wb.getWorksheet('Resumen HART').getCell('B2').value, 9000);
});

test('protected PDF receipts are archived byte-for-byte instead of losing their original content', async () => {
  const original = await PDFDocument.create(); original.addPage();
  // An encryption dictionary marks this structural fixture as protected.
  original.context.trailerInfo.Encrypt = original.context.register(original.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4 }));
  const bytes = await original.save({ useObjectStreams: false });
  const expense = validateExpense({ ...base(), has_receipt: true, original_amount: 30 });
  assert.deepEqual(await buildHartPdf(expense, { bytes, mime: 'application/pdf' }), bytes);
});
