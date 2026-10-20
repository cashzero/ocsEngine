import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = process.argv[2] ?? 'artifacts/ai-progress-combat-opportunity';
const engine = process.argv[3] ?? 'artifacts/ai-progress-objective-goal-continuity/engine';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path));
const registration = read(`${root}/registration.json`);
for (const [path, digest] of Object.entries(registration.files)) assert.equal(sha(readFileSync(path)), digest, path);
const tree = createHash('sha256');
for (const file of readdirSync(engine, { recursive: true }).filter(file => file.endsWith('.js')).sort())
  tree.update(file).update('\0').update(sha(readFileSync(`${engine}/${file}`))).update('\0');
assert.equal(tree.digest('hex'), registration.engineTreeSha256, 'Actual checker engine digest');
const m = await import(pathToFileURL(resolve(engine, 'index.js')).href);
const persistence = read('artifacts/ai-progress-objective-persistence/measurements.json');
const mechanism = read('artifacts/ai-progress-objective-mechanism/results.json');
const resumes = readFileSync('artifacts/ai-progress-objective-persistence/boundary-snapshots.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const truths = [], snapshots = [];
let replayedActions = 0, witnessedDeclarations = 0;
for (const firstMatch of registration.cases) {
  const pair = read(`${root}/pair-${firstMatch}.json`), source = persistence.rows.find(row => row.firstMatch === firstMatch);
  const original = mechanism.pairs.find(row => row.firstMatch === firstMatch).choices[0].target;
  const rawBytes = readFileSync(pair.provenance.rawPath); assert.equal(sha(rawBytes), pair.provenance.rawSha256);
  const raw = JSON.parse(gunzipSync(rawBytes).toString()), arms = [];
  for (const [index, arm] of pair.arms.entries()) {
    const observation = source.observations[index], saved = read(observation.path);
    assert.equal(sha(readFileSync(observation.path)), observation.sha256);
    const initial = resumes.find(row => row.firstMatch === firstMatch && row.path === observation.path);
    let replay = m.parseGameStateJson(initial.snapshot).value;
    assert.equal((await m.hashGameState(replay)).value, observation.boundary.stateHash);
    const witness = raw.find(row => row.armIndex === index); assert.ok(witness);
    const measured = m.parseGameStateJson(witness.snapshot); assert.ok(measured.ok);
    let entryState = null;
    for (let at = observation.boundary.at; at <= arm.at; at++) {
      const before = replay, applied = m.ruleEngine.applyAction(before, saved.acceptedActions[at]);
      assert.ok(applied.ok); replayedActions++; replay = applied.state;
      if (at !== arm.at) continue;
      assert.equal(m.serializeGameState(before).value, witness.containerBeforeSnapshot);
      assert.equal((await m.hashGameState(before)).value, arm.containerPreHash);
      assert.equal((await m.hashGameState(replay)).value, arm.containerPostHash);
      assert.deepEqual(applied.events, witness.allContainerEvents);
      assert.deepEqual(saved.acceptedActions[at], arm.action);
      let reconstructed = before;
      const regenerated = [];
      for (const event of applied.events.filter(event => event.kind === 'SEQUENCE_ADVANCED')) {
        assert.deepEqual(reconstructed.sequence, event.from);
        assert.deepEqual(m.nextSequence(reconstructed), event.to);
        const lifecycle = m.applySequenceLifecycle(reconstructed, event.to);
        reconstructed = lifecycle.state; regenerated.push(...lifecycle.events);
        if (event.sequence === arm.eventIndex) {
          assert.deepEqual(event, arm.entryEvent); entryState = reconstructed;
        }
      }
      assert.deepEqual(regenerated.map((event, sequence) => ({ ...event, sequence })), applied.events);
      assert.deepEqual({ ...reconstructed, revision: replay.revision }, replay);
    }
    assert.ok(entryState);
    assert.equal(m.serializeGameState(entryState).value, witness.snapshot);
    assert.equal((await m.hashGameState(entryState)).value, arm.stateHash);
    assert.equal(entryState.sequence.phase, 'COMBAT'); assert.equal(entryState.sequence.segment, 'COMBAT');
    assert.equal(entryState.sequence.gameTurn, observation.fork.gameTurn);
    assert.equal(entryState.sequence.playerTurnIndex, observation.fork.playerTurnIndex);
    assert.equal(entryState.sequence.phasingPlayerId, observation.fork.phasingPlayerId);
    const beforeQueries = m.serializeGameState(entryState).value;
    const query = m.ruleEngine.getActionCandidates(entryState, { actorId: 'player:axis', kind: 'DECLARE_COMBAT', pieceId: null, budget: 200 });
    assert.deepEqual(query, witness.candidates);
    assert.deepEqual(arm.query, { budget: 200, candidates: query.actions.length, truncated: query.truncated,
      actionsSha256: sha(JSON.stringify(query.actions)) });
    const actions = query.actions.filter(action => action.targetHexId === original);
    assert.ok(!query.truncated || actions.length);
    const witnesses = actions.map(action => {
      assert.ok(m.ruleEngine.validateAction(entryState, action).allowed);
      const supply = m.settleDeclaredAttackerSupply(entryState, action.actorId, action.attackerIds, action.attackerSupply);
      assert.deepEqual(supply.violations, []);
      const explanation = m.ruleEngine.explain(entryState, action); assert.ok(explanation.allowed);
      const strength = explanation.facts.find(fact => fact.key === 'combat.attackerStrength')?.value;
      assert.ok(typeof strength === 'number' && Number.isFinite(strength));
      return { action, attackerStrength: strength, externalPayments: supply.payments, internalIds: supply.internalIds };
    });
    const objective = entryState.configuration.objectives.find(objective => objective.hexId === original); assert.ok(objective);
    const holder = entryState.mapState.hexControl.find(control => control.hexId === original)?.controllerId ?? null;
    const scores = { 'player:axis': 0, 'player:allied': 0 };
    for (const objective of entryState.configuration.objectives) {
      const owner = entryState.mapState.hexControl.find(control => control.hexId === objective.hexId)?.controllerId;
      if (Object.hasOwn(scores, owner)) scores[owner] += objective.points;
    }
    const scale = objective.points / (entryState.configuration.objectives.reduce((sum, objective) => sum + objective.points, 0) / entryState.configuration.objectives.length);
    arms.push({ stateHash: arm.stateHash, sequence: entryState.sequence, revision: entryState.revision, targetPoints: objective.points, pointScale: scale,
      witnesses, scores, holder, attackAvailableValue: actions.length ? objective.points * (holder === 'player:axis' ? 0 : holder === null ? 1 : 2) : 0,
      offeredAttackStrength: witnesses.length ? Math.max(...witnesses.map(witness => witness.attackerStrength)) * scale : 0 });
    assert.equal(m.serializeGameState(entryState).value, beforeQueries, 'Rule query passivity');
    witnessedDeclarations += witnesses.length;
    snapshots.push({ firstMatch, armIndex: index, stateHash: arm.stateHash, containerPreHash: arm.containerPreHash, containerPostHash: arm.containerPostHash });
  }
  truths.push({ pair, original, arms });
}
const validate = (pair, truth) => {
  assert.equal(pair.originalTarget, truth.original, 'original target identity');
  for (const [index, arm] of pair.arms.entries()) {
    const actual = truth.arms[index];
    assert.deepEqual(arm.sequence, actual.sequence, 'exact Combat entry boundary');
    assert.equal(arm.internalBoundary, true); assert.equal(arm.revision, actual.revision);
    assert.equal(arm.containerPostRevision, actual.revision + 1);
    assert.equal(arm.stateHash, actual.stateHash);
    assert.equal(arm.witnesses.length, actual.witnesses.length);
    for (const [at, witness] of arm.witnesses.entries()) {
      for (const key of ['action', 'attackerStrength', 'externalPayments', 'internalIds'])
        assert.deepEqual(witness[key], actual.witnesses[at][key], key);
    }
    assert.deepEqual(arm.scores, actual.scores, 'current objective VP');
    assert.equal(arm.axisMargin, actual.scores['player:axis'] - actual.scores['player:allied'], 'current objective VP margin');
    assert.equal(arm.targetHolder, actual.holder);
    assert.equal(arm.targetPoints, actual.targetPoints); assert.equal(arm.pointScale, actual.pointScale);
    assert.equal(arm.attackAvailableValue, actual.attackAvailableValue, 'observed attack availability');
    assert.equal(arm.offeredAttackStrength, actual.offeredAttackStrength, 'best offered attack strength');
  }
  for (const [feature, field] of [['boundaryVp', 'axisMargin'], ['attackAvailableValue', 'attackAvailableValue'], ['offeredAttackStrength', 'offeredAttackStrength']])
    assert.equal(pair.features[feature], pair.arms[0][field] - pair.arms[1][field]);
};
for (const truth of truths) validate(truth.pair, truth);
const controls = [];
for (const kind of ['wrongOriginalTarget', 'wrongCombatBoundary', 'fabricatedAvailability', 'fabricatedConsistentVP']) {
  const truth = truths[0], pair = structuredClone(truth.pair); let expected;
  if (kind === 'wrongOriginalTarget') { pair.originalTarget = '999,999'; expected = /original target identity/; }
  else if (kind === 'wrongCombatBoundary') { pair.arms[0].sequence.segment = 'BARRAGE'; expected = /exact Combat entry boundary/; }
  else if (kind === 'fabricatedAvailability') { pair.arms[0].attackAvailableValue++; expected = /observed attack availability/; }
  else { pair.arms[0].axisMargin++; pair.features.boundaryVp++; expected = /current objective VP margin/; }
  assert.throws(() => validate(pair, truth), expected); controls.push({ kind, rejected: true, assertion: expected.source });
}
const sourcePath = 'artifacts/ai-progress-objective-30games/matches/match-1800001.save.json';
const saved = read(sourcePath);
let state = m.parseGameStateJson(saved.initialSnapshot).value;
for (const action of saved.acceptedActions.slice(0, 67)) {
  const applied = m.ruleEngine.applyAction(state, action); assert.ok(applied.ok); state = applied.state;
}
const stateHash = (await m.hashGameState(state)).value, originalSnapshot = m.serializeGameState(state).value;
const action = m.ruleEngine.getActionCandidates(state, { actorId: 'player:axis', kind: 'DECLARE_COMBAT', pieceId: null, budget: 200 }).actions
  .find(action => action.targetHexId === '17,7' && action.attackerIds.length === 3);
assert.ok(action && m.ruleEngine.validateAction(state, action).allowed);
const settlement = m.settleDeclaredAttackerSupply(state, action.actorId, action.attackerIds, action.attackerSupply);
assert.deepEqual(settlement.violations, []); assert.equal(settlement.payments.length, 1); assert.equal(settlement.payments[0].quantity, 3);
const resourceId = settlement.payments[0].resourcePieceId;
const underfunded = { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map(piece => piece.id === resourceId ? { ...piece, resourceQuantity: 2 } : piece) } };
const singles = action.attackerIds.map(pieceId => ({ ...action, attackerIds: [pieceId], leadAttackerId: pieceId,
  attackerSupply: action.attackerSupply.filter(choice => choice.pieceId === pieceId) }));
assert.ok(singles.every(single => m.ruleEngine.validateAction(underfunded, single).allowed), 'Every individual attacker must remain fundable');
const rejected = m.ruleEngine.validateAction(underfunded, action);
assert.equal(rejected.allowed, false, 'Joint declaration must reject double-counted shared supply');
assert.ok(rejected.violations.length > 0 && rejected.violations.every(violation => violation.path[0] === 'attackerSupply'));
const accepted = m.ruleEngine.applyAction(state, action); assert.ok(accepted.ok);
assert.equal(m.serializeGameState(state).value, originalSnapshot, 'Control must not mutate original history');
const paymentControl = { sourcePath, sourceSha256: sha(readFileSync(sourcePath)), at: 67, stateHash,
  resourceId, reservedTokens: 3, underfundedTokens: 2, individuallyLegalAttackers: singles.length,
  underfundedJointRejected: true, violations: rejected.violations, originalDeclarationAccepted: true,
  actualPendingDecision: accepted.state.pendingDecision?.kind ?? null, actualTransactionStep: accepted.state.activeTransaction?.step ?? null };
const output = { boundaries: snapshots.length, replayedActions, witnessedDeclarations, controls, paymentControl, snapshots,
  checkerSha256: sha(readFileSync(import.meta.filename)), registrationSha256: sha(readFileSync(`${root}/registration.json`)) };
writeFileSync(`${root}/checks.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ boundaries: snapshots.length, replayedActions, witnessedDeclarations, controls, paymentControl }));
