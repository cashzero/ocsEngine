#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical, FEATURE_KEYS, immutableProbe, loadEngine, observeControls, reconcileTargets, snapshotTargets, windowFromSource } from './ai-objective-replay.mjs';

const args = process.argv.slice(2);
const engineDirectory = resolve(args[args.indexOf('--engine') + 1] ?? 'dist');
const engine = await loadEngine(engineDirectory);
const fixtures = await import(pathToFileURL(join(engineDirectory, 'testing/index.js')).href);
const lifecycle = await import(pathToFileURL(join(engineDirectory, 'rules/lifecycle/lifecycle.js')).href);
const totals = (gained, lost, gainedVp, lostVp) => ({ objectivesGained: gained, objectivesLost: lost,
  objectiveVpGained: gainedVp, objectiveVpLost: lostVp });
const ledgerTargets = () => [
  { hexId: '1,1', points: 3, initialHolder: 'O', controlEvents: [] },
  { hexId: '4,4', points: 7, initialHolder: null, controlEvents: [] },
];
const frame = (revision, first, second) => ({ revision, mapState: { hexControl: [
  { hexId: '1,1', controllerId: first }, { hexId: '4,4', controllerId: second },
] } });
const frames = [frame(0, 'O', null), frame(1, 'P', 'P'), frame(2, 'O', null), frame(3, 'P', null)];
const targets = ledgerTargets();
for (let index = 1; index < frames.length; index += 1) {
  observeControls(targets, frames[index - 1], frames[index], { kind: 'MOVE_PIECE' }, index - 1);
}
const accounting = reconcileTargets(targets, frames.at(-1), ['P', 'O'], 'P', {
  P: totals(3, 2, 13, 10), O: totals(1, 2, 3, 6),
});
assert.deepEqual(targets[0].labels, { everCaptured: true, retainedCapture: true });
assert.deepEqual(targets[1].labels, { everCaptured: true, retainedCapture: false });
assert.equal(accounting.players.P.recaptures, 1);
assert.equal(accounting.players.P.signedVpDelta, 3);
assert.equal(accounting.players.O.signedVpDelta, -3);
assert.deepEqual(targets[0].controlEvents.map(({ from, to }) => [from, to]), [['O', 'P'], ['P', 'O'], ['O', 'P']]);
const swapped = [
  { hexId: '4,4', points: 7, initialHolder: null, controlEvents: [] },
  { hexId: '1,1', points: 3, initialHolder: 'O', controlEvents: [] },
];
for (let index = 1; index < frames.length; index += 1) observeControls(swapped, frames[index - 1], frames[index], { kind: 'MOVE_PIECE' }, index - 1);
reconcileTargets(swapped, frames.at(-1), ['P', 'O'], 'P', { P: totals(3, 2, 13, 10), O: totals(1, 2, 3, 6) });
assert.deepEqual(swapped[0].labels, targets[1].labels);
assert.deepEqual(swapped[1].labels, targets[0].labels);
assert.deepEqual(swapped[0].controlEvents, targets[1].controlEvents);
const wrongIds = ledgerTargets();
[wrongIds[0].hexId, wrongIds[1].hexId] = [wrongIds[1].hexId, wrongIds[0].hexId];
for (let index = 1; index < frames.length; index += 1) observeControls(wrongIds, frames[index - 1], frames[index], { kind: 'MOVE_PIECE' }, index - 1);
assert.throws(() => reconcileTargets(wrongIds, frames.at(-1), ['P', 'O'], 'P', {
  P: totals(3, 2, 13, 10), O: totals(1, 2, 3, 6),
}), /broken control history/);
const corrupted = structuredClone(targets); corrupted[0].controlEvents.splice(1, 1);
assert.throws(() => reconcileTargets(corrupted, frames.at(-1), ['P', 'O'], 'P', { P: totals(3, 2, 13, 10), O: totals(1, 2, 3, 6) }), /broken control history/);
const badExpected = { P: totals(2, 1, 10, 7), O: totals(1, 2, 3, 6) };
assert.throws(() => reconcileTargets(structuredClone(targets), frames.at(-1), ['P', 'O'], 'P', badExpected), /gross accounting mismatch/);

const base = fixtures.createRuleGameStateFixture();
const [P, O] = base.scenario.players.map(({ id }) => id);
const ground = base.pieceState.pieces.find(({ id }) => id === 'piece:ground');
const definition = base.scenario.pieceCatalog.definitions.find(({ id }) => id === ground.definitionId);
const unitDefinition = (id, ar, printed) => ({ ...definition, id, faces: definition.faces.map((face) => ({ ...face,
  steps: face.steps.map((step) => ({ ...step, actionRating: ar, combatStrength: printed })) })) });
const unit = (id, definitionId, ownerId, hexId, mode = 'COMBAT', oos = false) => ({ ...ground, id, definitionId, ownerId,
  mode, location: { kind: 'ON_MAP', hexId }, statuses: oos
    ? [{ statusDefinitionId: 'status:out-of-supply', value: { kind: 'FLAG', value: true } }] : [] });
const state = { ...base, configuration: { ...base.configuration, objectives: [{ hexId: '3,1', points: 3 }, { hexId: '4,4', points: 7 }] },
  scenario: { ...base.scenario, pieceCatalog: { ...base.scenario.pieceCatalog, definitions: [
    ...base.scenario.pieceCatalog.definitions, unitDefinition('definition:zero', 0, 2), unitDefinition('definition:four', 4, 4),
    unitDefinition('definition:two', 2, 2),
  ] } },
  mapState: { ...base.mapState, hexControl: [{ hexId: '3,1', controllerId: O }] },
  pieceState: { ...base.pieceState, pieces: [
    unit('own:zero', 'definition:zero', P, '2,1'), unit('own:dg-oos', 'definition:four', P, '3,0', 'DG', true),
    unit('own:b', 'definition:four', P, '2,1'), unit('own:a', 'definition:four', P, '2,1'),
    unit('own:strat', 'definition:four', P, '2,1', 'STRAT'),
    unit('enemy:zero', 'definition:zero', O, '3,1'), unit('enemy:two', 'definition:two', O, '3,1'),
    { ...base.pieceState.pieces.find(({ id }) => id === 'piece:hq'), location: { kind: 'ON_MAP', hexId: '2,1' } },
  ] } };
const original = canonical(state); const calls = [];
const instrumented = { ...engine, strength: { ...engine.strength, calculateCombatOdds: (...parameters) => {
  calls.push(parameters.slice(1)); return engine.strength.calculateCombatOdds(...parameters);
} } };
const observations = await immutableProbe(state, () => snapshotTargets(instrumented, state, 'meeting'));
assert.equal(canonical(state), original);
const computed = observations[0];
assert.equal(computed.conditions.combat.kind, 'computed');
assert.deepEqual(computed.conditions.combat.attackerLeader, { pieceId: 'own:a', actionRating: 4 });
assert.deepEqual(computed.conditions.combat.defenderLeader, { pieceId: 'enemy:two', actionRating: 2 });
assert.equal(computed.features.drm, 2);
assert.deepEqual(Object.keys(computed.features), FEATURE_KEYS);
assert.equal(calls.length, 2);
assert.deepEqual(calls[0][3], ['enemy:zero', 'enemy:two']); assert.deepEqual(calls[1][3], []);
for (const call of calls) {
  assert.equal(call[4], 'own:a'); assert.equal(call[5], 'enemy:two');
  assert.deepEqual(call[0], ['own:zero', 'own:dg-oos', 'own:b', 'own:a']);
}
assert(computed.conditions.combat.attackers.some(({ pieceId, outOfSupply, mode }) => pieceId === 'own:dg-oos' && outOfSupply && mode === 'DG'));
assert(!computed.conditions.ratio.own.some(({ pieceId }) => ['own:dg-oos', 'own:strat', 'piece:hq'].includes(pieceId)));
assert.equal(computed.conditions.ratio.ownStrength, 10);
assert.equal(computed.conditions.ratio.enemyStrength, 4);
assert.equal(computed.features.logRatio, Math.log1p(10 / 4));
assert.equal(observations[1].conditions.combat.kind, 'undefended');
assert.equal(observations[1].features.column, null);
assert.throws(() => { computed.features.occupied = 0; }, TypeError);
computed.labels = { everCaptured: true, retainedCapture: true };
assert.deepEqual(computed.features, snapshotTargets(engine, state, 'meeting')[0].features);
const noAdjacent = structuredClone(state);
noAdjacent.pieceState.pieces = noAdjacent.pieceState.pieces.filter((piece) => piece.ownerId !== P);
const missing = snapshotTargets(engine, noAdjacent, 'meeting')[0];
assert.equal(missing.conditions.combat.kind, 'noAdjacentFormation');
assert.equal(missing.features.nearestP, 10); assert.equal(missing.features.ownAbsent, 1);
const zero = structuredClone(state);
zero.pieceState.pieces = zero.pieceState.pieces.filter(({ id }) => ['own:zero', 'enemy:zero'].includes(id));
const zeroResult = snapshotTargets(engine, zero, 'meeting')[0];
assert.deepEqual(zeroResult.conditions.combat.attackerLeader, { pieceId: 'own:zero', actionRating: 0 });
assert.deepEqual(zeroResult.conditions.combat.defenderLeader, { pieceId: 'enemy:zero', actionRating: 0 });
assert.equal(zeroResult.features.drm, 0);
const mutable = structuredClone(state);
await assert.rejects(() => immutableProbe(mutable, () => { mutable.revision += 1; }), /observer query mutated/);
const undecided = lifecycle.applySequenceLifecycle(state, { ...state.sequence, gameTurn: 2,
  phase: 'FIRST_PLAYER', segment: 'NONE' }).state;
assert.equal(undecided.pendingDecision.kind, 'FIRST_PLAYER');
const selectedSecond = lifecycle.resolveFirstPlayerDecision(undecided, 'second');
assert.notEqual(selectedSecond.sequence.phasingPlayerId, undecided.sequence.phasingPlayerId);
assert.throws(() => snapshotTargets(engine, undecided), /turn order unresolved/);
assert.doesNotThrow(() => snapshotTargets(engine, selectedSecond));
const sourceRow = { gameTurn: 2, playerTurnIndex: 0, phasingPlayerId: 'P', attackerId: 'P', turn: { P: {}, O: {} } };
for (const choice of ['first', 'second']) {
  const traces = [{ stepKey: '2:0:FIRST_PLAYER:NONE', revision: 10, ordinal: 8,
    action: { kind: 'RESPOND_DECISION', actorId: 'P', choiceId: choice } },
  { stepKey: '2:0:REINFORCEMENT:NONE', revision: 11, ordinal: 9, action: { kind: 'PASS' } }];
  const window = windowFromSource(sourceRow, traces, 'game');
  assert.equal(window.phasingPlayerId, choice === 'first' ? 'P' : 'O');
  assert.equal(window.role, choice === 'first' ? 'attacker-moving' : 'defender-moving');
  assert.equal(window.recordedRole, 'attacker-moving');
  assert.equal(window.recordedStartRevision, 10); assert.equal(window.expectedStartRevision, 11);
  assert.deepEqual(window.firstPlayerDecision, { chooserId: 'P', choiceId: choice, revision: 10, actionIndex: 8 });
  const withoutChoice = windowFromSource(sourceRow, traces.slice(1), 'game');
  assert.equal(withoutChoice.phasingPlayerId, 'P'); assert.equal(withoutChoice.expectedStartRevision, 11);
  assert.equal(withoutChoice.firstPlayerDecision, null);
}
console.log(JSON.stringify({ status: 'PASS', checks: ['capture-release-recapture', 'ever-versus-retained', 'unequal-point-swapped-target-IDs',
  'gross-and-signed-accounting', 'corrupt-history-rejection', 'computed-real-adjacency', 'supplied-defender-contrast',
  'explicit-best-AR-leaders-and-ID-tie', 'legitimate-AR-zero', 'DG-OOS-conditional-members', 'ratio-cohort-exclusions',
  'undefended-and-no-adjacent', 'snapshot-feature-freezing', 'future-label-invariance', 'probe-state-immutability',
  'unresolved-first-player-rejection', 'post-choice-owner-role-and-revision'] }));
