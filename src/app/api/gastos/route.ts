import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';

// GET all gastos
export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from('gastos')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('GET gastos error:', error);
    return NextResponse.json({ error: 'Failed to fetch gastos' }, { status: 500 });
  }
}

// POST new gasto
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from('gastos')
      .insert([{
        fecha: body.fecha,
        categoria: body.categoria,
        proveedor: body.proveedor,
        tipo_comprobante: body.tipo_comprobante,
        monto_bob: body.monto_bob,
        monto_usd: body.monto_usd || null,
        pdf_url: body.pdf_url || null,
        drive_file_id: body.drive_file_id || null,
        drive_url: body.drive_url || null,
        imagen_original: body.imagen_original || null,
      }])
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('POST gasto error:', error);
    return NextResponse.json({ error: 'Failed to create gasto' }, { status: 500 });
  }
}

// DELETE gasto
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const supabase = createServerSupabase();

    const { error } = await supabase
      .from('gastos')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE gasto error:', error);
    return NextResponse.json({ error: 'Failed to delete gasto' }, { status: 500 });
  }
}
