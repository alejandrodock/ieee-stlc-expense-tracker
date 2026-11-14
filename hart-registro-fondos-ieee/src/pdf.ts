import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { categoryLabel, type ExpenseInput } from './domain.ts';

/** Server-generated report: neither client-supplied totals nor a client-made affidavit are trusted. */
export async function buildHartPdf(expense: ExpenseInput & { amount_usd: number }, receipt?: { bytes: Uint8Array; mime: string }) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 790;
  const clean = (s: string) => Array.from(s).map(c => { try { regular.encodeText(c); return c; } catch { return '?'; } }).join('');
  const line = (s: string, size = 11, heavy = false) => {
    const font = heavy ? bold : regular;
    const words = clean(s).split(/\s+/);
    let row = '';
    const draw = () => {
      if (y < 60) { page = doc.addPage([595, 842]); y = 790; }
      page.drawText(row, { x: 44, y, size, font, color: rgb(0.04, 0.14, 0.23) });
      y -= size + 7; row = '';
    };
    for (const word of words) {
      // Split long uninterrupted text so user-entered values never overflow the page.
      for (const chunk of word.match(/.{1,60}/g) ?? ['']) {
        if (row && font.widthOfTextAtSize(row + ' ' + chunk, size) > 507) draw();
        row += (row ? ' ' : '') + chunk;
      }
    }
    draw();
  };
  doc.setTitle(`IEEE HART 2026 - ${expense.proveedor}`);
  doc.setSubject(expense.has_receipt ? 'Comprobante de gasto HART' : 'IEEE Expense Affidavit');
  doc.setCreator('IEEE HART 2026');
  line('IEEE HART 2026', 23, true);
  line(expense.has_receipt ? 'COMPROBANTE DE GASTO' : 'DECLARACIÓN JURADA DE GASTO MINORISTA', 13, true);
  y -= 14;
  line(`Proyecto: HART | Fecha: ${expense.fecha}`);
  line(`Referencia: ${expense.id}`);
  line(`Categoría: ${categoryLabel(expense.categoria)}`);
  line(`Proveedor: ${expense.proveedor}`);
  line(`Monto original: ${expense.original_amount.toFixed(2)} ${expense.original_currency}`);
  line(`Tipo de cambio aplicado: 1 ${expense.original_currency} = ${expense.exchange_rate} USD`);
  line(`Origen de tasa: ${expense.rate_source === 'api' ? 'ExchangeRate-API' : 'Manual'}${expense.rate_date ? ' | Fecha: ' + expense.rate_date : ''}`);
  line(`Total convertido: USD ${expense.amount_usd.toFixed(2)}`, 15, true);
  if (expense.descripcion) { y -= 8; line(`Descripción: ${expense.descripcion}`); }
  if (!expense.has_receipt) {
    if (!expense.signature || !expense.signer_name || expense.amount_usd >= 25) throw new Error('La declaración requiere firma, nombre y un total inferior a 25 USD.');
    y -= 18;
    line(`Yo, ${expense.signer_name}, declaro que el gasto indicado corresponde a actividades de IEEE HART 2026, que no cuento con factura o recibo oficial y que los datos declarados son correctos. Solicito su consideración en la rendición de fondos.`);
    line('IEEE Expense Affidavit — firma manuscrita capturada para este gasto.', 10);
    if (y < 200) { page = doc.addPage([595, 842]); y = 790; }
    const signature = await doc.embedPng(Buffer.from(expense.signature.split(',')[1], 'base64'));
    if (signature.width < 20 || signature.height < 20 || signature.width > 4096 || signature.height > 4096) throw new Error('Imagen de firma inválida.');
    const s = Math.min(280 / signature.width, 95 / signature.height);
    page.drawImage(signature, { x: 44, y: y - 110, width: signature.width * s, height: signature.height * s });
    y -= 130;
    line(expense.signer_name, 11, true);
    line(`Fecha de declaración: ${new Date().toISOString().slice(0, 10)}`, 10);
  } else {
    if (!receipt?.bytes.length) throw new Error('Falta el comprobante.');
    if (receipt.mime === 'application/pdf') {
      const original = await PDFDocument.load(receipt.bytes);
      if (!original.getPageCount()) throw new Error('PDF sin páginas.');
      for (const p of await doc.copyPages(original, original.getPageIndices())) doc.addPage(p);
    } else {
      const img = receipt.mime === 'image/png' ? await doc.embedPng(receipt.bytes) : await doc.embedJpg(receipt.bytes);
      const p = doc.addPage([595, 842]);
      const s = Math.min(507 / img.width, 754 / img.height);
      p.drawImage(img, { x: (595 - img.width * s) / 2, y: (842 - img.height * s) / 2, width: img.width * s, height: img.height * s });
    }
  }
  return doc.save();
}
