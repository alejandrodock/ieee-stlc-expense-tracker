/**
 * Builds the audit PDF for an expense with pdf-lib (runs in the browser and in Node).
 *
 *  - Scanned receipt  -> ONE page: institutional header + data card + the scan
 *  - Attached PDF     -> page 1: header + data card (cover), followed by every page
 *                        of the original digital receipt, untouched.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { RESPONSABLE, RESPONSABLE_PERFIL } from '../constants';

export type ComprobanteMeta = {
  referencia: string; // file name used as audit reference
  fecha: string; // YYYY-MM-DD
  proveedor: string;
  categoria: string; // label
  tipoComprobante: string; // label
  montoBob: string; // formatted
  montoUsd: string; // formatted
  tipoCambio: string; // formatted
  descripcion?: string | null;
  observaciones?: string | null;
  generadoEn: string; // human readable timestamp
};

export type ScanInput = { jpeg: Uint8Array; width: number; height: number };

const A4: [number, number] = [595.28, 841.89];
const M = 36; // page margin
const C = {
  navy: rgb(15 / 255, 23 / 255, 42 / 255),
  slate400: rgb(148 / 255, 163 / 255, 184 / 255),
  slate500: rgb(100 / 255, 116 / 255, 139 / 255),
  slate800: rgb(30 / 255, 41 / 255, 59 / 255),
  cardBg: rgb(248 / 255, 250 / 255, 252 / 255),
  cardBorder: rgb(226 / 255, 232 / 255, 240 / 255),
  emerald: rgb(5 / 255, 150 / 255, 105 / 255),
  amberBg: rgb(254 / 255, 243 / 255, 199 / 255),
  amberText: rgb(120 / 255, 53 / 255, 15 / 255),
  amberLabel: rgb(180 / 255, 83 / 255, 9 / 255),
  blue: rgb(37 / 255, 99 / 255, 235 / 255),
  white: rgb(1, 1, 1),
};

type Fonts = { regular: PDFFont; bold: PDFFont };

/** Standard PDF fonts only cover WinAnsi; replace anything else so drawing never throws. */
function sanitizer(font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return (text: string) =>
    Array.from(text.normalize('NFC').replace(/\t/g, ' '))
      .map((ch) => {
        if (ch === '\n' || supported.has(ch.codePointAt(0)!)) return ch;
        const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
        return base && Array.from(base).every((b) => supported.has(b.codePointAt(0)!)) ? base : '';
      })
      .join('');
}

/** Word-wrap text to a width; honours explicit newlines and breaks over-long words. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue; }
      if (line) lines.push(line);
      // break words longer than the line
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

function drawLines(page: PDFPage, lines: string[], x: number, yTop: number, font: PDFFont, size: number, color: RGB, lineH = size * 1.3) {
  lines.forEach((l, i) => page.drawText(l, { x, y: yTop - size - i * lineH, size, font, color }));
  return lines.length * lineH;
}

const EVENT_TITLE = 'IEEE Student Tech Leadership Conference';
const EVENT_SUBTITLE = 'Universidad Mayor de San Andrés · 2026';

/** Header band; returns the y coordinate just below it. */
function drawHeader(page: PDFPage, f: Fonts, meta: ComprobanteMeta, clean: (s: string) => string): number {
  const [w, h] = A4;
  const bandH = 86;
  page.drawRectangle({ x: 0, y: h - bandH, width: w, height: bandH, color: C.navy });
  page.drawRectangle({ x: 0, y: h - bandH, width: w, height: 3, color: C.blue });
  const titleSize = Math.min(15, ((w - 2 * M) / f.bold.widthOfTextAtSize(EVENT_TITLE, 15)) * 15);
  page.drawText(clean(EVENT_TITLE), { x: M, y: h - 30, size: titleSize, font: f.bold, color: C.white });
  page.drawText(clean(EVENT_SUBTITLE), { x: M, y: h - 45, size: 10, font: f.regular, color: C.white });
  page.drawText(clean('COMPROBANTE DE RENDICIÓN DE FONDOS'), { x: M, y: h - 62, size: 8, font: f.bold, color: C.slate400 });
  const ref = wrap(clean(`Ref: ${meta.referencia}`), f.regular, 7.5, w - 2 * M);
  drawLines(page, ref.slice(0, 1), M, h - 66, f.regular, 7.5, C.slate400);
  return h - bandH - 16;
}

/** Page stand-in that measures layout without drawing anything. */
const MEASURE_PAGE = { drawText() {}, drawRectangle() {}, drawLine() {} } as unknown as PDFPage;

function drawFooters(doc: PDFDocument, f: Fonts, meta: ComprobanteMeta, clean: (s: string) => string, fromPage: number, toPage: number) {
  const pages = doc.getPages();
  const total = pages.length;
  for (let i = fromPage; i < toPage; i++) {
    const p = pages[i];
    const text = clean(`Generado el ${meta.generadoEn} · ${meta.referencia} · Página ${i + 1} de ${total}`);
    const size = 7;
    const tw = f.regular.widthOfTextAtSize(text, size);
    p.drawText(text, { x: (A4[0] - Math.min(tw, A4[0] - 2 * M)) / 2, y: 18, size, font: f.regular, color: C.slate500, maxWidth: A4[0] - 2 * M });
  }
}

/** Data card + optional description / observation blocks. Returns y below the content. */
function drawDetails(page: PDFPage, f: Fonts, meta: ComprobanteMeta, clean: (s: string) => string, yTop: number, maxBlockLines = Infinity): number {
  const [w] = A4;
  const cardW = w - 2 * M;
  const pad = 12;
  const leftW = cardW * 0.6 - pad * 1.5;
  const rightX = M + cardW * 0.6 + pad * 0.5;
  const rightW = cardW * 0.4 - pad * 1.5;
  const labelSize = 7, valueSize = 9.5;

  const leftRows: [string, string][] = [
    ['FECHA', meta.fecha],
    ['PROVEEDOR O EMPRESA', meta.proveedor],
    ['CATEGORÍA', meta.categoria],
    ['TIPO DE COMPROBANTE', meta.tipoComprobante],
  ];
  const leftWrapped = leftRows.map(([l, v]) => [l, wrap(clean(v), f.regular, valueSize, leftW)] as const);
  const leftH = leftWrapped.reduce((s, [, lines]) => s + labelSize + 4 + lines.length * valueSize * 1.3 + 7, 0);
  const rightH = 7 + 4 + 20 + 10 + 7 + 4 + 13 + 8 + 7 + 4 + 12;
  const cardH = Math.max(leftH, rightH) + pad * 2 - 7;

  page.drawRectangle({ x: M, y: yTop - cardH, width: cardW, height: cardH, color: C.cardBg, borderColor: C.cardBorder, borderWidth: 0.8 });
  page.drawLine({ start: { x: M + cardW * 0.6, y: yTop - pad }, end: { x: M + cardW * 0.6, y: yTop - cardH + pad }, thickness: 0.6, color: C.cardBorder });

  let y = yTop - pad;
  for (const [label, lines] of leftWrapped) {
    page.drawText(label, { x: M + pad, y: y - labelSize, size: labelSize, font: f.bold, color: C.slate500 });
    y -= labelSize + 4;
    y -= drawLines(page, lines, M + pad, y, label === 'PROVEEDOR O EMPRESA' ? f.bold : f.regular, valueSize, C.slate800);
    y -= 7;
  }

  let ry = yTop - pad;
  page.drawText('IMPORTE', { x: rightX, y: ry - labelSize, size: labelSize, font: f.bold, color: C.slate500 });
  ry -= labelSize + 4;
  const amount = clean(`Bs. ${meta.montoBob}`);
  const amountSize = Math.min(20, (rightW / Math.max(1, f.bold.widthOfTextAtSize(amount, 20))) * 20);
  page.drawText(amount, { x: rightX, y: ry - amountSize, size: amountSize, font: f.bold, color: C.emerald });
  ry -= 20 + 10;
  page.drawText('EQUIVALENTE USD', { x: rightX, y: ry - labelSize, size: labelSize, font: f.bold, color: C.slate500 });
  ry -= labelSize + 4;
  page.drawText(clean(`$ ${meta.montoUsd}`), { x: rightX, y: ry - 11, size: 11, font: f.bold, color: C.slate800 });
  ry -= 13 + 8;
  page.drawText('TIPO DE CAMBIO', { x: rightX, y: ry - labelSize, size: labelSize, font: f.bold, color: C.slate500 });
  ry -= labelSize + 4;
  page.drawText(clean(`${meta.tipoCambio} Bs por USD`), { x: rightX, y: ry - 9, size: 9, font: f.regular, color: C.slate800 });

  y = yTop - cardH - 10;

  const block = (title: string, text: string, bg: RGB, titleColor: RGB, textColor: RGB) => {
    let lines = wrap(clean(text), f.regular, 9, cardW - pad * 2);
    if (lines.length > maxBlockLines) {
      lines = lines.slice(0, maxBlockLines);
      const last = lines.length - 1;
      let tail = lines[last];
      while (tail && f.regular.widthOfTextAtSize(`${tail}...`, 9) > cardW - pad * 2) tail = tail.slice(0, -1);
      lines[last] = `${tail.trimEnd()}...`;
    }
    const h =pad + labelSize + 5 + lines.length * 9 * 1.3 + pad - 3;
    page.drawRectangle({ x: M, y: y - h, width: cardW, height: h, color: bg });
    page.drawText(title, { x: M + pad, y: y - pad - labelSize + 2, size: labelSize, font: f.bold, color: titleColor });
    drawLines(page, lines, M + pad, y - pad - labelSize - 3, f.regular, 9, textColor);
    y -= h + 8;
  };
  if (meta.descripcion?.trim()) block('DESCRIPCIÓN DE LOS ELEMENTOS', meta.descripcion.trim(), rgb(241 / 255, 245 / 255, 249 / 255), C.slate500, C.slate800);
  if (meta.observaciones?.trim()) block('OBSERVACIONES', meta.observaciones.trim(), C.amberBg, C.amberLabel, C.amberText);
  return y;
}

async function newDocument() {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  return { doc, fonts, clean: sanitizer(fonts.regular) };
}

function setInfo(doc: PDFDocument, meta: ComprobanteMeta) {
  doc.setTitle(`Comprobante ${meta.referencia}`);
  doc.setSubject('Rendición de fondos IEEE STLC 2026');
  doc.setAuthor(`${EVENT_TITLE} · ${EVENT_SUBTITLE}`);
  doc.setCreator('IEEE STLC ExpenseTracker');
  doc.setProducer('IEEE STLC ExpenseTracker');
}

/** Scanned receipt -> audit PDF. */
export async function buildScanPdf(meta: ComprobanteMeta, scan: ScanInput): Promise<Uint8Array> {
  const { doc, fonts, clean } = await newDocument();
  setInfo(doc, meta);
  const image = await doc.embedJpg(scan.jpeg);
  const [W, H] = A4;
  const bottom = 34;

  // Everything on ONE page: header + data card + scan. Long description/observation
  // texts are shortened only as much as needed to keep the scan at ≥ ~50 % of the page.
  const page = doc.addPage(A4);
  const top = drawHeader(page, fonts, meta, clean);
  let maxLines = Infinity;
  for (const limit of [Infinity, 8, 5, 3, 2, 1]) {
    maxLines = limit;
    if (drawDetails(MEASURE_PAGE, fonts, meta, clean, top, limit) - 4 - bottom >= H * 0.5) break;
  }
  const y = drawDetails(page, fonts, meta, clean, top, maxLines) - 4;
  const availH = y - bottom;
  const availW = W - 2 * M;
  const s = Math.min(availW / scan.width, availH / scan.height);
  const iw = scan.width * s, ih = scan.height * s;
  const x = (W - iw) / 2;
  const iy = y - ih;
  page.drawRectangle({ x: x - 0.5, y: iy - 0.5, width: iw + 1, height: ih + 1, borderColor: C.cardBorder, borderWidth: 0.8 });
  page.drawImage(image, { x, y: iy, width: iw, height: ih });

  drawFooters(doc, fonts, meta, clean, 0, doc.getPageCount());
  return doc.save();
}

/**
 * Minor expense without invoice or receipt (taxi, pasajes…) -> one-page signed
 * declaration that backs the expense in the report.
 */
export async function buildDeclaracionPdf(meta: ComprobanteMeta): Promise<Uint8Array> {
  const { doc, fonts: f, clean } = await newDocument();
  setInfo(doc, meta);
  const [W] = A4;
  const page = doc.addPage(A4);
  let y = drawHeader(page, f, meta, clean);
  y = drawDetails(page, f, meta, clean, y) - 14;

  const width = W - 2 * M;
  page.drawText(clean('DECLARACIÓN DE GASTO SIN COMPROBANTE'), { x: M, y: y - 11, size: 11, font: f.bold, color: C.slate800 });
  y -= 11 + 12;

  const texto =
    `Yo, ${RESPONSABLE}, con C.I. ${RESPONSABLE_PERFIL.ci}, responsable de los fondos del evento ${EVENT_TITLE} (${EVENT_SUBTITLE}), ` +
    `declaro que el gasto detallado en este documento por Bs. ${meta.montoBob} fue realizado el ${meta.fecha} ` +
    `exclusivamente para actividades del evento, y que no cuenta con factura ni recibo por tratarse de un gasto menor ` +
    `(transporte en taxi, trufi, minibús u otro similar) para el cual el proveedor no emite comprobante.`;
  y -= drawLines(page, wrap(clean(texto), f.regular, 10, width), M, y, f.regular, 10, C.slate800, 15) + 50;

  // Firma
  const lineW = 220;
  page.drawLine({ start: { x: M, y }, end: { x: M + lineW, y }, thickness: 0.8, color: C.slate500 });
  page.drawText(clean(RESPONSABLE), { x: M, y: y - 13, size: 9.5, font: f.bold, color: C.slate800 });
  page.drawText(clean(`Responsable de fondos · C.I.: ${RESPONSABLE_PERFIL.ci}`), { x: M, y: y - 26, size: 8.5, font: f.regular, color: C.slate500 });
  page.drawText(clean(`Lugar y fecha: La Paz, ${meta.fecha}`), { x: M, y: y - 39, size: 8.5, font: f.regular, color: C.slate500 });

  drawFooters(doc, f, meta, clean, 0, 1);
  return doc.save();
}

/**
 * Digital receipt (PDF) -> cover page + original pages.
 * Returns `merged: false` (and the original bytes) when the file cannot be merged,
 * e.g. password-protected PDFs, so the receipt is still archived.
 */
export async function buildAttachedPdf(meta: ComprobanteMeta, original: Uint8Array): Promise<{ bytes: Uint8Array; merged: boolean; pages: number }> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(original, { updateMetadata: false });
  } catch {
    return { bytes: original, merged: false, pages: 0 };
  }
  const { doc, fonts, clean } = await newDocument();
  setInfo(doc, meta);
  const cover = doc.addPage(A4);
  let y = drawHeader(cover, fonts, meta, clean);
  y = drawDetails(cover, fonts, meta, clean, y) - 6;
  const note = clean(`Comprobante digital adjunto: ${source.getPageCount()} página(s) a continuación.`);
  cover.drawText(note, { x: M, y: y - 10, size: 8.5, font: fonts.regular, color: C.slate500, maxWidth: A4[0] - 2 * M });

  const copied = await doc.copyPages(source, source.getPageIndices());
  copied.forEach((p) => doc.addPage(p));
  drawFooters(doc, fonts, meta, clean, 0, 1);
  return { bytes: await doc.save(), merged: true, pages: source.getPageCount() };
}

/** Quick inspection of a user-selected PDF (page count / encryption) for the UI. */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pages: number } | null> {
  try {
    const d = await PDFDocument.load(bytes, { updateMetadata: false });
    return { pages: d.getPageCount() };
  } catch {
    return null;
  }
}
