import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!base || !key || !anon) throw new Error('Load Supabase environment');
const bucket = 'telecom-evaluations';
const path = `_verification/${randomUUID()}.json`;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'x-upsert': 'false' };
const endpoint = `${base}/storage/v1/object/${bucket}/${path}`;
try {
  const attempts = await Promise.all([1,2].map(value => fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ verification: value }) })));
  assert.equal(attempts.filter(r => r.ok).length, 1, 'Storage must create only one object');
  const rejected = attempts.find(r => !r.ok); const error = await rejected.json();
  assert.ok(rejected.status === 409 || String(error.statusCode) === '409' || error.error === 'Duplicate');
  const read = await fetch(endpoint, { headers }); assert.ok(read.ok);
  const original = await read.json(); assert.ok([1,2].includes(original.verification));
  const publicRead = await fetch(endpoint, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
  assert.equal(publicRead.ok, false, 'Anonymous reads must be denied');
  const publicAccess = await fetch(`${base}/storage/v1/object/${bucket}/private/access.json`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
  assert.equal(publicAccess.ok, false, 'Access config must be private');
  console.log('Verified real Storage: atomic duplicate rejection and anonymous read denial.');
} finally {
  const cleanup = await fetch(`${base}/storage/v1/object/${bucket}`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: [path] }) });
  assert.ok(cleanup.ok, 'Temporary verification object cleanup');
  console.log('Removed only the temporary verification object. No jury evaluations created.');
}
