#!/usr/bin/env node
// Where does the attacker's SP stay behind, and what happened at those piles? Attributes the two attacker supply gates of
// docs/ai/evaluation.md (攻方運補 gate: rear SP left; 攻方送補 gate: SP no front unit can draw) to what happened at each pile in
// the Movement Segment (docs/roadmap/19-ai-strategy-improvement-wbs.md S1.1). Replays saves; does not play. Build first.
//
//   node scripts/ai-supply-gap-study.mjs --arm <label>=<dir> [--arm ...] [--from 3] [--to 99] [--shard i/n] --out <rows.jsonl>
//   node scripts/ai-supply-gap-study.mjs --summarize <rows.jsonl> [...] --baseline <label> [--examples n] [--json <out.json>]
//
// Every attacker Movement Segment from Game Turn --from to --to: at its end, each attacker pile (a dump that is not a garrison
// stock, or SP on a truck) is measured as the gates measure it — "stranded" when no front unit (a combat unit other than an HQ
// within 4 hexes of an enemy combat unit) can draw it directly or through an HQ throw (12.3a-b), "rear" when it is a dump at
// least 6 hexes from enemy combat units other than garrisons — and given the first category that applies:
//   truck        SP still on a truck
//   drop-now     a truck unloaded at its hex in this segment
//   railed-now   rail delivered SP to its hex in this segment (not loadable this phase, 12.2a)
//   rail-cut     its hex is on the rail net, but when the segment began (Rail Cap unspent) no legal RAIL_MOVE could carry SP
//                from it forward: the line out is cut by enemy units or ZOC, or no station ahead is detrainable (13.3c, 13.3e)
//   rail-could   at the segment's last decision a legal RAIL_MOVE could still carry SP from it forward (to a hex at least 3
//                hexes nearer the enemy and at least 3 from it), so rail left it
//   loaded-now   a truck loaded from it in this segment and the rest stayed
//   old-drop     a truck unloaded at its hex in an earlier segment
//   hq-moved     (stranded only) a front unit could draw it had the attacker's HQs stayed where they began the segment
//   idle-truck   a truck that was empty when the segment began and loaded nothing in it could have reached its hex
//   other
// The row also keeps every flag, so overlaps can be counted, and the segment's flows (rail, loads, unloads, idle trucks).
// Rows are per segment; --summarize gives SP per segment by category for each arm and, against --baseline, the difference
// per map (mean over the map's segments, then mean and 95% t interval over maps). The two seat-swapped games of a seed
// (matches 2k and 2k + 1) share a map and are one cluster, as in ai-theater-rollout.mjs --compare: rollouts from the
// first Movement decision of Game Turn 1 are identical for the two.
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CATEGORIES = ['truck', 'drop-now', 'railed-now', 'rail-cut', 'rail-could', 'loaded-now', 'old-drop', 'hq-moved', 'idle-truck', 'other'];
const argv = process.argv.slice(2);
const option = (name, fallback = null) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : fallback; };
const options = (name) => argv.flatMap((arg, index) => (arg === name ? [argv[index + 1]] : []));

if (argv.includes('--summarize')) {
  summarize();
} else {
  await record();
}

async function record() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
  const out = option('--out');
  if (!out) throw new Error('--out <rows.jsonl> is required');
  const from = Number(option('--from', '3'));
  const to = Number(option('--to', '99'));
  const [shard, shards] = (option('--shard', '0/1')).split('/').map(Number);
  const FRONT = 4; const REAR = 6; const RAIL_GAIN = 3; const RAIL_SAFE = 3;
  writeFileSync(out, '');
  const arms = options('--arm').map((spec) => { const at = spec.indexOf('='); return { label: spec.slice(0, at), dir: spec.slice(at + 1) }; });
  const jobs = arms.flatMap(({ label, dir }) => readdirSync(dir).filter((name) => /^match-\d+\.save\.json$/u.test(name)).sort()
    .map((file) => ({ label, dir, file, match: Number(file.match(/\d+/u)[0]) })))
    .filter((_, index) => index % shards === shard);

  for (const { label, dir, file, match } of jobs) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId ?? null;
    if (attackerId === null) continue;
    const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
    const isHq = (piece) => String(definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':hq');
    const isDump = (piece) => definitions.get(piece.definitionId)?.family === 'RESOURCE';
    const isStock = (id) => String(id).includes('-stock-');
    const byId = (current, id) => current.pieceState.pieces.find((piece) => piece.id === id);
    const hexOfPiece = (current, piece) => {
      if (!piece) return null;
      if (piece.location.kind === 'ON_MAP') return String(piece.location.hexId);
      if (piece.location.kind === 'CONTAINER') { const carrier = byId(current, piece.location.containerId); return carrier?.location.kind === 'ON_MAP' ? String(carrier.location.hexId) : null; }
      return null;
    };
    const own = (current) => current.pieceState.pieces.filter((piece) => piece.ownerId === attackerId && piece.location.kind === 'ON_MAP');
    const enemyUnits = (current, withGarrisons) => current.pieceState.pieces.filter((piece) => piece.ownerId !== attackerId && piece.location.kind === 'ON_MAP'
      && m.isOnMapCombatUnit(current, piece) && (withGarrisons || !/garrison/u.test(String(piece.definitionId))));
    const distanceTo = (units, hexId) => Math.min(99, ...units.map((unit) => m.hexDistanceBetween(String(unit.location.hexId), hexId)));
    const trucksOf = (current) => own(current).filter((piece) => m.isTransportPoint(current, piece));
    const dropHistory = new Map(); // hex -> last segment index with an attacker unload there
    let segmentIndex = 0;
    let segment = null;

    for (const action of save.acceptedActions) {
      const { gameTurn, phase, segment: step, phasingPlayerId } = state.sequence;
      const inSegment = phase === 'MOVEMENT' && step === 'MOVEMENT' && phasingPlayerId === attackerId && gameTurn >= from && gameTurn <= to;
      if (inSegment && !segment) {
        segmentIndex += 1;
        const trucks = trucksOf(state);
        const emptyAtStart = trucks.filter((truck) => m.loadedTokens(state, truck) === 0);
        // Rail lines out of each pile's hex while Rail Cap is still unspent.
        const enemyAtStart = enemyUnits(state, false);
        const railHexes = new Set(state.pieceState.pieces.filter((piece) => piece.ownerId === attackerId && piece.location.kind === 'ON_MAP' && isDump(piece)
          && !isStock(piece.id) && m.isRailHex(state, piece.location.hexId)).map((piece) => String(piece.location.hexId)));
        const railForwardHexes = new Set();
        for (const rail of m.ruleEngine.getActionCandidates(state, { actorId: attackerId, kind: 'RAIL_MOVE', pieceId: null, budget: 4000 }).actions) {
          if (!rail.supply.some(({ tokens }) => tokens > 0)) continue;
          const toDistance = distanceTo(enemyAtStart, String(rail.toHexId));
          if (toDistance >= RAIL_SAFE && toDistance <= distanceTo(enemyAtStart, String(rail.fromHexId)) - RAIL_GAIN) railForwardHexes.add(String(rail.fromHexId));
        }
        const reach = new Map(emptyAtStart.map((truck) => [truck.id, new Set((m.ruleEngine.queryMovementRange(state, attackerId, truck.id).value ?? []).map(({ hexId }) => String(hexId)))]));
        segment = {
          gameTurn, index: segmentIndex, trucks: trucks.length, railHexes, railForwardHexes, emptyAtStart: emptyAtStart.map(({ id }) => id), reach,
          hqStart: new Map(own(state).filter(isHq).map((hq) => [hq.id, hq])),
          unloadedAt: new Map(), railedTo: new Map(), loadedAt: new Map(), loadedBy: new Set(), unloadedBy: new Set(),
          flows: { railTokens: 0, railForwardTokens: 0, loadTokens: 0, loadRearTokens: 0, unloadTokens: 0, unloadFrontTokens: 0 },
        };
      }
      // Attacker unloads outside the measured segments still make old drops.
      if (action.kind === 'UNLOAD_SUPPLY' && phasingPlayerId === attackerId) {
        const at = hexOfPiece(state, byId(state, action.truckId));
        if (at) dropHistory.set(at, inSegment ? segment.index : segmentIndex + 0.5);
      }
      if (inSegment) {
        const enemy = enemyUnits(state, false);
        if (action.kind === 'UNLOAD_SUPPLY') {
          const at = hexOfPiece(state, byId(state, action.truckId));
          segment.unloadedBy.add(action.truckId);
          if (at) {
            segment.unloadedAt.set(at, (segment.unloadedAt.get(at) ?? 0) + action.tokens);
            segment.flows.unloadTokens += action.tokens;
            if (distanceTo(enemyUnits(state, true), at) <= FRONT + 1) segment.flows.unloadFrontTokens += action.tokens;
          }
        }
        if (action.kind === 'LOAD_SUPPLY') {
          const at = hexOfPiece(state, byId(state, action.truckId));
          segment.loadedBy.add(action.truckId);
          segment.flows.loadTokens += action.tokens;
          if (at) {
            segment.loadedAt.set(at, (segment.loadedAt.get(at) ?? 0) + action.tokens);
            if (distanceTo(enemy, at) >= REAR) segment.flows.loadRearTokens += action.tokens;
          }
        }
        if (action.kind === 'RAIL_MOVE') {
          const tokens = action.supply.filter(({ sourcePieceId }) => !isStock(sourcePieceId)).reduce((sum, { tokens: t }) => sum + t, 0);
          if (tokens > 0) {
            segment.railedTo.set(String(action.toHexId), (segment.railedTo.get(String(action.toHexId)) ?? 0) + tokens);
            segment.flows.railTokens += tokens;
            if (distanceTo(enemy, String(action.toHexId)) <= distanceTo(enemy, String(action.fromHexId)) - RAIL_GAIN) segment.flows.railForwardTokens += tokens;
          }
        }
      }
      const next = m.ruleEngine.applyAction(state, action).state;
      const leaving = !(next.sequence.phase === 'MOVEMENT' && next.sequence.segment === 'MOVEMENT');
      if (inSegment && leaving) {
        writeRow({ m, label, match, attackerId, last: state, end: next, segment, dropHistory, helpers: { isHq, isDump, isStock, byId, hexOfPiece, own, enemyUnits, distanceTo, trucksOf }, constants: { FRONT, REAR, RAIL_GAIN, RAIL_SAFE } });
        segment = null;
      }
      state = next;
    }
  }
  console.log(`done ${jobs.length} saves`);

  function writeRow({ m, label, match, attackerId, last, end, segment, dropHistory, helpers, constants }) {
    const { isHq, isDump, isStock, byId, hexOfPiece, own, enemyUnits, distanceTo, trucksOf } = helpers;
    const { FRONT, REAR, RAIL_GAIN, RAIL_SAFE } = constants;
    const enemyAll = enemyUnits(end, true);
    const enemyField = enemyUnits(end, false);
    const isField = (piece) => m.isOnMapCombatUnit(end, piece) && !isHq(piece);
    const front = new Set(own(end).filter((piece) => isField(piece) && distanceTo(enemyAll, String(piece.location.hexId)) <= FRONT).map((piece) => String(piece.location.hexId)));
    const reachesFront = (feed) => feed.hexIds.some((hexId) => front.has(String(hexId)));
    const feeds = (m.ruleEngine.queryFeedCoverage(end, attackerId, null).value ?? []).filter((feed) => !isStock(feed.dumpId));
    // The same feeds with the HQs that moved in this segment put back where they began it.
    const moved = [...segment.hqStart.values()].filter((hq) => { const now = byId(end, hq.id); return now && hexOfPiece(end, now) !== hexOfPiece(end, hq); });
    let hqBack = null;
    const hqBackFeeds = () => {
      if (hqBack) return hqBack;
      const back = new Map(moved.map((hq) => [hq.id, hq]));
      const clone = { ...end, pieceState: { ...end.pieceState, pieces: end.pieceState.pieces.map((piece) => back.get(piece.id) ?? piece) } };
      hqBack = new Map((m.ruleEngine.queryFeedCoverage(clone, attackerId, null).value ?? []).map((feed) => [feed.dumpId, feed]));
      return hqBack;
    };
    // Rail options left at the segment's last decision, by source pile.
    const railForward = new Map();
    for (const rail of m.ruleEngine.getActionCandidates(last, { actorId: attackerId, kind: 'RAIL_MOVE', pieceId: null, budget: 4000 }).actions) {
      const toDistance = distanceTo(enemyField, String(rail.toHexId));
      if (toDistance < RAIL_SAFE || toDistance > distanceTo(enemyField, String(rail.fromHexId)) - RAIL_GAIN) continue;
      for (const { sourcePieceId, tokens } of rail.supply) if (tokens > 0) railForward.set(sourcePieceId, Math.max(tokens, railForward.get(sourcePieceId) ?? 0));
    }
    const idleEmpty = segment.emptyAtStart.filter((id) => !segment.loadedBy.has(id));
    const piles = new Map();
    const pileOf = (piece) => {
      if (piles.has(piece.id)) return piles.get(piece.id);
      const hexId = hexOfPiece(end, piece);
      const onTruck = piece.location.kind === 'CONTAINER' || m.isTransportPoint(end, piece);
      const flags = {
        truck: onTruck,
        'drop-now': hexId !== null && segment.unloadedAt.has(hexId),
        'railed-now': hexId !== null && segment.railedTo.has(hexId),
        'rail-cut': hexId !== null && segment.railHexes.has(hexId) && !segment.railForwardHexes.has(hexId),
        'rail-could': railForward.has(piece.id),
        'loaded-now': hexId !== null && segment.loadedAt.has(hexId),
        'old-drop': hexId !== null && dropHistory.has(hexId) && dropHistory.get(hexId) < segment.index,
        'hq-moved': false,
        'idle-truck': hexId !== null && idleEmpty.some((id) => segment.reach.get(id)?.has(hexId)),
      };
      const pile = { id: String(piece.id).split(':').slice(-2).join(':'), hexId, enemyDistance: hexId === null ? null : distanceTo(enemyField, hexId), flags, stranded: 0, rear: 0 };
      piles.set(piece.id, pile);
      return pile;
    };
    let frontTokens = 0;
    for (const feed of feeds) {
      if (reachesFront(feed)) { frontTokens += feed.tokens; continue; }
      const piece = byId(end, feed.dumpId);
      if (!piece) continue;
      const pile = pileOf(piece);
      pile.stranded = feed.tokens;
      if (moved.length > 0) { const back = hqBackFeeds().get(feed.dumpId); pile.flags['hq-moved'] = back !== undefined && reachesFront(back); }
    }
    for (const piece of end.pieceState.pieces) {
      if (piece.ownerId !== attackerId || piece.location.kind !== 'ON_MAP' || !isDump(piece) || !(piece.resourceQuantity > 0) || isStock(piece.id)) continue;
      if (distanceTo(enemyField, String(piece.location.hexId)) < REAR) continue;
      pileOf(piece).rear = piece.resourceQuantity;
    }
    for (const pile of piles.values()) pile.category = CATEGORIES.find((category) => category === 'other' || pile.flags[category]);
    const row = {
      arm: label, match, gameTurn: segment.gameTurn, frontTokens,
      strandedTokens: [...piles.values()].reduce((sum, pile) => sum + pile.stranded, 0),
      rearTokens: [...piles.values()].reduce((sum, pile) => sum + pile.rear, 0),
      hqsMoved: moved.length,
      flows: { ...segment.flows, trucks: segment.trucks, emptyAtStart: segment.emptyAtStart.length, idleEmpty: idleEmpty.length,
        loadedIdle: trucksOf(end).filter((truck) => !segment.emptyAtStart.includes(truck.id) && !segment.unloadedBy.has(truck.id) && m.loadedTokens(end, truck) > 0).length },
      piles: [...piles.values()].filter((pile) => pile.stranded > 0 || pile.rear > 0),
    };
    appendFileSync(out, `${JSON.stringify(row)}\n`);
  }
}

function summarize() {
  const valued = new Set(['--baseline', '--examples', '--json']);
  const files = argv.filter((arg, index) => !arg.startsWith('--') && !valued.has(argv[index - 1]));
  const baseline = option('--baseline');
  const exampleCount = Number(option('--examples', '5'));
  const rows = files.flatMap((file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)));
  const arms = [...new Set(rows.map(({ arm }) => arm))];
  const measures = ['stranded', 'rear'];
  // Per arm and map: mean SP per segment by measure and category; flows per segment.
  const perMap = {};
  for (const row of rows) {
    const cell = ((perMap[row.arm] ??= {})[Math.floor(row.match / 2)] ??= { segments: 0, sums: {}, flows: {} });
    cell.segments += 1;
    const add = (key, value) => { cell.sums[key] = (cell.sums[key] ?? 0) + value; };
    for (const measure of measures) {
      add(`${measure}:total`, (measure === 'stranded' ? row.strandedTokens : row.rearTokens) / 4);
      for (const pile of row.piles) {
        const tokens = pile[measure];
        if (!tokens) continue;
        add(`${measure}:${pile.category}`, tokens / 4);
        for (const [flag, on] of Object.entries(pile.flags)) if (on) add(`${measure}:flag:${flag}`, tokens / 4);
      }
    }
    for (const [key, value] of Object.entries(row.flows)) cell.flows[key] = (cell.flows[key] ?? 0) + (key.endsWith('Tokens') ? value / 4 : value);
  }
  const meanOf = (values) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  // Two-sided 95% t quantiles by degrees of freedom (normal beyond 120).
  const tQuantile = (df) => [[1, 12.71], [2, 4.30], [3, 3.18], [4, 2.78], [5, 2.57], [6, 2.45], [7, 2.36], [8, 2.31], [9, 2.26], [10, 2.23], [12, 2.18], [15, 2.13], [20, 2.09], [25, 2.06], [30, 2.04], [40, 2.02], [60, 2.00], [120, 1.98]].find(([d]) => df <= d)?.[1] ?? 1.96;
  const interval = (values) => {
    const n = values.length; const mean = meanOf(values);
    if (n < 2) return { mean, low: null, high: null, n };
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1));
    const t = tQuantile(n - 1);
    return { mean, low: mean - t * sd / Math.sqrt(n), high: mean + t * sd / Math.sqrt(n), n };
  };
  const keys = [...new Set(Object.values(perMap).flatMap((maps) => Object.values(maps).flatMap(({ sums }) => Object.keys(sums))))].sort();
  const flowKeys = [...new Set(Object.values(perMap).flatMap((maps) => Object.values(maps).flatMap(({ flows }) => Object.keys(flows))))].sort();
  const segmentMean = (arm, key, kind = 'sums') => {
    const cells = Object.values(perMap[arm] ?? {});
    return cells.reduce((sum, cell) => sum + (cell[kind][key] ?? 0), 0) / Math.max(1, cells.reduce((sum, cell) => sum + cell.segments, 0));
  };
  const paired = (arm, key, kind = 'sums') => {
    const maps = Object.keys(perMap[arm] ?? {}).filter((match) => perMap[baseline]?.[match]);
    return interval(maps.map((match) => {
      const a = perMap[arm][match]; const b = perMap[baseline][match];
      return (a[kind][key] ?? 0) / a.segments - (b[kind][key] ?? 0) / b.segments;
    }));
  };
  const fmt = (value) => (value === null || value === undefined ? '—' : value.toFixed(2));
  const result = { arms: {}, baseline };
  for (const arm of arms) {
    const segments = Object.values(perMap[arm]).reduce((sum, cell) => sum + cell.segments, 0);
    result.arms[arm] = { maps: Object.keys(perMap[arm]).length, segments, measures: {}, flows: {} };
    for (const key of keys) {
      const entry = { perSegment: segmentMean(arm, key) };
      if (baseline && arm !== baseline) entry.minusBaseline = paired(arm, key);
      result.arms[arm].measures[key] = entry;
    }
    for (const key of flowKeys) {
      const entry = { perSegment: segmentMean(arm, key, 'flows') };
      if (baseline && arm !== baseline) entry.minusBaseline = paired(arm, key, 'flows');
      result.arms[arm].flows[key] = entry;
    }
  }
  for (const measure of measures) {
    console.log(`\n${measure === 'stranded' ? 'SP no front unit can draw' : 'Rear SP left'}, per segment (exclusive categories; then flags, which overlap)`);
    console.log(['category'.padEnd(18), ...arms.map((arm) => arm.padStart(16)), ...arms.filter((arm) => baseline && arm !== baseline).map((arm) => `${arm} − ${baseline}`.padStart(34))].join(''));
    for (const key of keys.filter((k) => k.startsWith(`${measure}:`))) {
      const name = key.slice(measure.length + 1);
      const diffs = arms.filter((arm) => baseline && arm !== baseline).map((arm) => { const d = result.arms[arm].measures[key]?.minusBaseline; return d ? `${fmt(d.mean)} [${fmt(d.low)}, ${fmt(d.high)}]`.padStart(34) : ''.padStart(34); });
      console.log([name.padEnd(18), ...arms.map((arm) => fmt(result.arms[arm].measures[key]?.perSegment ?? 0).padStart(16)), ...diffs].join(''));
    }
  }
  console.log('\nFlows per segment (tokens shown as SP)');
  for (const key of flowKeys) {
    const diffs = arms.filter((arm) => baseline && arm !== baseline).map((arm) => { const d = result.arms[arm].flows[key]?.minusBaseline; return d ? `${fmt(d.mean)} [${fmt(d.low)}, ${fmt(d.high)}]`.padStart(34) : ''.padStart(34); });
    console.log([key.padEnd(18), ...arms.map((arm) => fmt(result.arms[arm].flows[key].perSegment).padStart(16)), ...diffs].join(''));
  }
  // The largest piles of each category, for looking at positions.
  const examples = {};
  for (const arm of arms) {
    for (const measure of measures) {
      for (const category of CATEGORIES) {
        const list = rows.filter((row) => row.arm === arm && row.match % 2 === 0).flatMap((row) => row.piles.filter((pile) => pile.category === category && pile[measure] > 0)
          .map((pile) => ({ match: row.match, gameTurn: row.gameTurn, hexId: pile.hexId, sp: pile[measure] / 4, enemyDistance: pile.enemyDistance, flags: Object.keys(pile.flags).filter((flag) => pile.flags[flag]) })))
          .sort((a, b) => b.sp - a.sp).slice(0, exampleCount);
        if (list.length > 0) ((examples[arm] ??= {})[measure] ??= {})[category] = list;
      }
    }
  }
  result.examples = examples;
  const json = option('--json');
  if (json) writeFileSync(json, JSON.stringify(result, null, 2));
}
