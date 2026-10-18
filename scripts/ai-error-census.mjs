#!/usr/bin/env node
// Census of decisions that look wrong, per side role, from saved ai-match games with traces (docs/ai/evaluation.md). Build first.
//
//   node scripts/ai-error-census.mjs <match directory> [...] [--out <file.json>]
//
// Counts are candidates for the error list, not proven mistakes; each needs a continuation test (scripts/ai-continue.mjs).
// - idle combat: own Combat Segments (Game Turn 2+) with no regular attack declared although a legal one reached Combat
//   Table column 6 (Open 3:1 or its equivalent) or better when the segment began;
// - attack odds: declared regular attacks by column, and those at column 10 or more ("overkill");
// - advances: after-combat advance decisions the trace names as declined ("no supplied advance…") or taken;
// - never moved: own combat units on the map at the start that never moved all game.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : null;
const dirs = args.filter((_, index) => outIndex < 0 || (index !== outIndex && index !== outIndex + 1));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const roles = {};
const bump = (role, key, value = 1) => { const c = (roles[role] ??= { games: 0 }); c[key] = (c[key] ?? 0) + value; };

for (const dir of dirs) {
  const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
  for (const record of records) {
    const savePath = join(dir, `match-${record.match}.save.json`);
    const tracePath = join(dir, `match-${record.match}.trace.jsonl`);
    if (!existsSync(savePath) || !existsSync(tracePath)) continue;
    const save = JSON.parse(readFileSync(savePath, 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId;
    const roleOf = (playerId) => (attackerId === undefined ? 'meeting side' : playerId === attackerId ? 'attacker' : 'defender');
    for (const { id } of state.scenario.players) bump(roleOf(id), 'games');
    // Advance decisions, from the trace intents of each seat.
    for (const line of readFileSync(tracePath, 'utf8').split('\n')) {
      if (!line) continue;
      const row = JSON.parse(line);
      const playerId = save.bindings.find(({ seatId }) => seatId === row.seatId)?.playerId;
      if (!playerId || typeof row.intent !== 'string') continue;
      if (row.intent.startsWith('advance: no supplied advance')) bump(roleOf(playerId), 'advances declined');
      else if (row.intent.startsWith('advance: take')) bump(roleOf(playerId), 'advances taken');
    }
    const startHexes = new Map(state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, piece))
      .map((piece) => [piece.id, { ownerId: piece.ownerId, moved: false }]));
    let segment = null; let segmentInfo = null;
    const closeSegment = () => {
      if (!segmentInfo) return;
      const role = roleOf(segmentInfo.playerId);
      bump(role, 'combat segments');
      if (segmentInfo.best >= 6 && segmentInfo.declared === 0) bump(role, 'idle combat segments with a column 6+ attack');
      segmentInfo = null;
    };
    for (const action of save.acceptedActions) {
      const { gameTurn, playerTurnIndex, phase, segment: step, phasingPlayerId } = state.sequence;
      const key = `${gameTurn}:${playerTurnIndex}:${phase}:${step}`;
      if (key !== segment) {
        closeSegment();
        segment = key;
        if (phase === 'COMBAT' && step === 'COMBAT' && gameTurn >= 2) {
          let best = -1;
          for (const candidate of m.ruleEngine.getActionCandidates(state, { actorId: phasingPlayerId, kind: 'DECLARE_COMBAT', pieceId: null, budget: 200 }).actions) {
            if (candidate.combatKind === 'OVERRUN') continue;
            const explanation = m.ruleEngine.explain(state, candidate);
            const forecast = explanation.allowed ? m.forecastCombat(explanation.facts) : null;
            if (forecast) best = Math.max(best, forecast.columnIndex);
          }
          segmentInfo = { playerId: phasingPlayerId, best, declared: 0 };
        }
      }
      if (action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR') {
        const forecast = m.forecastCombat(m.ruleEngine.explain(state, action).facts);
        const role = roleOf(action.actorId);
        bump(role, 'regular attacks');
        if (forecast) { bump(role, `attack column ${forecast.columnIndex}`); if (forecast.columnIndex >= 10) bump(role, 'attacks at column 10+'); }
        if (segmentInfo && action.actorId === segmentInfo.playerId) segmentInfo.declared += 1;
      }
      if (action.kind === 'MOVE_PIECE' && startHexes.has(action.pieceId)) startHexes.get(action.pieceId).moved = true;
      state = m.ruleEngine.applyAction(state, action).state;
    }
    closeSegment();
    for (const { ownerId, moved } of startHexes.values()) if (!moved) bump(roleOf(ownerId), 'combat units never moved');
  }
}
const summary = Object.fromEntries(Object.entries(roles).map(([role, counts]) => [role, Object.fromEntries(
  Object.entries(counts).filter(([key]) => key !== 'games').sort().map(([key, value]) => [key, value / counts.games])).valueOf()]));
for (const [role, counts] of Object.entries(roles)) {
  console.log(`${role}: ${counts.games} side-games, per game:`);
  for (const [key, value] of Object.entries(summary[role])) console.log(`  ${key}: ${value.toFixed(2)}`);
}
if (out) writeFileSync(out, JSON.stringify({ dirs, roles: summary, sideGames: Object.fromEntries(Object.entries(roles).map(([role, c]) => [role, c.games])) }, null, 2));
