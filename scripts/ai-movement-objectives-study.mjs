#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const proofEngine = '4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a';
const treeHash = directory => {
  const digest = createHash('sha256');
  for (const file of readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.js')).sort()) {
    digest.update(file).update('\0').update(sha256(readFileSync(join(directory, file)))).update('\0');
  }
  return digest.digest('hex');
};
const turnKey = sequence => `${sequence.gameTurn}:${sequence.playerTurnIndex}`;
const stepKey = sequence => `${turnKey(sequence)}:${sequence.phase}:${sequence.segment}`;
const holders = state => Object.fromEntries(state.configuration.objectives.map(({ hexId }) => [hexId,
  state.mapState.hexControl.find(entry => entry.hexId === hexId)?.controllerId ?? null]));
const compact = (state, hash) => ({ revision: state.revision, hash, sequence: { ...state.sequence }, holders: holders(state) });
const enteredObjectives = (action, objectives) => action?.kind === 'MOVE_PIECE'
  ? [...new Set(action.path.slice(1).filter(hexId => objectives.has(hexId)))] : [];
const groupOutcome = group => group.selectedCandidateId !== null ? 'SELECTED'
  : group.improvingOrder.length === 0 ? 'NO_IMPROVING' : 'SUPPLY_EXHAUSTED';
const hasControlProof = (engineHash, actionKind) => engineHash === proofEngine && actionKind === 'ADVANCE_SEQUENCE';
const endpoint = (closure, snapshots, final) => {
  if (!closure) return { status: 'CENSORED', reason: final.sequence.phase === 'COMPLETE' ? 'GAME_ENDED' : 'PREFIX_ENDED',
    observedThrough: { revision: final.revision, hash: final.hash } };
  const measured = snapshots[closure.postIndex];
  return { status: closure.objectiveControlProven ? 'OBSERVED' : 'UNAVAILABLE_INTERNAL_BOUNDARY',
    boundary: { dispatchIndex: closure.dispatchIndex, eventIndex: closure.eventIndex,
      turn: closure.turn, owner: closure.owner, from: closure.from, to: closure.to },
    measuredSnapshot: { revision: measured.revision, hash: measured.hash },
    ...(closure.objectiveControlProven ? { objectiveControlBasis: 'SOURCE_PROVEN_SEQUENCE_INVARIANCE' }
      : { reason: 'No verified objective holder at the internal lifecycle boundary' }) };
};
const horizons = (pre, player, closures, snapshots) => {
  const ownIndex = closures.findIndex(closure => closure.turn === turnKey(pre.sequence) && closure.owner === player
    && closure.postIndex > pre.snapshotIndex);
  const own = ownIndex < 0 ? null : closures[ownIndex];
  const opponent = ownIndex < 0 ? null : closures.slice(ownIndex + 1).find(closure => closure.owner !== player) ?? null;
  return { own, opponent, ownTurn: endpoint(own, snapshots, snapshots.at(-1)),
    afterOpponentTurn: endpoint(opponent, snapshots, snapshots.at(-1)) };
};
const objectiveResult = (hexId, points, player, preIndex, endIndex, horizon, snapshots, changes) => {
  const initialHolder = snapshots[preIndex].holders[hexId];
  const suffix = changes.filter(change => change.hexId === hexId && change.dispatchIndex >= preIndex);
  const at = (closure, evidence) => {
    if (evidence.status !== 'OBSERVED') return { ...evidence };
    const holder = snapshots[closure.postIndex].holders[hexId];
    const events = suffix.filter(change => change.dispatchIndex < closure.postIndex);
    const value = owner => owner === player ? 1 : owner === null ? 0 : -1;
    return { ...evidence, holder, held: holder === player,
      acquired: events.some(change => change.to === player), lost: events.some(change => change.from === player),
      ownControlledVpDelta: points * (Number(holder === player) - Number(initialHolder === player)),
      objectiveVpMarginDelta: points * (value(holder) - value(initialHolder)) };
  };
  return { hexId, points, initialHolder, initiallyHeld: initialHolder === player,
    postDecisionHolder: snapshots[endIndex].holders[hexId],
    acquiredInObservedSuffix: suffix.some(change => change.to === player),
    ownTurn: at(horizon.own, horizon.ownTurn), afterOpponentTurn: at(horizon.opponent, horizon.afterOpponentTurn) };
};
const acceptedForGroup = (attempts, ids) => {
  const accepted = attempts.filter(attempt => attempt.status === 'ACCEPTED');
  assert.ok(accepted.length <= 1, 'More than one accepted attempt in a decision');
  const decisionAccepted = accepted[0] ?? null;
  return { decisionAccepted, groupAccepted: decisionAccepted && ids.has(decisionAccepted.candidateId) ? decisionAccepted : null };
};

async function createSession(m, payload, provenance) {
  if (payload.request.fixture) {
    const bytes = readFileSync(payload.request.fixture);
    assert.equal(sha256(bytes), provenance.fixtureSha256, 'Recorded fixture identity mismatch');
    const parsed = m.parseGameStateJson(JSON.parse(gunzipSync(bytes)).snapshot);
    assert.ok(parsed.ok, 'Recorded snapshot does not parse');
    const game = await m.createGameplayFixture({ scenario: parsed.value.scenario, configuration: parsed.value.configuration });
    const serialized = m.serializeGameState(parsed.value), hashed = await m.hashGameState(parsed.value);
    assert.ok(serialized.ok && hashed.ok);
    return game.engine.loadSession(JSON.stringify({ ...game.session.save(), initialSnapshot: serialized.value,
      currentSnapshot: serialized.value, initialStateHash: hashed.value, finalStateHash: hashed.value }));
  }
  const prepared = m.prepareNewGame(payload.request);
  assert.ok(prepared.ok, 'Stored generation request rejected');
  const engine = m.createGameplayEngine(m.createMemoryGameplayPorts());
  return engine.createSession({ scenario: prepared.value.scenario, configuration: prepared.value.configuration,
    rulesSeed: payload.request.seeds.rules, bindings: prepared.value.bindings, label: 'observation equivalence', persistence: 'MANUAL' });
}

async function replay(m, payload, provenance, engineHash) {
  const session = await createSession(m, payload, provenance);
  session.start();
  const parseCurrent = () => {
    const parsed = m.parseGameStateJson(session.save().currentSnapshot);
    assert.ok(parsed.ok, 'Session snapshot does not parse');
    return parsed.value;
  };
  let state = parseCurrent(), cursor = 0;
  assert.equal(session.getMetadata().stateHash, payload.initialStateHash, 'Initial state identity mismatch');
  const objectives = new Map(state.configuration.objectives.map(objective => [objective.hexId, objective.points]));
  assert.equal(objectives.size, state.configuration.objectives.length, 'Duplicate objective identity');
  const players = state.scenario.players.map(player => player.id);
  assert.equal(players.length, 2, 'Two-player accounting required');
  const snapshots = [compact(state, payload.initialStateHash)], changes = [], closures = [], decisions = [];
  assert.equal(payload.observations.length, payload.steps.length, 'Decision/step coverage mismatch');
  assert.equal(payload.observations.length, payload.decisions.length, 'Decision/policy coverage mismatch');
  const identities = new Set();
  for (const [index, report] of payload.observations.entries()) {
    const identity = `${report.runId}:${report.decisionOrdinal}`;
    assert.ok(!identities.has(identity), 'Duplicate observation identity'); identities.add(identity);
    assert.equal(report.decisionOrdinal, index, 'Observation order mismatch');
    assert.equal(report.schemaVersion, report.coverage === 'QUERY_ONLY' ? 1 : 2, 'Report schema mismatch');
    assert.ok(['QUERY_ONLY', 'QUERY_AND_MOVEMENT'].includes(report.coverage), 'Unknown observation coverage');
    assert.equal(report.revision, state.revision, 'Observation pre-state revision mismatch');
    assert.equal(report.stateHash, session.getMetadata().stateHash, 'Observation pre-state hash mismatch');
    assert.equal(report.stepKey, stepKey(state.sequence), 'Observation sequence mismatch');
    assert.equal(session.getBindings().find(binding => binding.seatId === report.seatId)?.playerId,
      report.playerId, 'Observation seat/player mismatch');
    assert.equal(report.playerId, state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId, 'Decision actor mismatch');
    const candidates = new Map(report.candidates.map(candidate => [candidate.id, candidate.action]));
    assert.equal(candidates.size, report.candidates.length, 'Duplicate candidate identity');
    const trace = payload.steps[index].trace;
    assert.equal(trace.revision, state.revision, 'Trace pre-state mismatch');
    assert.equal(trace.seatId, report.seatId, 'Trace seat mismatch');
    assert.deepEqual(candidates.get(report.choice?.candidateId), payload.decisions[index].chosen?.action, 'Policy choice mismatch');
    const preIndex = cursor;
    for (const group of report.movementGroups ?? []) {
      assert.equal(report.coverage, 'QUERY_AND_MOVEMENT');
      assert.equal(state.sequence.phasingPlayerId, report.playerId, 'Movement group outside own turn');
      assert.ok(['MOVEMENT', 'EXPLOITATION'].includes(state.sequence.phase) && state.sequence.segment === 'MOVEMENT',
        'Movement group outside supported segment');
      assert.equal(state.pendingDecision, null, 'Movement group during pending decision');
      const piece = state.pieceState.pieces.find(piece => piece.id === group.pieceId);
      assert.ok(piece && piece.ownerId === report.playerId && piece.location.hexId === group.stay.origin, 'Movement piece identity mismatch');
      assert.equal(group.conditionCoverage, 'COMPOSITE_ONLY');
      for (const row of group.candidates) {
        const action = candidates.get(row.candidateId);
        assert.ok(action?.kind === 'MOVE_PIECE' && action.pieceId === group.pieceId && action.path[0] === group.stay.origin,
          'Movement candidate identity mismatch');
        assert.ok(Number.isFinite(row.retainedScore) && row.retainedScore === row.retainedTerms.reduce((n, term) => n + term.value, 0),
          'Movement retained score mismatch');
      }
    }
    const attempts = [];
    for (const attempt of report.attempts) {
      const recorded = payload.dispatches[cursor], action = candidates.get(attempt.candidateId);
      assert.ok(recorded && action, 'Attempt missing dispatch or candidate');
      assert.equal(attempt.requestId, recorded.requestId, 'Attempt request identity mismatch');
      assert.deepEqual(action, recorded.action, 'Attempt action identity mismatch');
      assert.equal(attempt.status, recorded.status, 'Attempt status mismatch');
      assert.equal(attempt.revision, recorded.revision, 'Attempt revision mismatch');
      assert.deepEqual(attempt.violations, recorded.violations.map(entry => entry.code), 'Attempt violation mismatch');
      const before = snapshots.at(-1);
      const result = await session.dispatch({ requestId: attempt.requestId, seatId: report.seatId, action });
      assert.equal(result.status, recorded.status, 'Replayed dispatch status mismatch');
      assert.equal(Number(result.revision), recorded.revision, 'Replayed dispatch revision mismatch');
      assert.deepEqual(result.events, recorded.events, 'Replayed events mismatch');
      assert.deepEqual(result.violations, recorded.violations, 'Replayed violations mismatch');
      assert.equal(session.getMetadata().stateHash, recorded.hash, 'Replayed state hash mismatch');
      state = parseCurrent();
      const after = compact(state, recorded.hash);
      assert.deepEqual(state.configuration.objectives, [...objectives].map(([hexId, points]) => ({ hexId, points })),
        'Objective configuration changed');
      for (const [hexId, points] of objectives) {
        if (before.holders[hexId] !== after.holders[hexId]) changes.push({ dispatchIndex: cursor, requestId: recorded.requestId,
          revision: after.revision, hexId, points, from: before.holders[hexId], to: after.holders[hexId], actionKind: action.kind });
      }
      const objectiveControlProven = hasControlProof(engineHash, action.kind);
      if (objectiveControlProven) assert.deepEqual(before.holders, after.holders, 'Lifecycle objective-control proof disproved');
      for (const [eventIndex, event] of result.events.entries()) {
        if (event.kind === 'SEQUENCE_ADVANCED' && event.from.phase === 'CLEAN_UP') closures.push({
          dispatchIndex: cursor, postIndex: cursor + 1, eventIndex, turn: turnKey(event.from), owner: event.from.phasingPlayerId,
          from: event.from, to: event.to, objectiveControlProven });
      }
      snapshots.push(after);
      attempts.push({ ...attempt, dispatchIndex: cursor }); cursor++;
    }
    assert.equal(payload.steps[index].hash, snapshots.at(-1).hash, 'Decision endpoint mismatch');
    assert.equal(trace.attempts, attempts.length, 'Trace attempt coverage mismatch');
    if (attempts.length) {
      assert.equal(trace.status, attempts.at(-1).status, 'Trace final status mismatch');
      assert.deepEqual(trace.action, candidates.get(attempts.at(-1).candidateId), 'Trace final action mismatch');
    }
    decisions.push({ report, candidates, attempts, preIndex, endIndex: cursor });
  }
  assert.equal(cursor, payload.dispatches.length, 'Unconsumed dispatches');
  assert.deepEqual(session.save().acceptedActions, payload.acceptedActions, 'Accepted history mismatch');
  assert.equal(snapshots.at(-1).hash, payload.finalStateHash, 'Final state identity mismatch');
  return { snapshots, changes, closures, decisions, objectives, players };
}

function describe(replayed, inputHash) {
  const { snapshots, changes, closures, decisions, objectives, players } = replayed;
  const groups = [];
  for (const { report, candidates, attempts, preIndex, endIndex } of decisions) {
    for (const [groupIndex, group] of (report.movementGroups ?? []).entries()) {
      const ids = new Set(group.candidates.map(row => row.candidateId));
      const { decisionAccepted, groupAccepted } = acceptedForGroup(attempts, ids);
      const acceptedAction = groupAccepted ? candidates.get(groupAccepted.candidateId) : null;
      const actualChanges = groupAccepted ? changes.filter(change => change.dispatchIndex === groupAccepted.dispatchIndex) : [];
      const selectedPathObjectives = enteredObjectives(candidates.get(group.selectedCandidateId), objectives);
      const acceptedPathObjectives = enteredObjectives(acceptedAction, objectives);
      const pathCandidates = new Map();
      for (const row of group.candidates) for (const hexId of enteredObjectives(candidates.get(row.candidateId), objectives)) {
        if (!pathCandidates.has(hexId)) pathCandidates.set(hexId, []);
        pathCandidates.get(hexId).push(row);
      }
      const assigned = group.assignedTarget;
      const assignedCategory = !assigned ? 'NONE' : objectives.has(assigned.hexId) ? 'OBJECTIVE' : 'NON_OBJECTIVE';
      const relevant = new Set([...pathCandidates.keys(), ...acceptedPathObjectives, ...actualChanges.map(change => change.hexId),
        ...(assignedCategory === 'OBJECTIVE' ? [assigned.hexId] : [])]);
      const pre = { ...snapshots[preIndex], snapshotIndex: preIndex };
      const horizon = horizons(pre, report.playerId, closures, snapshots);
      const objectiveRows = [...relevant].sort().map(hexId => {
        const routes = pathCandidates.get(hexId) ?? [];
        const evidenceBasis = [];
        if (assignedCategory === 'OBJECTIVE' && assigned.hexId === hexId) evidenceBasis.push('ASSIGNED_TARGET');
        if (routes.length) evidenceBasis.push('SCORED_PATH');
        if (acceptedPathObjectives.includes(hexId)) evidenceBasis.push('ACCEPTED_PATH');
        if (actualChanges.some(change => change.hexId === hexId)) evidenceBasis.push('ACCEPTED_CONTROL_CHANGE');
        return { ...objectiveResult(hexId, objectives.get(hexId), report.playerId, preIndex, endIndex, horizon, snapshots, changes),
          evidenceBasis, scoredCandidateIds: routes.map(row => row.candidateId),
          improvingCandidateIds: routes.filter(row => row.retainedScore > group.stay.score).map(row => row.candidateId),
          supplyCheckedCandidateIds: routes.filter(row => row.finalSupply.status === 'EVALUATED').map(row => row.candidateId),
          supplyPreservedCandidateIds: routes.filter(row => row.finalSupply.status === 'EVALUATED' && row.finalSupply.preserved).map(row => row.candidateId),
          selectedPathIncludes: selectedPathObjectives.includes(hexId), acceptedPathIncludes: acceptedPathObjectives.includes(hexId),
          immediateControlChanges: actualChanges.filter(change => change.hexId === hexId) };
      });
      groups.push({ id: `${inputHash}:${report.runId}:${report.decisionOrdinal}:${groupIndex}`,
        runId: report.runId, decisionOrdinal: report.decisionOrdinal, playerId: report.playerId, seatId: report.seatId,
        revision: report.revision, stateHash: report.stateHash, stepKey: report.stepKey,
        pieceId: group.pieceId, role: group.role, assignedTarget: assigned, assignedCategory, outcome: groupOutcome(group),
        scored: group.candidates.length, improving: group.improvingOrder.length, supplyChecked: group.supplyCheckedOrder.length,
        supplyRefused: group.candidates.filter(row => row.finalSupply.status === 'EVALUATED' && !row.finalSupply.preserved).length,
        selectedCandidateId: group.selectedCandidateId,
        selectedAttempts: attempts.filter(attempt => attempt.candidateId === group.selectedCandidateId), decisionAccepted, groupAccepted,
        acceptedMatchesSelection: groupAccepted === null ? null : groupAccepted.candidateId === group.selectedCandidateId,
        selectedPathObjectives, acceptedPathObjectives, objectiveRows });
    }
  }
  const rows = groups.flatMap(group => group.objectiveRows.map(row => ({ group, row })));
  const uniqueWindows = horizon => new Set(rows.filter(({ row }) => row[horizon].status === 'OBSERVED')
    .map(({ group, row }) => `${group.playerId}:${row.hexId}:${row[horizon].boundary.turn}:${row[horizon].boundary.owner}`)).size;
  const accounting = players.map(playerId => {
    const ownVp = snapshot => [...objectives].reduce((n, [hexId, points]) => n + (snapshot.holders[hexId] === playerId ? points : 0), 0);
    const gained = changes.filter(change => change.to === playerId).reduce((n, change) => n + change.points, 0);
    const lost = changes.filter(change => change.from === playerId).reduce((n, change) => n + change.points, 0);
    assert.equal(gained - lost, ownVp(snapshots.at(-1)) - ownVp(snapshots[0]), 'Objective VP ledger mismatch');
    return { playerId, startControlledVp: ownVp(snapshots[0]), endControlledVp: ownVp(snapshots.at(-1)), gained, lost };
  });
  const summary = { groups: groups.length, assignedObjectiveGroups: groups.filter(group => group.assignedCategory === 'OBJECTIVE').length,
    absentTargetGroups: groups.filter(group => group.assignedCategory === 'NONE').length,
    nonObjectiveTargetGroups: groups.filter(group => group.assignedCategory === 'NON_OBJECTIVE').length,
    objectiveRows: rows.length, ownTurnObservedRows: rows.filter(({ row }) => row.ownTurn.status === 'OBSERVED').length,
    afterOpponentObservedRows: rows.filter(({ row }) => row.afterOpponentTurn.status === 'OBSERVED').length,
    uniqueOwnTurnObjectiveWindows: uniqueWindows('ownTurn'), uniqueAfterOpponentObjectiveWindows: uniqueWindows('afterOpponentTurn'),
    immediateCaptureRows: rows.filter(({ group, row }) => row.immediateControlChanges.some(change => change.to === group.playerId)).length,
    assignedTargetImmediateCaptureRows: rows.filter(({ group, row }) => row.evidenceBasis.includes('ASSIGNED_TARGET')
      && row.immediateControlChanges.some(change => change.to === group.playerId)).length,
    supplyExhaustedGroups: groups.filter(group => group.outcome === 'SUPPLY_EXHAUSTED').length,
    supplyExhaustedAssignedObjectiveGroups: groups.filter(group => group.outcome === 'SUPPLY_EXHAUSTED' && group.assignedCategory === 'OBJECTIVE').length,
    endpointStatuses: Object.fromEntries(['ownTurn', 'afterOpponentTurn'].map(horizon => [horizon,
      Object.fromEntries([...new Set(rows.map(({ row }) => row[horizon].status))].map(status => [status, rows.filter(({ row }) => row[horizon].status === status).length]))])),
    accounting, predictiveQualification: 'NOT_TESTED' };
  return { summary, completedTurns: closures, objectiveControlChanges: changes, groups };
}

function selfTest() {
  const snapshots = [0, 1, 2, 3].map(revision => ({ revision, hash: `h${revision}`,
    sequence: { gameTurn: 1, playerTurnIndex: 0, phase: 'MOVEMENT' }, holders: { x: revision === 0 ? 'B' : 'A' } }));
  const closures = ['A', 'A', 'B'].map((owner, index) => ({ owner, turn: index === 0 ? '1:0' : `2:${index - 1}`,
    dispatchIndex: index, postIndex: index + 1, eventIndex: 0, objectiveControlProven: true }));
  const h = horizons({ ...snapshots[0], snapshotIndex: 0 }, 'A', closures, snapshots);
  assert.equal(h.own.postIndex, 1); assert.equal(h.opponent.postIndex, 3);
  const changes = [{ hexId: 'x', dispatchIndex: 0, from: 'B', to: 'A' }];
  const result = objectiveResult('x', 2, 'A', 0, 1, h, snapshots, changes);
  assert.equal(result.ownTurn.acquired, true); assert.equal(result.ownTurn.ownControlledVpDelta, 2);
  assert.equal(result.ownTurn.objectiveVpMarginDelta, 4);
  const alreadyHeld = objectiveResult('x', 2, 'A', 1, 1, h, snapshots, changes);
  assert.equal(alreadyHeld.initiallyHeld, true); assert.equal(alreadyHeld.ownTurn.acquired, false);
  for (const phase of ['MOVEMENT', 'COMPLETE']) {
    const final = { ...snapshots.at(-1), sequence: { phase } };
    const missing = endpoint(null, snapshots, final);
    assert.equal(missing.status, 'CENSORED'); assert.ok(!('held' in missing) && !('ownControlledVpDelta' in missing));
  }
  assert.equal(hasControlProof(proofEngine, 'ADVANCE_SEQUENCE'), true);
  assert.equal(hasControlProof(proofEngine, 'RESPOND_DECISION'), false);
  assert.equal(hasControlProof('different-build', 'ADVANCE_SEQUENCE'), false);
  const internal = [snapshots[0], { ...snapshots[3], holders: { x: 'B' } }];
  const unproven = closures.slice(0, 2).map(closure => ({ ...closure, postIndex: 1,
    objectiveControlProven: hasControlProof(proofEngine, 'RESPOND_DECISION') }));
  for (const closure of unproven) {
    const unavailable = endpoint(closure, internal, internal.at(-1));
    assert.equal(unavailable.status, 'UNAVAILABLE_INTERNAL_BOUNDARY'); assert.ok(!('held' in unavailable));
  }
  const fallback = acceptedForGroup([{ candidateId: 'chosen', status: 'REJECTED', requestId: 'r0' },
    { candidateId: 'alternative', status: 'ACCEPTED', requestId: 'r1' }], new Set(['chosen', 'alternative']));
  assert.equal(fallback.groupAccepted.candidateId, 'alternative'); assert.notEqual(fallback.groupAccepted.candidateId, 'chosen');
  assert.equal(acceptedForGroup([fallback.groupAccepted], new Set(['chosen'])).groupAccepted, null);
  console.log('Own-own-opponent, censoring, unavailable boundaries, VP accounting and alternative identity controls passed');
}

const options = {};
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === '--self-test') { options.selfTest = true; continue; }
  assert.ok(['--input', '--summary', '--provenance', '--engine', '--out'].includes(flag), `Unknown option ${flag}`);
  const value = process.argv[++index]; assert.ok(value && !value.startsWith('--'), `Missing value for ${flag}`);
  options[flag.slice(2)] = value;
}
if (options.selfTest) selfTest();
else {
  for (const name of ['input', 'summary', 'provenance', 'engine', 'out']) assert.ok(options[name], `--${name} required`);
  const inputBytes = readFileSync(options.input), summaryBytes = readFileSync(options.summary), provenanceBytes = readFileSync(options.provenance);
  const summary = JSON.parse(summaryBytes), provenance = JSON.parse(provenanceBytes), payload = JSON.parse(inputBytes);
  const inputHash = sha256(inputBytes), engineHash = treeHash(options.engine);
  assert.equal(inputHash, summary.hashes[basename(options.input, '.json')], 'Input is not bound to supplied equivalence summary');
  assert.equal(sha256(provenanceBytes), summary.hashes.provenance, 'Producer provenance is not bound to summary');
  assert.equal(engineHash, provenance.engineTreeSha256, 'Replay engine differs from producer build');
  const started = performance.now();
  const m = await import(pathToFileURL(resolve(options.engine, 'index.js')).href);
  const result = describe(await replay(m, payload, provenance, engineHash), inputHash);
  const output = { schemaVersion: 1, provenance: { input: options.input, inputSha256: inputHash, summarySha256: sha256(summaryBytes),
    producerProvenanceSha256: sha256(provenanceBytes), engineTreeSha256: engineHash,
    scriptSha256: sha256(readFileSync(new URL(import.meta.url))), node: process.version,
    boundaryProofEngineTreeSha256: proofEngine, elapsedMs: performance.now() - started }, ...result };
  mkdirSync(dirname(options.out), { recursive: true }); writeFileSync(options.out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ out: options.out, ...result.summary }));
}
