import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const options = { root: 'artifacts/ai-progress-dice-reproducibility', engine: 'artifacts/ai-progress-objective-goal-continuity/engine' };
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index].slice(2), value = process.argv[index + 1];
  assert.ok(['root', 'engine', 'case', 'mode'].includes(key) && value); options[key] = value;
}
assert.ok(options.case && ['control', 'resample'].includes(options.mode));
assert.ok(options.mode !== 'control' || Number(options.case) === 1800026);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path));
const encode = value => JSON.stringify(value, (_key, item) => item instanceof Map ? { type: 'Map', entries: [...item] }
  : item instanceof Set ? { type: 'Set', values: [...item] } : item);
const revive = (_key, value) => value?.type === 'Map' ? new Map(value.entries) : value?.type === 'Set' ? new Set(value.values) : value;
const registration = read(`${options.root}/registration.json`), scriptSha256 = sha(readFileSync(import.meta.filename));
for (const [path, digest] of Object.entries(registration.files)) assert.equal(sha(readFileSync(path)), digest, `Registered input changed ${path}`);
const tree = createHash('sha256');
for (const path of readdirSync(options.engine, { recursive: true }).filter(path => path.endsWith('.js')).sort())
  tree.update(path).update('\0').update(sha(readFileSync(`${options.engine}/${path}`))).update('\0');
assert.equal(tree.digest('hex'), registration.engineTreeSha256);
const m = await import(pathToFileURL(resolve(options.engine, 'index.js')).href);
const trial = registration.cases.find(row => row.firstMatch === Number(options.case)); assert.ok(trial);
const sourceBytes = readFileSync(trial.sourceSave), source = JSON.parse(sourceBytes);
const sourceTraces = readFileSync(trial.sourceTrace, 'utf8').trim().split('\n').map(JSON.parse);
const initial = m.parseGameStateJson(source.initialSnapshot); assert.ok(initial.ok);
const weights = read('artifacts/ai-progress-objective-30games/weights.json');
const record = read('artifacts/ai-progress-objective-30games/matches/summary.json').records.find(record => record.match === trial.firstMatch + 1);
const sourceMemories = new Map([30, 15].map(weight => [weight, JSON.parse(readFileSync(trial.memories[weight], 'utf8'), revive)]));
assert.deepEqual(sourceMemories.get(30).before, sourceMemories.get(15).before);
const out = `${options.root}/${options.mode}/pair-${trial.firstMatch}`; mkdirSync(out, { recursive: true });
const results = [];
for (const forkWeight of [30, 15]) {
  const started = performance.now();
  const expectedSave = forkWeight === 30 ? source : read(trial.counterSave);
  const expectedTraces = forkWeight === 30 ? sourceTraces : readFileSync(trial.counterTrace, 'utf8').trim().split('\n').map(JSON.parse);
  const actor = initial.value.pendingDecision?.ownerId ?? initial.value.sequence.actingPlayerId;
  let activeSession = await m.createGameplayEngine(m.createMemoryGameplayPorts()).loadSession(JSON.stringify({
    ...source, currentSnapshot: source.initialSnapshot, finalStateHash: source.initialStateHash,
    acceptedActions: [], acceptedActionMetadata: [], checkpoints: [], lifecycle: 'ACTIVE',
    activeSeatId: source.bindings.find(binding => binding.playerId === actor).seatId,
  }));
  let dispatchEvents = null, accepted = 0, replay = initial.value, swapped = false, finished = false;
  let forkBefore = null, forkAfter = null, sourceFork = null, newFork = null, newForkHash = null;
  const mirror = new Map(), traces = [], losses = { 'player:axis': 0, 'player:allied': 0 };
  const prefixLosses = { 'player:axis': 0, 'player:allied': 0 };
  const session = new Proxy({}, { get(_target, key) {
    if (key === 'dispatch') return async request => {
      const result = await activeSession.dispatch(request); dispatchEvents = result.events; return result;
    };
    const value = Reflect.get(activeSession, key, activeSession);
    return typeof value === 'function' ? value.bind(activeSession) : value;
  } });
  const facts = { scenario: initial.value.scenario, turnLimit: initial.value.configuration.turnLimit };
  const policies = new Map([[15, m.createHeuristicPolicy(facts)],
    [30, m.createHeuristicPolicy(facts, { weights: m.heuristicWeights(weights.weights), label: weights.label })]]);
  const seats = source.bindings.map(binding => ({ ...binding,
    seed: record.seeds[binding.playerId === 'player:axis' ? 'axis' : 'allied'],
    policy: { id: 'future-dice', version: 1, decide(context) {
      const atFork = accepted === trial.forkAt;
      assert.equal(Number(context.view.stateRevision), accepted);
      if (atFork) {
        assert.ok(swapped); assert.equal(context.playerId, 'player:axis');
        assert.equal(context.view.metadata.stateHash, newForkHash);
        const complete = new Map(mirror); complete.set(context.seatId, context.memory);
        forkBefore = structuredClone(complete);
        assert.deepEqual(forkBefore, sourceMemories.get(forkWeight).before, 'Complete actual pre-policy memories');
      }
      const weight = context.playerId === 'player:axis' ? (atFork ? forkWeight : 30) : 15;
      const decision = policies.get(weight).decide(context); assert.ok(decision);
      if (atFork) {
        const expected = expectedTraces[trial.forkAt];
        assert.deepEqual(decision.action, expected.action, 'Original fork action');
        assert.equal(decision.intent, expected.intent, 'Original fork intent');
        assert.equal(decision.score, expected.score, 'Original fork score');
        assert.deepEqual(decision.breakdown, expected.breakdown, 'Original fork score terms');
        forkAfter = structuredClone(context.memory);
        assert.deepEqual(forkAfter, sourceMemories.get(forkWeight).afterPolicyCall, 'Action-associated phase notes');
      }
      mirror.set(context.seatId, { ...context.memory, actions: context.memory.actions + 1 });
      return decision;
    } },
  }));
  const runner = m.createBotSeatRunner({ session, seats, nonce: `dice-${options.mode}-${trial.firstMatch}-${forkWeight}`,
    onDecision: trace => traces.push(trace) });
  for (let guard = 0; guard < 20000; guard++) {
    if (!swapped && accepted === trial.forkAt) {
      sourceFork = replay;
      assert.equal((await m.hashGameState(sourceFork)).value, trial.originalForkHash);
      assert.deepEqual(sourceFork.rng, trial.originalForkRng);
      const state = options.mode === 'control' ? sourceFork.rng.state : m.createRulesRng(trial.futureSeed).state;
      if (options.mode === 'resample') assert.notEqual(state, sourceFork.rng.state, 'Future dice must genuinely differ');
      newFork = { ...sourceFork, rng: { ...sourceFork.rng, state } };
      assert.deepEqual({ ...newFork, rng: sourceFork.rng }, sourceFork, 'Unchanged non-RNG fork state');
      assert.equal(newFork.rng.draws, sourceFork.rng.draws, 'Preserved past draw counter');
      newForkHash = (await m.hashGameState(newFork)).value;
      if (options.mode === 'resample') assert.notEqual(newForkHash, trial.originalForkHash);
      const snapshot = m.serializeGameState(newFork).value;
      activeSession = await m.createGameplayEngine(m.createMemoryGameplayPorts()).loadSession(JSON.stringify({
        ...source, initialSnapshot: snapshot, currentSnapshot: snapshot,
        initialStateHash: newForkHash, finalStateHash: newForkHash,
        acceptedActions: [], acceptedActionMetadata: [], checkpoints: [], lifecycle: 'ACTIVE',
        activeSeatId: source.bindings.find(binding => binding.playerId === (newFork.pendingDecision?.ownerId ?? newFork.sequence.actingPlayerId)).seatId,
      }));
      assert.equal(activeSession.getMetadata().stateHash, newForkHash);
      assert.equal(activeSession.save().currentSnapshot, snapshot);
      replay = newFork; swapped = true;
    }
    const before = replay, step = await runner.step();
    if (step.kind === 'FINISHED') { finished = true; break; }
    assert.equal(step.kind, 'ACTED'); assert.equal(step.trace.status, 'ACCEPTED');
    assert.equal(step.trace.attempts, 1); assert.deepEqual(step.trace.rejections, []);
    if (accepted < trial.forkAt || options.mode === 'control') {
      const expected = accepted < trial.forkAt ? sourceTraces[accepted] : expectedTraces[accepted];
      assert.deepEqual(step.trace.action, expected.action, `Historical action ${accepted}`);
      assert.equal(step.trace.intent, expected.intent, `Historical intent ${accepted}`);
    }
    const applied = m.ruleEngine.applyAction(before, step.trace.action); assert.ok(applied.ok);
    assert.deepEqual(applied.events, dispatchEvents, `Independent events ${accepted}`);
    replay = applied.state;
    assert.equal((await m.hashGameState(replay)).value, session.getMetadata().stateHash, `Independent hash ${accepted}`);
    for (const event of applied.events) if (event.kind === 'STEP_LOST') {
      const piece = before.pieceState.pieces.find(piece => piece.id === event.pieceId)
        ?? replay.pieceState.pieces.find(piece => piece.id === event.pieceId); assert.ok(piece);
      const tally = accepted < trial.forkAt ? prefixLosses : losses; assert.ok(Object.hasOwn(tally, piece.ownerId)); tally[piece.ownerId]++;
    }
    accepted++;
    if (accepted % 100 === 0) console.log(JSON.stringify({ progress: true, firstMatch: trial.firstMatch, mode: options.mode, forkWeight,
      accepted, gameTurn: replay.sequence.gameTurn, revision: replay.revision }));
  }
  assert.ok(finished && swapped && forkBefore && forkAfter, 'Complete run required');
  assert.equal(session.getMetadata().lifecycle, 'FINISHED');
  const totals = runner.totals(); assert.equal(totals.rejected, 0); assert.deepEqual(totals.errors, []);
  const saved = session.save(), finalHash = (await m.hashGameState(replay)).value;
  assert.equal(finalHash, saved.finalStateHash);
  assert.equal(saved.acceptedActions.length, accepted - trial.forkAt);
  assert.deepEqual(saved.acceptedActions, traces.slice(trial.forkAt).map(trace => trace.action));
  if (options.mode === 'control') {
    assert.deepEqual(saved.acceptedActions, expectedSave.acceptedActions.slice(trial.forkAt));
    assert.equal(finalHash, expectedSave.finalStateHash, 'Original-dice complete terminal hash');
  }
  const scores = Object.fromEntries(m.calculateVictory(replay).scores.map(score => [score.playerId, score.points]));
  assert.deepEqual(scores, Object.fromEntries(replay.victory.scores.map(score => [score.playerId, score.points])));
  const stem = `${out}/branch-${forkWeight}`;
  writeFileSync(`${stem}.save.json`, `${JSON.stringify(saved)}\n`);
  writeFileSync(`${stem}.trace.jsonl`, `${traces.slice(trial.forkAt).map(trace => JSON.stringify(trace)).join('\n')}\n`);
  writeFileSync(`${stem}.memory.json`, `${encode({ before: forkBefore, afterPolicyCall: forkAfter })}\n`);
  const branch = { forkWeight, finished, sourceSaveSha256: sha(sourceBytes), originalForkHash: trial.originalForkHash,
    originalForkRng: sourceFork.rng, newForkHash, newForkRng: newFork.rng,
    preMemorySha256: sha(encode(forkBefore)), expectedPreMemorySha256: sha(encode(sourceMemories.get(forkWeight).before)),
    postMemorySha256: sha(encode(forkAfter)), forkTrace: traces[trial.forkAt],
    scores, axisMargin: scores['player:axis'] - scores['player:allied'], finalHash, finalRulesRng: replay.rng,
    futureDraws: replay.rng.draws - newFork.rng.draws, prefixStepsLost: prefixLosses, tailStepsLost: losses,
    totalStepsLost: Object.fromEntries(Object.keys(losses).map(player => [player, losses[player] + prefixLosses[player]])),
    regeneratedPrefixActions: trial.forkAt, continuationActions: saved.acceptedActions.length, acceptedActions: accepted,
    rejected: totals.rejected, errors: totals.errors, elapsedMs: performance.now() - started,
    files: Object.fromEntries(['save.json', 'trace.jsonl', 'memory.json'].map(suffix => [suffix, { path: `${stem}.${suffix}`, sha256: sha(readFileSync(`${stem}.${suffix}`)) }])) };
  writeFileSync(`${stem}.result.json`, `${JSON.stringify(branch, null, 2)}\n`); results.push(branch);
  console.log(JSON.stringify({ completedBranch: true, firstMatch: trial.firstMatch, mode: options.mode, forkWeight,
    accepted, continuationActions: saved.acceptedActions.length, scores, axisMargin: branch.axisMargin, futureDraws: branch.futureDraws }));
}
assert.deepEqual(results[0].newForkRng, results[1].newForkRng);
assert.equal(results[0].newForkHash, results[1].newForkHash);
assert.equal(results[0].preMemorySha256, results[1].preMemorySha256);
assert.equal(sha(readFileSync(import.meta.filename)), scriptSha256, 'Runner changed during run');
const output = { firstMatch: trial.firstMatch, mode: options.mode, originalEffect: trial.originalEffect,
  effect: results[0].axisMargin - results[1].axisMargin, branches: results,
  sourceCommit: registration.sourceCommit, scriptSha256, engineTreeSha256: registration.engineTreeSha256,
  registrationSha256: sha(readFileSync(`${options.root}/registration.json`)) };
writeFileSync(`${out}/result.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ completedPair: true, firstMatch: trial.firstMatch, mode: options.mode,
  originalEffect: trial.originalEffect, effect: output.effect }));
