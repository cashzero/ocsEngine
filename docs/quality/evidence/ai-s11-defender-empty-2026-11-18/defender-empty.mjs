// node docs/quality/evidence/ai-s11-defender-empty-2026-11-18/defender-empty.mjs <attack match directory> [...] (build first)
// Objectives the defender loses to an attacker that walks in. For each: was the hex ever garrisoned, and how
// its last defending combat unit left (its own move, a retreat or other combat decision, eliminated); the defender's
// combat units within 3 hexes that could have moved when its last own Movement Segment before the loss began.
import { readFileSync } from 'node:fs';
const m = await import('../../../../dist/index.js');
const rows = [];
let games = 0;
for (const dir of process.argv.slice(2)) {
  for (const record of JSON.parse(readFileSync(`${dir}/summary.json`, 'utf8')).records) {
    const save = JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`, 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory.attackerId;
    const defenderId = state.scenario.players.map(({ id }) => id).find((id) => id !== attackerId);
    const defenderPolicy = record.sides[String(defenderId).endsWith('axis') ? 'axis' : 'allied'].policy === 'heuristic' ? 'v88' : 'v86';
    games += 1;
    const objectives = new Map(state.configuration.objectives.map(({ hexId, points }) => [String(hexId), points]));
    const controller = (s, hexId) => s.mapState.hexControl.find((e) => String(e.hexId) === hexId)?.controllerId ?? null;
    const garrison = (s, hexId) => s.pieceState.pieces.filter((p) => p.ownerId === defenderId && p.location.kind === 'ON_MAP' && String(p.location.hexId) === hexId && m.isOnMapCombatUnit(s, p));
    const last = new Map([...objectives.keys()].map((hexId) => [hexId, { ever: garrison(state, hexId).length > 0, how: garrison(state, hexId).length > 0 ? null : 'never garrisoned', turn: null }]));
    let spare = new Map();
    for (const action of save.acceptedActions) {
      const { gameTurn, phase, segment, phasingPlayerId } = state.sequence;
      // The defender's Movement Segment begins: its mobile combat units within 3 hexes of each objective it holds empty.
      if (phase === 'MOVEMENT' && segment === 'MOVEMENT' && phasingPlayerId === defenderId && spare.get('key') !== `${gameTurn}`) {
        spare = new Map([['key', `${gameTurn}`]]);
        const units = state.pieceState.pieces.filter((p) => p.ownerId === defenderId && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p));
        for (const hexId of objectives.keys()) {
          if (controller(state, hexId) !== defenderId || garrison(state, hexId).length > 0) continue;
          spare.set(hexId, { turn: gameTurn, near: units.filter((p) => m.hexDistanceBetween(p.location.hexId, hexId) <= 3).length,
            reach: units.filter((p) => (m.ruleEngine.queryMovementRange(state, defenderId, p.id).value ?? []).some((move) => String(move.hexId ?? move.path?.at(-1)) === hexId)).length });
        }
      }
      const next = m.ruleEngine.applyAction(state, action).state;
      for (const hexId of objectives.keys()) {
        const before = garrison(state, hexId).length, after = garrison(next, hexId).length;
        if (after > 0) last.set(hexId, { ever: true, how: null, turn: null });
        else if (before > 0 && after === 0) {
          const gone = garrison(state, hexId).every((p) => next.pieceState.pieces.find((q) => q.id === p.id)?.location.kind !== 'ON_MAP');
          last.set(hexId, { ever: true, turn: gameTurn, how: gone ? 'eliminated' : action.actorId === defenderId && action.kind === 'MOVE_PIECE' ? 'moved away' : action.kind === 'RESPOND_DECISION' ? 'retreated' : `left by ${action.kind}` });
        }
        if (controller(state, hexId) === defenderId && controller(next, hexId) === attackerId && action.kind === 'MOVE_PIECE') {
          rows.push({ match: record.match, defenderPolicy, style: record.summary.mapStyle, hexId, points: objectives.get(hexId), turn: gameTurn, ...last.get(hexId), emptySince: last.get(hexId).turn,
            spare: spare.get(hexId) ?? null });
        }
      }
      state = next;
    }
  }
}
const per = (list, n) => (list.length / n).toFixed(2);
for (const policy of ['v88', 'v86']) {
  const list = rows.filter((r) => r.defenderPolicy === policy);
  const n = games / 2;
  console.log(`== defender ${policy}: ${per(list, n)} objectives a game walked into (${(list.reduce((t, r) => t + r.points, 0) / n).toFixed(2)} VP)`);
  for (const how of [...new Set(list.map((r) => r.how))]) {
    const some = list.filter((r) => r.how === how);
    console.log(`  ${how}: ${per(some, n)} a game, ${(some.reduce((t, r) => t + r.points, 0) / n).toFixed(2)} VP; same turn as the garrison left ${(some.filter((r) => r.emptySince === r.turn).length / Math.max(1, some.length)).toFixed(2)}`);
  }
  const seen = list.filter((r) => r.spare);
  console.log(`  empty when the defender's last Movement Segment began: ${per(seen, n)} a game; with a combat unit within 3 hexes ${per(seen.filter((r) => r.spare.near > 0), n)}; with one that could move in ${per(seen.filter((r) => r.spare.reach > 0), n)} (${(seen.filter((r) => r.spare.reach > 0).reduce((t, r) => t + r.points, 0) / n).toFixed(2)} VP)`);
}
