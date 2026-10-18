#!/usr/bin/env node
// Where do moving combat units stop, and could they have reached the enemy? Replays ai-match attack games with traces
// (docs/ai/policy-errors.md, E6). Build first.
//
//   node scripts/ai-approach-study.mjs <match directory> [...] [--role attacker|defender] [--out <file.json>]
//
// Every MOVE_PIECE of a combat unit of the role in a Movement Segment from Game Turn 2: its task (the purpose in the trace
// intent, e.g. assault, capture, hunt), the distance from its destination to the nearest enemy combat unit, whether its
// movement range at that moment held a hex adjacent to an enemy combat unit (contact reachable), and the score terms of the
// chosen move. Moves that stop 2–3 hexes short although contact was reachable are summarised by task and by their terms.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const role = option('--role', 'attacker');
const out = option('--out');
const dirs = args.filter((arg, index) => !arg.startsWith('--') && !['--role', '--out'].includes(args[index - 1]));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const moves = [];

for (const dir of dirs) {
  const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
  for (const record of records) {
    const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
    const traces = new Map(readFileSync(join(dir, `match-${record.match}.trace.jsonl`), 'utf8').split('\n').filter(Boolean)
      .map((line) => JSON.parse(line)).filter((row) => row.kind === 'ACTION').map((row) => [row.revision, row]));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId;
    if (attackerId === undefined) continue;
    const playerId = role === 'attacker' ? attackerId : state.scenario.players.map(({ id }) => id).find((id) => id !== attackerId);
    for (const [index, action] of save.acceptedActions.entries()) {
      const { gameTurn, phase, segment } = state.sequence;
      if (action.kind === 'MOVE_PIECE' && action.actorId === playerId && phase === 'MOVEMENT' && segment === 'MOVEMENT' && gameTurn >= 2) {
        const piece = state.pieceState.pieces.find((candidate) => candidate.id === action.pieceId);
        if (piece && m.isOnMapCombatUnit(state, piece)) {
          const enemy = state.pieceState.pieces.filter((other) => other.ownerId !== playerId && other.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, other));
          const nearest = (hexId) => Math.min(99, ...enemy.map((other) => m.hexDistanceBetween(other.location.hexId, hexId)));
          const range = m.ruleEngine.queryMovementRange(state, playerId, piece.id).value ?? [];
          const trace = traces.get(index);
          const task = /\((\w+) (-?\d+,-?\d+)\)/.exec(trace?.intent ?? '');
          const purpose = task?.[1] ?? 'none';
          const targetHex = task?.[2] ?? null;
          const targetEnemy = targetHex !== null && enemy.some((other) => String(other.location.hexId) === targetHex);
          moves.push({
            match: record.match, turn: gameTurn, purpose,
            from: nearest(piece.location.hexId), to: nearest(action.path.at(-1)),
            contactReachable: range.some((entry) => nearest(entry.hexId) === 1),
            targetEnemy, toTarget: targetHex === null ? null : m.hexDistanceBetween(action.path.at(-1), targetHex),
            targetAdjacentReachable: targetHex !== null && range.some((entry) => m.hexDistanceBetween(entry.hexId, targetHex) <= 1),
            terms: Object.fromEntries((trace?.breakdown ?? []).map(({ term, value }) => [term, value])),
          });
        }
      }
      state = m.ruleEngine.applyAction(state, action).state;
    }
  }
}

const bucket = (distance) => (distance <= 1 ? 'adjacent' : distance <= 3 ? '2-3' : distance <= 6 ? '4-6' : '7+');
const table = {};
for (const move of moves) {
  const row = (table[move.purpose] ??= { moves: 0, adjacent: 0, '2-3': 0, '4-6': 0, '7+': 0, short: 0 });
  row.moves += 1; row[bucket(move.to)] += 1;
  if (bucket(move.to) === '2-3' && move.contactReachable) row.short += 1;
}
const short = moves.filter((move) => bucket(move.to) === '2-3' && move.contactReachable);
const termTotals = {};
for (const move of short) for (const [term, value] of Object.entries(move.terms)) {
  const t = (termTotals[term] ??= { moves: 0, sum: 0 }); t.moves += 1; t.sum += value;
}
const games = new Set(moves.map((move) => move.match)).size;
console.log(`${role}: ${moves.length} combat-unit moves in ${games} games (Movement Segments from Game Turn 2)`);
console.log('task: moves / ending adjacent, 2-3, 4-6, 7+ hexes from the enemy / of the 2-3 ones, contact was reachable');
for (const [purpose, row] of Object.entries(table).sort((a, b) => b[1].moves - a[1].moves)) {
  console.log(`  ${purpose.padEnd(9)} ${row.moves} / ${row.adjacent} ${row['2-3']} ${row['4-6']} ${row['7+']} / ${row.short}`);
}
console.log(`stopped 2-3 short with contact reachable: ${short.length}; their score terms (moves with the term, mean value):`);
for (const [term, { moves: count, sum }] of Object.entries(termTotals).sort((a, b) => b[1].moves - a[1].moves)) console.log(`  ${term}: ${count}, ${(sum / count).toFixed(1)}`);
// By task, against the unit's own target: where it stopped, and whether a hex beside the target was in range.
console.log('by target: task (target held by an enemy combat unit?) / moves / ended beside or on the target / ended 2-3 from it although beside it was reachable');
const byTarget = {};
for (const move of moves.filter((entry) => entry.toTarget !== null)) {
  const key = `${move.purpose} (${move.targetEnemy ? 'enemy on target' : 'no enemy on target'})`;
  const row = (byTarget[key] ??= { moves: 0, beside: 0, short: 0, shortTerms: {} });
  row.moves += 1;
  if (move.toTarget <= 1) row.beside += 1;
  else if (move.toTarget <= 3 && move.targetAdjacentReachable) {
    row.short += 1;
    for (const [term, value] of Object.entries(move.terms)) { const t = (row.shortTerms[term] ??= { moves: 0, sum: 0 }); t.moves += 1; t.sum += value; }
  }
}
for (const [key, row] of Object.entries(byTarget).sort((a, b) => b[1].moves - a[1].moves)) {
  const terms = Object.entries(row.shortTerms).sort((a, b) => b[1].moves - a[1].moves).slice(0, 5).map(([term, t]) => `${term} ${t.moves}×${(t.sum / t.moves).toFixed(1)}`).join(', ');
  console.log(`  ${key}: ${row.moves} / ${row.beside} / ${row.short}${terms ? `  [${terms}]` : ''}`);
}
if (out) writeFileSync(out, JSON.stringify({ dirs, role, table, shortTerms: termTotals, moves }, null, 1));
