#!/usr/bin/env node
// Plan P11.2 precheck: does supply keep strength from reaching objectives during Movement? At every Movement segment
// entry, for the phasing player's combat units that need fuel: fueled already, payable now (own option or an HQ's
// option covering them), or stranded with no way to pay. A game that starts inside a Movement segment counts its
// initial state as that entry. For every unit, the hexes it could end in (rule movement
// range, with fuel assumed paid) are checked against the hexes adjacent to an objective it does not hold, in steps.
//
//   node scripts/ai-theater-fuel-check.mjs <dist> <out.json> <dir-with-saves>...
//
// Every recorded action is replayed through the rule engine; each game must reach its saved final state hash.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { segmentEntry } from './ai-theater-supply.mjs';

const [dist, out, ...dirs] = process.argv.slice(2);
if (!dist || !out || dirs.length === 0) {
  console.error('usage: node scripts/ai-theater-fuel-check.mjs <dist> <out.json> <dir-with-saves>...');
  process.exit(2);
}
const m = await import(pathToFileURL(resolve(dist, 'index.js')).href);
const pieces = await import(pathToFileURL(resolve(dist, 'rules/pieces.js')).href);

const entries = [];
const counts = { unavailable: 0, mismatched: 0 };

const probe = (file, index, state) => {
  const actorId = state.sequence.phasingPlayerId;
  const before = m.serializeGameState(state).value;
  const control = new Map(state.mapState.hexControl.map(({ hexId, controllerId }) => [String(hexId), controllerId]));
  const targets = new Set(state.configuration.objectives.filter(({ hexId }) => control.get(String(hexId)) !== actorId)
    .flatMap(({ hexId }) => [String(hexId), ...m.adjacentHexIds(hexId).map(String)]));
  const units = state.pieceState.pieces.filter((piece) => piece.ownerId === actorId && piece.location.kind === 'ON_MAP'
    && m.isOnMapCombatUnit(state, piece) && piece.mode !== 'STRAT');
  const hqCovered = new Set(state.pieceState.pieces.filter((piece) => piece.ownerId === actorId && piece.location.kind === 'ON_MAP')
    .flatMap((piece) => m.fuelOptions(state, piece).filter(({ method }) => method === 'HQ').flatMap(({ fueledPieceIds }) => fueledPieceIds)));
  const fueledUsage = (piece) => ({ ...pieces.usageOf(state, piece), fueled: true });
  const row = { game: file, index, gameTurn: state.sequence.gameTurn, actorId, units: 0, steps: 0, motorized: 0, fueled: 0, payable: 0, stranded: 0, strandedSteps: 0, reachSteps: 0, strandedReachSteps: 0 };
  for (const piece of units) {
    const steps = piece.remainingSteps ?? 1;
    row.units += 1; row.steps += steps;
    let status = 'NOT_NEEDED';
    if (pieces.needsFuel(state, piece)) {
      row.motorized += 1;
      if (m.fuelCoverage(state, piece) !== null) status = 'FUELED';
      else if (m.fuelOptions(state, piece).length > 0 || hqCovered.has(piece.id)) status = 'PAYABLE';
      else status = 'STRANDED';
    }
    if (status === 'FUELED') row.fueled += 1;
    if (status === 'PAYABLE') row.payable += 1;
    if (status === 'STRANDED') { row.stranded += 1; row.strandedSteps += steps; }
    const projected = { ...state, usage: pieces.withUsage(state, fueledUsage(piece)) };
    const reach = [String(piece.location.hexId), ...(m.ruleEngine.queryMovementRange(projected, actorId, piece.id).value ?? []).map(({ hexId }) => String(hexId))];
    if (reach.some((hexId) => targets.has(hexId))) {
      row.reachSteps += steps;
      if (status === 'STRANDED') row.strandedReachSteps += steps;
    }
  }
  assert.equal(m.serializeGameState(state).value, before, `${file}:${index} probes changed the state`);
  entries.push(row);
};

const games = [];
for (const dir of dirs) {
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json')).sort()) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    if (state.sequence.phase === 'MOVEMENT' && state.sequence.segment === 'MOVEMENT') probe(file, -1, state);
    for (const [index, action] of save.acceptedActions.entries()) {
      const applied = m.ruleEngine.applyAction(state, action);
      assert.ok(applied.ok, `${file}: recorded action ${index} rejected`);
      const entry = segmentEntry(m, state, action, applied, 'MOVEMENT', 'MOVEMENT', counts);
      if (entry) probe(file, index, entry);
      state = applied.state;
    }
    games.push({ file: join(dir, file), finalHashMatches: (await m.hashGameState(state)).value === save.finalStateHash });
  }
}

const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const side = (suffix) => entries.filter(({ actorId }) => actorId.endsWith(suffix));
const summary = {
  games: games.length, finalHashMismatches: games.filter(({ finalHashMatches }) => !finalHashMatches).length,
  entries: entries.length, entriesUnavailable: counts.unavailable, entriesMismatched: counts.mismatched,
  ...Object.fromEntries(['axis', 'allied'].map((name) => {
    const rows = side(name);
    return [name, {
      entries: rows.length, motorized: sum(rows, 'motorized'), fueled: sum(rows, 'fueled'), payable: sum(rows, 'payable'), stranded: sum(rows, 'stranded'),
      entriesWithStranded: rows.filter(({ stranded }) => stranded > 0).length,
      reachSteps: sum(rows, 'reachSteps'), strandedReachSteps: sum(rows, 'strandedReachSteps'),
    }];
  })),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ summary, entries, games }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
