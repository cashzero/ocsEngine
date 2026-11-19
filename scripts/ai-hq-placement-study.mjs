#!/usr/bin/env node
// S15.1: Why attacker HQs do not move to hexes that throw trace onto open objectives.
// Replays saved ai-match attack games; build first (`npm run build`).
//
//   node scripts/ai-hq-placement-study.mjs <match directory> [...] [--policy <attacker policy>] --out <file.json>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = option('--out');
const policy = option('--policy') ?? 'heuristic';
const dirs = args.filter((arg, index) => !arg.startsWith('--') && !['--out', '--policy'].includes(args[index - 1]));
if (!out || dirs.length === 0) throw new Error('Usage: node scripts/ai-hq-placement-study.mjs <dir...> --out <file.json>');

const m = await import(resolve(root, 'dist/index.js'));
const engine = m.ruleEngine;
const CANDIDATES = 12;
const HQ_SAFE_DISTANCE = 3;
const NEARBY_TROOP_DISTANCE = 6;
const FAR = 99;

const minDistance = (hexIds, target) => {
  let best = FAR;
  for (const hexId of hexIds) best = Math.min(best, m.hexDistanceBetween(hexId, target));
  return best;
};
const nearestTo = (hexIds, target, count) => hexIds
  .map((hexId) => [hexId, m.hexDistanceBetween(hexId, target)])
  .sort((left, right) => left[1] - right[1] || String(left[0]).localeCompare(String(right[0])))
  .slice(0, count)
  .map(([hexId]) => hexId);

const onMapHqs = (state, playerId) => state.pieceState.pieces.filter((piece) => piece.ownerId === playerId
  && piece.location.kind === 'ON_MAP' && m.roleOf(state, piece) === 'HQ');

const enemyCombatHexes = (state, playerId) => new Set(
  state.pieceState.pieces
    .filter((piece) => piece.ownerId !== playerId && piece.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, piece))
    .map((piece) => String(piece.location.hexId)),
);

const ownCombatNonHq = (state, playerId) => state.pieceState.pieces.filter(
  (piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP'
    && m.isOnMapCombatUnit(state, piece) && m.roleOf(state, piece) !== 'HQ',
);

const rows = [];
const segments = [];

for (const dir of dirs) {
  const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  for (const record of summary.records) {
    const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId;
    if (attackerId === undefined) continue;
    const side = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
    if (record.sides[side].policy !== policy) continue;
    const style = record.summary.mapStyle;

    const analyzePhase = (start, end, phaseActions) => {
      const turn = end.sequence.gameTurn;
      const endCoverage = engine.queryTraceCoverage(end, attackerId, null).value;
      const openAtEnd = end.configuration.objectives.filter(({ hexId }) => m.hexControllerOf(end, hexId) !== attackerId);
      const untracedOpen = openAtEnd.filter(({ hexId }) => minDistance(endCoverage.hexIds, hexId) > 1);
      segments.push({ match: record.match, style, turn, openCount: openAtEnd.length, untracedOpenCount: untracedOpen.length });
      if (untracedOpen.length === 0) return;

      const startEnemyAt = enemyCombatHexes(start, attackerId);
      const startEnemyList = [...startEnemyAt];
      const startDirect = new Set(engine.queryTraceCoverage(start, attackerId, null).value.directHexIds.map(String));
      const startHqs = onMapHqs(start, attackerId);
      const endHqHex = new Map(onMapHqs(end, attackerId).map((hq) => [String(hq.id), String(hq.location.hexId)]));
      const startCombat = ownCombatNonHq(start, attackerId);
      const endCombatHex = new Map(ownCombatNonHq(end, attackerId).map((u) => [String(u.id), String(u.location.hexId)]));

      // Which HQs moved or fueled during this Movement Phase.
      const movedIds = new Set();
      const fueledIds = new Set();
      for (const act of phaseActions) {
        if (act.kind === 'MOVE_PIECE' && act.pieceId) movedIds.add(String(act.pieceId));
        if (act.kind === 'PAY_FUEL' && act.pieceId) fueledIds.add(String(act.pieceId));
      }

      // Precompute per-HQ start reach, fed hexes, current throw, dependents, fuel/move availability, dump draw coverage.
      const hqCurrentThrow = new Map();
      for (const hq of startHqs) {
        hqCurrentThrow.set(String(hq.id), engine.queryHqThrow(start, attackerId, hq.id, hq.location.hexId).value);
      }

      const hqInfo = startHqs.map((hq) => {
        const id = String(hq.id);
        const startHex = String(hq.location.hexId);
        const endHex = endHqHex.get(id) ?? null;
        const reach = new Set(
          engine.queryProjectedReach(start, attackerId, hq.id, hq.location.hexId, 'MOVE').value
            .map(({ hexId }) => String(hexId))
            .concat(startHex),
        );
        const fedDirect = engine.queryTraceCoverage(start, attackerId, hq.id).value.directHexIds
          .map(String)
          .filter((hexId) => !startEnemyAt.has(hexId) && reach.has(hexId));
        const now = hqCurrentThrow.get(id);
        const nowCovers = new Set(now.hexIds.map(String));
        const servable = new Set(now.servableIds.map(String));
        const dependents = start.pieceState.pieces.filter((u) => u.ownerId === attackerId && u.location.kind === 'ON_MAP'
          && String(u.id) !== id && m.isOnMapCombatUnit(start, u)
          && nowCovers.has(String(u.location.hexId)) && !startDirect.has(String(u.location.hexId))
          && servable.has(String(u.id))
          && !startHqs.some((other) => String(other.id) !== id
            && hqCurrentThrow.get(String(other.id)).hexIds.map(String).includes(String(u.location.hexId))));

        // Can this HQ move or pay fuel at start?
        const rangeNow = engine.queryMovementRange(start, attackerId, hq.id).value ?? [];
        const fuelCands = engine.getActionCandidates(start, { actorId: attackerId, kind: 'PAY_FUEL', pieceId: hq.id, budget: 50 }).actions ?? [];
        const canMove = rangeNow.length > 0 || fuelCands.length > 0 || movedIds.has(id);

        // Dump feed coverage for this HQ (to check if off-rail-draw / SP draw mattered).
        const feedHexes = new Set(
          engine.queryFeedCoverage(start, attackerId, hq.id).value
            .filter(({ tokens }) => tokens > 0)
            .flatMap(({ hexIds }) => hexIds.map(String)),
        );

        return { hq, id, startHex, endHex, moved: endHex !== null && endHex !== startHex, reach, fedDirect, now, dependents, canMove, feedHexes };
      });

      const throwCache = new Map();
      const getThrow = (hq, hexId) => {
        const key = `${hq.id}|${hexId}`;
        if (!throwCache.has(key)) {
          throwCache.set(key, engine.queryHqThrow(start, attackerId, hq.id, hexId).value);
        }
        return throwCache.get(key);
      };

      for (const obj of untracedOpen) {
        const objHex = String(obj.hexId);
        // Find all (hq, hexId) pairs that can throw within 1 hex of objHex.
        const allPairs = [];
        for (const info of hqInfo) {
          const candidates = nearestTo(info.fedDirect, objHex, CANDIDATES);
          for (const hexId of candidates) {
            const thrown = getThrow(info.hq, hexId);
            if (!thrown.fed) continue;
            if (minDistance(thrown.hexIds, objHex) > 1) continue;
            const enemyDist = minDistance(startEnemyList, hexId);
            const safe = hexId === info.startHex || enemyDist >= HQ_SAFE_DISTANCE;
            const thrownSet = new Set(thrown.hexIds.map(String));
            const droppedDeps = info.dependents.filter((u) => !thrownSet.has(String(u.location.hexId)));
            const keepsDeps = droppedDeps.length === 0;
            const depsMovedAway = droppedDeps.length > 0 && droppedDeps.every((u) => {
              const eh = endCombatHex.get(String(u.id));
              return eh !== undefined && eh !== String(u.location.hexId);
            });
            allPairs.push({
              hqId: info.id,
              hexId,
              enemyDist,
              safe,
              canMove: info.canMove,
              keepsDeps,
              droppedDepCount: droppedDeps.length,
              depsMovedAway,
              hqMoved: info.moved,
              hqStartHex: info.startHex,
              hqEndHex: info.endHex,
              candHasDumpDraw: info.feedHexes.has(hexId),
              actualHasDumpDraw: info.endHex !== null && info.feedHexes.has(info.endHex),
            });
          }
        }
        if (allPairs.length === 0) continue;

        const nearestTroopStart = minDistance(startCombat.map((u) => u.location.hexId), objHex);
        const nearestTroopEnd = minDistance([...endCombatHex.values()], objHex);
        const hasNearbyTroops = Math.min(nearestTroopStart, nearestTroopEnd) <= NEARBY_TROOP_DISTANCE;

        const safePairs = allPairs.filter((p) => p.safe);
        const movablePairs = safePairs.filter((p) => p.canMove);
        const depSafePairs = movablePairs.filter((p) => p.keepsDeps);

        let reason;
        let bestPair = allPairs[0];
        if (safePairs.length === 0) {
          reason = 'blocked_enemy_near';
        } else if (movablePairs.length === 0) {
          reason = 'blocked_no_fuel';
          bestPair = safePairs[0];
        } else if (depSafePairs.length === 0) {
          reason = 'blocked_dependents';
          bestPair = movablePairs.sort((a, b) => a.droppedDepCount - b.droppedDepCount)[0];
        } else if (!hasNearbyTroops) {
          reason = 'no_nearby_troops';
          bestPair = depSafePairs[0];
        } else {
          bestPair = depSafePairs[0];
          reason = bestPair.hqMoved ? 'actionable_hq_moved_elsewhere' : 'actionable_hq_stayed';
        }

        // For blocked_dependents, check if any other HQ could stay/cover or if all dropped dependents moved away.
        const anyDepMovedAway = reason === 'blocked_dependents' && movablePairs.some((p) => p.depsMovedAway);

        rows.push({
          match: record.match,
          style,
          turn,
          hexId: objHex,
          points: obj.points,
          reason,
          anyDepMovedAway,
          nearestTroopStart,
          nearestTroopEnd,
          hqId: bestPair.hqId,
          candHex: bestPair.hexId,
          hqEndHex: bestPair.hqEndHex,
          candHasDumpDraw: bestPair.candHasDumpDraw,
          actualHasDumpDraw: bestPair.actualHasDumpDraw,
          anyActionableHasDumpDraw: depSafePairs.some((p) => p.candHasDumpDraw),
        });
      }
    };

    let start = null;
    let phaseActions = [];
    for (const action of save.acceptedActions) {
      const before = state;
      state = engine.applyAction(state, action).state;
      const attackerMoving = (entry) => entry.sequence.phase === 'MOVEMENT' && entry.sequence.phasingPlayerId === attackerId;
      if (attackerMoving(state) && !attackerMoving(before)) {
        start = state;
        phaseActions = [];
      }
      if (attackerMoving(before)) phaseActions.push(action);
      if (attackerMoving(before) && !attackerMoving(state)) {
        analyzePhase(start ?? before, before, phaseActions);
      }
    }
  }
}

mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, `${JSON.stringify({ rows, segments }, null, 2)}\n`);

const REASONS = [
  'blocked_enemy_near',
  'blocked_no_fuel',
  'blocked_dependents',
  'no_nearby_troops',
  'actionable_hq_stayed',
  'actionable_hq_moved_elsewhere',
];

for (const style of [...new Set(segments.map((s) => s.style))].sort()) {
  const gameCount = new Set(segments.filter((s) => s.style === style).map((s) => s.match)).size;
  console.log(`\n== ${style} (${gameCount} games): VP/game of untraced open objectives reachable by HQ this phase ==`);
  console.log(`turn  total | enemy<3 | noFuel | depend | noTroop | actStay | actMove | actTotal | actDumpDraw | depMovedAway`);
  for (let turn = 1; turn <= 8; turn += 1) {
    const list = rows.filter((r) => r.style === style && r.turn === turn);
    const vp = (pred) => (list.filter(pred).reduce((s, r) => s + r.points, 0) / gameCount).toFixed(2);
    const total = vp(() => true);
    const cols = REASONS.map((reason) => vp((r) => r.reason === reason));
    const actTotal = vp((r) => r.reason.startsWith('actionable_'));
    const actDumpDraw = vp((r) => r.reason.startsWith('actionable_') && r.anyActionableHasDumpDraw);
    const depMoved = vp((r) => r.reason === 'blocked_dependents' && r.anyDepMovedAway);
    console.log(
      `${String(turn).padStart(4)}  ${total.padStart(5)} | ${cols.map((c) => c.padStart(7)).join(' | ')} | ${actTotal.padStart(8)} | ${actDumpDraw.padStart(11)} | ${depMoved.padStart(12)}`,
    );
  }
  const gt36 = rows.filter((r) => r.style === style && r.turn >= 3 && r.turn <= 6);
  const mean36 = (pred) => (gt36.filter(pred).reduce((s, r) => s + r.points, 0) / (gameCount * 4)).toFixed(2);
  console.log(
    `GT3-6 avg/turn: total=${mean36(() => true)}, enemy<3=${mean36((r) => r.reason === 'blocked_enemy_near')}, `
    + `noFuel=${mean36((r) => r.reason === 'blocked_no_fuel')}, depend=${mean36((r) => r.reason === 'blocked_dependents')}, `
    + `noTroop=${mean36((r) => r.reason === 'no_nearby_troops')}, `
    + `actionable=${mean36((r) => r.reason.startsWith('actionable_'))} `
    + `(stayed=${mean36((r) => r.reason === 'actionable_hq_stayed')}, moved=${mean36((r) => r.reason === 'actionable_hq_moved_elsewhere')}, `
    + `withDumpDraw=${mean36((r) => r.reason.startsWith('actionable_') && r.anyActionableHasDumpDraw)})`,
  );
}
