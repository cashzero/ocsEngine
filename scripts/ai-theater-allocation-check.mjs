#!/usr/bin/env node
// Plan P11.4 acceptance: how far the allocation search (ai-theater-allocation.mjs) falls short of the optimum. At the
// phasing player's first Movement state of Game Turns 2-7, the K usable units with the most steps form a subproblem;
// allocate() on those units is compared with exhaustive() on the same units. Also times the full search.
//
//   node scripts/ai-theater-allocation-check.mjs <dist> <capture-model.json> <out.json> <k> <dir-with-saves>...
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { allocate, allocationProblem, canUse, exhaustive, loadAllocationEngine } from './ai-theater-allocation.mjs';

const [dist, modelPath, out, k, ...dirs] = process.argv.slice(2);
if (!dist || !modelPath || !out || !k || dirs.length === 0) {
  console.error('usage: node scripts/ai-theater-allocation-check.mjs <dist> <capture-model.json> <out.json> <k> <dir-with-saves>...');
  process.exit(2);
}
const engine = await loadAllocationEngine(dist);
const { m } = engine;
const model = JSON.parse(readFileSync(modelPath, 'utf8')).frozen;

const cases = [];
for (const dir of dirs) {
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json')).sort()) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const seen = new Set();
    for (const [index, action] of save.acceptedActions.entries()) {
      const key = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}`;
      if (!seen.has(key) && state.sequence.phase === 'MOVEMENT' && state.sequence.gameTurn >= 2 && state.sequence.gameTurn <= 7) {
        seen.add(key);
        const before = m.serializeGameState(state).value;
        const playerId = state.sequence.phasingPlayerId;
        const started = performance.now();
        const problem = allocationProblem(engine, state, playerId, model);
        const full = allocate(problem);
        const fullMs = performance.now() - started;
        const usable = problem.units.filter((unit) => problem.objectives.some((objective) => canUse(problem, unit, objective)))
          .sort((a, b) => b.steps - a.steps || String(a.id).localeCompare(String(b.id))).slice(0, Number(k)).map(({ id }) => id);
        const search = allocate(problem, usable);
        const optimum = exhaustive(problem, usable);
        assert.equal(m.serializeGameState(state).value, before, `${file}:${index} allocation changed the state`);
        assert.ok(search.value <= optimum.value + 1e-9, `${file}:${index} search beat the enumeration`);
        cases.push({ game: file, index, gameTurn: state.sequence.gameTurn, playerId, units: problem.units.length, usable: usable.length,
          objectives: problem.objectives.length, search: search.value, optimum: optimum.value, fullValue: full.value, fullMs: Math.round(fullMs),
          jointlyUnpayable: full.objectives.filter(({ jointlyPayable }) => !jointlyPayable).length, stranded: problem.units.filter(({ fuelStatus }) => fuelStatus === 'STRANDED').length });
      }
      const applied = m.ruleEngine.applyAction(state, action);
      assert.ok(applied.ok, `${file}: recorded action ${index} rejected`);
      state = applied.state;
    }
  }
}

const positive = cases.filter(({ optimum }) => optimum > 1e-9);
const gaps = positive.map(({ search, optimum }) => (optimum - search) / optimum).sort((a, b) => a - b);
const times = cases.map(({ fullMs }) => fullMs).sort((a, b) => a - b);
const summary = {
  k: Number(k), cases: cases.length, withValue: positive.length,
  optimal: positive.filter(({ search, optimum }) => optimum - search <= 1e-9).length,
  relativeGap: { mean: gaps.reduce((s, g) => s + g, 0) / (gaps.length || 1), q90: gaps[Math.floor(0.9 * gaps.length)] ?? null, max: gaps.at(-1) ?? null },
  jointlyUnpayableGroups: cases.reduce((s, { jointlyUnpayable }) => s + jointlyUnpayable, 0),
  valueShortfall: positive.reduce((s, { search, optimum }) => s + optimum - search, 0), optimumTotal: positive.reduce((s, { optimum }) => s + optimum, 0),
  fullSearchMs: { median: times[Math.floor(times.length / 2)] ?? null, q90: times[Math.floor(0.9 * times.length)] ?? null, max: times.at(-1) ?? null },
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ summary, cases }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
