// Position metrics for one side of a GameState, for continuation and metric studies (docs/ai/evaluation.md).
//
//   import { positionMetrics, eventTotals } from './ai-position-metrics.mjs';
//   positionMetrics(m, state)            -> { [playerId]: { vp, objectives, … } }
//   eventTotals(history, ownerOf)        -> { [playerId]: { stepsLost, spSpent, attacks, barrages } }
//
// `m` is a built engine (dist/index.js). Every metric is computed from the full state; none of them is a policy's view.
// Distances are to enemy combat units; "front" units are combat units other than HQs within FRONT_HEXES of one.
const FRONT_HEXES = 4;

export const METRIC_NAMES = [
  'vp', 'objectives', 'objectivesOccupied', 'objectivesThreatened', 'units', 'steps', 'dg', 'contact', 'within2',
  'meanEnemyDistance', 'outOfTrace', 'outOfTraceMarked', 'spOnMap', 'spFront', 'spStranded', 'hqs', 'dryHqs',
];

export const positionMetrics = (m, state) => {
  const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
  const isHq = (piece) => String(definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':hq');
  const isDump = (piece) => definitions.get(piece.definitionId)?.family === 'RESOURCE';
  const onMap = state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP');
  const combat = onMap.filter((piece) => m.isOnMapCombatUnit(state, piece));
  const control = new Map(state.mapState.hexControl.map(({ hexId, controllerId }) => [String(hexId), controllerId]));
  const result = {};
  for (const { id: playerId } of state.scenario.players) {
    const own = combat.filter((piece) => piece.ownerId === playerId);
    const enemy = combat.filter((piece) => piece.ownerId !== playerId);
    const nearest = (hexId) => Math.min(99, ...enemy.map((other) => m.hexDistanceBetween(other.location.hexId, hexId)));
    const held = state.configuration.objectives.filter(({ hexId }) => control.get(String(hexId)) === playerId);
    const front = new Set(own.filter((piece) => !isHq(piece) && nearest(piece.location.hexId) <= FRONT_HEXES).map((piece) => String(piece.location.hexId)));
    let spFront = 0; let spStranded = 0;
    for (const feed of m.ruleEngine.queryFeedCoverage(state, playerId, null).value ?? []) {
      if (String(feed.dumpId).includes('-stock-')) continue;
      if (feed.hexIds.some((hexId) => front.has(String(hexId)))) spFront += feed.tokens; else spStranded += feed.tokens;
    }
    const dumps = onMap.filter((piece) => piece.ownerId === playerId && isDump(piece) && !String(piece.id).includes('-stock-'));
    const trucks = onMap.filter((piece) => piece.ownerId === playerId && m.isTransportPoint(state, piece));
    const hqs = own.filter(isHq);
    const distances = own.map((piece) => nearest(piece.location.hexId));
    result[playerId] = {
      vp: held.reduce((total, { points }) => total + points, 0),
      objectives: held.length,
      objectivesOccupied: held.filter(({ hexId }) => own.some((piece) => String(piece.location.hexId) === String(hexId))).length,
      objectivesThreatened: held.filter(({ hexId }) => nearest(hexId) <= 1).length,
      units: own.length,
      steps: own.reduce((total, piece) => total + (piece.remainingSteps ?? 1), 0),
      dg: own.filter((piece) => piece.mode === 'DG').length,
      contact: distances.filter((distance) => distance <= 1).length,
      within2: distances.filter((distance) => distance <= 2).length,
      meanEnemyDistance: distances.length ? distances.reduce((total, distance) => total + Math.min(distance, 20), 0) / distances.length : null,
      outOfTrace: own.filter((piece) => !m.pieceHasTrace(state, piece)).length,
      outOfTraceMarked: own.filter((piece) => m.outOfTraceSince(piece) !== null).length,
      spOnMap: (dumps.reduce((total, piece) => total + (piece.resourceQuantity ?? 0), 0)
        + trucks.reduce((total, piece) => total + m.loadedTokens(state, piece), 0)) / 4,
      spFront: spFront / 4,
      spStranded: spStranded / 4,
      hqs: hqs.length,
      dryHqs: hqs.filter((hq) => m.dumpsReaching(state, playerId, hq.location.hexId, hq).length === 0).length,
    };
  }
  return result;
};

/** Steps lost, SP spent, regular attacks and barrages declared, per player, over history records (session.getHistory()). */
export const eventTotals = (history, ownerOf, players) => {
  const totals = Object.fromEntries(players.map((playerId) => [playerId, { stepsLost: 0, spSpent: 0, attacks: 0, barrages: 0 }]));
  for (const record of history) {
    const actor = totals[record.action.actorId];
    if (actor && record.action.kind === 'DECLARE_COMBAT' && record.action.combatKind === 'REGULAR') actor.attacks += 1;
    if (actor && record.action.kind === 'DECLARE_BARRAGE') actor.barrages += 1;
    for (const event of record.events) {
      if (event.kind === 'STEP_LOST') { const owner = totals[ownerOf(event.pieceId)]; if (owner) owner.stepsLost += 1; }
      const pieceId = event.kind === 'SUPPLY_SPENT' ? event.resourcePieceId : event.kind === 'RESOURCE_CONSUMED' ? event.reservation.resourcePieceId : null;
      const quantity = event.kind === 'SUPPLY_SPENT' ? event.quantity : event.kind === 'RESOURCE_CONSUMED' ? event.reservation.quantity : 0;
      if (pieceId !== null) { const owner = totals[ownerOf(pieceId)]; if (owner) owner.spSpent += quantity / 4; }
    }
  }
  return totals;
};

export const NEXT_TURN_METRIC_NAMES = [
  'objectivesAtRisk', 'objectiveVpAtRisk', 'objectivesInReach', 'objectiveVpInReach', 'stacksExposed', 'stepsExposed',
  'stacksExposedAllocated', 'stepsExposedAllocated', 'hqsInReach', 'dumpSpInReach', 'unitsWithReach', 'supplyBestCut', 'supplyCuttable',
];

/** Loads the rule modules nextTurnMetrics needs from a built engine directory (dist). */
export const loadEngine = async (distDirectory) => {
  const { pathToFileURL } = await import('node:url');
  const { join } = await import('node:path');
  const load = (file) => import(pathToFileURL(join(distDirectory, file)).href);
  const [m, strength, pieces, supply] = await Promise.all([load('index.js'), load('rules/combat/strength.js'), load('rules/pieces.js'), load('rules/supply/supply.js')]);
  return { m, strength, pieces, supply };
};

/**
 * What each side could do next turn from this position: the state projected to that side's Movement Segment with nothing
 * moved and every unit fueled, so the rules' movement range gives each combat unit's reach (terrain, ZOC); the opponent's
 * moves in between are ignored. A hex is attackable by the units that can reach a hex beside it, at the odds the rules give
 * all of them against the defenders (the defender picking terrain, every defender supplied). For each player, from the
 * opponent's reach:
 * - objectivesAtRisk / objectiveVpAtRisk: objectives the player holds that the opponent can attack at column 6+ or,
 *   with no combat unit of the player in them, enter;
 * - objectivesInReach / objectiveVpInReach: the same the other way: objectives the player does not hold that it can attack at
 *   column 6+ or enter;
 * - stacksExposed / stepsExposed: hexes of the player's combat units the opponent can attack at column 9+, and their steps;
 *   an upper bound, since every opponent unit counts toward every hex it can reach beside;
 * - stacksExposedAllocated / stepsExposedAllocated: the same with each opponent unit attacking one hex only, allocated
 *   greedily: the hex with the most steps the unallocated units can attack at column 9+, kept to the attackers needed
 *   there (the weakest printed strength dropped first while it stays at 9+), then the next;
 * - hqsInReach / dumpSpInReach: the player's HQs, and SP in its dumps (not garrison stocks), beside a hex the opponent reaches;
 * - unitsWithReach: the player's combat units with a non-empty reach (the others cannot move: immobile, or no MP);
 * - supplyBestCut / supplyCuttable: of the player's combat units in trace now, the most that one opponent unit ending its
 *   move in one hex cuts off (the rules' trace on the state with that unit moved there), and how many some such move cuts.
 *   A ballpark: the hexes tried are the opponent's reachable hexes at most one hex off a straight line from one of the
 *   player's sources or HQs to one of its traced units, those beside a source or HQ all, the others thinned so no two
 *   tried hexes are adjacent (one unit's ZOC covers its neighbours). Two opponent units closing a gap together are not
 *   counted. Computed only for the players in `supplyCutFor` (null for the others): about 0.4 s per player.
 */
export const nextTurnMetrics = ({ m, strength, pieces, supply }, state, { supplyCutFor = null } = {}) => {
  const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
  const isHq = (piece) => String(definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':hq');
  const isDump = (piece) => definitions.get(piece.definitionId)?.family === 'RESOURCE';
  const players = state.scenario.players.map(({ id }) => id);
  const control = new Map(state.mapState.hexControl.map(({ hexId, controllerId }) => [String(hexId), controllerId]));
  const combatOf = (playerId) => state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, piece));
  // Reach: hexes each combat unit of `playerId` can end its move in, on the projected state.
  const reachOf = (playerId) => {
    const own = combatOf(playerId);
    const projected = {
      ...state, activeTransaction: null, pendingDecision: null, currentMoverId: null,
      sequence: { ...state.sequence, phase: 'MOVEMENT', segment: 'MOVEMENT', phasingPlayerId: playerId, actingPlayerId: playerId },
      usage: own.map((piece) => ({ ...pieces.usageOf(state, piece), movementSpentTicks: 0, moved: false, fueled: true, negationLocked: false, phaseStartHexId: piece.location.hexId })),
      air: { ...state.air, builderIds: [] },
    };
    return new Map(own.map((piece) => [piece.id, new Set([String(piece.location.hexId),
      ...(m.ruleEngine.queryMovementRange(projected, playerId, piece.id).value ?? []).map((entry) => String(entry.hexId))])]));
  };
  const reaches = new Map(players.map((playerId) => [playerId, reachOf(playerId)]));
  const beside = (hexId, reach) => [...reach].some((hex) => m.hexDistanceBetween(hex, hexId) === 1);
  const potential = (attackerId, targetHexId) => {
    const defenders = state.pieceState.pieces.filter((piece) => piece.ownerId !== attackerId && piece.location.kind === 'ON_MAP'
      && String(piece.location.hexId) === targetHexId && m.isOnMapCombatUnit(state, piece));
    if (defenders.length === 0) return null;
    const attackers = [...reaches.get(attackerId)].filter(([, reach]) => beside(targetHexId, reach)).map(([id]) => id);
    if (attackers.length === 0) return -1;
    return strength.calculateCombatOdds(state, attackers, defenders.map((piece) => piece.id), targetHexId,
      defenders.map((piece) => piece.id), null, null).columnIndex;
  };
  const enters = (playerId, hexId) => [...reaches.get(playerId).values()].some((reach) => reach.has(hexId));
  const printed = (pieceId) => {
    const piece = state.pieceState.pieces.find(({ id }) => id === pieceId);
    return Math.max(0, ...(definitions.get(piece.definitionId)?.faces ?? []).flatMap((face) => face.steps.map((step) => step.combatStrength ?? 0)));
  };
  const allocatedExposure = (playerId, opponent) => {
    const besideOf = new Map([...reaches.get(opponent)].map(([pieceId, reach]) => [pieceId, new Set([...reach].flatMap((hexId) => m.adjacentHexIds(hexId).map(String)))]));
    const defendersAt = new Map();
    for (const piece of combatOf(playerId)) defendersAt.set(String(piece.location.hexId), [...(defendersAt.get(String(piece.location.hexId)) ?? []), piece]);
    const column = (attackers, hexId) => {
      const ids = defendersAt.get(hexId).map((piece) => piece.id);
      return strength.calculateCombatOdds(state, attackers, ids, hexId, ids, null, null).columnIndex;
    };
    const steps = (hexId) => defendersAt.get(hexId).reduce((total, piece) => total + (piece.remainingSteps ?? 1), 0);
    const free = new Set(besideOf.keys());
    const open = new Set(defendersAt.keys());
    let stacks = 0; let exposedSteps = 0;
    for (;;) {
      const attackable = [...open].map((hexId) => ({ hexId, attackers: [...free].filter((pieceId) => besideOf.get(pieceId).has(hexId)) }))
        .filter(({ hexId, attackers }) => attackers.length > 0 && column(attackers, hexId) >= 9)
        .sort((left, right) => steps(right.hexId) - steps(left.hexId) || left.attackers.length - right.attackers.length || left.hexId.localeCompare(right.hexId));
      if (attackable.length === 0) break;
      const { hexId, attackers } = attackable[0];
      let kept = [...attackers].sort((left, right) => printed(left) - printed(right) || String(left).localeCompare(String(right)));
      for (const candidate of [...kept]) {
        const trial = kept.filter((pieceId) => pieceId !== candidate);
        if (trial.length > 0 && column(trial, hexId) >= 9) kept = trial;
      }
      kept.forEach((pieceId) => free.delete(pieceId));
      open.delete(hexId);
      stacks += 1; exposedSteps += steps(hexId);
    }
    return { stacksExposedAllocated: stacks, stepsExposedAllocated: exposedSteps };
  };
  const supplyCut = (playerId, opponent) => {
    // Only an opponent unit moves, so the player's pieces are the same objects in every hypothetical state.
    const traced = (current) => new Set(combatOf(playerId).filter((piece) => m.pieceHasTrace(current, piece)).map((piece) => piece.id));
    const before = traced(state);
    const units = combatOf(playerId).filter((piece) => before.has(piece.id)).map((piece) => String(piece.location.hexId));
    const anchors = [...supply.friendlySourceHexes(state, playerId).map(String),
      ...combatOf(playerId).filter(isHq).map((piece) => String(piece.location.hexId))];
    const distance = (left, right) => m.hexDistanceBetween(left, right);
    const between = (hexId) => units.some((unit) => anchors.some((anchor) => distance(anchor, hexId) + distance(hexId, unit) <= distance(anchor, unit) + 1));
    const mover = new Map();
    for (const [pieceId, reach] of reaches.get(opponent)) {
      const start = String(state.pieceState.pieces.find((piece) => piece.id === pieceId).location.hexId);
      for (const hexId of reach) if (hexId !== start && !mover.has(hexId) && between(hexId)) mover.set(hexId, pieceId);
    }
    const tried = [...mover.keys()].filter((hexId) => anchors.some((anchor) => distance(anchor, hexId) <= 1));
    for (const hexId of [...mover.keys()].sort()) if (!tried.some((other) => distance(other, hexId) <= 1)) tried.push(hexId);
    const cut = new Set(); let best = 0;
    for (const hexId of tried) {
      const pieceId = mover.get(hexId);
      const moved = state.pieceState.pieces.map((piece) => (piece.id === pieceId ? { ...piece, location: { ...piece.location, hexId } } : piece));
      const after = traced({ ...state, pieceState: { ...state.pieceState, pieces: moved } });
      const lost = [...before].filter((id) => !after.has(id));
      lost.forEach((id) => cut.add(id));
      best = Math.max(best, lost.length);
    }
    return { supplyBestCut: best, supplyCuttable: cut.size };
  };
  const result = {};
  for (const playerId of players) {
    const opponent = players.find((id) => id !== playerId);
    const opponentReach = [...reaches.get(opponent).values()];
    const reachable = (hexId) => opponentReach.some((reach) => reach.has(hexId) || beside(hexId, reach));
    const takeable = (by, hexId) => { const column = potential(by, hexId); return column === null ? enters(by, hexId) : column >= 6; };
    const held = state.configuration.objectives.filter(({ hexId }) => control.get(String(hexId)) === playerId);
    const notHeld = state.configuration.objectives.filter(({ hexId }) => control.get(String(hexId)) !== playerId);
    const threatened = held.filter(({ hexId }) => takeable(opponent, String(hexId)));
    const open = notHeld.filter(({ hexId }) => takeable(playerId, String(hexId)));
    const own = combatOf(playerId);
    const stacks = [...new Set(own.map((piece) => String(piece.location.hexId)))];
    const exposed = stacks.filter((hexId) => (potential(opponent, hexId) ?? -1) >= 9);
    const dumps = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && isDump(piece) && !String(piece.id).includes('-stock-'));
    result[playerId] = {
      objectivesAtRisk: threatened.length, objectiveVpAtRisk: threatened.reduce((total, { points }) => total + points, 0),
      objectivesInReach: open.length, objectiveVpInReach: open.reduce((total, { points }) => total + points, 0),
      stacksExposed: exposed.length,
      stepsExposed: own.filter((piece) => exposed.includes(String(piece.location.hexId))).reduce((total, piece) => total + (piece.remainingSteps ?? 1), 0),
      ...allocatedExposure(playerId, opponent),
      hqsInReach: own.filter((piece) => isHq(piece) && reachable(String(piece.location.hexId))).length,
      dumpSpInReach: dumps.filter((piece) => reachable(String(piece.location.hexId))).reduce((total, piece) => total + (piece.resourceQuantity ?? 0), 0) / 4,
      unitsWithReach: [...reaches.get(playerId).values()].filter((reach) => reach.size > 1).length,
      ...((supplyCutFor ?? players).includes(playerId) ? supplyCut(playerId, opponent) : { supplyBestCut: null, supplyCuttable: null }),
    };
  }
  return result;
};
