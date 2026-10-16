#!/usr/bin/env node
// Inspect the first action fork in a swapped-seat pair; it is not proof of the eventual loss cause.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [manifestPath, directory, firstText, output] = process.argv.slice(2);
if (!output) throw Error('usage: ai-paired-divergence.mjs <freeze.json> <match directory> <even match> <output.json>');
const frozen = JSON.parse(readFileSync(manifestPath));
const build = resolve(frozen.buildDirectory, 'dist');
const m = await import(pathToFileURL(`${build}/index.js`));
const { analyze } = await import(pathToFileURL(`${build}/ai/analysis.js`));
const first = Number(firstText);
if (!Number.isSafeInteger(first) || first % 2) throw Error('Expected even match index');
const summary = JSON.parse(readFileSync(resolve(directory, 'summary.json')));
const records = [first, first + 1].map(match => summary.records.find(r => r.match === match));
for (const key of ['map', 'oob', 'deployment', 'rules']) if (records[0].seeds[key] !== records[1].seeds[key]) throw Error('Different seed pair');
const saves = records.map(r => JSON.parse(readFileSync(resolve(directory, `match-${r.match}.save.json`))));
if (JSON.stringify(saves[0].initialSnapshot) !== JSON.stringify(saves[1].initialSnapshot)) throw Error('Different initial states');
const traces = records.map(r => new Map(readFileSync(resolve(directory, `match-${r.match}.trace.jsonl`), 'utf8').trim().split('\n')
  .map(JSON.parse).filter(t => t.status === 'ACCEPTED').map(t => [t.revision, t])));
let common = m.parseGameStateJson(saves[0].initialSnapshot).value;
let divergence = null;
for (let i = 0; i < Math.min(...saves.map(s => s.acceptedActions.length)); i++) {
  const actions = saves.map(s => s.acceptedActions[i]);
  if (JSON.stringify(actions[0]) !== JSON.stringify(actions[1])) {
    if (actions[0].actorId !== actions[1].actorId) throw Error('Common state has different actors');
    const owner = actions[0].actorId;
    const situation = analyze(m.ruleEngine.projectForViewer(common, owner), owner, { scenario: common.scenario, turnLimit: 8 });
    const mean = situation.objectives.reduce((sum, o) => sum + o.points, 0) / Math.max(1, situation.objectives.length);
    divergence = { revision: common.revision, turn: common.sequence.gameTurn, phase: common.sequence.phase, owner,
      choices: actions.map((action, j) => ({ match: records[j].match, policy: traces[j].get(common.revision)?.policy,
        intent: traces[j].get(common.revision)?.intent, action,
        supplyFacts: m.ruleEngine.explain(common, action).facts.filter(f => f.key.startsWith('supply.')) })),
      held: situation.objectives.filter(o => o.controllerId === owner).map(o => ({ ...o, threat: situation.threatAt(o.hexId), meanPoints: mean,
        defenders: situation.friendlyAt(o.hexId).filter(u => situation.isCombatUnit(u)).map(u => ({ id: u.piece.id, strength: u.profile?.strength, movement: u.profile?.movement })) })) };
    break;
  }
  const next = m.ruleEngine.applyAction(common, actions[0]);
  if (!next.ok) throw Error('Common prefix rejected');
  common = next.state;
}
const finals = [];
for (let j = 0; j < 2; j++) {
  let state = m.parseGameStateJson(saves[j].initialSnapshot).value;
  const controlChanges = [];
  for (const action of saves[j].acceptedActions) {
    const next = m.ruleEngine.applyAction(state, action);
    if (!next.ok) throw Error('Rejected full replay');
    for (const objective of state.configuration.objectives) {
      const before = state.mapState.hexControl.find(c => c.hexId === objective.hexId)?.controllerId ?? null;
      const after = next.state.mapState.hexControl.find(c => c.hexId === objective.hexId)?.controllerId ?? null;
      if (before !== after) controlChanges.push({ revision: state.revision, turn: state.sequence.gameTurn, ...objective, before, after, action: action.kind });
    }
    state = next.state;
  }
  if (state.sequence.phase !== 'COMPLETE' || (await m.hashGameState(state)).value !== records[j].finalStateHash) throw Error('Final hash mismatch');
  finals.push({ match: records[j].match, controlChanges, scores: state.victory.scores });
}
const result = { firstDivergence: divergence, finals };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
