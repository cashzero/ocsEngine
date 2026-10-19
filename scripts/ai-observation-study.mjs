#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const options = { engine: 'dist', baseline: null, out: 'artifacts/ai-decision-observability-study/equivalence' };
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag !== '--engine' && flag !== '--baseline' && flag !== '--out') throw new Error(`Unknown option ${flag}`);
  const value = process.argv[++index];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  options[flag.slice(2)] = value;
}
if (!options.baseline) throw new Error('--baseline must name the frozen pre-observation build');
const encode = value => JSON.stringify(value, (_key, item) => item instanceof Map ? { map: [...item] }
  : item instanceof Set ? { set: [...item] } : item);
const hash = value => createHash('sha256').update(encode(value)).digest('hex');
const load = directory => import(pathToFileURL(resolve(directory, 'index.js')).href);
mkdirSync(options.out, { recursive: true });
const sourceFiles = ['src/ai/model.ts', 'src/ai/observation.ts', 'src/ai/seat-runner.ts', 'src/ai/policies/heuristic.ts',
  'scripts/ai-match.mjs', 'scripts/ai-observation-study.mjs', 'tests/ai/movement-observation.test.ts'];
const digestFile = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, digestFile(file)]));
const treeHash = directory => {
  const digest = createHash('sha256');
  for (const file of readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.js')).sort()) {
    digest.update(file).update('\0').update(digestFile(join(directory, file))).update('\0');
  }
  return digest.digest('hex');
};
writeFileSync(join(options.out, 'provenance.json'), JSON.stringify({ command: process.argv, node: process.version,
  commit: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
  sources: sourceHashes, sourceSetSha256: hash(sourceHashes),
  fixtureSha256: digestFile('tests/ai/fixtures/vp-trace-gain-1221000.state.json.gz'),
  engineTreeSha256: treeHash(options.engine), baselineTreeSha256: treeHash(options.baseline) }, null, 2) + '\n');

const capture = async (m, enabled, policyKind = 'heuristic', policyModule = m) => {
  const random = policyKind === 'random-legal';
  const recorded = policyKind === 'recorded-movement';
  const request = { ...m.DEFAULT_NEW_GAME_REQUEST, turnLimit: random ? 1 : 2, engagement: 'ALLIED_ATTACKS',
    oob: { ...m.DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: random ? 1 : 2, armoredDivisionsPerSide: random ? 0 : 1 } };
  const prepared = m.prepareNewGame(request);
  assert.ok(prepared.ok, encode(prepared));
  let engine = m.createGameplayEngine(m.createMemoryGameplayPorts());
  let session = await engine.createSession({ scenario: prepared.value.scenario, configuration: prepared.value.configuration,
    rulesSeed: request.seeds.rules, bindings: prepared.value.bindings, label: 'observation equivalence', persistence: 'MANUAL' });
  let scenario = prepared.value.scenario, turnLimit = request.turnLimit;
  if (recorded) {
    const fixture = JSON.parse(gunzipSync(readFileSync('tests/ai/fixtures/vp-trace-gain-1221000.state.json.gz')));
    const parsed = m.parseGameStateJson(fixture.snapshot);
    assert.ok(parsed.ok, 'Recorded movement state must parse');
    const state = parsed.value;
    const game = await m.createGameplayFixture({ scenario: state.scenario, configuration: state.configuration });
    engine = game.engine;
    const snapshot = m.serializeGameState(state), hashed = await m.hashGameState(state);
    assert.ok(snapshot.ok && hashed.ok, 'Recorded movement state must serialize and hash');
    session = await engine.loadSession(JSON.stringify({ ...game.session.save(), initialSnapshot: snapshot.value,
      currentSnapshot: snapshot.value, initialStateHash: hashed.value, finalStateHash: hashed.value }));
    scenario = state.scenario;
    turnLimit = state.configuration.turnLimit;
  }
  session.start();
  const observations = [], decisions = [], steps = [], dispatches = [];
  const actualDispatch = session.dispatch;
  session.dispatch = async request => {
    const result = await actualDispatch(request);
    dispatches.push({ action: request.action, status: result.status, events: result.events,
      requestId: request.requestId, revision: Number(result.revision),
      violations: result.violations, hash: session.getMetadata().stateHash });
    return result;
  };
  const policy = random ? policyModule.createRandomLegalPolicy()
    : policyModule.createHeuristicPolicy({ scenario, turnLimit });
  const wrapped = { ...policy, decide: context => {
    const calls = [], draws = [];
    const wrap = (object, sink) => Object.fromEntries(Object.entries(object).map(([name, fn]) => [name, (...args) => {
      const result = fn(...args);
      sink.push({ name, args, result: hash(result), value: structuredClone(result),
        ...(name === 'explain' ? { explanation: result.explanation } : {}) });
      return result;
    }]));
    const before = encode(context.memory);
    const chosen = policy.decide({ ...context, actions: wrap(context.actions, calls), rng: wrap(context.rng, draws) });
    const projection = context.view.projection;
    decisions.push({ before, after: encode(context.memory), calls, draws, chosen,
      movementInputs: projection ? { playerId: context.playerId,
        opponentTurnRemains: turnLimit - projection.sequence.gameTurn > 0 || projection.sequence.playerTurnIndex === 0,
        objectives: projection.objectives,
        pieces: projection.stacks.flatMap(stack => stack.pieces.map(piece => ({ id: piece.id, role: piece.role,
          location: stack.location }))) } : null });
    return chosen;
  } };
  const seats = session.getBindings().map((binding, index) => ({ ...binding, policy: wrapped, seed: (recorded ? 7 : 700) + index }));
  const runner = m.createBotSeatRunner({ session, seats,
    ...(enabled ? { observation: { runId: 'equivalence', onDecision: observation => observations.push(observation) } } : {}) });
  for (let index = 0; index < (recorded ? 30 : 3000); index++) {
    const result = await runner.step();
    if (result.kind === 'FINISHED') break;
    assert.equal(result.kind, 'ACTED', encode(result));
    const trace = Object.fromEntries(['ordinal', 'seatId', 'policy', 'stepKey', 'revision', 'kind', 'action', 'intent',
      'score', 'breakdown', 'status', 'attempts', 'rejections'].map(key => [key, result.trace[key]]));
    steps.push({ trace, hash: session.getMetadata().stateHash });
  }
  if (!recorded) assert.equal(session.getMetadata().lifecycle, 'FINISHED');
  const loaded = await engine.loadSession(session.serializeSave());
  assert.equal(loaded.getMetadata().stateHash, session.getMetadata().stateHash);
  assert.deepEqual(loaded.save().acceptedActions, session.save().acceptedActions);
  assert.deepEqual(loaded.save().acceptedActionMetadata, session.save().acceptedActionMetadata);
  return { request: recorded ? { fixture: 'tests/ai/fixtures/vp-trace-gain-1221000.state.json.gz', prefix: 30 } : request,
    initialStateHash: session.save().initialStateHash, decisions, steps, dispatches,
    finalStateHash: session.getMetadata().stateHash, acceptedActions: session.save().acceptedActions, observations };
};

const baselineEngine = await load(options.baseline);
const baseline = await capture(baselineEngine, false);
const current = await load(options.engine);
const disabled = await capture(current, false);
const enabled = await capture(current, true);
const withoutObservations = ({ observations, ...behavior }) => behavior;
const movementCounts = { groups: 0, scoredCandidates: 0, correctionApplied: 0, correctionRefused: 0,
  correctionBudget: 0, notEligible: 0, supplyRefused: 0, notImproving: 0, earlierSelected: 0, selected: 0 };
const verifyMovement = (report, decision, candidates) => {
  const sum = terms => terms.reduce((total, term) => total + term.value, 0);
  const explanations = decision.calls.filter(call => call.name === 'explain');
  let explainIndex = 0;
  const consume = (id, explanation) => {
    while (explainIndex < explanations.length) {
      const call = explanations[explainIndex++];
      if (encode(call.args[0]) === encode(candidates.get(id).action) && encode(call.explanation) === encode(explanation)) return;
    }
    assert.fail(`Movement check ${id} has no matching actual explanation in call order`);
  };
  for (const group of report.movementGroups ?? []) {
    movementCounts.groups++;
    movementCounts.scoredCandidates += group.candidates.length;
    assert.equal(group.conditionCoverage, 'COMPOSITE_ONLY');
    assert.equal(group.stay.score, sum(group.stay.terms));
    const piece = decision.movementInputs.pieces.find(piece => piece.id === group.pieceId);
    assert.ok(piece && piece.role !== 'TRUCK');
    assert.equal(group.role, piece.role);
    assert.equal(piece.location.hexId, group.stay.origin);
    const inputs = decision.movementInputs;
    const swing = candidate => {
      const action = candidates.get(candidate.candidateId).action;
      if (piece.role !== 'COMBAT' || inputs.opponentTurnRemains
        && !inputs.objectives.some(o => o.controllerId !== inputs.playerId && o.hexId === action.path.at(-1))) return 0;
      return inputs.objectives.filter(o => o.controllerId !== inputs.playerId && action.path.slice(1).includes(o.hexId))
        .reduce((total, o) => total + o.points * (o.controllerId === null ? 1 : 2), 0);
    };
    const withoutSupply = candidate => sum(candidate.baseTerms.filter(term => term.term !== 'out-of-supply'));
    const eligible = group.candidates.filter(candidate => candidate.baseTerms.some(term => term.term === 'out-of-supply')
      && ['COMBAT', 'ARTILLERY', 'HQ'].includes(piece.role) && withoutSupply(candidate) > group.stay.score)
      .sort((a, b) => swing(b) - swing(a) || withoutSupply(b) - withoutSupply(a)).map(candidate => candidate.candidateId);
    assert.deepEqual(group.correctionEligibleOrder, eligible);
    assert.equal(group.correctionLimit, 12);
    assert.deepEqual(group.correctionCheckedOrder, eligible.slice(0, 12));
    const improving = group.candidates.filter(candidate => candidate.retainedScore > group.stay.score)
      .sort((a, b) => swing(b) - swing(a) || b.retainedScore - a.retainedScore).map(candidate => candidate.candidateId);
    assert.deepEqual(group.improvingOrder, improving);
    const rows = new Map(group.candidates.map(candidate => [candidate.candidateId, candidate]));
    assert.equal(rows.size, group.candidates.length);
    for (const id of group.correctionCheckedOrder) consume(id, rows.get(id).correction.explanation);
    for (const id of group.supplyCheckedOrder) consume(id, rows.get(id).finalSupply.explanation);
    const survivor = group.supplyCheckedOrder.find(id => rows.get(id).finalSupply.preserved) ?? null;
    assert.equal(group.selectedCandidateId, survivor);
    const checkedCount = survivor === null ? improving.length : improving.indexOf(survivor) + 1;
    assert.deepEqual(group.supplyCheckedOrder, improving.slice(0, checkedCount));
    if (survivor !== null) {
      movementCounts.selected++;
      assert.equal(report.choice.candidateId, survivor);
      assert.equal(report.choice.score, rows.get(survivor).retainedScore);
      assert.deepEqual(report.choice.breakdown, rows.get(survivor).retainedTerms);
    }
    for (const candidate of group.candidates) {
      const id = candidate.candidateId, action = candidates.get(id).action;
      assert.equal(action.kind, 'MOVE_PIECE');
      assert.equal(action.pieceId, group.pieceId);
      assert.ok(report.queries.some(query => query.kind === 'MOVE_PIECE' && query.pieceId === group.pieceId && query.candidates.includes(id)));
      assert.equal(candidate.baseScore, sum(candidate.baseTerms));
      assert.equal(candidate.retainedScore, sum(candidate.retainedTerms));
      const correction = candidate.correction;
      if (group.correctionCheckedOrder.includes(id)) {
        assert.equal(correction.status, 'EVALUATED');
        const value = key => correction.explanation.facts.find(fact => fact.key === key)?.value;
        assert.equal(correction.allowed, correction.explanation.allowed);
        assert.equal(correction.applied, correction.allowed && value('supply.relocationMoverHasTrace') === true
          && value('supply.relocationTraceLost') === 0 && value('supply.relocationFeedLost') === 0);
        assert.deepEqual(candidate.retainedTerms, correction.retainedTerms);
        if (correction.applied) {
          movementCounts.correctionApplied++;
          assert.ok(candidate.baseTerms.some(term => term.term === 'out-of-supply'));
          assert.ok(!candidate.retainedTerms.some(term => term.term === 'out-of-supply'));
          assert.deepEqual(candidate.retainedTerms.filter(term => term.term !== 'hq-dependent-supply'),
            candidate.baseTerms.filter(term => term.term !== 'out-of-supply' && term.term !== 'hq-dependent-supply'));
        } else {
          movementCounts.correctionRefused++;
          assert.deepEqual(candidate.retainedTerms, candidate.baseTerms);
        }
      } else {
        assert.deepEqual(correction, { status: 'NOT_EVALUATED', reason: eligible.includes(id) ? 'CORRECTION_BUDGET' : 'NOT_ELIGIBLE' });
        movementCounts[eligible.includes(id) ? 'correctionBudget' : 'notEligible']++;
        assert.deepEqual(candidate.retainedTerms, candidate.baseTerms);
      }
      const supply = candidate.finalSupply;
      if (group.supplyCheckedOrder.includes(id)) {
        assert.equal(supply.status, 'EVALUATED');
        const value = key => supply.explanation.facts.find(fact => fact.key === key)?.value;
        assert.equal(supply.preserved, supply.explanation.allowed && value('supply.relocationOtherTraceLost') === 0
          && value('supply.relocationFeedLost') === 0 && value('supply.relocationTraceLost') === 0);
        if (!supply.preserved) movementCounts.supplyRefused++;
      } else {
        const isImproving = improving.includes(id);
        assert.deepEqual(supply, { status: 'NOT_EVALUATED', reason: isImproving ? 'EARLIER_CANDIDATE_SELECTED' : 'NOT_IMPROVING' });
        if (isImproving) assert.notEqual(survivor, null);
        movementCounts[isImproving ? 'earlierSelected' : 'notImproving']++;
      }
    }
  }
};
const verifyObservations = record => {
  let dispatchIndex = 0;
  for (const [index, report] of record.observations.entries()) {
    const decision = record.decisions[index];
    assert.equal(report.decisionOrdinal, index);
    assert.ok(report.coverage === 'QUERY_ONLY' || report.coverage === 'QUERY_AND_MOVEMENT');
    assert.equal(report.schemaVersion, report.coverage === 'QUERY_ONLY' ? 1 : 2);
    if (report.coverage === 'QUERY_ONLY') assert.ok(!('movementGroups' in report));
    else assert.ok(report.movementGroups.length > 0);
    assert.equal(report.stateHash, index === 0 ? record.initialStateHash : record.steps[index - 1].hash);
    assert.equal(report.revision, record.steps[index].trace.revision);
    const candidates = new Map(report.candidates.map(candidate => [candidate.id, candidate]));
    assert.equal(candidates.size, report.candidates.length);
    const scoredIds = new Set((report.movementGroups ?? []).flatMap(group => group.candidates.map(candidate => candidate.candidateId)));
    assert.ok(report.candidates.every(candidate => candidate.policyEvaluation
      === (scoredIds.has(candidate.id) ? 'MOVEMENT_DESTINATION' : 'NOT_INSTRUMENTED')));
    const queries = new Map(report.queries.map(query => [query.id, query]));
    assert.equal(queries.size, report.queries.length);
    const calls = decision.calls.filter(call => call.name === 'candidates');
    assert.equal(calls.length, report.queryCalls.length);
    const usedQueries = new Set();
    for (const [callIndex, call] of calls.entries()) {
      const use = report.queryCalls[callIndex];
      const query = queries.get(use.queryId);
      assert.ok(query);
      assert.deepEqual([query.kind, query.pieceId, query.budget], [call.args[0], call.args[1] ?? null, call.args[2] ?? 400]);
      assert.equal(use.cacheHit, usedQueries.has(query.id));
      usedQueries.add(query.id);
      assert.equal(hash(query.candidates.map(id => candidates.get(id).action)), call.result);
    }
    assert.equal(usedQueries.size, queries.size);
    assert.deepEqual(candidates.get(report.choice.candidateId).action, decision.chosen.action);
    assert.equal(report.choice.score, decision.chosen.score);
    assert.deepEqual(report.choice.breakdown, decision.chosen.breakdown);
    assert.deepEqual(report.choice.alternatives.map(id => candidates.get(id).action), decision.chosen.alternatives);
    verifyMovement(report, decision, candidates);
    for (const attempt of report.attempts) {
      const dispatch = record.dispatches[dispatchIndex++];
      assert.deepEqual(candidates.get(attempt.candidateId).action, dispatch.action);
      assert.equal(attempt.requestId, dispatch.requestId);
      assert.equal(attempt.status, dispatch.status);
      assert.equal(attempt.revision, dispatch.revision);
      assert.deepEqual(attempt.violations, dispatch.violations.map(violation => violation.code));
    }
  }
  assert.equal(dispatchIndex, record.dispatches.length);
};
assert.deepEqual(withoutObservations(disabled), withoutObservations(baseline), 'Current disabled behavior differs from frozen baseline');
assert.deepEqual(withoutObservations(enabled), withoutObservations(baseline), 'Observed behavior differs from frozen baseline');
assert.equal(disabled.observations.length, 0);
assert.equal(enabled.observations.length, enabled.decisions.length, 'Observation must complete for every decision');
verifyObservations(enabled);
for (const [name, value] of Object.entries({ baseline, disabled, enabled })) {
  writeFileSync(join(options.out, `${name}.json`), encode(value) + '\n');
}
const randomBaseline = await capture(baselineEngine, false, 'random-legal');
const randomDisabled = await capture(current, false, 'random-legal');
const randomEnabled = await capture(current, true, 'random-legal');
assert.deepEqual(withoutObservations(randomDisabled), withoutObservations(randomBaseline), 'Random disabled behavior differs from baseline');
assert.deepEqual(withoutObservations(randomEnabled), withoutObservations(randomBaseline), 'Random observed behavior differs from baseline');
assert.equal(randomEnabled.observations.length, randomEnabled.decisions.length);
const randomDraws = randomEnabled.decisions.reduce((sum, row) => sum + row.draws.length, 0);
assert.ok(randomDraws > 0, 'Random control must execute RNG calls');
verifyObservations(randomEnabled);
for (const [name, value] of Object.entries({ 'random-baseline': randomBaseline, 'random-disabled': randomDisabled, 'random-enabled': randomEnabled })) {
  writeFileSync(join(options.out, `${name}.json`), encode(value) + '\n');
}
const frozenControl = await capture(current, true, 'heuristic', baselineEngine);
assert.deepEqual(withoutObservations(frozenControl), withoutObservations(baseline), 'Frozen policy under new runner differs from baseline');
verifyObservations(frozenControl);
assert.ok(frozenControl.observations.every(report => report.coverage === 'QUERY_ONLY' && report.schemaVersion === 1),
  'Policy without movement writer must remain query-only');
writeFileSync(join(options.out, 'frozen-policy-control.json'), encode(frozenControl) + '\n');
const recordedBaseline = await capture(baselineEngine, false, 'recorded-movement');
const recordedDisabled = await capture(current, false, 'recorded-movement');
const recordedEnabled = await capture(current, true, 'recorded-movement');
assert.deepEqual(withoutObservations(recordedDisabled), withoutObservations(recordedBaseline), 'Recorded disabled behavior differs from baseline');
assert.deepEqual(withoutObservations(recordedEnabled), withoutObservations(recordedBaseline), 'Recorded observed behavior differs from baseline');
assert.equal(recordedEnabled.observations.length, 30);
verifyObservations(recordedEnabled);
for (const [name, value] of Object.entries({ 'recorded-baseline': recordedBaseline, 'recorded-disabled': recordedDisabled, 'recorded-enabled': recordedEnabled })) {
  writeFileSync(join(options.out, `${name}.json`), encode(value) + '\n');
}
assert.ok(movementCounts.groups > 0 && movementCounts.correctionApplied > 0 && movementCounts.correctionRefused > 0
  && movementCounts.correctionBudget > 0 && movementCounts.supplyRefused > 0 && movementCounts.notImproving > 0
  && movementCounts.earlierSelected > 0, 'Study must exercise movement correction, budget and final-supply branches');
const summary = { scope: 'Three deterministic fixtures, frozen baseline and observation off/on, frozen-policy writer control; no VP improvement claim',
  actions: enabled.steps.length, decisions: enabled.decisions.length,
  accessCalls: enabled.decisions.reduce((sum, row) => sum + row.calls.length, 0),
  rngCalls: enabled.decisions.reduce((sum, row) => sum + row.draws.length, 0),
  observations: enabled.observations.length, initialStateHash: enabled.initialStateHash, finalStateHash: enabled.finalStateHash,
  queryGenerations: enabled.observations.reduce((sum, report) => sum + report.queries.length, 0),
  queryCacheHits: enabled.observations.reduce((sum, report) => sum + report.queryCalls.filter(call => call.cacheHit).length, 0),
  candidateIdentities: enabled.observations.reduce((sum, report) => sum + report.candidates.length, 0),
  positiveRngControl: { policy: 'random-legal', actions: randomEnabled.steps.length, rngCalls: randomDraws,
    observations: randomEnabled.observations.length, finalStateHash: randomEnabled.finalStateHash },
  movementCounts,
  reportCoverageCounts: Object.fromEntries(['QUERY_ONLY', 'QUERY_AND_MOVEMENT'].map(coverage => [coverage,
    [...enabled.observations, ...recordedEnabled.observations].filter(report => report.coverage === coverage).length])),
  recordedMovement: { actions: recordedEnabled.steps.length,
    movementChoices: recordedEnabled.steps.filter(step => step.trace.action.kind === 'MOVE_PIECE').length,
    moveQueries: recordedEnabled.decisions.flatMap(decision => decision.calls).filter(call => call.name === 'candidates' && call.args[0] === 'MOVE_PIECE').length,
    explanations: recordedEnabled.decisions.flatMap(decision => decision.calls).filter(call => call.name === 'explain').length,
    finalStateHash: recordedEnabled.finalStateHash },
  frozenPolicyControl: { observations: frozenControl.observations.length, coverage: 'QUERY_ONLY' },
  gaps: ['Atomic predicate evaluation, other policy branches, target/control joins and causal VP prediction remain uninstrumented',
    'Verification fixtures establish passivity and local payload integrity, not policy strength or full P10 closure'],
  equality: ['policy choices', 'phase memory before and after every decision', 'access calls and result hashes', 'RNG calls and result hashes',
    'dispatch actions, statuses, events and violations', 'per-action state hashes', 'accepted action log', 'save/load final state'],
  hashes: Object.fromEntries(['baseline', 'disabled', 'enabled', 'random-baseline', 'random-disabled', 'random-enabled', 'frozen-policy-control',
    'recorded-baseline', 'recorded-disabled', 'recorded-enabled', 'provenance'].map(name => [name, createHash('sha256')
    .update(readFileSync(join(options.out, `${name}.json`))).digest('hex')])) };
writeFileSync(join(options.out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
