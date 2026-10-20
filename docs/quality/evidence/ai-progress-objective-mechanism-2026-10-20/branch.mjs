import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as m from '../../dist/index.js';

const root = 'artifacts/ai-progress-objective-mechanism';
const source = 'artifacts/ai-progress-objective-30games';
const saveBytes = readFileSync(`${source}/matches/match-1800013.save.json`);
const save = JSON.parse(saveBytes);
const old15 = JSON.parse(readFileSync(`${source}/matches/match-1800012.save.json`));
const record = JSON.parse(readFileSync(`${source}/matches/summary.json`)).records.find(record => record.match === 1800013);
const initial = m.parseGameStateJson(save.initialSnapshot);
assert.ok(initial.ok);
const facts = { scenario: initial.value.scenario, turnLimit: initial.value.configuration.turnLimit };
const weights = JSON.parse(readFileSync(`${source}/weights.json`));
const branches = [], memories = [];
const prefixHashes = [save.initialStateHash];
let prefixState = initial.value;
for (const action of save.acceptedActions.slice(0, 9)) {
  const applied = m.ruleEngine.applyAction(prefixState, action);
  assert.ok(applied.ok); prefixState = applied.state;
  prefixHashes.push((await m.hashGameState(prefixState)).value);
}
assert.equal(prefixHashes[9], 'sha256:b8bae14c958036871b3b7930fa69b777bdcd3850b0df82640db22232fc655a0a');
const initialBinding = save.bindings.find(binding => binding.playerId
  === (initial.value.pendingDecision?.ownerId ?? initial.value.sequence.actingPlayerId));
assert.ok(initialBinding);
for (const forkWeight of [15, 30]) {
  const policies = new Map([[15, m.createHeuristicPolicy(facts)],
    [30, m.createHeuristicPolicy(facts, { weights: m.heuristicWeights(weights.weights), label: weights.label })]]);
  const session = await m.createGameplayEngine(m.createMemoryGameplayPorts()).loadSession(JSON.stringify({
    ...save, initialSnapshot: save.initialSnapshot, currentSnapshot: save.initialSnapshot,
    initialStateHash: save.initialStateHash, finalStateHash: save.initialStateHash,
    acceptedActions: [], acceptedActionMetadata: [], checkpoints: [], lifecycle: 'ACTIVE', activeSeatId: initialBinding.seatId,
  }));
  const mirror = new Map(), traces = [];
  let forkBefore = null, forkAfter = null;
  const seats = save.bindings.map(binding => ({ ...binding,
    seed: record.seeds[binding.playerId === 'player:axis' ? 'axis' : 'allied'],
    policy: { id: 'one-decision', version: 1, decide(context) {
      const revision = Number(context.view.stateRevision);
      const weight = revision < 9 ? (context.playerId === 'player:axis' ? 30 : 15) : revision === 9 ? forkWeight : 15;
      if (revision === 9) {
        assert.equal(context.playerId, 'player:axis');
        assert.equal(context.view.metadata.stateHash, prefixHashes[9]);
        const before = new Map(mirror); before.set(context.seatId, context.memory);
        forkBefore = structuredClone(before);
      }
      const decision = policies.get(weight).decide(context);
      assert.ok(decision);
      if (revision < 9) assert.deepEqual(decision.action, save.acceptedActions[revision]);
      if (revision === 9) {
        assert.deepEqual(decision.action, (forkWeight === 15 ? old15 : save).acceptedActions[9]);
        forkAfter = structuredClone(context.memory);
      }
      mirror.set(context.seatId, { ...context.memory, actions: context.memory.actions + 1 });
      return decision;
    } },
  }));
  const runner = m.createBotSeatRunner({ session, seats, nonce: `single-decision-${forkWeight}`,
    onDecision: trace => traces.push(trace) });
  let finished = false;
  for (let guard = 0; guard < 20000; guard++) {
    const step = await runner.step();
    if (step.kind === 'FINISHED') { finished = true; break; }
    assert.equal(step.kind, 'ACTED', JSON.stringify(step));
    assert.equal(step.trace.status, 'ACCEPTED');
    assert.equal(step.trace.attempts, 1);
    assert.equal(step.trace.rejections.length, 0);
    if (guard < 9) {
      assert.deepEqual(step.trace.action, save.acceptedActions[guard]);
      assert.equal(session.getMetadata().stateHash, prefixHashes[guard + 1]);
    }
  }
  assert.ok(finished, 'Continuation did not finish');
  const totals = runner.totals();
  assert.equal(totals.rejected, 0); assert.deepEqual(totals.errors, []);
  const delivered = session.save();
  const final = m.parseGameStateJson(delivered.currentSnapshot);
  assert.ok(final.ok);
  let replay = m.parseGameStateJson(delivered.initialSnapshot).value;
  for (const action of delivered.acceptedActions) {
    const applied = m.ruleEngine.applyAction(replay, action);
    assert.ok(applied.ok); replay = applied.state;
  }
  assert.equal((await m.hashGameState(replay)).value, delivered.finalStateHash);
  assert.ok(forkBefore && forkAfter);
  memories.push(forkBefore);
  const memoryEvidence = JSON.stringify({ before: forkBefore, afterPolicyCall: forkAfter },
    (_key, value) => value instanceof Map ? { type: 'Map', entries: [...value] }
      : value instanceof Set ? { type: 'Set', values: [...value] } : value, 2);
  writeFileSync(`${root}/branch-${forkWeight}.save.json`, `${JSON.stringify(delivered)}\n`);
  writeFileSync(`${root}/branch-${forkWeight}.trace.jsonl`, `${traces.map(trace => JSON.stringify(trace)).join('\n')}\n`);
  writeFileSync(`${root}/branch-${forkWeight}.memory.json`, `${memoryEvidence}\n`);
  branches.push({ forkWeight, acceptedActions: totals.accepted, rejected: totals.rejected, errors: totals.errors,
    initialStateHash: delivered.initialStateHash, preStateHash: prefixHashes[9], preRulesRng: prefixState.rng,
    forkAction: traces[9].action, forkIntent: traces[9].intent, finalStateHash: delivered.finalStateHash,
    victory: final.value.victory, finalRulesRng: final.value.rng,
    files: Object.fromEntries(['save.json', 'trace.jsonl', 'memory.json'].map(suffix => {
      const path = `${root}/branch-${forkWeight}.${suffix}`;
      return [suffix, { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }];
    })) });
  console.log(JSON.stringify(branches.at(-1)));
}
assert.deepEqual(memories[0], memories[1], 'Pre-intervention memories differ');
assert.equal(branches[0].preStateHash, branches[1].preStateHash);
assert.deepEqual(branches[0].preRulesRng, branches[1].preRulesRng);
const result = { sourceCommit: 'd12230fb8e60f77a3402873f50fd977883985dad',
  sourceSaveSha256: createHash('sha256').update(saveBytes).digest('hex'),
  scriptSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),
  protocolSha256: createHash('sha256').update(readFileSync(`${root}/branch-protocol.md`)).digest('hex'),
  commonPrefixActions: 9, commonPrefixPolicy: { axis: 30, allied: 15 },
  laterPolicies: { axis: 15, allied: 15 }, originalRulesRng: true, preMemoriesEqual: true,
  scope: 'Two single-decision policy interventions from a post-selected state, one original dice realization and one common later policy. Action-associated memory updates are included. No average causal effect or predictor qualification.',
  branches };
writeFileSync(`${root}/branch-results.json`, `${JSON.stringify(result, null, 2)}\n`);
