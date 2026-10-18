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
  'meanEnemyDistance', 'outOfTrace', 'outOfTraceMarked', 'spOnMap', 'spFront', 'spStranded', 'surplusCombatSp',
  'bestObjectiveEffectiveColumn', 'localForceRatioAt2Hex', 'hqs', 'dryHqs', 'outOfTraceUnfed',
];

const TWO_DICE = Array.from({ length: 11 }, (_, index) => ({
  total: index + 2, p: (6 - Math.abs(index + 2 - 7)) / 36,
}));
const rationBudgetByModule = new WeakMap();

export const positionMetrics = (mOrEngine, state) => {
  const m = mOrEngine.m ?? mOrEngine;
  const rationBudget = mOrEngine.rationBudget ?? rationBudgetByModule.get(m) ?? null;
  const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
  const isHq = (piece) => String(definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':hq');
  const isDump = (piece) => definitions.get(piece.definitionId)?.family === 'RESOURCE';
  const unitStrength = (piece) => {
    const def = definitions.get(piece.definitionId);
    const face = def?.faces?.find((f) => f.id === piece.currentFaceId) ?? def?.faces?.[0];
    const step = face?.steps?.find((s) => s.remainingSteps === piece.remainingSteps) ?? face?.steps?.[0];
    return step?.combatStrength ?? (isHq(piece) ? (piece.currentFaceId === 'combat' ? 5 : 1) : 1);
  };
  const onMap = state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP');
  const combat = onMap.filter((piece) => m.isOnMapCombatUnit(state, piece));
  const control = new Map(state.mapState.hexControl.map(({ hexId, controllerId }) => [String(hexId), controllerId]));
  const result = {};
  for (const { id: playerId } of state.scenario.players) {
    const own = combat.filter((piece) => piece.ownerId === playerId);
    const enemy = combat.filter((piece) => piece.ownerId !== playerId);
    const nearest = (hexId) => Math.min(99, ...enemy.map((other) => m.hexDistanceBetween(other.location.hexId, hexId)));
    const held = state.configuration.objectives.filter(({ hexId }) => control.get(String(hexId)) === playerId);
    const notHeld = state.configuration.objectives.filter(({ hexId }) => control.get(String(hexId)) !== playerId);
    const front = new Set(own.filter((piece) => !isHq(piece) && nearest(piece.location.hexId) <= FRONT_HEXES).map((piece) => String(piece.location.hexId)));
    let spFront = 0; let spStranded = 0;
    const fedHexes = new Set();
    for (const feed of m.ruleEngine.queryFeedCoverage(state, playerId, null).value ?? []) {
      if (feed.tokens > 0) feed.hexIds.forEach((hexId) => fedHexes.add(String(hexId)));
      if (String(feed.dumpId).includes('-stock-')) continue;
      if (feed.hexIds.some((hexId) => front.has(String(hexId)))) spFront += feed.tokens; else spStranded += feed.tokens;
    }
    let surplusCombatSp = spFront / 4;
    if (rationBudget) {
      const recovered = rationBudget.afterRequiredRecovery(state, playerId);
      const plan = rationBudget.rationPlan(state, playerId);
      const committed = new Map((plan.groups ?? []).map((group) => [String(group.sourcePieceId), group.tokens]));
      let surplusTokens = 0;
      for (const feed of m.ruleEngine.queryFeedCoverage(recovered, playerId, null).value ?? []) {
        if (String(feed.dumpId).includes('-stock-')) continue;
        if (feed.hexIds.some((hexId) => front.has(String(hexId)))) {
          surplusTokens += Math.max(0, feed.tokens - (committed.get(String(feed.dumpId)) ?? 0));
        }
      }
      surplusCombatSp = surplusTokens / 4;
    }
    let bestObjectiveEffectiveColumn = -1;
    let bestFocalOwn2 = -1;
    let bestFocalPoints = -1;
    let localForceRatioAt2Hex = 0;
    const enemyHexSet = new Set(enemy.map((piece) => String(piece.location.hexId)));
    for (const objective of notHeld) {
      const objHex = String(objective.hexId);
      const nearOwn = own.filter((piece) => !isHq(piece) && piece.mode !== 'STRAT' && m.hexDistanceBetween(piece.location.hexId, objHex) <= 2);
      const nearOwnSupplied = nearOwn.filter((piece) => !piece.statuses?.some((s) => s.statusDefinitionId === 'status:out-of-supply'));
      const own2Strength = nearOwnSupplied.reduce((sum, piece) => sum + unitStrength(piece), 0);
      const enemy2Strength = enemy.filter((piece) => m.hexDistanceBetween(piece.location.hexId, objHex) <= 2)
        .reduce((sum, piece) => sum + unitStrength(piece), 0);
      if (own2Strength > bestFocalOwn2 || (own2Strength === bestFocalOwn2 && objective.points > bestFocalPoints)) {
        bestFocalOwn2 = own2Strength;
        bestFocalPoints = objective.points;
        localForceRatioAt2Hex = own2Strength > 0 ? Number((own2Strength / Math.max(1, enemy2Strength)).toFixed(3)) : 0;
      }
      if (nearOwn.length > 0) {
        const defenders = enemy.filter((piece) => String(piece.location.hexId) === objHex);
        if (defenders.length === 0) {
          bestObjectiveEffectiveColumn = Math.max(bestObjectiveEffectiveColumn, 12);
        } else {
          const adjHexes = m.adjacentHexIds(objHex).map(String).filter((hexId) => !enemyHexSet.has(hexId));
          if (adjHexes.length > 0) {
            const nearIds = new Set(nearOwn.map((piece) => piece.id));
            const projectedPieces = state.pieceState.pieces.map((piece) => {
              if (!nearIds.has(piece.id)) return piece;
              const curHex = String(piece.location.hexId);
              const targetAdj = m.hexDistanceBetween(curHex, objHex) === 1 ? curHex
                : [...adjHexes].sort((a, b) => m.hexDistanceBetween(curHex, a) - m.hexDistanceBetween(curHex, b))[0];
              return { ...piece, currentFaceId: 'combat', location: { ...piece.location, hexId: targetAdj } };
            });
            const projectedState = { ...state, pieceState: { ...state.pieceState, pieces: projectedPieces } };
            const odds = m.calculateCombatOdds(projectedState, nearOwn.map((p) => p.id), defenders.map((p) => p.id), objHex, defenders.map((p) => p.id), null, null);
            bestObjectiveEffectiveColumn = Math.max(bestObjectiveEffectiveColumn, odds.columnIndex);
          }
        }
      }
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
      outOfTraceUnfed: own.filter((piece) => !m.pieceHasTrace(state, piece) && !fedHexes.has(String(piece.location.hexId))).length,
      spOnMap: (dumps.reduce((total, piece) => total + (piece.resourceQuantity ?? 0), 0)
        + trucks.reduce((total, piece) => total + m.loadedTokens(state, piece), 0)) / 4,
      spFront: spFront / 4,
      spStranded: spStranded / 4,
      surplusCombatSp,
      bestObjectiveEffectiveColumn,
      localForceRatioAt2Hex,
      hqs: hqs.length,
      dryHqs: hqs.filter((hq) => m.dumpsReaching(state, playerId, hq.location.hexId, hq).length === 0).length,
    };
  }
  return result;
};

/** Steps lost (total, combat, attrition), SP spent, SP captured/destroyed, regular attacks and barrages declared, per player, over history records (session.getHistory()). */
export const eventTotals = (history, ownerOf, players) => {
  const totals = Object.fromEntries(players.map((playerId) => [playerId, {
    stepsLost: 0, combatStepsLost: 0, attritionStepsLost: 0, spSpent: 0, spCapturedOrDestroyed: 0, attacks: 0, barrages: 0,
  }]));
  let pendingAttrition = 0;
  for (const record of history) {
    const actor = totals[record.action.actorId];
    if (actor && record.action.kind === 'DECLARE_COMBAT' && record.action.combatKind === 'REGULAR') actor.attacks += 1;
    if (actor && record.action.kind === 'DECLARE_BARRAGE') actor.barrages += 1;
    for (const event of record.events) {
      if (event.kind === 'ATTRITION_ROLLED') pendingAttrition += event.steps;
      if (event.kind === 'STEP_LOST') {
        const owner = totals[ownerOf(event.pieceId)];
        const isAttrition = pendingAttrition > 0;
        if (isAttrition) pendingAttrition -= 1;
        if (owner) {
          owner.stepsLost += 1;
          if (isAttrition) owner.attritionStepsLost += 1; else owner.combatStepsLost += 1;
        }
      }
      const pieceId = event.kind === 'SUPPLY_SPENT' ? event.resourcePieceId : event.kind === 'RESOURCE_CONSUMED' ? event.reservation.resourcePieceId : null;
      const quantity = event.kind === 'SUPPLY_SPENT' ? event.quantity : event.kind === 'RESOURCE_CONSUMED' ? event.reservation.resourcePieceId : 0;
      if (pieceId !== null) { const owner = totals[ownerOf(pieceId)]; if (owner) owner.spSpent += (event.kind === 'SUPPLY_SPENT' ? event.quantity : event.reservation.quantity) / 4; }
      if (event.kind === 'SUPPLY_CAPTURED' && !String(event.resourcePieceId).includes('-stock-')) {
        const loser = players.find((id) => id !== record.action.actorId);
        if (loser && totals[loser]) totals[loser].spCapturedOrDestroyed += (event.captured + event.destroyed) / 4;
      }
      if (event.kind === 'DUMP_BLOWN' && !String(event.resourcePieceId).includes('-stock-')) {
        const owner = totals[ownerOf(event.resourcePieceId)];
        if (owner) owner.spCapturedOrDestroyed += event.destroyed / 4;
      }
    }
  }
  return totals;
};

export const NEXT_TURN_METRIC_NAMES = [
  'objectivesAtRisk', 'objectiveVpAtRisk', 'objectivesInReach', 'objectiveVpInReach',
  'payableObjectivesAtRisk', 'payableObjectiveVpAtRisk', 'payableObjectivesInReach', 'payableObjectiveVpInReach',
  'stacksExposed', 'stepsExposed', 'stacksExposedAllocated', 'stepsExposedAllocated', 'maxSingleStackExpectedLoss',
  'hqsInReach', 'dumpSpInReach', 'unitsWithReach', 'supplyBestCut', 'supplyCuttable',
  'expectedLossAllocated', 'objectiveReachColumn', 'hqDependentUnitsInReach', 'rearHexesInReach',
];

/** Loads the rule modules nextTurnMetrics needs from a built engine directory (dist). */
export const loadEngine = async (distDirectory) => {
  const { pathToFileURL } = await import('node:url');
  const { join } = await import('node:path');
  const load = (file) => import(pathToFileURL(join(distDirectory, file)).href);
  const [m, strength, pieces, supply, rationBudget] = await Promise.all([
    load('index.js'), load('rules/combat/strength.js'), load('rules/pieces.js'), load('rules/supply/supply.js'), load('rules/supply/ration-budget.js'),
  ]);
  rationBudgetByModule.set(m, rationBudget);
  return { m, strength, pieces, supply, rationBudget };
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
 * - payableObjectivesAtRisk / payableObjectiveVpAtRisk / payableObjectivesInReach / payableObjectiveVpInReach:
 *   subset of at-risk / in-reach objectives whose minimal column-6+ attacking group can be paid from internal stocks or
 *   surplus front combat SP (after mandatory recovery and ration commitments);
 * - stacksExposed / stepsExposed: hexes of the player's combat units the opponent can attack at column 9+, and their steps;
 *   an upper bound, since every opponent unit counts toward every hex it can reach beside;
 * - stacksExposedAllocated / stepsExposedAllocated: the same with each opponent unit attacking one hex only, allocated
 *   greedily: the hex with the most steps the unallocated units can attack at column 9+, kept to the attackers needed
 *   there (the weakest printed strength dropped first while it stays at 9+), then the next;
 * - maxSingleStackExpectedLoss: highest expected defender step loss from a single opponent attack on any of the player's stacks;
 * - hqsInReach / dumpSpInReach: the player's HQs, and SP in its dumps (not garrison stocks), beside a hex the opponent reaches;
 * - unitsWithReach: the player's combat units with a non-empty reach (the others cannot move: immobile, or no MP);
 * - expectedLossAllocated: the opponent's attack potential allocated to the player's stacks, each opponent unit attacking one
 *   hex only: repeatedly the stack with the highest expected step loss from the unallocated units able to reach beside it,
 *   kept to the attackers that leave that expected loss unchanged (weakest printed strength dropped first), summed; the
 *   expected loss is over 2d6 on the Combat Table, counting the option as loss on a held objective;
 * - objectiveReachColumn: the highest column the player can reach next turn on an objective it does not hold, with every
 *   unit able to reach a hex beside it (12 for one it can walk into, -1 for none);
 * - hqDependentUnitsInReach: the player's non-HQ combat units in trace whose every trace route is an HQ throw from an HQ
 *   the opponent can reach beside next turn;
 * - rearHexesInReach: hexes the opponent can reach next turn that are 2+ hexes from the player's combat units and inside
 *   the player's trace supply coverage;
 * - supplyBestCut / supplyCuttable: of the player's combat units in trace now, the most that one opponent unit ending its
 *   move in one hex cuts off (the rules' trace on the state with that unit moved there), and how many some such move cuts.
 *   A ballpark: the hexes tried are the opponent's reachable hexes at most one hex off a straight line from one of the
 *   player's sources or HQs to one of its traced units, those beside a source or HQ all, the others thinned so no two
 *   tried hexes are adjacent (one unit's ZOC covers its neighbours). Two opponent units closing a gap together are not
 *   counted. Computed only for the players in `supplyCutFor` (null for the others): about 0.4 s per player.
 */
export const nextTurnMetrics = ({ m, strength, pieces, supply, rationBudget }, state, { supplyCutFor = null } = {}) => {
  const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
  const isHq = (piece) => String(definitions.get(piece.definitionId)?.categoryDefinitionId).endsWith(':hq');
  const isDump = (piece) => definitions.get(piece.definitionId)?.family === 'RESOURCE';
  const players = state.scenario.players.map(({ id }) => id);
  const control = new Map(state.mapState.hexControl.map(({ hexId, controllerId }) => [String(hexId), controllerId]));
  const pieceById = new Map(state.pieceState.pieces.map((piece) => [piece.id, piece]));
  const combatOf = (playerId) => state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, piece));
  const surplusSpOf = (playerId) => {
    const own = combatOf(playerId);
    const enemy = combatOf(players.find((id) => id !== playerId));
    const nearest = (hexId) => Math.min(99, ...enemy.map((other) => m.hexDistanceBetween(other.location.hexId, hexId)));
    const front = new Set(own.filter((piece) => !isHq(piece) && nearest(piece.location.hexId) <= FRONT_HEXES).map((piece) => String(piece.location.hexId)));
    const rb = rationBudget ?? rationBudgetByModule.get(m);
    if (!rb) {
      let tokens = 0;
      for (const feed of m.ruleEngine.queryFeedCoverage(state, playerId, null).value ?? []) {
        if (!String(feed.dumpId).includes('-stock-') && feed.hexIds.some((hexId) => front.has(String(hexId)))) tokens += feed.tokens;
      }
      return tokens / 4;
    }
    const recovered = rb.afterRequiredRecovery(state, playerId);
    const plan = rb.rationPlan(state, playerId);
    const committed = new Map((plan.groups ?? []).map((group) => [String(group.sourcePieceId), group.tokens]));
    let surplusTokens = 0;
    for (const feed of m.ruleEngine.queryFeedCoverage(recovered, playerId, null).value ?? []) {
      if (String(feed.dumpId).includes('-stock-')) continue;
      if (feed.hexIds.some((hexId) => front.has(String(hexId)))) {
        surplusTokens += Math.max(0, feed.tokens - (committed.get(String(feed.dumpId)) ?? 0));
      }
    }
    return surplusTokens / 4;
  };
  const surplusByPlayer = new Map(players.map((playerId) => [playerId, surplusSpOf(playerId)]));
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
  const defendersAtHex = (attackerId, targetHexId) => state.pieceState.pieces.filter((piece) => piece.ownerId !== attackerId && piece.location.kind === 'ON_MAP'
    && String(piece.location.hexId) === targetHexId && m.isOnMapCombatUnit(state, piece));
  const oddsFor = (attackerIds, defenderIds, targetHexId) => strength.calculateCombatOdds(state, attackerIds, defenderIds, targetHexId, defenderIds, null, null);
  const potential = (attackerId, targetHexId) => {
    const defenders = defendersAtHex(attackerId, targetHexId);
    if (defenders.length === 0) return null;
    const attackers = [...reaches.get(attackerId)].filter(([, reach]) => beside(targetHexId, reach)).map(([id]) => id);
    if (attackers.length === 0) return -1;
    const defIds = defenders.map((piece) => piece.id);
    return oddsFor(attackers, defIds, targetHexId).columnIndex;
  };
  const enters = (playerId, hexId) => [...reaches.get(playerId).values()].some((reach) => reach.has(hexId));
  const printed = (pieceId) => {
    const piece = pieceById.get(pieceId);
    return Math.max(0, ...(definitions.get(piece.definitionId)?.faces ?? []).flatMap((face) => face.steps.map((step) => step.combatStrength ?? 0)));
  };
  const minimalAttackersForColumn = (attackerId, targetHexId, minColumn, excludedIds = new Set()) => {
    const defenders = defendersAtHex(attackerId, targetHexId);
    if (defenders.length === 0) return [];
    const defIds = defenders.map((piece) => piece.id);
    const avail = [...reaches.get(attackerId)]
      .filter(([id, reach]) => !excludedIds.has(id) && beside(targetHexId, reach))
      .map(([id]) => id)
      .sort((a, b) => ((pieceById.get(b)?.remainingSteps ?? 1) - (pieceById.get(a)?.remainingSteps ?? 1)) || String(a).localeCompare(String(b)));
    if (avail.length === 0 || oddsFor(avail, defIds, targetHexId).columnIndex < minColumn) return null;
    let chosen = [...avail];
    for (const candidateId of avail) {
      if (chosen.length <= 1) break;
      const without = chosen.filter((id) => id !== candidateId);
      if (oddsFor(without, defIds, targetHexId).columnIndex >= minColumn) chosen = without;
    }
    return chosen;
  };
  const countPayableObjectives = (by, objectiveList) => {
    let remainingSp = surplusByPlayer.get(by) ?? 0;
    const usedUnits = new Set();
    let count = 0; let vp = 0;
    const sorted = [...objectiveList].sort((a, b) => b.points - a.points || String(a.hexId).localeCompare(String(b.hexId)));
    for (const obj of sorted) {
      const hexId = String(obj.hexId);
      const defenders = defendersAtHex(by, hexId);
      if (defenders.length === 0) {
        if (enters(by, hexId)) { count += 1; vp += obj.points; }
        continue;
      }
      const chosen = minimalAttackersForColumn(by, hexId, 6, usedUnits);
      if (!chosen) continue;
      const dumpCostSp = chosen.reduce((sum, id) => {
        const unit = pieceById.get(id);
        if (!unit || m.internalStocksOf(unit) !== 'EXHAUSTED') return sum;
        return sum + (unit.remainingSteps ?? 1) * 0.25;
      }, 0);
      if (dumpCostSp <= remainingSp + 1e-9) {
        remainingSp -= dumpCostSp;
        for (const id of chosen) usedUnits.add(id);
        count += 1;
        vp += obj.points;
      }
    }
    return { count, vp };
  };
  const expectedLoss = (attackerIds, defenders, hexId, heldObjective) => {
    const defIds = defenders.map((piece) => piece.id);
    const odds = oddsFor(attackerIds, defIds, hexId);
    const stackSteps = defenders.reduce((sum, piece) => sum + (piece.remainingSteps ?? 1), 0);
    const netDrm = odds.drm - odds.hedgehogLevel;
    let expected = 0;
    for (const { total, p } of TWO_DICE) {
      const parsed = m.parseCombatResult(m.COMBAT_TABLE_ROWS[m.combatTableRowIndex(total + netDrm)][odds.columnIndex]);
      expected += p * Math.min(stackSteps, parsed.defender.loss + (heldObjective ? parsed.defender.option : 0));
    }
    return expected;
  };
  const allocatedExpectedLoss = (playerId, opponent) => {
    const besideOf = new Map([...reaches.get(opponent)].map(([pieceId, reach]) => [pieceId, new Set([...reach].flatMap((hexId) => m.adjacentHexIds(hexId).map(String)))]));
    const defendersAt = new Map();
    for (const piece of combatOf(playerId)) defendersAt.set(String(piece.location.hexId), [...(defendersAt.get(String(piece.location.hexId)) ?? []), piece]);
    const held = new Set(state.configuration.objectives.filter(({ hexId }) => control.get(String(hexId)) === playerId).map(({ hexId }) => String(hexId)));
    const free = new Set(besideOf.keys());
    const open = new Set(defendersAt.keys());
    let total = 0;
    for (;;) {
      const options = [...open].map((hexId) => {
        const attackers = [...free].filter((pieceId) => besideOf.get(pieceId).has(hexId));
        return { hexId, attackers, loss: attackers.length ? expectedLoss(attackers, defendersAt.get(hexId), hexId, held.has(hexId)) : 0 };
      }).filter(({ loss }) => loss > 1e-9).sort((left, right) => right.loss - left.loss || left.hexId.localeCompare(right.hexId));
      if (options.length === 0) break;
      const { hexId, attackers, loss } = options[0];
      let kept = [...attackers].sort((left, right) => printed(left) - printed(right) || String(left).localeCompare(String(right)));
      for (const candidate of [...kept]) {
        const trial = kept.filter((pieceId) => pieceId !== candidate);
        if (trial.length > 0 && expectedLoss(trial, defendersAt.get(hexId), hexId, held.has(hexId)) >= loss - 1e-9) kept = trial;
      }
      kept.forEach((pieceId) => free.delete(pieceId));
      open.delete(hexId);
      total += loss;
    }
    return Number(total.toFixed(3));
  };
  const objectiveReachColumn = (playerId) => {
    let best = -1;
    for (const { hexId } of state.configuration.objectives) {
      if (control.get(String(hexId)) === playerId) continue;
      const column = potential(playerId, String(hexId));
      best = Math.max(best, column === null ? (enters(playerId, String(hexId)) ? 12 : -1) : column);
    }
    return best;
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
    const payableRisk = countPayableObjectives(opponent, threatened);
    const payableOpen = countPayableObjectives(playerId, open);
    const own = combatOf(playerId);
    const stacks = [...new Set(own.map((piece) => String(piece.location.hexId)))];
    const exposed = stacks.filter((hexId) => (potential(opponent, hexId) ?? -1) >= 9);
    const heldHexSet = new Set(held.map(({ hexId }) => String(hexId)));
    let maxSingleStackExpectedLoss = 0;
    for (const hexId of stacks) {
      const defenders = defendersAtHex(opponent, hexId);
      const attackers = [...reaches.get(opponent)].filter(([, reach]) => beside(hexId, reach)).map(([id]) => id);
      if (defenders.length === 0 || attackers.length === 0) continue;
      maxSingleStackExpectedLoss = Math.max(maxSingleStackExpectedLoss, expectedLoss(attackers, defenders, hexId, heldHexSet.has(hexId)));
    }
    maxSingleStackExpectedLoss = Number(maxSingleStackExpectedLoss.toFixed(3));
    const dumps = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && isDump(piece) && !String(piece.id).includes('-stock-'));
    result[playerId] = {
      objectivesAtRisk: threatened.length, objectiveVpAtRisk: threatened.reduce((total, { points }) => total + points, 0),
      objectivesInReach: open.length, objectiveVpInReach: open.reduce((total, { points }) => total + points, 0),
      payableObjectivesAtRisk: payableRisk.count, payableObjectiveVpAtRisk: payableRisk.vp,
      payableObjectivesInReach: payableOpen.count, payableObjectiveVpInReach: payableOpen.vp,
      stacksExposed: exposed.length,
      stepsExposed: own.filter((piece) => exposed.includes(String(piece.location.hexId))).reduce((total, piece) => total + (piece.remainingSteps ?? 1), 0),
      ...allocatedExposure(playerId, opponent),
      maxSingleStackExpectedLoss,
      hqsInReach: own.filter((piece) => isHq(piece) && reachable(String(piece.location.hexId))).length,
      dumpSpInReach: dumps.filter((piece) => reachable(String(piece.location.hexId))).reduce((total, piece) => total + (piece.resourceQuantity ?? 0), 0) / 4,
      unitsWithReach: [...reaches.get(playerId).values()].filter((reach) => reach.size > 1).length,
      ...((supplyCutFor ?? players).includes(playerId) ? supplyCut(playerId, opponent) : { supplyBestCut: null, supplyCuttable: null }),
      expectedLossAllocated: allocatedExpectedLoss(playerId, opponent),
      objectiveReachColumn: objectiveReachColumn(playerId),
      hqDependentUnitsInReach: own.filter((piece) => !isHq(piece) && m.pieceHasTrace(state, piece)).filter((piece) => {
        const routes = supply.traceRoutesFor(state, piece);
        return routes.length > 0 && routes.every((route) => {
          if (!route.startsWith('HQ:')) return false;
          const hq = pieceById.get(route.slice(3));
          return hq?.location.kind === 'ON_MAP' && reachable(String(hq.location.hexId));
        });
      }).length,
      rearHexesInReach: [...new Set(opponentReach.flatMap((reach) => [...reach]))].filter((hexId) =>
        own.every((piece) => m.hexDistanceBetween(piece.location.hexId, hexId) >= 2) && supply.traceSupplyAvailableAt(state, playerId, hexId)).length,
    };
  }
  return result;
};
