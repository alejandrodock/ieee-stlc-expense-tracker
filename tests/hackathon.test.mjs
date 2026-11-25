import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITERIA, INITIAL_SCORES, JUDGES, TEAMS, ranking, validScores, weightedTotal } from '../auto-registro-fondos-ieee/src/lib/hackathon/domain.ts';
test('official scores, rubric, and pitch remain correct for all judges', () => {
  assert.equal(CRITERIA.reduce((sum, c) => sum + c.weight, 0), 100);
  assert.deepEqual(TEAMS.map(t => INITIAL_SCORES.ivan[t.id][5]), [95,30,90,75,80]);
  for (const team of TEAMS) assert.deepEqual(INITIAL_SCORES.ivan[team.id].slice(0,5), [null,null,null,null,null]);
  assert.deepEqual(TEAMS.map(t => weightedTotal(INITIAL_SCORES.fabian[t.id])), [88.5,69,93,83.25,85.25]);
  assert.deepEqual(TEAMS.map(t => weightedTotal(INITIAL_SCORES.eloy[t.id])), [86,74.25,89.25,73.75,77.6]);
  assert.equal(JUDGES.length, 3);
});
test('scores reject coercion, missing notes, out of range and excessive precision', () => {
  for (const input of [[0,0,0,0], [1,2,3,4,101], [-1,2,3,4,5], [null,2,3,4,5], ['80',2,3,4,5], [NaN,2,3,4,5], [Infinity,2,3,4,5], [0.001,2,3,4,5]]) assert.equal(validScores(input,5), false);
  assert.ok(validScores([0,100,99.99,0.01,80.5],5));
  assert.equal(weightedTotal([100,100,100,100,100,100]),100);
  assert.equal(weightedTotal([0,0,0,0,0,95]),9.5);
});
test('pending evaluations are excluded from averages and never become zero', () => {
  const result = ranking([{ teamId: 'tilcayos', total: 80 }, { teamId: 'tilcayos', total: 90 }]);
  assert.equal(result[0].average,85); assert.equal(result[0].count,2);
  assert.equal(result.find(t => t.id === 'novax').average,null);
});
