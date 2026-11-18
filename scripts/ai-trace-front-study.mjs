#!/usr/bin/env node
// Why an attacker's trace supply does not reach the objectives (docs/ai/evaluation.md). Replays saved ai-match attack
// games; build first.
//
//   node scripts/ai-trace-front-study.mjs <match directory> [...] [--policy <attacker policy, exact>] [--extender [--extender-gap <hexes>]] --out <file.json>
//
// At the end of each Movement Phase of the attacker (just before its Supply Phase), for every objective it does not hold,
// the distance in hexes from the objective to:
// - dTrace: the attacker's trace coverage (12.6; any unit, `queryTraceCoverage`);
// - dHqNow: the throw of an attacker HQ where it stands now, when it is fed (12.3b);
// - dBound: the best the current Supply Sources allow: the side's direct draw (12.3a) or the throw of any of its HQs
//   standing on one of the hexes nearest the objective where that HQ would be fed. HQ movement allowance, stacking, the
//   enemy's next moves and the bot's own preferences are ignored, so this is an upper bound for HQ placement;
// - dHqReach (where dTrace > 1 and dBound <= 1): the same, counting only the hexes each HQ could reach in that Movement
//   Phase from where it began it (`queryProjectedReach`, Move Mode);
// - dSource / dSourceRail: the nearest Supply Source / detrainable rail source (12.6a, `querySupplySources`);
// - dRail: the nearest rail hex, and the rail path from the attacker's source rail hexes to the rail hex nearest the
//   objective with the fewest hexes rail trace cannot pass (12.7a: enemy combat unit, enemy ZOC, enemy-held station).
// - dExtender (with --extender, where dBound > 1): dBound again with one Extender (12.7) of the attacker on the one hex,
//   chosen for the whole side, that brings the most such objective VP within 1 hex. Candidates are the hexes nearest each
//   objective at least --extender-gap hexes (default 2: not on or beside) from every enemy combat unit, where the Extender
//   would link to a Supply Source. Transport Points
//   and truck movement are ignored, so this is an upper bound for one Extender; the segment row records the hex and how far
//   it lies from the current sources, the enemy and the attacker's trucks. `tp` is the attacker's Transport Points on the
//   map (an Extender takes 5 on one counter, 12.7).
// An objective counts as reached when the distance is at most 1 (an attack position or the hex itself).
// Writes every row; prints VP a game by category, map style and Game Turn.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = option('--out');
const policy = option('--policy') ?? 'heuristic';
const withExtender = args.includes('--extender');
const extenderGap = Number(option('--extender-gap') ?? 2);
const dirs = args.filter((arg, index) => !arg.startsWith('--') && !['--out', '--policy', '--extender-gap'].includes(args[index - 1]));
if (!out || dirs.length === 0) throw new Error('see usage');
const m = await import(resolve(root, 'dist/index.js'));
const engine = m.ruleEngine;
/** Fed hexes nearest an objective tried per HQ. */
const CANDIDATES = 8;
/** Linked Extender hexes nearest each objective tried. */
const EXTENDER_CANDIDATES = 3;
const FAR = 99;

const minDistance = (hexIds, target) => {
  let best = FAR;
  for (const hexId of hexIds) best = Math.min(best, m.hexDistanceBetween(hexId, target));
  return best;
};
const nearestTo = (hexIds, target, count) => hexIds.map((hexId) => [hexId, m.hexDistanceBetween(hexId, target)])
  .sort((left, right) => left[1] - right[1]).slice(0, count).map(([hexId]) => hexId);
const onMapHqs = (state, attackerId) => state.pieceState.pieces.filter((piece) => piece.ownerId === attackerId
  && piece.location.kind === 'ON_MAP' && m.roleOf(state, piece) === 'HQ');

/** Rail path with the fewest impassable hexes from `seeds` to `goal` (0-1 BFS over the rail graph). */
const railPath = (state, attackerId, seeds, goal) => {
  const { neighbors } = m.railNetworkOf(state);
  if (neighbors.size === 0 || seeds.length === 0) return null;
  const blocked = (hexId) => !m.railTracePassable(state, attackerId, hexId);
  const cost = new Map();
  const previous = new Map();
  const deque = [];
  for (const seed of seeds) { cost.set(seed, 0); deque.push(seed); }
  while (deque.length > 0) {
    const hexId = deque.shift();
    if (hexId === goal) break;
    for (const next of neighbors.get(hexId) ?? []) {
      const step = blocked(next) ? 1 : 0;
      const total = cost.get(hexId) + step;
      if (total >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, total);
      previous.set(next, hexId);
      if (step === 0) deque.unshift(next); else deque.push(next);
    }
  }
  if (!cost.has(goal)) return null;
  const kinds = { unit: 0, zoc: 0, station: 0 };
  let length = 0;
  for (let hexId = goal; previous.has(hexId); hexId = previous.get(hexId)) {
    length += 1;
    if (!blocked(hexId)) continue;
    const enemyUnit = state.pieceState.pieces.some((piece) => piece.ownerId !== attackerId && piece.location.kind === 'ON_MAP'
      && String(piece.location.hexId) === String(hexId) && m.isOnMapCombatUnit(state, piece));
    if (enemyUnit) kinds.unit += 1;
    else if (m.isRailStation(state, hexId) && m.hexControllerOf(state, hexId) !== attackerId) kinds.station += 1;
    else kinds.zoc += 1;
  }
  return { blockers: cost.get(goal), length, ...kinds };
};

/**
 * dBound for each objective hex in `state`: the side's direct draw, or an HQ's throw from the fed hexes nearest the
 * objective (`standable(hq)` narrows where each HQ may stand).
 */
const boundsOf = (state, attackerId, hexIds, enemyAt, standable = () => null) => {
  const direct = engine.queryTraceCoverage(state, attackerId, null).value.directHexIds;
  const best = new Map(hexIds.map((hexId) => [hexId, minDistance(direct, hexId)]));
  for (const hq of onMapHqs(state, attackerId)) {
    const allowed = standable(hq);
    const fed = engine.queryTraceCoverage(state, attackerId, hq.id).value.directHexIds
      .filter((hexId) => !enemyAt.has(String(hexId)) && (allowed === null || allowed.has(String(hexId))));
    const throws = new Map();
    for (const hexId of hexIds) {
      for (const candidate of nearestTo(fed, hexId, CANDIDATES)) {
        if (!throws.has(candidate)) {
          const thrown = engine.queryHqThrow(state, attackerId, hq.id, candidate).value;
          throws.set(candidate, thrown.fed ? thrown.hexIds : []);
        }
        best.set(hexId, Math.min(best.get(hexId), minDistance(throws.get(candidate), hexId)));
      }
    }
  }
  return best;
};

/** The state with `truck` standing on `hexId` as an Extender (as `extenderConnectsAt` probes it), or null if unlinked. */
const extenderProbe = (state, attackerId, truck, hexId) => {
  const probe = { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((piece) => (piece.id === truck.id
    ? { ...piece, location: { kind: 'ON_MAP', hexId }, currentFaceId: 'extender' } : piece)) } };
  return m.friendlySourceHexes(probe, attackerId).map(String).includes(String(hexId)) ? probe : null;
};

const rows = [];
const segments = [];
for (const dir of dirs) {
  for (const record of JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records) {
    const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId;
    if (attackerId === undefined) continue;
    const side = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
    if (record.sides[side].policy !== policy) continue;
    const style = record.summary.mapStyle;
    const railHexes = state.scenario.mapDefinition.hexes.map(({ id }) => id).filter((hexId) => m.isRailHex(state, hexId));
    const measure = (start, current) => {
      const turn = current.sequence.gameTurn;
      const coverage = engine.queryTraceCoverage(current, attackerId, null).value;
      const sources = engine.querySupplySources(current, attackerId).value;
      const sourceHexes = sources.map(({ hexId }) => hexId);
      const sourceRail = sourceHexes.filter((hexId) => m.isRailHex(current, hexId));
      const own = current.pieceState.pieces.filter((piece) => piece.ownerId === attackerId && piece.location.kind === 'ON_MAP');
      const combat = own.filter((piece) => m.isOnMapCombatUnit(current, piece));
      const trucks = own.filter((piece) => m.roleOf(current, piece) === 'TRUCK' && !m.isExtender(current, piece));
      const hqs = onMapHqs(current, attackerId).map((hq) => {
        const now = engine.queryHqThrow(current, attackerId, hq.id, hq.location.hexId).value;
        return { fed: now.fed, throwNow: now.hexIds };
      });
      const enemyAt = new Set(current.pieceState.pieces.filter((piece) => piece.ownerId !== attackerId && piece.location.kind === 'ON_MAP'
        && m.isOnMapCombatUnit(current, piece)).map((piece) => String(piece.location.hexId)));
      const open = current.configuration.objectives.filter(({ hexId }) => m.hexControllerOf(current, hexId) !== attackerId);
      const openHexes = open.map(({ hexId }) => hexId);
      const bounds = boundsOf(current, attackerId, openHexes, enemyAt);
      // Where each HQ could have stood this Movement Phase, from where it began it.
      const reach = new Map(onMapHqs(start, attackerId).map((hq) => [String(hq.id),
        new Set(engine.queryProjectedReach(start, attackerId, hq.id, hq.location.hexId, 'MOVE').value.map(({ hexId }) => String(hexId))
          .concat(String(hq.location.hexId)))]));
      const hqShort = openHexes.filter((hexId) => minDistance(coverage.hexIds, hexId) > 1 && bounds.get(hexId) <= 1);
      const reachBounds = hqShort.length === 0 ? new Map()
        : boundsOf(current, attackerId, hqShort, enemyAt, (hq) => reach.get(String(hq.id)) ?? new Set());
      // One Extender for the whole side.
      const sourceShort = open.filter(({ hexId }) => bounds.get(hexId) > 1);
      let extender = null;
      const truck = trucks[0];
      if (withExtender && sourceShort.length > 0 && truck) {
        const land = current.scenario.mapDefinition.hexes.filter(({ id, terrainDefinitionIds }) => minDistance(enemyAt, id) >= extenderGap
          && !terrainDefinitionIds.some((terrain) => String(terrain) === 'terrain:water')).map(({ id }) => id);
        const probes = new Map();
        for (const { hexId } of sourceShort) {
          let found = 0;
          for (const candidate of nearestTo(land, hexId, land.length)) {
            if (found >= EXTENDER_CANDIDATES) break;
            if (!probes.has(String(candidate))) probes.set(String(candidate), extenderProbe(current, attackerId, truck, candidate));
            if (probes.get(String(candidate))) found += 1;
          }
        }
        for (const [hexId, probe] of probes) {
          if (!probe) continue;
          const withIt = boundsOf(probe, attackerId, sourceShort.map(({ hexId: objective }) => objective), enemyAt);
          const gain = sourceShort.filter(({ hexId: objective }) => withIt.get(objective) <= 1).reduce((total, { points }) => total + points, 0);
          if (extender === null || gain > extender.gain) extender = { hexId, gain, bounds: withIt };
        }
      }
      for (const { hexId, points } of open) {
        const nearestRail = nearestTo(railHexes, hexId, 1)[0];
        rows.push({
          match: record.match, style, turn, hexId: String(hexId), points, defended: enemyAt.has(String(hexId)),
          dUnit: minDistance(combat.map((piece) => piece.location.hexId), hexId),
          dTrace: minDistance(coverage.hexIds, hexId),
          dHqNow: Math.min(...hqs.filter(({ fed }) => fed).map(({ throwNow }) => minDistance(throwNow, hexId)), FAR),
          dBound: bounds.get(hexId), dHqReach: reachBounds.get(hexId) ?? null,
          dExtender: extender?.bounds.get(hexId) ?? null,
          dSource: minDistance(sourceHexes, hexId), dSourceRail: minDistance(sourceRail, hexId),
          dRail: nearestRail === undefined ? FAR : m.hexDistanceBetween(nearestRail, hexId),
          rail: nearestRail === undefined ? null : railPath(current, attackerId, sourceRail, nearestRail),
        });
      }
      segments.push({
        match: record.match, style, turn, open: open.length, hqs: hqs.length, fedHqs: hqs.filter(({ fed }) => fed).length,
        sources: sources.length, railSources: sourceRail.length,
        tp: trucks.reduce((total, piece) => total + m.transportPointsOf(current, piece), 0),
        extender: extender && {
          hexId: extender.hexId, gain: extender.gain, toSource: minDistance(sourceHexes, extender.hexId),
          toEnemy: minDistance([...enemyAt], extender.hexId), toTruck: minDistance(trucks.map((piece) => piece.location.hexId), extender.hexId),
          inTrace: coverage.hexIds.map(String).includes(extender.hexId),
        },
      });
    };
    let start = null;
    for (const action of save.acceptedActions) {
      const before = state;
      state = engine.applyAction(state, action).state;
      const attackerMoving = (entry) => entry.sequence.phase === 'MOVEMENT' && entry.sequence.phasingPlayerId === attackerId;
      if (attackerMoving(state) && !attackerMoving(before)) start = state;
      if (attackerMoving(before) && !attackerMoving(state)) measure(start ?? before, before);
    }
  }
}
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, `${JSON.stringify({ rows, segments })}\n`);

const games = (style) => new Set(segments.filter((entry) => entry.style === style).map(({ match }) => match)).size;
const categories = [
  ['reached', (row) => row.dTrace <= 1],
  ['HQ, reachable this phase', (row) => row.dTrace > 1 && row.dBound <= 1 && row.dHqReach <= 1],
  ['HQ, farther', (row) => row.dTrace > 1 && row.dBound <= 1 && row.dHqReach > 1],
  ['source, rail blocked', (row) => row.dBound > 1 && row.rail && row.rail.blockers > 0],
  ['source, other', (row) => row.dBound > 1 && !(row.rail && row.rail.blockers > 0)],
  ...(withExtender ? [['(of source) one Extender', (row) => row.dBound > 1 && row.dExtender !== null && row.dExtender <= 1]] : []),
];
for (const style of [...new Set(segments.map(({ style: entry }) => entry))].sort()) {
  const count = games(style);
  console.log(`== ${style} (${count} games): objective VP a game not held at the end of the attacker's Movement Phase`);
  console.log(`turn  open VP | ${categories.map(([name]) => name).join(' | ')} | dTrace dHqNow dBound dSourceRail dRail`);
  for (let turn = 1; turn <= 8; turn += 1) {
    const list = rows.filter((row) => row.style === style && row.turn === turn);
    if (list.length === 0) continue;
    const vp = (test) => (list.filter(test).reduce((total, row) => total + row.points, 0) / count).toFixed(2);
    const mean = (key) => (list.reduce((total, row) => total + Math.min(row[key], 30), 0) / list.length).toFixed(1);
    console.log(`${turn}  ${vp(() => true)} | ${categories.map(([, test]) => vp(test)).join(' | ')} | ${['dTrace', 'dHqNow', 'dBound', 'dSourceRail', 'dRail'].map(mean).join(' ')}`);
  }
}
