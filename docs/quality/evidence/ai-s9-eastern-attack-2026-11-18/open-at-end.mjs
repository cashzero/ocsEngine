// node docs/quality/evidence/ai-s9-eastern-attack-2026-11-18/open-at-end.mjs <attack match directory> [...] (after scripts/ai-attack-progress-study.mjs; build first)
// objectives the attacker does not hold at the end: defended or empty, distance to its nearest combat unit,
// whether it was ever attacked (from progress-all.json).
import { readFileSync } from 'node:fs';
const m = await import('../../../../dist/index.js');
const attacks = JSON.parse(readFileSync('artifacts/ai-next/progress-all.json', 'utf8')).attacks;
const attacked = new Map(); for (const a of attacks) attacked.set(`${a.match}|${a.hexId}`, (attacked.get(`${a.match}|${a.hexId}`) ?? 0) + 1);
const out = {};
for (const dir of process.argv.slice(2)) {
  for (const record of JSON.parse(readFileSync(`${dir}/summary.json`, 'utf8')).records) {
    if (record.sides.axis.policy !== 'heuristic') continue;
    const save = JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`, 'utf8'));
    const state = m.parseGameStateJson(save.currentSnapshot).value;
    const attackerId = state.configuration.attackVictory.attackerId;
    const own = state.pieceState.pieces.filter((p) => p.ownerId === attackerId && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p));
    const row = (out[record.summary.mapStyle] ??= { games: 0, open: 0, points: 0, defended: 0, defendedPoints: 0, empty: 0, emptyPoints: 0, neverAttacked: 0, neverAttackedPoints: 0, distance: 0, adjacent: 0 });
    row.games += 1;
    for (const { hexId, points } of state.configuration.objectives) {
      if (state.mapState.hexControl.find((e) => String(e.hexId) === String(hexId))?.controllerId === attackerId) continue;
      const defended = state.pieceState.pieces.some((p) => p.ownerId !== attackerId && p.location.kind === 'ON_MAP' && String(p.location.hexId) === String(hexId) && m.isOnMapCombatUnit(state, p));
      const distance = Math.min(...own.map((p) => m.hexDistanceBetween(p.location.hexId, hexId)));
      row.open += 1; row.points += points; row.distance += distance; if (distance <= 1) row.adjacent += 1;
      if (defended) { row.defended += 1; row.defendedPoints += points; } else { row.empty += 1; row.emptyPoints += points; }
      if (!attacked.has(`${record.match}|${hexId}`)) { row.neverAttacked += 1; row.neverAttackedPoints += points; }
    }
  }
}
for (const [style, r] of Object.entries(out)) console.log(style, `games ${r.games}: not held at the end ${(r.open / r.games).toFixed(2)} objectives (${(r.points / r.games).toFixed(2)} VP); defended ${(r.defended / r.games).toFixed(2)} (${(r.defendedPoints / r.games).toFixed(2)} VP), empty ${(r.empty / r.games).toFixed(2)} (${(r.emptyPoints / r.games).toFixed(2)} VP); never attacked ${(r.neverAttacked / r.games).toFixed(2)} (${(r.neverAttackedPoints / r.games).toFixed(2)} VP); mean distance to the nearest attacker unit ${(r.distance / r.open).toFixed(1)}, adjacent ${(r.adjacent / r.open).toFixed(2)}`);
