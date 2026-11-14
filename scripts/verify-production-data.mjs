import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const baselineFile = new URL('.deployment/stlc-baseline.json', root);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Load the application environment first.');
const columns = 'id,created_at,fecha,categoria,proveedor,descripcion,observaciones,tipo_comprobante,monto_bob,monto_usd,pdf_url,drive_file_id,drive_url,imagen_original';
const after = process.argv.includes('--after');
const rows = [];
for (let offset = 0; ; offset += 1000) {
  const response = await fetch(`${url}/rest/v1/gastos?select=${columns}&order=id&offset=${offset}&limit=1000${after ? '&project_id=eq.STLC' : ''}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Supabase read failed: ${response.status}`);
  const page = await response.json(); rows.push(...page); if (page.length < 1000) break;
}
const fingerprint = row => createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))).digest('hex');
const snapshot = { count: rows.length, totalBob: Math.round(rows.reduce((sum, r) => sum + Number(r.monto_bob), 0) * 100) / 100, rows: Object.fromEntries(rows.map(row => [row.id, fingerprint(row)])) };
if (!after) {
  await mkdir(new URL('.deployment/', root), { recursive: true });
  await writeFile(baselineFile, JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify({ baseline: true, count: snapshot.count, totalBob: snapshot.totalBob }));
} else {
  const baseline = JSON.parse(await readFile(baselineFile, 'utf8'));
  const missingOrChanged = Object.entries(baseline.rows).filter(([id, hash]) => snapshot.rows[id] !== hash);
  if (missingOrChanged.length) throw new Error(`${missingOrChanged.length} pre-existing STLC rows changed or are missing.`);
  console.log(JSON.stringify({ preserved: true, originalCount: baseline.count, currentCount: snapshot.count, totalBob: snapshot.totalBob }));
}
