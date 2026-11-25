import 'server-only';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { INITIAL_SCORES, JUDGES, TEAMS, validScores, weightedTotal, type Baselines, type JudgeId, type Submission, type TeamId } from './domain';

const BUCKET = 'telecom-evaluations';
export class EvaluationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
// Private Storage objects are inserted once, never upserted. The unique bucket/path
// constraint arbitrates concurrent requests, including requests on different servers.
async function storage(path: string, value?: unknown): Promise<unknown | null> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Storage unavailable');
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: value === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'x-upsert': 'false', 'Cache-Control': 'no-store' },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }), signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (response.ok) return body;
  if (value === undefined && (response.status === 404 || String(body.statusCode) === '404')) return null;
  if (value !== undefined && (response.status === 409 || ['409', 'Duplicate'].includes(String(body.statusCode)) || body.error === 'Duplicate')) {
    throw new EvaluationError('Este registro ya fue enviado. Para corregirlo, contacta a IVAN ALEJANDRO MENDOZA MENDOZA (+59168108299).', 409);
  }
  throw new Error(`Storage request failed (${response.status})`);
}
type Access = { admin: string; judges: Record<JudgeId, string> };
export async function authenticate(request: Request): Promise<JudgeId | 'admin'> {
  const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) throw new EvaluationError('Abre el enlace personal que te envió la coordinación.', 401);
  const access = await storage('private/access.json') as Access | null;
  if (!access) throw new EvaluationError('Los accesos todavía no están configurados.', 503);
  const hash = createHash('sha256').update(token).digest();
  const matches = (stored: string) => /^[a-f0-9]{64}$/.test(stored) && timingSafeEqual(hash, Buffer.from(stored, 'hex'));
  if (matches(access.admin)) return 'admin';
  for (const judge of JUDGES) if (matches(access.judges[judge.id])) return judge.id;
  throw new EvaluationError('El enlace personal no es válido.', 401);
}
export async function baselines(judge: JudgeId): Promise<Baselines | null> {
  return INITIAL_SCORES[judge];
}
export async function submissions(judge?: JudgeId): Promise<Submission[]> {
  const selected = judge ? JUDGES.filter(j => j.id === judge) : JUDGES;
  const rows = await Promise.all(selected.flatMap(j => TEAMS.map(t => storage(`submissions/${j.id}/${t.id}.json`))));
  return rows.filter(Boolean) as Submission[];
}
export async function submit(judge: JudgeId, input: Record<string, unknown>) {
  const team = TEAMS.find(t => t.id === input.teamId);
  if (!team || !validScores(input.scores, 5) || input.confirmed !== true) throw new EvaluationError('Revisa las cinco notas (0 a 100, hasta dos decimales) y confirma el envío definitivo.', 400);
  const baseline = (await baselines(judge))?.[team.id];
  if (!baseline) throw new EvaluationError('Faltan tus notas presenciales. Contacta a la coordinación antes de evaluar.', 409);
  const scores = [...input.scores, baseline[5]];
  const row: Submission = { id: randomUUID(), judgeId: judge, teamId: team.id as TeamId, baseline: [...baseline], scores, total: weightedTotal(scores), submittedAt: new Date().toISOString() };
  await storage(`submissions/${judge}/${team.id}.json`, row);
  return row;
}
