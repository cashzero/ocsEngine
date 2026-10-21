#!/usr/bin/env node
// Plan P11.1 acceptance: at every recorded regular attack, bestPayableAttack (ai-theater-supply.mjs) on the same state
// must find a payable attack whose odds column is at least the declared one, and the queries must not change the state.
// At every Combat segment entry it also probes each objective the phasing player does not hold and the enemy defends,
// attacked or not, so supply that blocks attacks the bot never declared is counted too. When an action stops at the
// entry, the state after it is the entry; an ADVANCE_SEQUENCE that passes through it is rebuilt by replaying its
// lifecycle transitions, which must regenerate the recorded events and state; any other entry is counted as unavailable.
//
//   node scripts/ai-theater-attack-check.mjs <dist> <out.json> <dir-with-saves>...
//
// Every recorded action is replayed through the rule engine; each game must reach its saved final state hash.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bestPayableAttack, segmentEntry } from './ai-theater-supply.mjs';

const [dist, out, ...dirs] = process.argv.slice(2);
if (!dist || !out || dirs.length === 0) {
  console.error('usage: node scripts/ai-theater-attack-check.mjs <dist> <out.json> <dir-with-saves>...');
  process.exit(2);
}
const m = await import(pathToFileURL(resolve(dist, 'index.js')).href);

const attacks = [];
const entries = [];

const entryCounts = { unavailable: 0, mismatched: 0 };
const combatEntry = (before, action, applied) => segmentEntry(m, before, action, applied, 'COMBAT', 'COMBAT', entryCounts);

const probeEntry = (file, index, state) => {
  const actorId = state.sequence.phasingPlayerId;
  const control = new Map(state.mapState.hexControl.map(({ hexId, controllerId }) => [String(hexId), controllerId]));
  const before = m.serializeGameState(state).value;
  for (const { hexId, points } of state.configuration.objectives) {
    if (control.get(String(hexId)) === actorId) continue;
    const best = bestPayableAttack(m, state, actorId, hexId);
    if (best === null) continue;
    entries.push({
      game: file, index, gameTurn: state.sequence.gameTurn, actorId, hexId: String(hexId), points,
      adjacent: best.candidates + best.ineligible, candidates: best.candidates, column: best.column, unboundColumn: best.unboundColumn, reasons: best.reasons,
    });
  }
  assert.equal(m.serializeGameState(state).value, before, `${file}:${index} entry probes changed the state`);
};
const games = [];
for (const dir of dirs) {
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json')).sort()) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    for (const [index, action] of save.acceptedActions.entries()) {
      if (action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR') {
        const before = m.serializeGameState(state).value;
        const declared = m.calculateCombatOdds(state, action.attackerIds, action.defenderIds, action.targetHexId, action.defenderIds, null, null).columnIndex;
        const generated = m.defaultAttackerSupply(state, action.actorId, action.attackerIds);
        const started = performance.now();
        const best = bestPayableAttack(m, state, action.actorId, action.targetHexId);
        const ms = performance.now() - started;
        assert.equal(m.serializeGameState(state).value, before, `${file}:${index} queries changed the state`);
        attacks.push({
          game: file, index, gameTurn: state.sequence.gameTurn, actorId: action.actorId, targetHexId: action.targetHexId,
          declaredAttackers: action.attackerIds.length, declaredColumn: declared,
          declaredInternal: action.attackerSupply.filter(({ method }) => method === 'INTERNAL').length,
          defaultSupplyFound: generated !== null,
          bestColumn: best?.column ?? null, unboundColumn: best?.unboundColumn ?? null, bestAttackers: best?.attackerIds.length ?? 0,
          candidates: best?.candidates ?? 0, ineligible: best?.ineligible ?? 0, reasons: best?.reasons ?? {}, dropped: best?.dropped ?? 0, validations: best?.validations ?? 0, ms: Math.round(ms),
        });
      }
      const applied = m.ruleEngine.applyAction(state, action);
      assert.ok(applied.ok, `${file}: recorded action ${index} rejected`);
      const entry = combatEntry(state, action, applied);
      if (entry) probeEntry(file, index, entry);
      state = applied.state;
    }
    const hash = (await m.hashGameState(state)).value;
    games.push({ file: join(dir, file), actions: save.acceptedActions.length, finalHashMatches: hash === save.finalStateHash });
  }
}

const below = attacks.filter(({ bestColumn, declaredColumn }) => bestColumn === null || bestColumn < declaredColumn);
const sorted = attacks.map(({ ms }) => ms).sort((a, b) => a - b);
const summary = {
  games: games.length, finalHashMismatches: games.filter(({ finalHashMatches }) => !finalHashMatches).length,
  attacks: attacks.length,
  belowDeclared: below.length,
  higherThanDeclared: attacks.filter(({ bestColumn, declaredColumn }) => bestColumn !== null && bestColumn > declaredColumn).length,
  boundBelowUnbound: attacks.filter(({ bestColumn, unboundColumn }) => bestColumn !== null && unboundColumn !== null && bestColumn < unboundColumn).length,
  defaultSupplyMissing: attacks.filter(({ defaultSupplyFound }) => !defaultSupplyFound).length,
  withIneligibleNeighbors: attacks.filter(({ ineligible }) => ineligible > 0).length,
  ineligibleReasons: attacks.reduce((total, { reasons }) => { for (const [code, n] of Object.entries(reasons)) total[code] = (total[code] ?? 0) + n; return total; }, {}),
  entriesUnavailable: entryCounts.unavailable, entriesMismatched: entryCounts.mismatched,
  entryObjectives: entries.length,
  entryWithAdjacentUnits: entries.filter(({ adjacent }) => adjacent > 0).length,
  entryPayable: entries.filter(({ column }) => column !== null).length,
  entrySupplyBlocked: entries.filter(({ adjacent, column, reasons }) => adjacent > 0 && column === null && (reasons.NO_SUPPLY_CHOICE ?? 0) > 0).length,
  entryReasons: entries.reduce((total, { reasons }) => { for (const [code, n] of Object.entries(reasons)) total[code] = (total[code] ?? 0) + n; return total; }, {}),
  candidatesDropped: attacks.filter(({ dropped }) => dropped > 0).length,
  msMedian: sorted[Math.floor(sorted.length / 2)] ?? null, msMax: sorted.at(-1) ?? null,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ summary, below, attacks, entries, games }, null, 1)}\n`);
console.log(JSON.stringify({ ...summary, belowExamples: below.slice(0, 5) }, null, 1));
