import { NextRequest, NextResponse, after } from 'next/server';
import { getServerSupabase } from '@/lib/server/supabase';
import { parseGastoInput, isUuid } from '@/lib/server/validation';
import {
  COMPROBANTES_BUCKET, comprobanteExists, comprobantePath, comprobanteUrl,
} from '@/lib/server/storage';
import { isDriveSyncEnabled, trashInDrive, uploadToDrive } from '@/lib/server/drive';
import { generatePdfFilename, getCategoriaLabel } from '@/lib/constants';
import { GASTO_COLUMNS } from '@/lib/types';
import { removeGastoMediaFiles } from '@/lib/server/media';

export const dynamic = 'force-dynamic';

// GET all gastos (light columns only – receipts are fetched on demand)
export async function GET() {
  try {
    const { data, error } = await getServerSupabase()
      .from('gastos')
      .select(GASTO_COLUMNS)
      .eq('project_id', 'STLC')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET gastos error:', error);
    return NextResponse.json({ error: 'No se pudieron obtener los gastos' }, { status: 500 });
  }
}

// POST new gasto. The receipt PDF (if any) must already be uploaded to storage.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = parseGastoInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.data;

  try {
    if (input.tiene_comprobante && !(await comprobanteExists(input.id))) {
      return NextResponse.json({ error: 'El comprobante no se subió correctamente' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('gastos')
      .insert([{
        project_id: 'STLC',
        id: input.id,
        fecha: input.fecha,
        categoria: input.categoria,
        proveedor: input.proveedor,
        descripcion: input.descripcion,
        observaciones: input.observaciones,
        tipo_comprobante: input.tipo_comprobante,
        monto_bob: input.monto_bob,
        monto_usd: input.monto_usd,
        pdf_url: input.tiene_comprobante ? comprobanteUrl(input.id) : null,
      }])
      .select(GASTO_COLUMNS)
      .single();

    if (error) throw error;

    // Optional Google Drive copy, after the response is sent (never blocks the user).
    if (input.tiene_comprobante && isDriveSyncEnabled()) {
      after(async () => {
        try {
          const { data: file, error: dlError } = await supabase.storage
            .from(COMPROBANTES_BUCKET)
            .download(comprobantePath(input.id));
          if (dlError || !file) throw dlError ?? new Error('PDF no encontrado');
          const filename = generatePdfFilename(input.fecha, input.categoria, input.proveedor, input.monto_bob);
          const { fileId, webViewLink } = await uploadToDrive(
            filename,
            new Uint8Array(await file.arrayBuffer()),
            getCategoriaLabel(input.categoria),
          );
          await supabase.from('gastos').update({ drive_file_id: fileId, drive_url: webViewLink }).eq('project_id', 'STLC').eq('id', input.id);
        } catch (err) {
          console.error('Drive sync failed (non-fatal):', err);
        }
      });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('POST gasto error:', error);
    return NextResponse.json({ error: 'No se pudo guardar el gasto' }, { status: 500 });
  }
}

// PATCH: edit an existing gasto. `tiene_comprobante: true` links a (newly) uploaded
// receipt; `false` keeps whatever receipt the expense already had.
export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = parseGastoInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.data;

  try {
    if (input.tiene_comprobante && !(await comprobanteExists(input.id))) {
      return NextResponse.json({ error: 'El comprobante no se subió correctamente' }, { status: 400 });
    }
    const { data, error } = await getServerSupabase()
      .from('gastos')
      .update({
        fecha: input.fecha,
        categoria: input.categoria,
        proveedor: input.proveedor,
        descripcion: input.descripcion,
        observaciones: input.observaciones,
        tipo_comprobante: input.tipo_comprobante,
        monto_bob: input.monto_bob,
        monto_usd: input.monto_usd,
        ...(input.tiene_comprobante ? { pdf_url: comprobanteUrl(input.id) } : {}),
      })
      .eq('id', input.id)
      .eq('project_id', 'STLC')
      .select(GASTO_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error('PATCH gasto error:', error);
    return NextResponse.json({ error: 'No se pudo actualizar el gasto' }, { status: 500 });
  }
}

// DELETE gasto (and its stored receipt)
export async function DELETE(req: NextRequest) {
  let id: unknown;
  try {
    ({ id } = await req.json());
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!isUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  try {
    const supabase = getServerSupabase();
    const { data: existing, error: lookupError } = await supabase.from('gastos').select('drive_file_id').eq('project_id', 'STLC').eq('id', id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    const { error } = await supabase.from('gastos').delete().eq('project_id', 'STLC').eq('id', id);
    if (error) throw error;

    const driveFileId = existing?.drive_file_id as string | null | undefined;
    if (driveFileId && isDriveSyncEnabled()) {
      after(async () => {
        try {
          await trashInDrive(driveFileId);
        } catch (err) {
          console.error('Drive trash failed (non-fatal):', err);
        }
      });
    }

    const { error: storageError } = await supabase.storage.from(COMPROBANTES_BUCKET).remove([comprobantePath(id)]);
    if (storageError) console.warn('Receipt cleanup failed (non-fatal):', storageError.message);
    // Rows in gasto_media go away with ON DELETE CASCADE; remove the files too.
    await removeGastoMediaFiles(id).catch((e) => console.warn('Media cleanup failed (non-fatal):', e));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE gasto error:', error);
    return NextResponse.json({ error: 'No se pudo eliminar el gasto' }, { status: 500 });
  }
}
