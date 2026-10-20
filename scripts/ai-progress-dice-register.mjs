import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] ?? 'artifacts/ai-progress-dice-reproducibility';
const stage = process.argv[3] ?? 'control';
assert.ok(['control', 'frozen'].includes(stage));
const engine = 'artifacts/ai-progress-objective-goal-continuity/engine';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path));
const tree = createHash('sha256');
for (const path of readdirSync(engine, { recursive: true }).filter(path => path.endsWith('.js')).sort())
  tree.update(path).update('\0').update(sha(readFileSync(`${engine}/${path}`))).update('\0');
const engineTreeSha256 = tree.digest('hex');
assert.equal(engineTreeSha256, '4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a');
const m = await import(pathToFileURL(resolve(engine, 'index.js')).href);
const mechanismPath = 'artifacts/ai-progress-objective-mechanism/results.json';
const priorPath = 'artifacts/ai-progress-objective-original-continuation/results.json';
const combatPath = 'artifacts/ai-progress-combat-opportunity/results.json';
const files = [mechanismPath, priorPath, combatPath, `${root}/protocol.md`,
  'artifacts/ai-progress-objective-30games/weights.json',
  'artifacts/ai-progress-objective-30games/matches/summary.json',
  'scripts/ai-progress-dice-register.mjs', 'scripts/ai-progress-dice-run.mjs'];
const mechanism = read(mechanismPath), prior = read(priorPath), combat = read(combatPath);
const cases = [];
for (const pair of mechanism.pairs) {
  const firstMatch = pair.firstMatch;
  const sourceSave = `artifacts/ai-progress-objective-30games/matches/match-${firstMatch + 1}.save.json`;
  const sourceTrace = sourceSave.replace('.save.json', '.trace.jsonl');
  const oldRoot = `artifacts/ai-progress-objective-original-continuation/pair-${firstMatch}`;
  const counterSave = `${oldRoot}/branch-15.save.json`, counterTrace = `${oldRoot}/branch-15.trace.jsonl`;
  const memories = Object.fromEntries([30, 15].map(weight => [weight, `${oldRoot}/branch-${weight}.memory.json`]));
  files.push(sourceSave, sourceTrace, counterSave, counterTrace, ...Object.values(memories));
  const source = read(sourceSave), parsed = m.parseGameStateJson(source.initialSnapshot); assert.ok(parsed.ok);
  let state = parsed.value;
  for (const action of source.acceptedActions.slice(0, pair.commonActions)) {
    const applied = m.ruleEngine.applyAction(state, action); assert.ok(applied.ok); state = applied.state;
  }
  assert.equal((await m.hashGameState(state)).value, pair.preStateHash);
  const futureSeed = createHash('sha256').update(`progress-objective:future-dice:replicate-1:${firstMatch}`).digest().readUInt32BE(0);
  const futureState = m.createRulesRng(futureSeed).state; assert.notEqual(futureState, state.rng.state);
  const old = prior.rows.find(row => row.firstMatch === firstMatch); assert.ok(old);
  const fold = prior.folds.find(row => row.firstMatch === firstMatch);
  const combatFold = combat.folds.find(row => row.firstMatch === firstMatch);
  cases.push({ firstMatch, mapSeed: pair.mapSeed, sourceSave, sourceTrace, counterSave, counterTrace, memories,
    forkAt: pair.commonActions, originalForkHash: pair.preStateHash, originalForkRng: state.rng,
    futureSeed, futureState, originalEffect: old.localMarginEffect,
    predictions: { ...fold.predictions, fittedOfferedAttackStrength: combatFold.predictions.fittedOfferedAttackStrength,
      originalTerminalEffect: old.localMarginEffect } });
}
assert.equal(cases.length, 15); assert.equal(new Set(cases.map(row => row.futureState)).size, 15);
const registration = { stage, createdAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  engineTreeSha256, scheduledNewContinuations: 30, scheduledControls: 2, cases };
if (stage === 'frozen') {
  const controlPath = `${root}/control-registration.json`, control = read(controlPath);
  assert.deepEqual(cases, control.cases, 'Cases, seeds and prediction vectors fixed before controls');
  const resultPath = `${root}/control/pair-1800026/result.json`, result = read(resultPath);
  assert.equal(result.registrationSha256, sha(readFileSync(controlPath)));
  assert.equal(result.effect, cases.find(row => row.firstMatch === 1800026).originalEffect);
  assert.equal(result.branches.length, 2);
  for (const branch of result.branches) {
    assert.ok(branch.finished); assert.deepEqual(branch.newForkRng, branch.originalForkRng);
    assert.equal(branch.rejected, 0); assert.deepEqual(branch.errors, []);
    for (const raw of Object.values(branch.files)) { assert.equal(sha(readFileSync(raw.path)), raw.sha256); files.push(raw.path); }
  }
  files.push(controlPath, resultPath, 'scripts/ai-progress-dice-score.py');
}
registration.files = Object.fromEntries([...new Set(files)].map(path => [path, sha(readFileSync(path))]));
const bytes = `${JSON.stringify(registration, null, 2)}\n`;
writeFileSync(`${root}/registration.json`, bytes);
if (stage === 'control') writeFileSync(`${root}/control-registration.json`, bytes);
console.log(JSON.stringify({ stage, cases: cases.length, uniqueFutureStates: new Set(cases.map(row => row.futureState)).size,
  registrationSha256: sha(bytes), registeredFiles: Object.keys(registration.files).length }));
