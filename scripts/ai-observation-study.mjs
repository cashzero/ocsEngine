#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

const capture = async (m, enabled, policyKind = 'heuristic') => {
  const random = policyKind === 'random-legal';
  const request = { ...m.DEFAULT_NEW_GAME_REQUEST, turnLimit: random ? 1 : 2, engagement: 'ALLIED_ATTACKS',
    oob: { ...m.DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: random ? 1 : 2, armoredDivisionsPerSide: random ? 0 : 1 } };
  const prepared = m.prepareNewGame(request);
  assert.ok(prepared.ok, encode(prepared));
  const engine = m.createGameplayEngine(m.createMemoryGameplayPorts());
  const session = await engine.createSession({ scenario: prepared.value.scenario, configuration: prepared.value.configuration,
    rulesSeed: request.seeds.rules, bindings: prepared.value.bindings, label: 'observation equivalence', persistence: 'MANUAL' });
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
  const policy = random ? m.createRandomLegalPolicy()
    : m.createHeuristicPolicy({ scenario: prepared.value.scenario, turnLimit: request.turnLimit });
  const wrapped = { ...policy, decide: context => {
    const calls = [], draws = [];
    const wrap = (object, sink) => Object.fromEntries(Object.entries(object).map(([name, fn]) => [name, (...args) => {
      const result = fn(...args);
      sink.push({ name, args, result: hash(result) });
      return result;
    }]));
    const before = encode(context.memory);
    const chosen = policy.decide({ ...context, actions: wrap(context.actions, calls), rng: wrap(context.rng, draws) });
    decisions.push({ before, after: encode(context.memory), calls, draws, chosen });
    return chosen;
  } };
  const seats = prepared.value.bindings.map((binding, index) => ({ ...binding, policy: wrapped, seed: 700 + index }));
  const runner = m.createBotSeatRunner({ session, seats,
    ...(enabled ? { observation: { runId: 'equivalence', onDecision: observation => observations.push(observation) } } : {}) });
  for (let index = 0; index < 3000; index++) {
    const result = await runner.step();
    if (result.kind === 'FINISHED') break;
    assert.equal(result.kind, 'ACTED', encode(result));
    const trace = Object.fromEntries(['ordinal', 'seatId', 'policy', 'stepKey', 'revision', 'kind', 'action', 'intent',
      'score', 'breakdown', 'status', 'attempts', 'rejections'].map(key => [key, result.trace[key]]));
    steps.push({ trace, hash: session.getMetadata().stateHash });
  }
  assert.equal(session.getMetadata().lifecycle, 'FINISHED');
  const loaded = await engine.loadSession(session.serializeSave());
  assert.equal(loaded.getMetadata().stateHash, session.getMetadata().stateHash);
  return { request, initialStateHash: session.save().initialStateHash, decisions, steps, dispatches,
    finalStateHash: session.getMetadata().stateHash, acceptedActions: session.save().acceptedActions, observations };
};

const baselineEngine = await load(options.baseline);
const baseline = await capture(baselineEngine, false);
const current = await load(options.engine);
const disabled = await capture(current, false);
const enabled = await capture(current, true);
const withoutObservations = ({ observations, ...behavior }) => behavior;
const verifyObservations = record => {
  let dispatchIndex = 0;
  for (const [index, report] of record.observations.entries()) {
    const decision = record.decisions[index];
    assert.equal(report.decisionOrdinal, index);
    assert.equal(report.coverage, 'QUERY_ONLY');
    assert.equal(report.stateHash, index === 0 ? record.initialStateHash : record.steps[index - 1].hash);
    assert.equal(report.revision, record.steps[index].trace.revision);
    const candidates = new Map(report.candidates.map(candidate => [candidate.id, candidate]));
    assert.equal(candidates.size, report.candidates.length);
    assert.ok(report.candidates.every(candidate => candidate.policyEvaluation === 'NOT_INSTRUMENTED'));
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
const summary = { scope: 'Two deterministic fixtures, frozen baseline and observation off/on; no VP improvement claim',
  actions: enabled.steps.length, decisions: enabled.decisions.length,
  accessCalls: enabled.decisions.reduce((sum, row) => sum + row.calls.length, 0),
  rngCalls: enabled.decisions.reduce((sum, row) => sum + row.draws.length, 0),
  observations: enabled.observations.length, initialStateHash: enabled.initialStateHash, finalStateHash: enabled.finalStateHash,
  queryGenerations: enabled.observations.reduce((sum, report) => sum + report.queries.length, 0),
  queryCacheHits: enabled.observations.reduce((sum, report) => sum + report.queryCalls.filter(call => call.cacheHit).length, 0),
  candidateIdentities: enabled.observations.reduce((sum, report) => sum + report.candidates.length, 0),
  positiveRngControl: { policy: 'random-legal', actions: randomEnabled.steps.length, rngCalls: randomDraws,
    observations: randomEnabled.observations.length, finalStateHash: randomEnabled.finalStateHash },
  equality: ['policy choices', 'phase memory before and after every decision', 'access calls and result hashes', 'RNG calls and result hashes',
    'dispatch actions, statuses, events and violations', 'per-action state hashes', 'accepted action log', 'save/load final state'],
  hashes: Object.fromEntries(['baseline', 'disabled', 'enabled', 'random-baseline', 'random-disabled', 'random-enabled'].map(name => [name, createHash('sha256')
    .update(readFileSync(join(options.out, `${name}.json`))).digest('hex')])) };
writeFileSync(join(options.out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
