import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as m from '../../dist/index.js';

const root = 'artifacts/ai-progress-objective-goal-continuity';
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const data = JSON.parse(readFileSync(`${root}/measurements.json`));
const mechanism = JSON.parse(readFileSync('artifacts/ai-progress-objective-mechanism/results.json'));
const raw = readFileSync(`${root}/handoff-snapshots.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(raw.length, 30);
const truths = [];
for (const row of data.rows) {
  const source = mechanism.pairs.find(pair => pair.firstMatch === row.firstMatch);
  assert.ok(source);
  const truth = { firstMatch: row.firstMatch, target: source.choices[0].target, arms: [] };
  for (const arm of row.arms) {
    const entries = raw.filter(entry => entry.firstMatch === row.firstMatch && entry.path === arm.path);
    assert.equal(entries.length, 1);
    const entry = entries[0], parsed = m.parseGameStateJson(entry.snapshot);
    assert.ok(parsed.ok);
    const state = parsed.value;
    assert.equal((await m.hashGameState(state)).value, entry.stateHash);
    assert.equal(entry.internalBoundary, true);
    const scores = { 'player:axis': 0, 'player:allied': 0 };
    for (const objective of state.configuration.objectives) {
      const controller = state.mapState.hexControl.find(control => control.hexId === objective.hexId)?.controllerId;
      if (Object.hasOwn(scores, controller)) scores[controller] += objective.points;
    }
    const target = state.configuration.objectives.find(objective => objective.hexId === truth.target);
    assert.ok(target);
    const holder = state.mapState.hexControl.find(control => control.hexId === truth.target)?.controllerId ?? null;
    truth.arms.push({ path: arm.path, stateHash: entry.stateHash, eventIndex: entry.eventIndex,
      sequence: state.sequence, revision: state.revision, scores, axisMargin: scores['player:axis'] - scores['player:allied'],
      targetHolder: holder, targetPoints: target.points,
      targetMarginContribution: target.points * (holder === 'player:axis' ? 1 : holder === 'player:allied' ? -1 : 0) });
  }
  truths.push(truth);
}
const validate = observed => {
  assert.equal(observed.rows.length, truths.length);
  for (const [index, row] of observed.rows.entries()) {
    const truth = truths[index];
    assert.equal(row.firstMatch, truth.firstMatch);
    assert.equal(row.originalTarget, truth.target, 'original target identity');
    assert.equal(row.arms.length, 2);
    for (const [index, arm] of row.arms.entries()) {
      const actual = truth.arms[index], primary = arm.primary;
      assert.equal(arm.path, actual.path);
      assert.equal(primary.stateHash, actual.stateHash, 'internal snapshot identity');
      assert.equal(primary.internalBoundary, true, 'derived internal boundary tag');
      assert.equal(primary.eventIndex, actual.eventIndex);
      assert.equal(primary.departureEvent.sequence, actual.eventIndex);
      assert.equal(primary.departureEvent.from.phase, 'CLEAN_UP');
      assert.equal(primary.departureEvent.from.phasingPlayerId, 'player:axis');
      assert.deepEqual(primary.sequence, actual.sequence);
      assert.deepEqual(primary.departureEvent.to, actual.sequence);
      assert.equal(primary.revision, actual.revision, 'internal boundary revision');
      assert.equal(primary.containerPostRevision, actual.revision + 1, 'outer dispatch revision');
      assert.equal(primary.reconstruction.allEventsMatch, true);
      assert.equal(primary.reconstruction.normalizedFinalStateMatches, true);
      assert.deepEqual(primary.scores, actual.scores, 'current objective VP from raw control');
      for (const key of ['axisMargin', 'targetHolder', 'targetPoints', 'targetMarginContribution'])
        assert.equal(primary[key], actual[key], key);
    }
    assert.equal(row.allVpEffect, truth.arms[0].axisMargin - truth.arms[1].axisMargin);
    assert.equal(row.targetVpEffect, truth.arms[0].targetMarginContribution - truth.arms[1].targetMarginContribution);
  }
};
validate(data);
const controls = [];
for (const kind of ['wrongOriginalTarget', 'wrongCurrentVP', 'outerRevisionAsInternal']) {
  const altered = structuredClone(data);
  let expected;
  if (kind === 'wrongOriginalTarget') {
    altered.rows[0].originalTarget = '999,999'; expected = /original target identity/;
  } else if (kind === 'wrongCurrentVP') {
    altered.rows[0].arms[0].primary.scores['player:axis']++; expected = /current objective VP from raw control/;
  } else {
    altered.rows[0].arms[0].primary.revision = altered.rows[0].arms[0].primary.containerPostRevision;
    expected = /internal boundary revision/;
  }
  assert.throws(() => validate(altered), expected);
  controls.push({ kind, rejected: true, assertion: expected.source });
}
const output = { verifiedInternalSnapshots: raw.length, controls,
  scriptSha256: digest(import.meta.filename), measurementsSha256: digest(`${root}/measurements.json`),
  snapshotsSha256: digest(`${root}/handoff-snapshots.jsonl`),
  mechanismSha256: digest('artifacts/ai-progress-objective-mechanism/results.json'),
  scope: 'Raw derived snapshot checks; independent selective legal replay is recorded in final-review.md.' };
writeFileSync(`${root}/extraction-checks.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output));
