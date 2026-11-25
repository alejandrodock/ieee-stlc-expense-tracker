import { test, expect } from '@playwright/test';
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import ExcelJS from 'exceljs';

async function coverContains(bytes, label) {
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(2);
  const contents = pdf.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray
    ? contents.asArray().map(ref => pdf.context.lookup(ref, PDFRawStream)) : [contents];
  const operators = streams.map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString()).join('\n');
  expect(operators.toLowerCase()).toContain(Buffer.from(label).toString('hex'));
}

test('STLC custom invoice survives failure/reload, saves its PDF, edits and exports in both languages', async ({ page, request }) => {
  const provider = 'Prueba de factura personalizada STLC';
  const custom = 'Factura a nombre de Fabian Borda';
  const edited = 'Factura a nombre de Maria Perez';
  let id;
  try {
    await page.goto('/stlc');
    await page.getByRole('button', { name: 'Registrar compra', exact: true }).click();
    await page.getByLabel('Categoría del Presupuesto').selectOption('transporte');
    await page.getByLabel('Proveedor o empresa').fill(provider);
    await page.getByRole('radio', { name: 'Otro (especificar)' }).click();
    await page.getByLabel('Nombre del tipo de comprobante').fill('   ');
    await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
    await page.getByLabel('Nombre del tipo de comprobante').fill(`  ${custom}  `);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByLabel('Monto en Bolivianos (BOB)').fill('350');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('dialog').getByText(custom, { exact: true })).toBeVisible();

    await page.route('**/api/gastos', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({ status: 503, json: { error: 'Este tipo de comprobante aún no está habilitado para guardar. Contacta al administrador; tus datos siguen en el formulario.' } });
    });
    await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('tus datos siguen en el formulario');
    await page.unroute('**/api/gastos');
    await page.reload();
    await expect(page.getByRole('dialog').getByText(custom, { exact: true })).toBeVisible();

    const source = await PDFDocument.create(); source.addPage();
    await page.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await source.save()) });
    await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(custom, { exact: true })).toBeVisible();
    const rows = await (await request.get('/api/gastos')).json();
    const saved = rows.find(row => row.proveedor === provider);
    id = saved.id;
    expect(saved.tipo_comprobante).toBe(custom);
    expect(Number(saved.monto_bob)).toBe(350);
    await coverContains(await (await request.get(saved.pdf_url)).body(), custom);

    await page.getByRole('button', { name: `Editar gasto de ${provider}`, exact: true }).click();
    await expect(page.getByLabel('Nombre del tipo de comprobante')).toHaveValue(custom);
    await page.getByLabel('Nombre del tipo de comprobante').fill(edited);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('dialog').getByText(edited, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(edited, { exact: true })).toBeVisible();
    await coverContains(await (await request.get(saved.pdf_url)).body(), edited);
    expect((await (await request.get('/api/gastos')).json()).find(row => row.id === id).tipo_comprobante).toBe(edited);

    for (const lang of ['es', 'en']) {
      const response = await request.get(`/api/export?lang=${lang}`);
      expect(response.ok()).toBeTruthy();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.body());
      const cells = workbook.worksheets.flatMap(sheet => sheet.getSheetValues().flatMap(row => row ?? []));
      expect(cells).toContain(edited);
    }
  } finally {
    if (id) await request.delete('/api/gastos', { data: { id } });
  }
});

test('STLC rejects empty custom types restored directly into the final draft step', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nueva-compra-draft', JSON.stringify({
    fecha: '2026-11-15', categoria: 'transporte', proveedor: 'Borrador de prueba',
    tipoComprobante: 'personalizado', tipoComprobantePersonalizado: '', montoBob: '350', step: 3,
  })));
  await page.goto('/stlc');
  let writes = 0;
  page.on('request', req => { if (req.url().endsWith('/api/gastos') && req.method() === 'POST') writes++; });
  await page.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Vuelve al paso Datos');
  expect(writes).toBe(0);
});
