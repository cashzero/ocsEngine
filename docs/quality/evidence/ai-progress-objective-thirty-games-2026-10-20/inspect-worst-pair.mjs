import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as m from '../../dist/index.js';

const root = 'artifacts/ai-progress-objective-30games';
const results = JSON.parse(readFileSync(`${root}/results.json`));
const worst = [...results.pairs].sort((a, b) => a.vpMargin - b.vpMargin || a.firstMatch - b.firstMatch)[0];
const ids = [worst.firstMatch, worst.firstMatch + 1];
const saves = ids.map(id => JSON.parse(readFileSync(`${root}/matches/match-${id}.save.json`)));
assert.equal(saves[0].initialStateHash, saves[1].initialStateHash);
let prefix = 0;
while (prefix < Math.min(...saves.map(save => save.acceptedActions.length))
  && isDeepStrictEqual(saves[0].acceptedActions[prefix], saves[1].acceptedActions[prefix])) prefix++;
let state = m.parseGameStateJson(saves[0].initialSnapshot).value;
for (const action of saves[0].acceptedActions.slice(0, prefix)) {
  const next = m.ruleEngine.applyAction(state, action); assert.ok(next.ok); state = next.state;
}
const traces = ids.map(id => readFileSync(`${root}/matches/match-${id}.trace.jsonl`, 'utf8').trim().split('\n').map(JSON.parse));
const rows = [];
for (const [index, id] of ids.entries()) {
  const action = saves[index].acceptedActions[prefix];
  const trace = traces[index].find(row => row.revision === state.revision && isDeepStrictEqual(row.action, action));
  assert.ok(trace && trace.status === 'ACCEPTED' && trace.attempts === 1 && trace.rejections.length === 0);
  const parsed = /^combat to [-\d]+,[-\d]+ \((capture|assault|garrison) ([-\d]+,[-\d]+)\)$/.exec(trace.intent);
  assert.ok(parsed);
  const target = parsed[2], objective = state.configuration.objectives.find(o => o.hexId === target);
  assert.ok(objective);
  const distanceProgress = m.hexDistanceBetween(action.path[0], target) - m.hexDistanceBetween(action.path.at(-1), target);
  const weight = trace.policy === 'heuristic@85' ? 15 : 30;
  assert.ok(trace.policy === 'heuristic@85' || trace.policy === 'heuristic@85+progressObjective30-western');
  const scale = parsed[1] === 'garrison' ? 1 : objective.points / (state.configuration.objectives.reduce((n, o) => n + o.points, 0) / state.configuration.objectives.length);
  const progressTerm = trace.breakdown.filter(t => t.term === 'progress').reduce((n, t) => n + t.value, 0);
  assert.ok(Math.abs(progressTerm - distanceProgress * weight * scale) < 1e-10);
  assert.ok(Math.abs(trace.score - trace.breakdown.reduce((n, t) => n + t.value, 0)) < 1e-10);
  assert.ok(m.ruleEngine.applyAction(state, action).ok);
  rows.push({ match: id, actor: action.actorId, weight, pieceId: action.pieceId, purpose: parsed[1], target,
    targetPoints: objective.points, pointScale: scale, origin: action.path[0], destination: action.path.at(-1),
    distanceProgress, score: trace.score, terms: trace.breakdown });
}
assert.equal(rows[0].pieceId, rows[1].pieceId); assert.equal(rows[0].target, rows[1].target);
const output = { selection: 'lowest of all15 paired VP margins, ties byfirstMatch; post-result descriptive case',
  pair: worst, commonActions: prefix, sequence: state.sequence, revision: state.revision,
  preStateHash: (await m.hashGameState(state)).value, rows,
  limitation: 'Both later policies differ across paired games. This proves local score/choice sensitivity, not that the first move caused the terminal pair loss.' };
writeFileSync(`${root}/worst-pair-case.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output));
