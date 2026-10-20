import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as m from '../../dist/index.js';

const root = 'artifacts/ai-progress-objective-original-continuation';
const firstMatch = Number(process.argv[2]);
const controlFull = process.argv.includes('--control-full');
const mechanism = JSON.parse(readFileSync('artifacts/ai-progress-objective-mechanism/results.json'));
const pair = mechanism.pairs.find(pair => pair.firstMatch === firstMatch);
assert.ok(pair);
assert.ok(!controlFull || firstMatch === 1800012);
const at = pair.commonActions;
const caseRoot = `${root}/pair-${firstMatch}`;
mkdirSync(caseRoot, { recursive: true });
const source = 'artifacts/ai-progress-objective-30games';
const saveBytes = readFileSync(`${source}/matches/match-${firstMatch + 1}.save.json`);
const save = JSON.parse(saveBytes);
const old15 = JSON.parse(readFileSync(`${source}/matches/match-${firstMatch}.save.json`));
const record = JSON.parse(readFileSync(`${source}/matches/summary.json`)).records.find(record => record.match === firstMatch + 1);
const initial = m.parseGameStateJson(save.initialSnapshot);
assert.ok(initial.ok);
const facts = { scenario: initial.value.scenario, turnLimit: initial.value.configuration.turnLimit };
const weights = JSON.parse(readFileSync(`${source}/weights.json`));
const branches = [], memories = [];
const prefixHashes = [save.initialStateHash];
let prefixState = initial.value;
for (const action of save.acceptedActions.slice(0, at)) {
  const applied = m.ruleEngine.applyAction(prefixState, action);
  assert.ok(applied.ok); prefixState = applied.state;
  prefixHashes.push((await m.hashGameState(prefixState)).value);
}
assert.equal(prefixHashes[at], pair.preStateHash);
const initialBinding = save.bindings.find(binding => binding.playerId
  === (initial.value.pendingDecision?.ownerId ?? initial.value.sequence.actingPlayerId));
assert.ok(initialBinding);
for (const forkWeight of [30, 15]) {
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
      const weight = context.playerId === 'player:axis' ? (revision === at ? forkWeight : 30) : 15;
      if (revision === at) {
        assert.equal(context.playerId, 'player:axis');
        assert.equal(context.view.metadata.stateHash, prefixHashes[at]);
        const before = new Map(mirror); before.set(context.seatId, context.memory);
        forkBefore = structuredClone(before);
      }
      const decision = policies.get(weight).decide(context);
      assert.ok(decision);
      if (revision < at) assert.deepEqual(decision.action, save.acceptedActions[revision]);
      if (revision === at) {
        assert.deepEqual(decision.action, (forkWeight === 15 ? old15 : save).acceptedActions[at]);
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
    if (guard < at || (controlFull && forkWeight === 30)) {
      assert.deepEqual(step.trace.action, save.acceptedActions[guard]);
      if (guard < at) assert.equal(session.getMetadata().stateHash, prefixHashes[guard + 1]);
    }
    if (forkWeight === 30 && !controlFull && guard === at) break;
  }
  assert.ok((forkWeight === 30 && !controlFull) || finished, 'Continuation did not finish');
  const totals = runner.totals();
  assert.equal(totals.rejected, 0); assert.deepEqual(totals.errors, []);
  const delivered = session.save();
  const final = m.parseGameStateJson(delivered.currentSnapshot);
  assert.ok(final.ok);
  let replay = m.parseGameStateJson(delivered.initialSnapshot).value;
  const stepsLost = { 'player:axis': 0, 'player:allied': 0 };
  let postRulesRng = null, postStateHash = null;
  for (const [index, action] of delivered.acceptedActions.entries()) {
    const applied = m.ruleEngine.applyAction(replay, action);
    assert.ok(applied.ok);
    for (const event of applied.events) if (event.kind === 'STEP_LOST') {
      const piece = replay.pieceState.pieces.find(piece => piece.id === event.pieceId)
        ?? applied.state.pieceState.pieces.find(piece => piece.id === event.pieceId);
      assert.ok(piece && Object.hasOwn(stepsLost, piece.ownerId));
      stepsLost[piece.ownerId]++;
    }
    replay = applied.state;
    if (index === at) { postRulesRng = replay.rng; postStateHash = (await m.hashGameState(replay)).value; }
  }
  assert.equal((await m.hashGameState(replay)).value, delivered.finalStateHash);
  if (controlFull && forkWeight === 30) {
    assert.deepEqual(delivered.acceptedActions, save.acceptedActions);
    assert.equal(delivered.finalStateHash, save.finalStateHash);
  }
  assert.ok(forkBefore && forkAfter);
  memories.push(forkBefore);
  const memoryEvidence = JSON.stringify({ before: forkBefore, afterPolicyCall: forkAfter },
    (_key, value) => value instanceof Map ? { type: 'Map', entries: [...value] }
      : value instanceof Set ? { type: 'Set', values: [...value] } : value, 2);
  writeFileSync(`${caseRoot}/branch-${forkWeight}.save.json`, `${JSON.stringify(delivered)}\n`);
  writeFileSync(`${caseRoot}/branch-${forkWeight}.trace.jsonl`, `${traces.map(trace => JSON.stringify(trace)).join('\n')}\n`);
  writeFileSync(`${caseRoot}/branch-${forkWeight}.memory.json`, `${memoryEvidence}\n`);
  branches.push({ forkWeight, finished, acceptedActions: totals.accepted, rejected: totals.rejected, errors: totals.errors,
    initialStateHash: delivered.initialStateHash, preStateHash: prefixHashes[at], preRulesRng: prefixState.rng,
    forkAction: traces[at].action, forkIntent: traces[at].intent, finalStateHash: delivered.finalStateHash,
    victory: final.value.victory, finalRulesRng: final.value.rng, postRulesRng, postStateHash, stepsLost,
    targetFinalHolder: final.value.mapState.hexControl.find(entry => entry.hexId === pair.choices[0].target)?.controllerId ?? null,
    files: Object.fromEntries(['save.json', 'trace.jsonl', 'memory.json'].map(suffix => {
      const path = `${caseRoot}/branch-${forkWeight}.${suffix}`;
      return [suffix, { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }];
    })) });
  console.log(JSON.stringify(branches.at(-1)));
}
assert.deepEqual(memories[0], memories[1], 'Pre-intervention memories differ');
assert.equal(branches[0].preStateHash, branches[1].preStateHash);
assert.deepEqual(branches[0].preRulesRng, branches[1].preRulesRng);
const result = { sourceCommit: 'ed7e706d45c5a2ea7a93dfc805319153ca28636c', firstMatch, controlFull,
  sourceSaveSha256: createHash('sha256').update(saveBytes).digest('hex'),
  scriptSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),
  protocolSha256: createHash('sha256').update(readFileSync(`${root}/protocol.md`)).digest('hex'),
  commonPrefixActions: at, commonPrefixPolicy: { axis: 30, allied: 15 },
  laterPolicies: { axis: 30, allied: 15 }, originalRulesRng: true, preMemoriesEqual: true,
  scope: 'One-decision15 counterfactual versus the recorded30 factual continuation. Same original prefix, rules RNG and lateraxis30/allied15. Control30 reconstructs the prefix and fork; the pilot also reproduces its full factual history. No predictor qualification.',
  branches };
writeFileSync(`${caseRoot}/branch-results.json`, `${JSON.stringify(result, null, 2)}\n`);
