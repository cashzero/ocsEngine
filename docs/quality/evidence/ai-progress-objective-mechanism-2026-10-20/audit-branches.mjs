import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as m from '../../dist/index.js';

const root = 'artifacts/ai-progress-objective-mechanism';
const resultBytes = readFileSync(`${root}/branch-results.json`);
const result = JSON.parse(resultBytes);
const rows = [], memories = [];
for (const branch of result.branches) {
  for (const file of Object.values(branch.files))
    assert.equal(createHash('sha256').update(readFileSync(file.path)).digest('hex'), file.sha256);
  const save = JSON.parse(readFileSync(branch.files['save.json'].path));
  const traces = readFileSync(branch.files['trace.jsonl'].path, 'utf8').trim().split('\n').map(JSON.parse);
  const memory = JSON.parse(readFileSync(branch.files['memory.json'].path));
  memories.push(memory.before);
  assert.deepEqual(traces.map(trace => trace.action), save.acceptedActions);
  assert.ok(traces.every(trace => trace.status === 'ACCEPTED' && trace.attempts === 1 && trace.rejections.length === 0));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const stepsLost = { 'player:allied': 0, 'player:axis': 0 };
  let postRulesRng = null, postStateHash = null;
  for (const [at, action] of save.acceptedActions.entries()) {
    const next = m.ruleEngine.applyAction(state, action);
    assert.ok(next.ok);
    for (const event of next.events) if (event.kind === 'STEP_LOST') {
      const piece = state.pieceState.pieces.find(piece => piece.id === event.pieceId)
        ?? next.state.pieceState.pieces.find(piece => piece.id === event.pieceId);
      assert.ok(piece && Object.hasOwn(stepsLost, piece.ownerId));
      stepsLost[piece.ownerId]++;
    }
    state = next.state;
    if (at === 9) { postRulesRng = state.rng; postStateHash = (await m.hashGameState(state)).value; }
  }
  assert.equal((await m.hashGameState(state)).value, save.finalStateHash);
  assert.deepEqual(state.victory, branch.victory);
  rows.push({ forkWeight: branch.forkWeight, acceptedActions: save.acceptedActions.length,
    preRulesRng: branch.preRulesRng, postRulesRng, postStateHash, stepsLost, victory: state.victory,
    finalStateHash: save.finalStateHash, noRejectionOrFallback: true });
}
assert.deepEqual(memories[0], memories[1]);
const output = { sourceResultSha256: createHash('sha256').update(resultBytes).digest('hex'),
  scriptSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),
  preMemoriesEqual: true, independentlyReplayedActions: rows.reduce((n, row) => n + row.acceptedActions, 0), rows };
writeFileSync(`${root}/branch-audit.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output));
