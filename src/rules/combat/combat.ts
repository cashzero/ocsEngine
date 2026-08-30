import {
  HEX_DIRECTIONS,
  formatHexId,
  hexDistance,
  neighbor,
  parseDefinitionId,
  parseHexCoordinateId,
  stableSort,
  type HexId,
  type PieceId,
  type PlayerId,
} from '../../core/index.js';
import { createMapDefinitionIndex, setHexControl } from '../../domain/map/index.js';
import {
  createPieceDefinitionCatalogIndex,
  createPieceStateIndex,
  upsertPieceState,
  type PieceState,
} from '../../domain/piece/index.js';
import type {
  BarrageResultCode,
  CombatResultCode,
  GameAction,
  GameState,
  PendingDecision,
  RuleEvent,
  RuleTransaction,
  RuleViolation,
} from '../kernel/model.js';
import { parseRuleDecisionId } from '../kernel/ids.js';
import { rollTwoDice } from '../kernel/rng.js';
import type { RuleQueryResult } from '../query/model.js';
import { nextStackOrderAtHex, queryStacking } from '../stacking/stacking.js';
import { queryResourceSources } from '../supply/supply.js';
import { queryZoc } from '../zoc/zoc.js';
import { violation } from '../validation/violation.js';

const catalogFor = (state: GameState) => createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog);

const currentStep = (state: GameState, piece: PieceState) => {
  const definition = catalogFor(state).get(piece.definitionId);
  return definition?.faces.find(({ id }) => id === piece.currentFaceId)
    ?.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps);
};

const isOutOfSupply = (piece: PieceState): boolean => piece.statuses.some(({ statusDefinitionId, value }) =>
  statusDefinitionId === 'status:out-of-supply' && value.kind === 'FLAG' && value.value);

const priorModeStatusId = (() => {
  const parsed = parseDefinitionId('status:mode-before-involuntary');
  if (!parsed.ok) throw new Error('Prior-mode status ID is invalid.');
  return parsed.value;
})();

const withInvoluntaryMode = (piece: PieceState, mode: 'DG' | 'EXPLOITATION'): PieceState => ({
  ...piece,
  mode,
  statuses: [
    ...piece.statuses.filter(({ statusDefinitionId }) => statusDefinitionId !== priorModeStatusId),
    {
      statusDefinitionId: priorModeStatusId,
      value: piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === priorModeStatusId)?.value
        ?? { kind: 'TEXT', value: piece.mode === 'COMBAT' ? 'COMBAT' : 'MOVE' },
    },
  ],
});

const effectiveStrength = (
  state: GameState,
  piece: PieceState,
  supplied: boolean,
): number => {
  let strength = currentStep(state, piece)?.combatStrength ?? 0;
  if (piece.mode === 'DG') strength /= 2;
  if (isOutOfSupply(piece)) strength *= supplied ? 0.5 : 0.25;
  return strength;
};

const actionRating = (state: GameState, piece: PieceState): number =>
  currentStep(state, piece)?.actionRating ?? 0;

const onMapHex = (piece: PieceState): HexId | null =>
  piece.location.kind === 'ON_MAP' ? piece.location.hexId : null;

const adjacent = (left: HexId, right: HexId): boolean => {
  const a = parseHexCoordinateId(left);
  const b = parseHexCoordinateId(right);
  return a.ok && b.ok && hexDistance(a.value, b.value) === 1;
};

export interface CombatCalculation {
  readonly attackerStrength: number;
  readonly defenderStrength: number;
  readonly odds: number;
  readonly actionRatingModifier: number;
  readonly terrainDefinitionIds: readonly string[];
  readonly tableMinimumOdds: number;
}

export const queryCombat = (
  state: GameState,
  actorId: PlayerId,
  attackerIds: readonly PieceId[],
  defenderIds: readonly PieceId[],
  targetHexId: HexId,
  combatKind: 'REGULAR' | 'OVERRUN',
  supplied = true,
): RuleQueryResult<CombatCalculation> => {
  const attackers = attackerIds.flatMap((id) => {
    const piece = createPieceStateIndex(state.pieceState).get(id);
    return piece ? [piece] : [];
  });
  const defenders = defenderIds.flatMap((id) => {
    const piece = createPieceStateIndex(state.pieceState).get(id);
    return piece ? [piece] : [];
  });
  const reasons = [] as Array<{ code: string; allowed: boolean; message: string; rule: string }>;
  if (attackers.length !== attackerIds.length || attackers.length === 0) reasons.push({ code: 'INVALID_ATTACKERS', allowed: false, message: 'Attackers must exist.', rule: '9.1' });
  if (defenders.length !== defenderIds.length || defenders.length === 0) reasons.push({ code: 'INVALID_DEFENDERS', allowed: false, message: 'Defenders must exist.', rule: '9.1' });
  if (attackers.some((piece) => piece.ownerId !== actorId || onMapHex(piece) === null
    || !adjacent(onMapHex(piece)!, targetHexId))) reasons.push({ code: 'ATTACKER_NOT_ADJACENT', allowed: false, message: 'Every attacker must be owned, on-map, and adjacent.', rule: combatKind === 'OVERRUN' ? '8.1' : '9.1' });
  if (defenders.some((piece) => piece.ownerId === actorId || onMapHex(piece) !== targetHexId)) reasons.push({ code: 'INVALID_TARGET_HEX', allowed: false, message: 'Every defender must be enemy in target Hex.', rule: '9.1' });
  if (attackers.some((piece) => ['RESERVE', 'STRAT'].includes(piece.mode ?? '')
    || currentStep(state, piece)?.combatStrength === null
    || currentStep(state, piece)?.combatStrength === undefined)) reasons.push({ code: 'ATTACKER_NOT_CAPABLE', allowed: false, message: 'Attacker mode/ratings cannot attack.', rule: '4.4' });
  if (attackers.some((piece) => state.usage.some((usage) => usage.pieceId === piece.id && usage.attacked))) {
    reasons.push({ code: 'ATTACKER_ALREADY_USED', allowed: false, message: 'An attacker already attacked this Player Turn.', rule: '9.1' });
  }
  const attackerStrength = attackers.reduce((total, piece) => total + effectiveStrength(state, piece, supplied), 0);
  const defenderStrength = defenders.reduce((total, piece) => total + effectiveStrength(state, piece, supplied), 0);
  const odds = defenderStrength <= 0 ? Number.POSITIVE_INFINITY : attackerStrength / defenderStrength;
  const attackerAr = Math.max(0, ...attackers.map((piece) => actionRating(state, piece)));
  const defenderAr = Math.max(0, ...defenders.map((piece) => actionRating(state, piece)));
  const actionRatingModifier = Math.max(-2, Math.min(2, attackerAr - defenderAr));
  const band = stableSort(state.configuration.combatTable, (left, right) => right.minimumOdds - left.minimumOdds)
    .find(({ minimumOdds }) => odds >= minimumOdds) ?? state.configuration.combatTable[0]!;
  const terrainDefinitionIds = createMapDefinitionIndex(state.scenario.mapDefinition)
    .getHex(targetHexId)?.terrainDefinitionIds ?? [];
  const allowed = reasons.every(({ allowed }) => allowed);
  if (allowed) reasons.push({ code: 'COMBAT_DECLARATION_LEGAL', allowed: true, message: `${attackerStrength}:${defenderStrength}, odds ${odds}.`, rule: '9.1-9.8' });
  return {
    allowed,
    value: { attackerStrength, defenderStrength, odds, actionRatingModifier, terrainDefinitionIds, tableMinimumOdds: band.minimumOdds },
    reasons,
    facts: [
      { key: 'combat.attackerStrength', value: attackerStrength, visibility: 'PUBLIC', ownerId: null },
      { key: 'combat.defenderStrength', value: defenderStrength, visibility: 'PUBLIC', ownerId: null },
      { key: 'combat.odds', value: Number.isFinite(odds) ? odds : 999, visibility: 'PUBLIC', ownerId: null },
      { key: 'combat.actionRatingModifier', value: actionRatingModifier, visibility: 'PUBLIC', ownerId: null },
      { key: 'combat.terrain', value: terrainDefinitionIds.join(','), visibility: 'PUBLIC', ownerId: null },
    ],
    dependencies: [{ aggregate: 'GAME', revision: state.revision, key: `combat:${combatKind}:${targetHexId}` }],
  };
};

export interface BarrageCalculation {
  readonly strength: number;
  readonly maximumRange: number;
  readonly distance: number;
  readonly tableMinimumStrength: number;
  readonly supplyTokenCost: number;
}

export const queryBarrage = (
  state: GameState,
  actorId: PlayerId,
  firerIds: readonly PieceId[],
  targetPieceIds: readonly PieceId[],
  targetHexId: HexId,
): RuleQueryResult<BarrageCalculation> => {
  const firers = firerIds.flatMap((id) => {
    const piece = createPieceStateIndex(state.pieceState).get(id);
    return piece ? [piece] : [];
  });
  const targetCoordinate = parseHexCoordinateId(targetHexId);
  const distances = firers.map((piece) => {
    const source = onMapHex(piece);
    const parsed = source ? parseHexCoordinateId(source) : undefined;
    return parsed?.ok && targetCoordinate.ok ? hexDistance(parsed.value, targetCoordinate.value) : Number.POSITIVE_INFINITY;
  });
  const ranges = firers.map((piece) => currentStep(state, piece)?.range ?? 0);
  const reasons = [] as Array<{ code: string; allowed: boolean; message: string; rule: string }>;
  if (firers.length === 0 || firers.length !== firerIds.length) reasons.push({ code: 'INVALID_BARRAGE_FIRERS', allowed: false, message: 'Firers must exist.', rule: '10.1' });
  if (firers.some((piece) => piece.ownerId !== actorId
    || !catalogFor(state).get(piece.definitionId)?.capabilities.some(({ id }) => id === 'ARTILLERY'))) reasons.push({ code: 'FIRER_NOT_ARTILLERY', allowed: false, message: 'Every firer must have Artillery capability.', rule: '10.1a' });
  if (distances.some((distance, index) => distance > (ranges[index] ?? 0))) reasons.push({ code: 'BARRAGE_OUT_OF_RANGE', allowed: false, message: 'Target exceeds a firer range.', rule: '10.1a' });
  if (targetPieceIds.some((id) => {
    const target = createPieceStateIndex(state.pieceState).get(id);
    return !target || target.ownerId === actorId || onMapHex(target) !== targetHexId;
  })) reasons.push({ code: 'INVALID_BARRAGE_TARGET', allowed: false, message: 'Targets must be enemy Pieces in target Hex.', rule: '10.0d' });
  if (firers.some((piece) => state.usage.some((usage) => usage.pieceId === piece.id && usage.barraged))) reasons.push({ code: 'ARTILLERY_ALREADY_BARRAGED', allowed: false, message: 'A firer already barraged this turn.', rule: '10.0e' });
  const strength = firers.reduce((total, piece) => total + (currentStep(state, piece)?.combatStrength ?? 0), 0);
  const band = stableSort(state.configuration.barrageTable, (left, right) => right.minimumStrength - left.minimumStrength)
    .find(({ minimumStrength }) => strength >= minimumStrength) ?? state.configuration.barrageTable[0]!;
  const allowed = reasons.every(({ allowed }) => allowed);
  if (allowed) reasons.push({ code: 'BARRAGE_DECLARATION_LEGAL', allowed: true, message: `Barrage strength ${strength}.`, rule: '10.0-10.1' });
  return {
    allowed,
    value: {
      strength,
      maximumRange: Math.min(...ranges),
      distance: Math.max(...distances),
      tableMinimumStrength: band.minimumStrength,
      supplyTokenCost: band.supplyTokenCost,
    },
    reasons,
    facts: [{ key: 'barrage.strength', value: strength, visibility: 'PUBLIC', ownerId: null }],
    dependencies: [{ aggregate: 'GAME', revision: state.revision, key: `barrage:${targetHexId}` }],
  };
};

export const validateCombatOrBarrageDeclaration = (
  state: GameState,
  action: Extract<GameAction, { readonly kind: 'DECLARE_COMBAT' | 'DECLARE_BARRAGE' }>,
): readonly RuleViolation[] => {
  const query = action.kind === 'DECLARE_COMBAT'
    ? queryCombat(state, action.actorId, action.attackerIds, action.defenderIds, action.targetHexId, action.combatKind)
    : queryBarrage(state, action.actorId, action.firerIds, action.targetPieceIds, action.targetHexId);
  const issues = query.reasons.filter(({ allowed }) => !allowed)
    .map((reason) => violation(reason.code, ['participants'], reason.message, reason.rule));
  if (action.kind === 'DECLARE_BARRAGE' && query.value !== null && 'supplyTokenCost' in query.value
    && queryResourceSources(state, action.actorId, action.targetHexId, query.value.supplyTokenCost).length === 0) {
    issues.push(violation('BARRAGE_SUPPLY_UNAVAILABLE', ['firerIds'], 'Artillery barrage requires enough supply for its table band.', '10.1b'));
  }
  return issues;
};

const decision = (
  transaction: RuleTransaction,
  kind: PendingDecision['kind'],
  ownerId: PlayerId,
  options: PendingDecision['options'],
): PendingDecision => {
  const parsed = parseRuleDecisionId(`decision:${transaction.id}:${kind}`);
  if (!parsed.ok) throw new Error('Generated result decision ID is invalid.');
  return { id: parsed.value, kind, ownerId, transactionId: transaction.id, options };
};

const lossDecision = (state: GameState, transaction: RuleTransaction, attacker: boolean): PendingDecision => {
  const ids = (attacker ? transaction.attackerIds : transaction.defenderIds)
    .filter((id) => state.pieceState.pieces.find((piece) => piece.id === id)?.location.kind !== 'ELIMINATED');
  const first = state.pieceState.pieces.find(({ id }) => id === ids[0]);
  return decision(transaction, 'STEP_LOSS', first?.ownerId ?? transaction.ownerId,
    ids.map((id) => ({ id: `piece:${id}`, label: `Take one step from ${id}` })));
};

const retreatOptions = (state: GameState, transaction: RuleTransaction): PendingDecision['options'] => {
  const defender = state.pieceState.pieces.find(({ id }) => id === transaction.defenderIds[0]);
  const coordinate = parseHexCoordinateId(transaction.targetHexId);
  if (!defender || !coordinate.ok) return [];
  return HEX_DIRECTIONS.flatMap((direction) => {
    const hexId = formatHexId(neighbor(coordinate.value, direction));
    const exists = createMapDefinitionIndex(state.scenario.mapDefinition).getHex(hexId);
    const enemy = state.pieceState.pieces.some((piece) => piece.ownerId !== defender.ownerId
      && piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId);
    return exists && !enemy && queryZoc(state, defender.ownerId, hexId, 'RETREAT').allowed
      && queryStacking(state, hexId, defender.id).allowed
      ? [{ id: `hex:${hexId}`, label: `Retreat to ${hexId}` }]
      : [];
  });
};

const advanceDecision = (state: GameState, transaction: RuleTransaction): PendingDecision =>
  decision(transaction, 'ADVANCE_HEX', transaction.ownerId, [
    ...transaction.attackerIds.map((id) => ({ id: `piece:${id}`, label: `Advance ${id}` })),
    { id: 'SKIP', label: 'Do not advance' },
  ]);

const consumeReservations = (
  state: GameState,
  transaction: RuleTransaction,
): { pieceState: GameState['pieceState']; events: RuleEvent[] } => {
  let pieceState = state.pieceState;
  const events: RuleEvent[] = [];
  for (const reservation of transaction.reservations) {
    const resource = pieceState.pieces.find(({ id }) => id === reservation.resourcePieceId)!;
    pieceState = upsertPieceState(pieceState, {
      ...resource,
      resourceQuantity: (resource.resourceQuantity ?? 0) - reservation.quantity,
    });
    events.push({
      kind: 'RESOURCE_CONSUMED', sequence: events.length,
      transactionId: transaction.id, reservation,
    });
  }
  return { pieceState, events };
};

const usageAfterCommit = (state: GameState, transaction: RuleTransaction): GameState['usage'] => {
  const participantIds = transaction.attackerIds;
  const entries = [...state.usage];
  for (const pieceId of participantIds) {
    const current = entries.find((entry) => entry.pieceId === pieceId) ?? {
      pieceId, movementSpentTicks: 0, moved: false, fired: false,
      attacked: false, barraged: false, reserveReleased: false,
    };
    const replacement = transaction.kind === 'BARRAGE'
      ? { ...current, fired: true, barraged: true }
      : { ...current, attacked: true };
    const index = entries.findIndex((entry) => entry.pieceId === pieceId);
    if (index >= 0) entries[index] = replacement;
    else entries.push(replacement);
  }
  return stableSort(entries, (left, right) => String(left.pieceId).localeCompare(String(right.pieceId)));
};

export const validateTransactionCommit = (
  state: GameState,
  actorId: PlayerId,
  transactionId: string,
): readonly RuleViolation[] => {
  const transaction = state.activeTransaction;
  if (!transaction || transaction.id !== transactionId) return [violation('UNKNOWN_TRANSACTION', ['transactionId'], 'Transaction is not active.', 'engine')];
  const issues: RuleViolation[] = [];
  if (transaction.ownerId !== actorId) issues.push(violation('WRONG_TRANSACTION_OWNER', ['actorId'], 'Actor does not own transaction.', 'engine'));
  if (transaction.step !== 'READY' || state.pendingDecision !== null) issues.push(violation('TRANSACTION_NOT_READY', ['transactionId'], 'Transaction still requires a decision.', '9.2'));
  for (const reservation of transaction.reservations) {
    const resource = state.pieceState.pieces.find(({ id }) => id === reservation.resourcePieceId);
    if (!resource || (resource.resourceQuantity ?? 0) < reservation.quantity) issues.push(violation('STALE_RESOURCE_RESERVATION', ['transactionId'], 'Reserved resource is no longer available.', '12.4'));
  }
  return issues;
};

export const commitRuleTransaction = (
  state: GameState,
): { readonly state: GameState; readonly events: readonly RuleEvent[] } => {
  const transaction = state.activeTransaction!;
  const consumed = consumeReservations(state, transaction);
  const rolled = rollTwoDice(state.rng);
  const events: RuleEvent[] = [...consumed.events, {
    kind: 'DICE_ROLLED', sequence: consumed.events.length,
    transactionId: transaction.id, roll: rolled.roll,
  }];
  let result: CombatResultCode | BarrageResultCode;
  if (transaction.kind === 'BARRAGE') {
    const calculation = queryBarrage(state, transaction.ownerId, transaction.attackerIds, transaction.defenderIds, transaction.targetHexId).value!;
    const band = stableSort(state.configuration.barrageTable, (left, right) => right.minimumStrength - left.minimumStrength)
      .find(({ minimumStrength }) => calculation.strength >= minimumStrength)!;
    result = band.resultsByTwoDiceTotal[rolled.roll.total] ?? 'NO_EFFECT';
  } else {
    const calculation = queryCombat(state, transaction.ownerId, transaction.attackerIds, transaction.defenderIds, transaction.targetHexId, transaction.kind === 'OVERRUN' ? 'OVERRUN' : 'REGULAR', transaction.reservations.length > 0).value!;
    const band = stableSort(state.configuration.combatTable, (left, right) => right.minimumOdds - left.minimumOdds)
      .find(({ minimumOdds }) => calculation.odds >= minimumOdds) ?? state.configuration.combatTable[0]!;
    const adjustedTotal = Math.max(2, Math.min(12, rolled.roll.total + calculation.actionRatingModifier));
    result = band.resultsByTwoDiceTotal[adjustedTotal] ?? 'NO_EFFECT';
  }
  const committed = { ...transaction, roll: rolled.roll, result };
  let baseState: GameState = {
    ...state,
    pieceState: consumed.pieceState,
    rng: rolled.rng,
    usage: usageAfterCommit(state, transaction),
    activeTransaction: committed,
  };
  if (result === 'NO_EFFECT') {
    events.push({ kind: 'TRANSACTION_RESOLVED', sequence: events.length, transactionId: transaction.id, result });
    return { state: { ...baseState, activeTransaction: null, currentMoverId: null }, events };
  }
  if (result === 'DG') {
    let pieceState = baseState.pieceState;
    for (const id of transaction.defenderIds) {
      const piece = pieceState.pieces.find((candidate) => candidate.id === id)!;
      pieceState = upsertPieceState(pieceState, withInvoluntaryMode(piece, 'DG'));
    }
    events.push({ kind: 'TRANSACTION_RESOLVED', sequence: events.length, transactionId: transaction.id, result });
    return { state: { ...baseState, pieceState, activeTransaction: null, currentMoverId: null }, events };
  }
  let pending: PendingDecision;
  let step: RuleTransaction['step'];
  let resolutionTransaction = committed;
  if (result === 'ATTACKER_STEP_LOSS') {
    pending = lossDecision(baseState, committed, true);
    step = 'AWAITING_LOSS';
  } else if (result === 'DEFENDER_STEP_LOSS'
    || result === 'DEFENDER_STEP_LOSS_AND_RETREAT'
    || result === 'STEP_LOSS_AND_DG') {
    if (result === 'STEP_LOSS_AND_DG') {
      let pieceState = baseState.pieceState;
      for (const id of transaction.defenderIds) {
        const piece = pieceState.pieces.find((candidate) => candidate.id === id)!;
        pieceState = upsertPieceState(pieceState, withInvoluntaryMode(piece, 'DG'));
      }
      baseState = { ...baseState, pieceState };
    }
    pending = lossDecision(baseState, committed, false);
    step = 'AWAITING_LOSS';
  } else {
    const options = retreatOptions(baseState, committed);
    if (options.length === 0) {
      const forcedLoss = { ...committed, result: 'DEFENDER_STEP_LOSS' as const };
      resolutionTransaction = forcedLoss;
      pending = lossDecision(baseState, forcedLoss, false);
      step = 'AWAITING_LOSS';
    } else {
      pending = decision(committed, 'RETREAT_HEX',
        baseState.pieceState.pieces.find(({ id }) => id === committed.defenderIds[0])!.ownerId,
        options);
      step = 'AWAITING_RETREAT';
    }
  }
  const activeTransaction = { ...resolutionTransaction, step };
  events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: pending });
  return { state: { ...baseState, activeTransaction, pendingDecision: pending }, events };
};

const applyOneStepLoss = (
  state: GameState,
  pieceId: PieceId,
): { pieceState: GameState['pieceState']; remainingSteps: number | null } => {
  const piece = state.pieceState.pieces.find(({ id }) => id === pieceId)!;
  if ((piece.remainingSteps ?? 1) > 1) {
    const remainingSteps = piece.remainingSteps! - 1;
    return { pieceState: upsertPieceState(state.pieceState, { ...piece, remainingSteps }), remainingSteps };
  }
  return {
    pieceState: upsertPieceState(state.pieceState, { ...piece, location: { kind: 'ELIMINATED' } }),
    remainingSteps: null,
  };
};

export const resolveResultDecision = (
  state: GameState,
  choiceId: string,
): { readonly state: GameState; readonly events: readonly RuleEvent[] } => {
  const transaction = state.activeTransaction!;
  const pending = state.pendingDecision!;
  if (pending.kind === 'STEP_LOSS') {
    const pieceId = choiceId.slice('piece:'.length) as PieceId;
    const loss = applyOneStepLoss(state, pieceId);
    const events: RuleEvent[] = [{ kind: 'STEP_LOST', sequence: 0, pieceId, remainingSteps: loss.remainingSteps }];
    const afterLoss = { ...state, pieceState: loss.pieceState, pendingDecision: null };
    if (transaction.result === 'DEFENDER_STEP_LOSS_AND_RETREAT') {
      const options = retreatOptions(afterLoss, transaction);
      if (options.length === 0) {
        const survivors = transaction.defenderIds.filter((id) =>
          afterLoss.pieceState.pieces.find((piece) => piece.id === id)?.location.kind !== 'ELIMINATED');
        if (survivors.length === 0) {
          const next = advanceDecision(afterLoss, transaction);
          events.push({ kind: 'DECISION_REQUESTED', sequence: 1, decision: next });
          return { state: { ...afterLoss, activeTransaction: { ...transaction, step: 'AWAITING_ADVANCE' }, pendingDecision: next }, events };
        }
        const forcedLoss = { ...transaction, result: 'DEFENDER_STEP_LOSS' as const };
        const next = lossDecision(afterLoss, forcedLoss, false);
        events.push({ kind: 'DECISION_REQUESTED', sequence: 1, decision: next });
        return { state: { ...afterLoss, activeTransaction: { ...forcedLoss, step: 'AWAITING_LOSS' }, pendingDecision: next }, events };
      }
      const next = decision(transaction, 'RETREAT_HEX',
        afterLoss.pieceState.pieces.find(({ id }) => id === transaction.defenderIds[0])!.ownerId,
        options);
      events.push({ kind: 'DECISION_REQUESTED', sequence: 1, decision: next });
      return { state: { ...afterLoss, activeTransaction: { ...transaction, step: 'AWAITING_RETREAT' }, pendingDecision: next }, events };
    }
    if (transaction.kind !== 'BARRAGE' && transaction.result === 'DEFENDER_STEP_LOSS'
      && transaction.defenderIds.every((id) => afterLoss.pieceState.pieces.find((piece) => piece.id === id)?.location.kind === 'ELIMINATED')) {
      const next = advanceDecision(afterLoss, transaction);
      events.push({ kind: 'DECISION_REQUESTED', sequence: 1, decision: next });
      return { state: { ...afterLoss, activeTransaction: { ...transaction, step: 'AWAITING_ADVANCE' }, pendingDecision: next }, events };
    }
    events.push({ kind: 'TRANSACTION_RESOLVED', sequence: events.length, transactionId: transaction.id, result: transaction.result! });
    return { state: { ...afterLoss, activeTransaction: null, currentMoverId: null }, events };
  }
  if (pending.kind === 'RETREAT_HEX') {
    const toHexId = choiceId.slice('hex:'.length) as HexId;
    let pieceState = state.pieceState;
    const events: RuleEvent[] = [];
    for (const pieceId of transaction.defenderIds) {
      const piece = pieceState.pieces.find(({ id }) => id === pieceId)!;
      if (piece.location.kind === 'ELIMINATED') continue;
      pieceState = upsertPieceState(pieceState, {
        ...withInvoluntaryMode(piece, 'DG'),
        location: { kind: 'ON_MAP', hexId: toHexId },
        stackOrder: nextStackOrderAtHex(pieceState, toHexId, piece.id),
      });
      events.push({ kind: 'PIECE_RETREATED', sequence: events.length, pieceId, toHexId });
    }
    const afterRetreat = { ...state, pieceState, pendingDecision: null };
    const next = advanceDecision(afterRetreat, transaction);
    events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: next });
    return { state: { ...afterRetreat, activeTransaction: { ...transaction, step: 'AWAITING_ADVANCE' }, pendingDecision: next }, events };
  }
  if (pending.kind === 'ADVANCE_HEX') {
    const events: RuleEvent[] = [];
    let pieceState = state.pieceState;
    let mapState = state.mapState;
    if (choiceId !== 'SKIP') {
      const pieceId = choiceId.slice('piece:'.length) as PieceId;
      const piece = pieceState.pieces.find(({ id }) => id === pieceId)!;
      pieceState = upsertPieceState(pieceState, {
        ...piece,
        location: { kind: 'ON_MAP', hexId: transaction.targetHexId },
        stackOrder: nextStackOrderAtHex(pieceState, transaction.targetHexId, piece.id),
      });
      mapState = setHexControl(mapState, transaction.targetHexId, transaction.ownerId);
      events.push({ kind: 'PIECE_ADVANCED', sequence: 0, pieceId, toHexId: transaction.targetHexId });
    }
    events.push({ kind: 'TRANSACTION_RESOLVED', sequence: events.length, transactionId: transaction.id, result: transaction.result! });
    return { state: { ...state, pieceState, mapState, activeTransaction: null, pendingDecision: null, currentMoverId: null }, events };
  }
  throw new Error(`Unsupported result decision ${pending.kind}.`);
};
