// Why can rail not carry the attacker's SP forward? At the first decision of each attacker Movement segment (Game Turns
// 3-6), for each attacker dump of 8T or more on a rail hex at least 6 hexes from the enemy with no legal forward rail move:
// is there a station ahead at all, is the rail path blocked (where, by what, how far own units are), or is the station
// not detrainable?  node rail-cut-why.mjs <root> <arm=dir>... [--shard i/n]   one JSON line per pile
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : '0/1';
const [shard, shards] = shardArg.split('/').map(Number);
const [root, ...specs] = args.filter((a, i) => a !== '--shard' && args[i - 1] !== '--shard');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const jobs = specs.flatMap((spec) => { const [arm, dir] = spec.split('='); return readdirSync(dir).filter((f) => /^match-\d+\.save\.json$/u.test(f)).sort().map((f) => ({ arm, dir, f })); })
  .filter((_, i) => i % shards === shard);
for (const { arm, dir, f } of jobs) {
  const save = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const match = Number(f.match(/\d+/u)[0]);
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const me = state.configuration.attackVictory.attackerId;
  const defs = new Map(state.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
  const isHq = (p) => String(defs.get(p.definitionId)?.categoryDefinitionId).endsWith(':hq');
  const seen = new Set();
  for (const action of save.acceptedActions) {
    const s = state.sequence;
    if (s.gameTurn >= 3 && s.gameTurn <= 6 && s.phasingPlayerId === me && s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT' && !state.pendingDecision && !seen.has(s.gameTurn)) {
      seen.add(s.gameTurn);
      const enemy = state.pieceState.pieces.filter((p) => p.ownerId !== me && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p) && !/garrison/u.test(String(p.definitionId)));
      const enemyAll = state.pieceState.pieces.filter((p) => p.ownerId !== me && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p));
      const ownField = state.pieceState.pieces.filter((p) => p.ownerId === me && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p) && !isHq(p));
      const ed = (h) => Math.min(99, ...enemy.map((e) => m.hexDistanceBetween(String(e.location.hexId), String(h))));
      const od = (h) => Math.min(99, ...ownField.map((e) => m.hexDistanceBetween(String(e.location.hexId), String(h))));
      const candidates = m.ruleEngine.getActionCandidates(state, { actorId: me, kind: 'RAIL_MOVE', pieceId: null, budget: 4000 }).actions.filter((a) => a.supply.length > 0);
      const forwardFrom = new Set(candidates.filter((a) => ed(a.toHexId) >= 3 && ed(a.toHexId) <= ed(a.fromHexId) - 3).map((a) => String(a.fromHexId)));
      const neighbors = m.railNetworkOf(state).neighbors;
      for (const dump of state.pieceState.pieces) {
        if (dump.ownerId !== me || dump.location.kind !== 'ON_MAP' || defs.get(dump.definitionId)?.family !== 'RESOURCE' || String(dump.id).includes('-stock-') || (dump.resourceQuantity ?? 0) < 8) continue;
        const hex = String(dump.location.hexId);
        if (!m.isRailHex(state, dump.location.hexId) || ed(hex) < 6 || forwardFrom.has(hex)) continue;
        // Static rail net from the pile, ignoring the enemy: stations ahead (3+ nearer, 3+ from the enemy).
        const parent = new Map([[hex, null]]); const queue = [hex];
        for (let i = 0; i < queue.length; i++) for (const n of neighbors.get(queue[i]) ?? []) { const k = String(n); if (!parent.has(k)) { parent.set(k, queue[i]); queue.push(k); } }
        const ahead = [...parent.keys()].filter((h) => h !== hex && m.isRailStation(state, h) && ed(h) >= 3 && ed(h) <= ed(hex) - 3)
          .sort((a, b) => ed(a) - ed(b));
        let kind = 'no-station-ahead'; let block = null; const reasons = new Set();
        if (ahead.length > 0) {
          for (const station of ahead.slice(0, 6)) {
            const violations = m.validateRailMove(state, { kind: 'RAIL_MOVE', actorId: me, fromHexId: hex, toHexId: station, unitIds: [], supply: [{ sourcePieceId: dump.id, tokens: Math.min(4, dump.resourceQuantity) }] });
            for (const v of violations) reasons.add(v.code);
          }
          kind = reasons.has('NO_RAIL_PATH') ? 'path-blocked' : reasons.has('NOT_ENTRAINABLE') ? 'not-entrainable' : reasons.has('NOT_DETRAINABLE') || reasons.has('DETRAIN_IN_ENEMY_ZOC') ? 'not-detrainable' : [...reasons].join('+') || 'other';
          // First impassable hex on the static path to the nearest station ahead.
          const path = []; for (let at = String(ahead[0]); at !== null; at = parent.get(at) ?? null) path.unshift(at);
          const bad = path.slice(1).find((h) => !m.railCargoPassable(state, me, h));
          if (bad) {
            const cause = m.hasEnemyCombatUnit(state, me, bad) ? 'enemy-unit' : m.inEnemyZoc(state, me, bad) ? 'enemy-zoc' : 'station-control';
            block = { hexId: bad, cause, stepsFromPile: path.indexOf(bad), enemyDistance: Math.min(99, ...enemyAll.map((e) => m.hexDistanceBetween(String(e.location.hexId), bad))), ownDistance: od(bad) };
          }
        }
        console.log(JSON.stringify({ arm, match, gameTurn: s.gameTurn, hexId: hex, tokens: dump.resourceQuantity, arrival: String(dump.id).includes('supply-arrival'), enemyDistance: ed(hex), ownDistance: od(hex), kind, reasons: [...reasons], block, stationsAhead: ahead.length }));
      }
    }
    state = m.ruleEngine.applyAction(state, action).state;
  }
}
