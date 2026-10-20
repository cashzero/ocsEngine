import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as m from '../../dist/index.js';

const root = 'artifacts/ai-progress-objective-mechanism';
const results = JSON.parse(readFileSync(`${root}/results.json`));
const rows = [];
for (const pair of results.pairs) {
  const save = JSON.parse(readFileSync(`artifacts/ai-progress-objective-30games/matches/match-${pair.firstMatch}.save.json`));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const target = pair.choices[0].target;
  const holder = state.mapState.hexControl.find(entry => entry.hexId === target)?.controllerId ?? null;
  assert.equal(holder, 'player:allied');
  for (const action of save.acceptedActions.slice(0, pair.commonActions)) {
    const next = m.ruleEngine.applyAction(state, action);
    assert.ok(next.ok); state = next.state;
    assert.equal(state.mapState.hexControl.find(entry => entry.hexId === target)?.controllerId ?? null, holder);
  }
  rows.push({ firstMatch: pair.firstMatch, target, commonActions: pair.commonActions, holderThroughoutPrefix: holder });
}
writeFileSync(`${root}/prefix-control-check.json`, `${JSON.stringify({ pairs: rows.length,
  note: 'Every assigned target stays allied throughout its common prefix. First suffix axis acquisitions are first full-history acquisitions.', rows }, null, 2)}\n`);
console.log(`Verified ${rows.length} target-control prefixes.`);
