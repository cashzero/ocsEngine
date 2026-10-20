import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const root = 'artifacts/ai-progress-objective-original-continuation';
const inputs = [30, 15].map(weight => readFileSync(`${root}/pair-1800012/branch-${weight}.save.json`));
const saves = inputs.map(bytes => JSON.parse(bytes));
assert.equal(saves[0].acceptedActions.length, saves[1].acceptedActions.length);
const differentActions = saves[0].acceptedActions.flatMap((action, index) =>
  isDeepStrictEqual(action, saves[1].acceptedActions[index]) ? [] : [index]);
assert.deepEqual(differentActions, [9, 131]);
const finals = saves.map(save => JSON.parse(save.currentSnapshot));
const differingStateKeys = Object.keys(finals[0]).filter(key => !isDeepStrictEqual(finals[0][key], finals[1][key]));
assert.deepEqual(differingStateKeys, ['mapState']);
const differingMapKeys = Object.keys(finals[0].mapState).filter(key => !isDeepStrictEqual(finals[0].mapState[key], finals[1].mapState[key]));
assert.deepEqual(differingMapKeys, ['revision']);
const objectives = new Set(finals[0].configuration.objectives.map(objective => objective.hexId));
const controls = finals.map(state => new Map(state.mapState.hexControl.map(entry => [entry.hexId, entry.controllerId])));
const hexes = new Set(controls.flatMap(control => [...control.keys()]));
const differences = [...hexes].filter(hexId => controls[0].get(hexId) !== controls[1].get(hexId))
  .map(hexId => ({ hexId, factual30: controls[0].get(hexId) ?? null, counterfactual15: controls[1].get(hexId) ?? null }));
assert.ok(differences.every(entry => !objectives.has(entry.hexId)));
assert.equal(differences.length, 0);
const traces = readFileSync(`${root}/pair-1800012/branch-30.trace.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
const output = { selection: 'Post-result descriptive inspection of the preselected pilot, not a fitted prediction feature',
  sourceSaveSha256: inputs.map(bytes => createHash('sha256').update(bytes).digest('hex')),
  scriptSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),
  acceptedActionsEach: saves[0].acceptedActions.length, differentActions,
  moves: differentActions.map(index => ({ index, stepKey: traces[index].stepKey,
    factual: saves[0].acceptedActions[index], counterfactual: saves[1].acceptedActions[index] })),
  differingStateKeys, differingMapKeys, nonObjectiveControlDifferences: differences,
  terminalMapRevisions: finals.map(state => state.mapState.revision),
  terminalPieceStateEqual: true, terminalRulesRngEqual: true, terminalVictoryEqual: true,
  limitation: 'Full terminal hashes differ only by map revision. Board and endpoint agreement does not prove identical intermediate states or general strategic irrelevance.' };
writeFileSync(`${root}/pilot-inspection.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ differentActions, nonObjectiveControlDifferences: differences.length }));
