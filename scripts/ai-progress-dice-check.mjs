import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] ?? 'artifacts/ai-progress-dice-reproducibility';
const engine = process.argv[3] ?? 'artifacts/ai-progress-objective-goal-continuity/engine';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path));
const jsonl = path => readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse);
const revive = (_key, value) => value?.type === 'Map' ? new Map(value.entries) : value?.type === 'Set' ? new Set(value.values) : value;
const memory = path => JSON.parse(readFileSync(path, 'utf8'), revive);
const encode = value => JSON.stringify(value, (_key, item) => item instanceof Map ? { type: 'Map', entries: [...item] }
  : item instanceof Set ? { type: 'Set', values: [...item] } : item);
const registration = read(`${root}/registration.json`), controlRegistration = read(`${root}/control-registration.json`);
assert.equal(registration.stage, 'frozen'); assert.deepEqual(registration.cases, controlRegistration.cases);
for (const [path, digest] of Object.entries(registration.files)) assert.equal(sha(readFileSync(path)), digest, path);
const tree = createHash('sha256');
for (const path of readdirSync(engine, { recursive: true }).filter(path => path.endsWith('.js')).sort())
  tree.update(path).update('\0').update(sha(readFileSync(`${engine}/${path}`))).update('\0');
assert.equal(tree.digest('hex'), registration.engineTreeSha256);
const m = await import(pathToFileURL(resolve(engine, 'index.js')).href);
const parse = snapshot => { const parsed = m.parseGameStateJson(snapshot); assert.ok(parsed.ok); return parsed.value; };
const hash = async state => (await m.hashGameState(state)).value;
const tally = () => ({ 'player:axis': 0, 'player:allied': 0 });
function countLosses(before, after, events, counts) {
  for (const event of events) if (event.kind === 'STEP_LOST') {
    const piece = before.pieceState.pieces.find(piece => piece.id === event.pieceId)
      ?? after.pieceState.pieces.find(piece => piece.id === event.pieceId); assert.ok(piece);
    assert.ok(Object.hasOwn(counts, piece.ownerId)); counts[piece.ownerId]++;
  }
}
function verifyFork(actual, original, expectedRng) {
  assert.equal(m.serializeGameState({ ...actual, rng: original.rng }).value, m.serializeGameState(original).value);
  assert.deepEqual(actual.rng, expectedRng);
}
function verifyMemory(actual, expected, arm) {
  assert.deepEqual(actual, expected);
  assert.equal(sha(encode(actual.before)), arm.preMemorySha256);
  assert.equal(sha(encode(actual.afterPolicyCall)), arm.postMemorySha256);
}
function directScores(state) {
  const scores = tally();
  for (const objective of state.configuration.objectives) {
    const holder = state.mapState.hexControl.find(row => row.hexId === objective.hexId)?.controllerId;
    if (holder) { assert.ok(Object.hasOwn(scores, holder)); scores[holder] += objective.points; }
  }
  return scores;
}
function verifyScores(state, arm) {
  const scores = directScores(state); assert.deepEqual(arm.scores, scores);
  assert.equal(arm.axisMargin, scores['player:axis'] - scores['player:allied']);
}
const rows = [], negative = [];
let example = null;
let prefixActions = 0, tailActions = 0, newActions = 0, newDraws = 0;
for (const trial of registration.cases) {
  const source = read(trial.sourceSave); let fork = parse(source.initialSnapshot); const prefixLosses = tally();
  for (const action of source.acceptedActions.slice(0, trial.forkAt)) {
    const applied = m.ruleEngine.applyAction(fork, action); assert.ok(applied.ok);
    countLosses(fork, applied.state, applied.events, prefixLosses); fork = applied.state; prefixActions++;
  }
  assert.equal(await hash(fork), trial.originalForkHash); assert.deepEqual(fork.rng, trial.originalForkRng);
  const digest = createHash('sha256').update(`progress-objective:future-dice:replicate-1:${trial.firstMatch}`).digest();
  assert.equal(digest.readUInt32BE(0), trial.futureSeed);
  assert.equal(m.createRulesRng(trial.futureSeed).state, trial.futureState); assert.notEqual(trial.futureState, fork.rng.state);
  for (const mode of trial.firstMatch === 1800026 ? ['control', 'resample'] : ['resample']) {
    const path = `${root}/${mode}/pair-${trial.firstMatch}/result.json`, result = read(path);
    assert.equal(result.firstMatch, trial.firstMatch); assert.equal(result.mode, mode);
    assert.equal(result.registrationSha256, sha(readFileSync(`${root}/${mode === 'control' ? 'control-registration' : 'registration'}.json`)));
    assert.equal(result.scriptSha256, registration.files['scripts/ai-progress-dice-run.mjs']);
    assert.equal(result.engineTreeSha256, registration.engineTreeSha256); assert.equal(result.sourceCommit, registration.sourceCommit);
    assert.deepEqual(result.branches.map(arm => arm.forkWeight), [30, 15]);
    const initialStates = [], armChecks = [];
    for (const arm of result.branches) {
      for (const raw of Object.values(arm.files)) assert.equal(sha(readFileSync(raw.path)), raw.sha256, raw.path);
      const saved = read(arm.files['save.json'].path), traces = jsonl(arm.files['trace.jsonl'].path);
      const actualMemory = memory(arm.files['memory.json'].path), expectedMemory = memory(trial.memories[arm.forkWeight]);
      verifyMemory(actualMemory, expectedMemory, arm);
      assert.equal(arm.expectedPreMemorySha256, arm.preMemorySha256);
      const initial = parse(saved.initialSnapshot), expectedRng = { ...fork.rng, state: mode === 'control' ? fork.rng.state : trial.futureState };
      verifyFork(initial, fork, expectedRng); initialStates.push(initial);
      assert.equal(await hash(initial), arm.newForkHash); assert.equal(saved.initialStateHash, arm.newForkHash);
      assert.deepEqual(arm.newForkRng, expectedRng); assert.deepEqual(arm.originalForkRng, fork.rng);
      assert.equal(arm.originalForkHash, trial.originalForkHash); assert.equal(arm.sourceSaveSha256, sha(readFileSync(trial.sourceSave)));
      const originalSave = arm.forkWeight === 30 ? source : read(trial.counterSave);
      const oldTraces = jsonl(arm.forkWeight === 30 ? trial.sourceTrace : trial.counterTrace);
      const first = traces[0], expected = oldTraces[trial.forkAt];
      for (const key of ['action', 'intent', 'score', 'breakdown']) assert.deepEqual(first[key], expected[key], key);
      assert.deepEqual(first, arm.forkTrace);
      if (mode === 'control') {
        assert.deepEqual(saved.acceptedActions, originalSave.acceptedActions.slice(trial.forkAt));
        assert.equal(saved.finalStateHash, originalSave.finalStateHash);
        traces.forEach((trace, index) => assert.equal(trace.intent, oldTraces[index + trial.forkAt].intent));
      }
      assert.deepEqual(traces.map(trace => trace.action), saved.acceptedActions);
      let state = initial; const losses = tally();
      for (const [index, trace] of traces.entries()) {
        assert.equal(trace.status, 'ACCEPTED'); assert.equal(trace.attempts, 1); assert.deepEqual(trace.rejections, []);
        assert.equal(trace.revision, trial.forkAt + index); assert.equal(trace.ordinal, trial.forkAt + index);
        const applied = m.ruleEngine.applyAction(state, trace.action); assert.ok(applied.ok);
        countLosses(state, applied.state, applied.events, losses); state = applied.state; tailActions++;
      }
      assert.equal(m.serializeGameState(state).value, saved.currentSnapshot); assert.equal(await hash(state), saved.finalStateHash);
      assert.equal(arm.finalHash, saved.finalStateHash); assert.equal(saved.lifecycle, 'FINISHED');
      assert.ok(arm.finished); assert.equal(arm.rejected, 0); assert.deepEqual(arm.errors, []);
      verifyScores(state, arm);
      assert.deepEqual(Object.fromEntries(m.calculateVictory(state).scores.map(row => [row.playerId, row.points])), arm.scores);
      assert.deepEqual(arm.prefixStepsLost, prefixLosses); assert.deepEqual(arm.tailStepsLost, losses);
      assert.deepEqual(arm.totalStepsLost, Object.fromEntries(Object.keys(losses).map(player => [player, prefixLosses[player] + losses[player]])));
      assert.deepEqual(arm.finalRulesRng, state.rng); assert.equal(arm.futureDraws, state.rng.draws - initial.rng.draws);
      assert.ok(arm.futureDraws > 0); assert.equal(arm.continuationActions, traces.length);
      assert.equal(arm.regeneratedPrefixActions, trial.forkAt); assert.equal(arm.acceptedActions, trial.forkAt + traces.length);
      assert.equal(state.sequence.gameTurn, 8); assert.equal(state.sequence.phase, 'COMPLETE');
      if (mode === 'resample') { newActions += traces.length; newDraws += arm.futureDraws; }
      armChecks.push({ forkWeight: arm.forkWeight, newForkHash: arm.newForkHash, finalHash: arm.finalHash,
        finalRevision: state.revision, finalSequence: state.sequence, scores: arm.scores, axisMargin: arm.axisMargin,
        futureDraws: arm.futureDraws, continuationActions: traces.length, elapsedMs: arm.elapsedMs });
      if (!example && actualMemory.before.size === 2) example = { initial, fork, expectedRng, actualMemory, expectedMemory, arm, state, pair: result };
    }
    assert.deepEqual(initialStates[0], initialStates[1]);
    assert.equal(result.branches[0].preMemorySha256, result.branches[1].preMemorySha256);
    assert.equal(result.originalEffect, trial.originalEffect);
    assert.equal(result.effect, result.branches[0].axisMargin - result.branches[1].axisMargin);
    if (mode === 'control') assert.equal(result.effect, trial.originalEffect);
    else rows.push({ firstMatch: trial.firstMatch, oldEffect: trial.originalEffect, newEffect: result.effect, path,
      sha256: sha(readFileSync(path)), arms: armChecks });
  }
  console.log(JSON.stringify({ checked: trial.firstMatch, prefixActions, tailActions }));
}
assert.ok(example);
for (const [name, run] of [
  ['nonRngForkMutation', () => verifyFork({ ...example.initial, revision: example.initial.revision + 1 }, example.fork, example.expectedRng)],
  ['missingPhaseMemory', () => verifyMemory({ ...example.actualMemory, before: new Map() }, example.expectedMemory, example.arm)],
  ['changedPhaseMemory', () => {
    const changed = structuredClone(example.actualMemory); const seat = [...changed.before.keys()][0];
    changed.before.get(seat).actions++; verifyMemory(changed, example.expectedMemory, example.arm);
  }],
  ['wrongTerminalMargin', () => {
    const changed = structuredClone(example.pair), arm = changed.branches.find(arm => arm.forkWeight === example.arm.forkWeight);
    arm.scores['player:axis']++; arm.axisMargin++;
    changed.effect = changed.branches[0].axisMargin - changed.branches[1].axisMargin;
    assert.equal(changed.effect, example.pair.effect + (arm.forkWeight === 30 ? 1 : -1));
    verifyScores(example.state, arm);
  }],
]) { assert.throws(run); negative.push(name); }
const scored = read(`${root}/results.json`); assert.equal(scored.rows.length, rows.length);
for (const [index, row] of rows.entries()) {
  assert.equal(scored.rows[index].oldEffect, row.oldEffect); assert.equal(scored.rows[index].newEffect, row.newEffect);
  assert.equal(scored.rows[index].resultSha256, row.sha256);
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
for (const [name, model] of Object.entries(scored.models)) {
  const estimates = registration.cases.map(row => row.predictions[name]);
  for (const [index, row] of scored.rows.entries()) assert.deepEqual(row.predictions, registration.cases[index].predictions);
  close(model.newMae, mean(rows.map((row, index) => Math.abs(row.newEffect - estimates[index]))));
  close(model.newMse, mean(rows.map((row, index) => (row.newEffect - estimates[index]) ** 2)));
  close(model.oldMae, mean(rows.map((row, index) => Math.abs(row.oldEffect - estimates[index]))));
  close(model.oldMse, mean(rows.map((row, index) => (row.oldEffect - estimates[index]) ** 2)));
}
const before = rows.map(row => row.oldEffect), after = rows.map(row => row.newEffect);
const matrix = Object.fromEntries([-1, 0, 1].map(sign => [sign, Object.fromEntries([-1, 0, 1].map(other => [other, 0]))]));
for (const row of rows) matrix[Math.sign(row.oldEffect)][Math.sign(row.newEffect)]++;
assert.deepEqual(scored.summary.signMatrixOldRowsNewColumns, matrix);
assert.deepEqual(scored.summary.exactSignAgreement,
  { numerator: rows.filter(row => Math.sign(row.oldEffect) === Math.sign(row.newEffect)).length, denominator: 15 });
const nonzero = rows.filter(row => row.oldEffect !== 0 && row.newEffect !== 0);
assert.deepEqual(scored.summary.bothNonzeroDirectionAgreement,
  { numerator: nonzero.filter(row => Math.sign(row.oldEffect) === Math.sign(row.newEffect)).length, denominator: nonzero.length });
assert.equal(scored.summary.exactEffectAgreement, rows.filter(row => row.oldEffect === row.newEffect).length);
function corr(xs, ys) {
  const a = xs.map(value => value - mean(xs)), b = ys.map(value => value - mean(ys));
  const bottom = Math.sqrt(a.reduce((sum, value) => sum + value ** 2, 0) * b.reduce((sum, value) => sum + value ** 2, 0));
  return bottom === 0 ? null : a.reduce((sum, value, index) => sum + value * b[index], 0) / bottom;
}
const ranks = values => values.map(value => values.filter(other => other < value).length + (values.filter(other => other === value).length + 1) / 2);
for (const [name, value] of [['pearson', corr(before, after)], ['spearman', corr(ranks(before), ranks(after))]]) {
  if (value === null) assert.equal(scored.summary[name], null); else close(scored.summary[name], value);
}
const absoluteChanges = rows.map(row => Math.abs(row.newEffect - row.oldEffect)).sort((a, b) => a - b);
for (const [name, value] of Object.entries({ oldMean: mean(before), newMean: mean(after),
  pooledTwoRealizationMean: mean([...before, ...after]), meanChange: mean(after.map((value, index) => value - before[index])),
  meanAbsoluteChange: mean(absoluteChanges), medianAbsoluteChange: absoluteChanges[7] })) close(scored.summary[name], value);
assert.deepEqual(scored.summary.absoluteChangeRange, [absoluteChanges[0], absoluteChanges.at(-1)]);
assert.deepEqual(scored.summary.oldRange, [Math.min(...before), Math.max(...before)]);
assert.deepEqual(scored.summary.newRange, [Math.min(...after), Math.max(...after)]);
assert.equal(scored.summary.physicalCases, 15); assert.equal(scored.summary.newContinuations, 30);
assert.equal(scored.summary.controlContinuations, 2); assert.equal(scored.summary.continuationActions, newActions);
assert.equal(scored.summary.futureRulesDraws, newDraws);
assert.equal(scored.provenance.scorerSha256, registration.files['scripts/ai-progress-dice-score.py']);
assert.equal(scored.provenance.registrationSha256, sha(readFileSync(`${root}/registration.json`)));
assert.equal(rows.length, 15); assert.equal(new Set(registration.cases.map(row => row.futureState)).size, 15);
const output = { physicalCases: rows.length, newContinuations: 30, controls: 2, prefixActions, tailActions,
  negativeControlsRejected: negative, rows, checkerSha256: sha(readFileSync(import.meta.filename)),
  registrationSha256: sha(readFileSync(`${root}/registration.json`)), resultsSha256: sha(readFileSync(`${root}/results.json`)) };
writeFileSync(`${root}/check.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output));
