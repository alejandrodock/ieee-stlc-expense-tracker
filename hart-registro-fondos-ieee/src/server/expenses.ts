import { NextRequest, NextResponse } from 'next/server';
import { validateExpense, isUuid } from '../domain';
import { buildHartPdf } from '../pdf';
import { db, ensureBucket, EXPENSE_COLUMNS, HART_BUCKET, receiptPath, reportPath, MAX_RECEIPT_BYTES } from './db';

export async function GET() {
  try {
    const { data, error } = await db().from('gastos').select(EXPENSE_COLUMNS).eq('project_id', 'HART').order('fecha', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('HART list:', e);
    return NextResponse.json({ error: 'No se pudieron cargar los gastos HART. Comprueba la migración y la conexión.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let expense;
  try { expense = validateExpense(await req.json()); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Datos inválidos.' }, { status: 400 }); }
  const client = db();
  try {
    const existing = await client.from('gastos').select('id').eq('project_id', 'HART').eq('id', expense.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return NextResponse.json({ error: 'Este gasto ya está registrado. Actualiza la lista.' }, { status: 409 });
    let receipt: { bytes: Uint8Array; mime: string } | undefined;
    if (expense.has_receipt) {
      const { data, error } = await client.storage.from(HART_BUCKET).download(receiptPath(expense.id));
      if (error || !data) return NextResponse.json({ error: 'Sube una factura o recibo antes de guardar.' }, { status: 400 });
      if (data.size > MAX_RECEIPT_BYTES) return NextResponse.json({ error: 'El comprobante supera 20 MB.' }, { status: 400 });
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(data.type)) return NextResponse.json({ error: 'Formato de comprobante inválido.' }, { status: 400 });
      receipt = { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type };
    }
    let pdf;
    try { pdf = await buildHartPdf(expense, receipt); }
    catch { return NextResponse.json({ error: 'No se pudo validar el comprobante o la firma. Usa un PDF sin contraseña o una imagen JPG/PNG válida.' }, { status: 400 }); }
    await ensureBucket(client);
    const uploaded = await client.storage.from(HART_BUCKET).upload(reportPath(expense.id), pdf, { contentType: 'application/pdf', upsert: false });
    if (uploaded.error) throw uploaded.error;
    const { signature: _signature, ...values } = expense;
    void _signature;
    const result = await client.from('gastos').insert({
      ...values, project_id: 'HART', monto_bob: expense.original_currency === 'BOB' ? expense.original_amount : null,
      monto_usd: expense.amount_usd, tipo_comprobante: expense.has_receipt ? 'recibo' : 'sin_comprobante',
      pdf_url: `/api/hart/comprobantes/${expense.id}`,
    }).select(EXPENSE_COLUMNS).single();
    if (result.error) {
      await client.storage.from(HART_BUCKET).remove([reportPath(expense.id)]);
      throw result.error;
    }
    // The report already contains the original; do not retain a second copy.
    if (expense.has_receipt) await client.storage.from(HART_BUCKET).remove([receiptPath(expense.id)]);
    return NextResponse.json(result.data, { status: 201 });
  } catch (e) {
    console.error('HART save:', e);
    return NextResponse.json({ error: 'No se pudo guardar el gasto HART. Puedes reintentar.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  let id;
  try { ({ id } = await req.json()); } catch { /* validated below */ }
  if (!isUuid(id)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
  try {
    const client = db();
    const { data, error } = await client.from('gastos').delete().eq('project_id', 'HART').eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Gasto HART no encontrado.' }, { status: 404 });
    const removed = await client.storage.from(HART_BUCKET).remove([reportPath(id), receiptPath(id)]);
    if (removed.error) console.error('HART storage cleanup:', removed.error);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('HART delete:', e);
    return NextResponse.json({ error: 'No se pudo eliminar el gasto.' }, { status: 500 });
  }
}
