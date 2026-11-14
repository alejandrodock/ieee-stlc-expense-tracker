import { test, expect } from '@playwright/test';
import { PDFDocument, PDFName } from 'pdf-lib';

async function openForm(page, name) {
  await page.goto('/hart');
  await page.getByRole('button', { name: 'Nuevo gasto', exact: true }).click();
  await page.getByLabel('Proveedor', { exact: true }).fill(name);
  await page.getByLabel('Monto original', { exact: true }).fill('30');
}

test('HART reuses image scanning, filters, rotation, recropping and uploads the processed image', async ({ page, request }) => {
  await openForm(page, 'Recibo escaneado WEBP');
  const save = page.getByRole('button', { name: 'Guardar gasto', exact: true });
  await expect(save).toBeDisabled();
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 600;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, 400, 600);
    ctx.fillStyle = '#111'; ctx.font = '24px sans-serif';
    ctx.fillText('FACTURA HART', 40, 70); ctx.fillText('TOTAL USD 30.00', 40, 160);
    return c.toDataURL('image/webp').split(',')[1];
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Imagen Galería' }).click();
  await (await chooser).setFiles({ name: 'recibo.webp', mimeType: 'image/webp', buffer: Buffer.from(data, 'base64') });
  await expect(page.getByRole('button', { name: 'Imagen completa' })).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Imagen completa' }).click();
  await page.getByRole('button', { name: 'Recortar y escanear' }).click();
  const preview = page.getByAltText('Documento escaneado');
  await expect(preview).toBeVisible(); await expect(save).toBeEnabled();
  for (const name of ['Grises', 'Original', 'Color nítido']) {
    await page.getByRole('radio', { name, exact: true }).click();
    await expect(page.getByRole('radio', { name, exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(save).toBeEnabled();
  }
  const before = await preview.evaluate(img => img.naturalWidth / img.naturalHeight);
  await page.getByRole('button', { name: 'Girar', exact: true }).first().click();
  await expect(save).toBeEnabled();
  const after = await preview.evaluate(img => img.naturalWidth / img.naturalHeight);
  expect(before).toBeLessThan(1); expect(after).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Bordes', exact: true }).click();
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Bordes automáticos' }).click();
  await page.getByRole('button', { name: 'Recortar y escanear' }).click();
  await expect(save).toBeEnabled();
  await page.screenshot({ path: 'test-results/hart-scanner-mobile.png', fullPage: true });
  const prepared = page.waitForRequest(r => r.url().endsWith('/api/hart/comprobantes') && r.method() === 'POST');
  await save.click();
  expect((await prepared).postDataJSON().mime_type).toBe('image/jpeg');
  await expect(page.getByRole('form', { name: 'Nuevo gasto HART' })).toHaveCount(0);
  const rows = await (await request.get('/api/hart/gastos')).json();
  const row = rows.find(e => e.proveedor === 'Recibo escaneado WEBP');
  expect(row.amount_usd).toBe(30);
  const pdf = await PDFDocument.load(await (await request.get(row.pdf_url)).body());
  expect(pdf.getCreator()).toBe('IEEE HART 2026');
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getPage(1).node.Resources().lookup(PDFName.of('XObject')).keys().length).toBeGreaterThan(0);
});

test('HART uses the existing camera with retake, confirmation, stream cleanup and attachment replacement', async ({ page }) => {
  await page.addInitScript(() => {
    window.__streams = [];
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => { const stream = await getUserMedia(options); window.__streams.push(stream); return stream; };
  });
  await openForm(page, 'Foto desde cámara');
  await page.getByRole('button', { name: 'Escanear Cámara' }).click();
  await expect(page.getByRole('dialog', { name: 'Cámara', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tomar foto', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Tomar foto', exact: true }).click();
  await expect(page.getByAltText('Foto tomada')).toBeVisible();
  await page.getByRole('button', { name: 'Repetir', exact: true }).click();
  await page.getByRole('button', { name: 'Tomar foto', exact: true }).click();
  await page.getByRole('button', { name: 'Usar foto', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Cámara', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
  await expect(page.getByRole('button', { name: 'Recortar y escanear' })).toBeVisible();
  await page.getByRole('button', { name: 'Recortar y escanear' }).click();
  await expect(page.getByRole('button', { name: 'Guardar gasto', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Cambiar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardar gasto', exact: true })).toBeDisabled();
  const doc = await PDFDocument.create(); doc.addPage(); doc.addPage();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'PDF Recibo digital' }).click();
  await (await chooser).setFiles({ name: 'recibo-nuevo.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  await expect(page.getByText(/2 página\(s\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar gasto', exact: true })).toBeEnabled();
  await page.getByLabel('Tengo factura o recibo oficial').uncheck();
  await page.getByLabel('Tengo factura o recibo oficial').check();
  await expect(page.getByRole('button', { name: 'Guardar gasto', exact: true })).toBeDisabled();
});

test('HART falls back to the native camera picker when permission is denied', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }; });
  await openForm(page, 'Cámara nativa');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Escanear Cámara' }).click();
  const input = (await chooser).element();
  expect(await input.getAttribute('capture')).toBe('environment');
  await expect(page.getByRole('dialog', { name: 'Cámara', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar gasto', exact: true })).toBeDisabled();
});
