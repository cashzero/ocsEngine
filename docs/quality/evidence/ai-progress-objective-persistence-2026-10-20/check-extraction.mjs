import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as m from '../../dist/index.js';

const root = 'artifacts/ai-progress-objective-persistence';
const data = JSON.parse(readFileSync(`${root}/measurements.json`));
const mechanism = JSON.parse(readFileSync('artifacts/ai-progress-objective-mechanism/results.json'));
const truths = [], snapshots = [];
let replayedActions = 0;
for (const row of data.rows) {
  const pair = mechanism.pairs.find(pair => pair.firstMatch === row.firstMatch);
  assert.ok(pair);
  const truth = { target: pair.choices[0].target, pointScale: pair.choices[0].pointScale, observations: [] };
  for (const observed of row.observations) {
    const save = JSON.parse(readFileSync(observed.path));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    for (const action of save.acceptedActions.slice(0, observed.boundary.at)) {
      const applied = m.ruleEngine.applyAction(state, action);
      assert.ok(applied.ok); state = applied.state; replayedActions++;
    }
    assert.equal((await m.hashGameState(state)).value, observed.boundary.stateHash);
    const action = save.acceptedActions[observed.boundary.at];
    const exit = m.ruleEngine.applyAction(state, action);
    assert.ok(exit.ok); replayedActions++;
    assert.equal((await m.hashGameState(exit.state)).value, observed.boundary.postStateHash);
    assert.deepEqual(action, observed.boundary.exitAction);
    assert.ok(exit.events.some(event => event.kind === 'SEQUENCE_ADVANCED'
      && JSON.stringify(event) === JSON.stringify(observed.boundary.exitEvent)));
    const piece = state.pieceState.pieces.find(piece => piece.id === pair.choices[0].pieceId);
    assert.equal(piece?.location.kind, 'ON_MAP');
    assert.ok(piece.remainingSteps > 0);
    const scores = Object.fromEntries(m.calculateVictory(state).scores.map(score => [score.playerId, score.points]));
    truth.observations.push({ distance: m.hexDistanceBetween(piece.location.hexId, truth.target), scores,
      axisMargin: scores['player:axis'] - scores['player:allied'], piece });
    snapshots.push({ firstMatch: row.firstMatch, path: observed.path, stateHash: observed.boundary.stateHash,
      snapshot: m.serializeGameState(state).value });
  }
  truths.push(truth);
}
const validate = observed => {
  assert.equal(observed.rows.length, truths.length);
  for (const [index, row] of observed.rows.entries()) {
    const truth = truths[index];
    assert.equal(row.target, truth.target, 'target identity');
    assert.equal(row.pointScale, truth.pointScale, 'objective value scale');
    for (const [arm, observation] of row.observations.entries()) {
      assert.equal(observation.boundary.distance, truth.observations[arm].distance, 'unit distance');
      assert.deepEqual(observation.boundary.currentScores, truth.observations[arm].scores, 'current VP, not cached victory');
      assert.equal(observation.boundary.axisMargin, truth.observations[arm].axisMargin, 'current VP margin');
      assert.deepEqual(observation.boundary.piece.location, truth.observations[arm].piece.location, 'unit location');
    }
    assert.equal(row.retainedScaledProgress, (truth.observations[1].distance - truth.observations[0].distance) * truth.pointScale);
    assert.equal(row.boundaryVpEffect, truth.observations[0].axisMargin - truth.observations[1].axisMargin);
  }
  assert.equal(observed.coverage.availableRetainedProgress, observed.rows.length);
  assert.equal(observed.coverage.identicalToFirstProgress, observed.rows.every(row => Math.abs(row.retainedScaledProgress - row.initialScaledProgress) < 1e-9));
};
validate(data);
const controls = [];
for (const kind of ['wrongTarget', 'wrongDistance', 'cachedVictoryAsCurrent']) {
  const changed = structuredClone(data);
  let expected;
  if (kind === 'wrongTarget') { changed.rows[0].target = '999,999'; expected = /target identity/; }
  else if (kind === 'wrongDistance') { changed.rows[0].observations[0].boundary.distance++; expected = /unit distance/; }
  else {
    const chosen = changed.rows.flatMap(row => row.observations).find(observation => {
      const cached = Object.fromEntries(observation.boundary.cachedVictory.scores.map(score => [score.playerId, score.points]));
      return JSON.stringify(cached) !== JSON.stringify(observation.boundary.currentScores);
    });
    assert.ok(chosen, 'No genuine stale cached VP case to test');
    chosen.boundary.currentScores = Object.fromEntries(chosen.boundary.cachedVictory.scores.map(score => [score.playerId, score.points]));
    expected = /current VP, not cached victory/;
  }
  assert.throws(() => validate(changed), expected);
  controls.push({ kind, rejected: true, expected: expected.source });
}
writeFileSync(`${root}/boundary-snapshots.jsonl`, `${snapshots.map(row => JSON.stringify(row)).join('\n')}\n`);
const output = { scriptSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),
  verifiedBoundarySnapshots: snapshots.length, replayedActions, controls,
  snapshotsSha256: createHash('sha256').update(readFileSync(`${root}/boundary-snapshots.jsonl`)).digest('hex') };
writeFileSync(`${root}/extraction-checks.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output));
