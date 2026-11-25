// Read-only checks plus deliberately invalid POSTs; never creates a jury evaluation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INITIAL_SCORES, TEAMS } from '../auto-registro-fondos-ieee/src/lib/hackathon/domain.ts';
const access = JSON.parse(await readFile(new URL('../.deployment/hackathon-access.json', import.meta.url), 'utf8'));
const origin = process.env.HACKATHON_ORIGIN || 'https://auto-registro-fondos-ieee.vercel.app';
for (const path of ['/', '/stlc', '/hart', '/hackathon']) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, `${path} available`);
  const html = await response.text();
  if (path === '/hackathon') assert.ok(html.includes('Telecom Innovation Hackathon'));
  console.log(`${path}: HTTP 200`);
}
const endpoint = origin + '/api/hackathon';
assert.equal((await fetch(endpoint)).status, 401);
for (const judge of ['ivan','fabian','eloy']) {
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${access[judge]}` } });
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const body = await response.json(); assert.equal(body.judge.id,judge);
  assert.deepEqual(body.baselines, INITIAL_SCORES[judge]);
  assert.ok(body.submissions.every(s => s.judgeId === judge));
  for (const team of TEAMS) assert.equal(body.baselines[team.id][5],INITIAL_SCORES[judge][team.id][5]);
  console.log(`${judge}: personal access and all baseline scores verified; ${body.submissions.length}/5 submitted.`);
}
const admin = await fetch(endpoint, { headers: { Authorization: `Bearer ${access.admin}` } });
assert.equal(admin.status,200); const results = await admin.json();
assert.equal(results.role,'admin'); assert.equal(results.ranking.length,5);
console.log(`Results: ${results.submissions.length}/15 evaluations.`);
const invalid = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${access.ivan}`, 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify({ teamId: 'tilcayos', scores: [100,100,100,100,101], confirmed: true }) });
assert.equal(invalid.status,400, 'Invalid scores rejected without saving');
const forbidden = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${access.admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: 'tilcayos', scores: [100,100,100,100,100], confirmed: true }) });
assert.equal(forbidden.status,403, 'Results access cannot submit scores');
console.log('Live validation and read-only administration verified. No evaluations created.');
