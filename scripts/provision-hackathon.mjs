// Run with node --env-file=auto-registro-fondos-ieee/.env.local scripts/provision-hackathon.mjs
// Only the service role can read the private bucket. Never print credentials or tokens.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Missing server Supabase configuration');
const bucket = 'telecom-evaluations';
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const call = (path, init = {}) => fetch(`${base}/storage/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
let response = await call(`bucket/${bucket}`);
if (!response.ok) {
  const error = await response.json();
  if (![400,404].includes(response.status) || !/not found/i.test(error.message || '')) throw new Error(`Cannot inspect bucket (${response.status})`);
  response = await call('bucket', { method: 'POST', body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 65536, allowed_mime_types: ['application/json'] }) });
  if (!response.ok) throw new Error(`Cannot create bucket (${response.status})`);
}
const info = await (await call(`bucket/${bucket}`)).json();
if (info.public !== false) throw new Error('Evaluation bucket must be private');
const statePath = new URL('../.deployment/hackathon-access.json', import.meta.url);
await mkdir(new URL('../.deployment/', import.meta.url), { recursive: true });
let state;
try { state = JSON.parse(await readFile(statePath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const existing = await call(`object/${bucket}/private/access.json`);
if (existing.ok) {
  if (!state) throw new Error('Access already configured. Recover existing handoff file; do not rotate implicitly.');
  const saved = await existing.json();
  const hash = token => createHash('sha256').update(token).digest('hex');
  if (saved.admin !== hash(state.admin) || !['ivan','fabian','eloy'].every(id => saved.judges[id] === hash(state[id]))) throw new Error('Local access does not match deployed access');
  console.log('Private bucket and existing access verified.');
} else {
  const error = await existing.json();
  if (existing.status !== 404 && String(error.statusCode) !== '404') throw new Error(`Cannot inspect access (${existing.status})`);
  if (!state) {
    state = Object.fromEntries(['admin','ivan','fabian','eloy'].map(id => [id, randomBytes(32).toString('base64url')]));
    await writeFile(statePath, JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
  }
  const hash = token => createHash('sha256').update(token).digest('hex');
  const access = { admin: hash(state.admin), judges: Object.fromEntries(['ivan','fabian','eloy'].map(id => [id, hash(state[id])])) };
  response = await call(`object/${bucket}/private/access.json`, { method: 'POST', headers: { 'x-upsert': 'false' }, body: JSON.stringify(access) });
  if (!response.ok) throw new Error(`Cannot initialize access (${response.status})`);
  console.log('Private bucket created; access hashes saved.');
}
const origin = process.env.HACKATHON_ORIGIN || 'https://auto-registro-fondos-ieee.vercel.app';
const labels = { admin: 'Coordinación — resultados (no compartir con jurados)', ivan: 'IVAN ALEJANDRO MENDOZA MENDOZA', fabian: 'MARCO FABIAN BORDA WIEGERT', eloy: 'ELOY RICARDO SERRUDO CAREAGA' };
const links = '# Telecom Innovation Hackathon — accesos privados\n\n' + Object.entries(labels).map(([id, label]) => `- ${label}: ${origin}/hackathon#acceso=${state[id]}`).join('\n') + '\n';
await writeFile(new URL('../.deployment/hackathon-links.md', import.meta.url), links, { mode: 0o600 });
console.log('Personal links saved to .deployment/hackathon-links.md (ignored by Git).');
