#!/usr/bin/env node
// Map structure behind theater supply allocation: rail network, supply sources and the theaters of
// ai-theater-supply.mjs for both players, at the initial state and at the start of Game Turn 3.
//
//   node scripts/ai-theater-survey.mjs <dist> <out.json> <dir-with-saves>...
//
// Every recorded action up to Game Turn 3 is replayed through the rule engine and must be accepted.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SPLIT_RAIL_HEXES, theaters } from './ai-theater-supply.mjs';

const [dist, out, ...dirs] = process.argv.slice(2);
if (!dist || !out || dirs.length === 0) {
  console.error('usage: node scripts/ai-theater-survey.mjs <dist> <out.json> <dir-with-saves>...');
  process.exit(2);
}
const m = await import(pathToFileURL(resolve(dist, 'index.js')).href);

const railFacts = (state) => {
  const neighbors = m.railNetworkOf(state).neighbors;
  const seen = new Set();
  let components = 0;
  for (const start of neighbors.keys()) {
    if (seen.has(start)) continue;
    components += 1;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) for (const next of neighbors.get(stack.pop())) if (!seen.has(next)) { seen.add(next); stack.push(next); }
  }
  return { railHexes: neighbors.size, components, junctions: [...neighbors.values()].filter((list) => list.length >= 3).length };
};

const survey = (state) => ({
  rail: railFacts(state),
  players: Object.fromEntries(state.scenario.players.map(({ id }) => {
    const sources = {};
    for (const { kind } of m.friendlySupplySources(state, id)) sources[kind] = (sources[kind] ?? 0) + 1;
    const result = theaters(m, state, id);
    return [id, {
      sources,
      roots: result.roots.length,
      theaters: result.theaters,
      objectives: result.objectives.map(({ hexId, points, heldBy, railDistance, railDepth, theater }) => ({ hexId, points, heldBy, railDistance, railDepth, theater })),
    }];
  })),
});

const games = [];
for (const dir of dirs) {
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json')).sort()) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const parsed = m.parseGameStateJson(save.initialSnapshot);
    assert.ok(parsed.ok, `${file}: initial snapshot does not parse`);
    let state = parsed.value;
    const initial = survey(state);
    const initialSplits = Object.fromEntries([4, 8].map((split) => [split, Object.fromEntries(state.scenario.players.map(({ id }) => [id, theaters(m, state, id, { splitRailHexes: split }).theaters.length]))]));
    let replayed = 0;
    for (const action of save.acceptedActions) {
      if (state.sequence.gameTurn >= 3) break;
      const applied = m.ruleEngine.applyAction(state, action);
      assert.ok(applied.ok, `${file}: recorded action ${replayed} rejected`);
      state = applied.state;
      replayed += 1;
    }
    games.push({ file: join(dir, file), initial, initialSplits, gameTurn3: state.sequence.gameTurn >= 3 ? survey(state) : null, replayed });
  }
}

const count = (values) => Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map())].sort((a, b) => a[0] - b[0]));
const summary = { splitRailHexes: SPLIT_RAIL_HEXES, games: games.length, railComponents: count(games.map((game) => game.initial.rail.components)) };
for (const playerId of Object.keys(games[0]?.initial.players ?? {})) {
  summary[playerId] = {
    theatersPerMap: count(games.map((game) => game.initial.players[playerId].theaters.length)),
    theatersPerMapBySplit: Object.fromEntries([4, 8].map((split) => [split, count(games.map((game) => game.initialSplits[split][playerId]))])),
    objectivesOffRail: games.flatMap((game) => game.initial.players[playerId].objectives).filter(({ railDistance }) => railDistance > 0).length,
    objectivesWithoutRailRoute: games.flatMap((game) => game.initial.players[playerId].objectives).filter(({ railDepth }) => railDepth === null).length,
    theatersChangedByGameTurn3: games.filter((game) => game.gameTurn3
      && JSON.stringify(game.gameTurn3.players[playerId].theaters) !== JSON.stringify(game.initial.players[playerId].theaters)).length,
  };
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ summary, games }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
