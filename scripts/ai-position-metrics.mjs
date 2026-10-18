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
