import { NextRequest, NextResponse } from 'next/server';
import { CURRENCIES } from '../domain';

export async function GET(req: NextRequest) {
  const currency = req.nextUrl.searchParams.get('currency');
  if (!CURRENCIES.some(c => c === currency)) return NextResponse.json({ error: 'Moneda inválida.' }, { status: 400 });
  if (currency === 'USD') return NextResponse.json({ rate: 1, date: null, source: 'api' });
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Proveedor no disponible');
    const data = await response.json();
    const rate = data.rates?.[currency!];
    if (data.result !== 'success' || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(data.time_last_update_unix)) throw new Error('Respuesta inválida');
    return NextResponse.json({ rate: Number((1 / rate).toFixed(12)), date: new Date(data.time_last_update_unix * 1000).toISOString(), source: 'api' });
  } catch {
    return NextResponse.json({ error: 'No se pudo consultar la tasa. Introduce una tasa manual (USD por unidad de moneda).' }, { status: 503 });
  }
}
