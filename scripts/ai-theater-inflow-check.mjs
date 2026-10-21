#!/usr/bin/env node
// Plan P11.2 acceptance: from each Movement segment entry to the following Combat segment entry of the same player
// turn, the Tokens transport actually moved into each theater's zone must not exceed inflowBound (ai-theater-supply.mjs)
// computed at the Movement entry. Moved in is the net change of the zone's Tokens over the actions that leave the
// player's total Tokens unchanged; actions that spend, gain or lose Tokens (fuel, rations, capture) are left out. A
// window whose Combat entry cannot be rebuilt is dropped and counted.
//
//   node scripts/ai-theater-inflow-check.mjs <dist> <out.json> <dir-with-saves>...
//
// Every recorded action is replayed through the rule engine; each game must reach its saved final state hash.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflowBound, segmentEntry, theaterZones, theaters, zoneTokens } from './ai-theater-supply.mjs';

const [dist, out, ...dirs] = process.argv.slice(2);
if (!dist || !out || dirs.length === 0) {
  console.error('usage: node scripts/ai-theater-inflow-check.mjs <dist> <out.json> <dir-with-saves>...');
  process.exit(2);
}
const load = (file) => import(pathToFileURL(resolve(dist, file)).href);
const m = await load('index.js');
const modules = { pieces: await load('rules/pieces.js'), transport: await load('rules/supply/transport.js'), railCap: await load('rules/supply/rail-cap.js') };

const windows = [];
const counts = { unavailable: 0, mismatched: 0, withoutCombat: 0 };
const games = [];
for (const dir of dirs) {
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json')).sort()) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    let open = null;
    const start = (entry, index) => {
      const playerId = entry.sequence.phasingPlayerId;
      const zones = theaterZones(m, entry, theaters(m, entry, playerId));
      const before = m.serializeGameState(entry).value;
      const bound = inflowBound(m, modules, entry, playerId, zones);
      assert.equal(m.serializeGameState(entry).value, before, `${file}:${index} bound changed the state`);
      open = { game: file, index, gameTurn: entry.sequence.gameTurn, turn: `${entry.sequence.gameTurn}:${entry.sequence.playerTurnIndex}`, playerId, zones, bound, net: {}, excludedActions: 0 };
    };
    const account = (from, to) => {
      const a = zoneTokens(from, open.playerId, open.zones), b = zoneTokens(to, open.playerId, open.zones);
      if (a.total !== b.total) { open.excludedActions += 1; return; }
      for (const theater of Object.keys(open.bound)) open.net[theater] = (open.net[theater] ?? 0) + (b.byTheater[theater] ?? 0) - (a.byTheater[theater] ?? 0);
    };
    const close = () => {
      for (const [theater, bound] of Object.entries(open.bound)) {
        windows.push({ game: open.game, index: open.index, gameTurn: open.gameTurn, playerId: open.playerId, theater, actual: Math.max(0, open.net[theater] ?? 0), ...bound, excludedActions: open.excludedActions });
      }
      open = null;
    };
    if (state.sequence.phase === 'MOVEMENT' && state.sequence.segment === 'MOVEMENT') start(state, -1);
    for (const [index, action] of save.acceptedActions.entries()) {
      const applied = m.ruleEngine.applyAction(state, action);
      assert.ok(applied.ok, `${file}: recorded action ${index} rejected`);
      const combat = open ? segmentEntry(m, state, action, applied, 'COMBAT', 'COMBAT', counts) : null;
      if (open) {
        account(state, combat ?? applied.state);
        if (combat) close();
        else if (applied.events.some((event) => event.kind === 'SEQUENCE_ADVANCED' && `${event.to.gameTurn}:${event.to.playerTurnIndex}` !== open.turn)) { counts.withoutCombat += 1; open = null; }
      }
      const movement = segmentEntry(m, state, action, applied, 'MOVEMENT', 'MOVEMENT', counts);
      if (movement && !open) start(movement, index);
      state = applied.state;
    }
    if (open) { counts.withoutCombat += 1; open = null; }
    games.push({ file: join(dir, file), finalHashMatches: (await m.hashGameState(state)).value === save.finalStateHash });
  }
}

const over = windows.filter(({ actual, bound }) => actual > bound);
const moved = windows.filter(({ actual }) => actual > 0);
const ratios = moved.map(({ actual, bound }) => actual / bound).sort((a, b) => a - b);
const quantile = (q) => ratios.length ? Number(ratios[Math.min(ratios.length - 1, Math.floor(q * ratios.length))].toFixed(3)) : null;
const summary = {
  games: games.length, finalHashMismatches: games.filter(({ finalHashMatches }) => !finalHashMatches).length,
  windows: windows.length, entriesUnavailable: counts.unavailable, entriesMismatched: counts.mismatched, windowsWithoutCombatEntry: counts.withoutCombat,
  overBound: over.length,
  withInflow: moved.length,
  boundLimitedBy: { outside: windows.filter(({ outside, rail, trucks }) => outside <= rail + trucks).length, transport: windows.filter(({ outside, rail, trucks }) => outside > rail + trucks).length },
  actualOverBoundQuantiles: { q10: quantile(0.1), q50: quantile(0.5), q90: quantile(0.9), max: ratios.at(-1) ?? null },
  tokens: { actual: windows.reduce((sum, { actual }) => sum + actual, 0), bound: windows.reduce((sum, { bound }) => sum + bound, 0) },
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ summary, over, windows, games }, null, 1)}\n`);
console.log(JSON.stringify({ ...summary, overExamples: over.slice(0, 5) }, null, 1));
