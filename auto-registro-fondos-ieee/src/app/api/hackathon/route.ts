import { NextResponse } from 'next/server';
import { authenticate, baselines, EvaluationError, submissions, submit } from '@/lib/hackathon/server';
import { JUDGES, ranking } from '@/lib/hackathon/domain';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const respond = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } });
function failure(error: unknown) {
  if (error instanceof EvaluationError) return respond({ error: error.message }, error.status);
  console.error('Hackathon request failed:', error instanceof Error ? error.message : 'Unknown error');
  return respond({ error: 'No se pudo verificar el registro. Vuelve a consultar antes de intentar enviar otra vez.' }, 503);
}
export async function GET(request: Request) {
  try {
    const identity = await authenticate(request);
    if (identity === 'admin') {
      const rows = await submissions();
      return respond({ role: 'admin', submissions: rows, ranking: ranking(rows) });
    }
    const [partial, rows] = await Promise.all([baselines(identity), submissions(identity)]);
    return respond({ role: 'judge', judge: JUDGES.find(j => j.id === identity), baselines: partial, submissions: rows });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    // Bearer authentication is not ambient cookie auth. Fetch Metadata also blocks
    // browser requests from other sites without trusting proxy-rewritten origins.
    if (request.headers.get('sec-fetch-site') === 'cross-site') return respond({ error: 'Origen no permitido.' }, 403);
    const identity = await authenticate(request);
    const raw = await request.text();
    if (raw.length > 10000) return respond({ error: 'Solicitud demasiado grande.' }, 413);
    let input;
    try { input = JSON.parse(raw); } catch { return respond({ error: 'Solicitud inválida.' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return respond({ error: 'Solicitud inválida.' }, 400);
    if (identity === 'admin') {
      return respond({ error: 'Este acceso es solo para consultar resultados.' }, 403);
    }
    return respond({ submission: await submit(identity, input) }, 201);
  } catch (error) { return failure(error); }
}
