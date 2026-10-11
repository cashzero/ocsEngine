import { portAt } from '../port/state.js';
import { defendingHedgehogLevel, hedgehogAt, hedgehogLevel, HEDGEHOG_BARRAGE_SHIFT, HEDGEHOG_BRACKETED_LEVEL, HEDGEHOG_SURPRISE_DRM } from '../hedgehog/hedgehog.js';
import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { setHexControl } from '../../domain/map/index.js';
import { upsertPieceState, type PieceState } from '../../domain/piece/index.js';
import { parseRuleDecisionId, parseRuleTransactionId } from '../kernel/ids.js';
import type {
  AttackerSupplyChoice,
  CombatSide,
  GameAction,
  GameState,
  InternalStocksLevel,
  PaymentConsumer,
  PendingDecision,
  ResolutionStep,
  ResourceReservation,
  RuleEvent,
  RuleTransaction,
  RuleViolation,
} from '../kernel/model.js';
import { rollDie, rollTwoDice } from '../kernel/rng.js';
import { applyCreateBreakdown, mayCreateBreakdown, pieceNameOf } from '../breakdown/breakdown.js';
import { settleInterrupts, applyInterruptChoice } from '../lifecycle/interrupts.js';
import {
  adjacentHexIds,
  barrageStrengthOf,
  definitionOf,
  enemyCombatUnitsAt,
  faceMode,
  formationOf,
  friendlyCombatUnitsAt,
  hexDistanceBetween,
  hexOf,
  internalStocksOf,
  isAdjacent,
  isArtillery,
  isAttackCapable,
  isCombatUnit,
  isEligibleMover,
  isMultiUnitFormation,
  isTransportPoint,
  mobilityOf,
  movementAllowanceTicks,
  needsFuel,
  opponentOf,
  pieceById,
  piecesAt,
  printedSteps,
  reTicksOf,
  stepOf,
  usageOf,
  withInternalStocks,
  withInvoluntaryMode,
  withUsage,
} from '../pieces.js';
import { commitFuelForMove, isFueled } from '../supply/fuel.js';
import {
  allocateSupply,
  dumpsReachingAll,
  routesFromDump,
  spendReservations,
  type DumpAccess,
} from '../supply/supply.js';
import { captureAt } from '../supply/transport.js';
import {
  BARRAGE_TABLE_COLUMNS,
  BARRAGE_TABLE_ROWS,
  COMBAT_SUPPLY,
  COMBAT_TABLE_ROWS,
  SURPRISE_THRESHOLDS,
  barrageColumnIndex,
  barrageDensityShift,
  combatTableRowIndex,
  parseBarrageResult,
  parseCombatResult,
  roundOcs,
} from '../tables/ocs-4.3.js';
import { hexCombatTerrains, movementCostModel } from '../terrain.js';
import { playerCostModel } from '../movement/bridging.js';
import { violation } from '../validation/violation.js';
import { inEnemyZoc } from '../zoc/zoc.js';
import {
  attackingHexes,
  calculateCombatOdds,
  combatActionRating,
  defenseTerrainChoices,
  type CombatOdds,
} from './strength.js';

export { calculateCombatOdds } from './strength.js';

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };

export const unitName = (state: GameState, piece: PieceState | undefined): string =>
  piece ? pieceNameOf(piece) ?? definitionOf(state, piece)?.name ?? 'Unit' : 'Unit';

const BREAKDOWN_RETREAT_PREFIX = 'breakdown:';
const BREAKDOWN_ADVANCE_PREFIX = 'advance-breakdown:';

/** 20.0a: detach a Breakdown as a unit begins to retreat or advance; returns the state and the new Breakdown's ID. */
const detachInCombat = (state: GameState, parentId: PieceId, events: RuleEvent[]): { readonly state: GameState; readonly breakdownId: PieceId } => {
  const created = applyCreateBreakdown(state, parentId);
  events.push(...created.events.map((event) => ({ ...event, sequence: events.length })));
  const event = created.events.find((entry) => entry.kind === 'BREAKDOWN_CREATED');
  return { state: created.state, breakdownId: (event?.kind === 'BREAKDOWN_CREATED' ? event.breakdownId : parentId) };
};

const stepsOf = (piece: PieceState): number => piece.remainingSteps ?? 0;

const decisionId = (value: string) => {
  const parsed = parseRuleDecisionId(value);
  if (!parsed.ok) throw new Error(`Generated decision ID ${value} is invalid.`);
  return parsed.value;
};

const transactionIdFor = (actionId: string) => {
  const parsed = parseRuleTransactionId(`transaction:${actionId}`);
  if (!parsed.ok) throw new Error('Generated transaction ID is invalid.');
  return parsed.value;
};

const renumber = (events: readonly RuleEvent[]): RuleEvent[] => events.map((event, index) => ({ ...event, sequence: index }));

// ─── Declaration ───────────────────────────────────────────────────────────────────────────────

/** Can `piece` enter `targetHexId` from its Hex under the movement rules (9.1f, 8.1b/c)? */
const canEnterForCombat = (state: GameState, piece: PieceState, targetHexId: HexId, overrun: boolean): RuleViolation | null => {
  const origin = hexOf(piece);
  const mobility = mobilityOf(state, piece);
  if (!origin || !mobility) return violation('ATTACKER_CANNOT_MOVE', ['attackerIds'], 'Attackers must be able to move.', '9.1f');
  // 13.8b: Bridging can enable an attack, but never an overrun across a river (8.1c).
  const model = overrun ? movementCostModel(state, mobility, false) : playerCostModel(state, piece.ownerId, mobility);
  const step = model.evaluate(origin, targetHexId);
  if (step.kind !== 'COST') {
    return violation('ATTACK_INTO_PROHIBITED_TERRAIN', ['attackerIds'], overrun
      ? 'Overruns cannot use roads to enter otherwise prohibited terrain.' : 'Units cannot attack a Hex they could not enter.', overrun ? '8.1c' : '9.1f');
  }
  if (overrun && (step.all || step.cost.totalTicks > 12)) {
    return violation('OVERRUN_TERRAIN_TOO_COSTLY', ['attackerIds'], 'Overruns require a Hex costing 3 MP or less to enter, ignoring roads.', '8.1b');
  }
  return null;
};

const attackerNeed = (piece: PieceState): number => stepsOf(piece) * COMBAT_SUPPLY.attackerTokensPerStep;

const reserveInto = (state: GameState, reservations: readonly ResourceReservation[]): GameState => ({
  ...state,
  pieceState: reservations.reduce((pieceState, reservation) => {
    const dump = pieceState.pieces.find(({ id }) => id === reservation.resourcePieceId)!;
    return upsertPieceState(pieceState, { ...dump, resourceQuantity: (dump.resourceQuantity ?? 0) - reservation.quantity });
  }, state.pieceState),
});

const mergePayments = (payments: readonly ResourceReservation[]): readonly ResourceReservation[] => {
  const merged = new Map<string, ResourceReservation>();
  for (const payment of payments) {
    const existing = merged.get(String(payment.resourcePieceId));
    merged.set(String(payment.resourcePieceId), existing ? { ...existing, quantity: existing.quantity + payment.quantity } : payment);
  }
  return stableSort([...merged.values()], (left, right) => String(left.resourcePieceId).localeCompare(String(right.resourcePieceId)));
};

/** An attacker's combat supply settled in declaration order: what it draws, or that it uses its internal stocks. */
export interface DeclaredAttackerSupply {
  readonly payments: readonly ResourceReservation[];
  readonly internalIds: readonly PieceId[];
  readonly violations: readonly RuleViolation[];
}

const tokensIn = (dumps: readonly DumpAccess[]): number => dumps.reduce((total, dump) => total + dump.availableQuantity, 0);

/** Pay one attacker's declared choice from `state`, whose dumps already carry the attackers declared before it. */
const settleAttackerChoice = (
  state: GameState,
  actorId: PlayerId,
  choice: AttackerSupplyChoice,
  index: number,
): { readonly payments: readonly ResourceReservation[]; readonly internal: boolean; readonly violation: RuleViolation | null } => {
  const path = ['attackerSupply', index];
  const piece = pieceById(state, choice.pieceId)!;
  const need = attackerNeed(piece);
  const dumps = dumpsReachingAll(state, actorId, [piece]);
  if (choice.method === 'INTERNAL') {
    if (internalStocksOf(piece) === 'EXHAUSTED') {
      return { payments: [], internal: false, violation: violation('INTERNAL_STOCKS_EXHAUSTED', path, `${unitName(state, piece)} has Exhausted internal stocks; it attacks only with SP from a dump.`, '12.10c') };
    }
    if (tokensIn(dumps) >= need) {
      return { payments: [], internal: false, violation: violation('ON_MAP_SUPPLY_AVAILABLE', path, `${unitName(state, piece)} can draw its ${need}T from dumps in reach, so it cannot use internal stocks.`, '12.10a') };
    }
    // 12.10h: SP in reach that cannot cover a multi-step unit is still spent.
    const waste = printedSteps(state, piece) > 1 ? dumps.map((dump) => reservation(state, dump.pieceId, dump.availableQuantity)) : [];
    return { payments: waste, internal: true, violation: null };
  }
  const reaching = new Map(dumps.map((dump) => [dump.pieceId, dump]));
  if (choice.dumpIds.length === 0 || new Set(choice.dumpIds).size !== choice.dumpIds.length || choice.dumpIds.some((id) => !reaching.has(id))) {
    return { payments: [], internal: false, violation: violation('INVALID_ATTACKER_SUPPLY_SOURCE', path, `${unitName(state, piece)} must draw from dumps that reach it and still hold SP.`, '12.3') };
  }
  const payments: ResourceReservation[] = [];
  let left = need;
  for (const id of choice.dumpIds) {
    if (left <= 0) break;
    const quantity = Math.min(left, reaching.get(id)!.availableQuantity);
    payments.push(reservation(state, id, quantity));
    left -= quantity;
  }
  return left > 0
    ? { payments: [], internal: false, violation: violation('ATTACKER_SUPPLY_SHORT', path, `Those dumps hold less than the ${need}T ${unitName(state, piece)} needs.`, '12.4') }
    : { payments, internal: false, violation: null };
};

/** 9.5, 12.4, 12.10: settle every attacker's declared supply in order; each sees the dumps the earlier ones left. */
export const settleDeclaredAttackerSupply = (
  state: GameState,
  actorId: PlayerId,
  attackerIds: readonly PieceId[],
  choices: readonly AttackerSupplyChoice[],
): DeclaredAttackerSupply => {
  const ids = choices.map(({ pieceId }) => String(pieceId));
  if (ids.length !== attackerIds.length || new Set(ids).size !== ids.length || attackerIds.some((id) => !ids.includes(String(id)))) {
    return { payments: [], internalIds: [], violations: [violation('ATTACKER_SUPPLY_MISMATCH', ['attackerSupply'], 'Declare one combat supply source for each attacking unit.', '9.5')] };
  }
  let working = state;
  const payments: ResourceReservation[] = [];
  const internalIds: PieceId[] = [];
  const violations: RuleViolation[] = [];
  for (const [index, choice] of choices.entries()) {
    const settled = settleAttackerChoice(working, actorId, choice, index);
    if (settled.violation) { violations.push(settled.violation); continue; }
    if (settled.internal) internalIds.push(choice.pieceId);
    payments.push(...settled.payments);
    working = reserveInto(working, settled.payments);
  }
  return { payments: mergePayments(payments), internalIds, violations };
};

/** A combat supply source one attacker could declare. */
export interface AttackerSupplyOption {
  readonly id: string;
  readonly choice: AttackerSupplyChoice;
  readonly label: string;
  /** Dump hexes it draws from (or whose SP 12.10h wastes). */
  readonly hexIds: readonly HexId[];
  /** Tokens spent without supplying the unit (12.10h). */
  readonly wastedTokens: number;
}

export interface AttackerSupplyOptions {
  readonly pieceId: PieceId;
  readonly need: number;
  /** Tokens in reach after the attackers declared before it. */
  readonly reachable: number;
  readonly options: readonly AttackerSupplyOption[];
  /** Why it cannot join the attack when there is no option. */
  readonly reason: string | null;
}

/**
 * The sources one attacker may declare after `prior` (12.10a): each hex of dumps in reach that covers it alone, the
 * dumps in reach together when only together they do, and its internal stocks only when they do not.
 */
export const attackerSupplyOptions = (
  state: GameState,
  actorId: PlayerId,
  prior: readonly AttackerSupplyChoice[],
  pieceId: PieceId,
): AttackerSupplyOptions | null => {
  const piece = pieceById(state, pieceId);
  if (!piece || piece.ownerId !== actorId || hexOf(piece) === null) return null;
  let working = state;
  for (const [index, choice] of prior.entries()) {
    if (choice.pieceId === pieceId || !pieceById(state, choice.pieceId)) continue;
    const settled = settleAttackerChoice(working, actorId, choice, index);
    if (!settled.violation) working = reserveInto(working, settled.payments);
  }
  const need = attackerNeed(piece);
  const dumps = dumpsReachingAll(working, actorId, [piece]);
  const reachable = tokensIn(dumps);
  // Dumps in one hex are one source to the player (as on the map): draw from the largest first.
  const byHex = new Map<HexId, DumpAccess[]>();
  for (const dump of dumps) byHex.set(dump.hexId, [...(byHex.get(dump.hexId) ?? []), dump]);
  const options: AttackerSupplyOption[] = [...byHex].filter(([, here]) => tokensIn(here) >= need).map(([hexId, here]) => ({
    id: `hex:${hexId}`, choice: { pieceId, method: 'DUMPS', dumpIds: here.map((dump) => dump.pieceId) },
    label: `${need}T from the dump at ${hexId} (${tokensIn(here)}T there)`, hexIds: [hexId], wastedTokens: 0,
  }));
  if (options.length === 0 && reachable >= need) {
    options.push({
      id: `dumps:${dumps.map((dump) => dump.pieceId).join('+')}`, choice: { pieceId, method: 'DUMPS', dumpIds: dumps.map((dump) => dump.pieceId) },
      label: `${need}T from the dumps at ${dumps.map((dump) => dump.hexId).join(', ')}`, hexIds: dumps.map((dump) => dump.hexId), wastedTokens: 0,
    });
  }
  const level = internalStocksOf(piece);
  if (reachable < need && level !== 'EXHAUSTED') {
    const wasted = printedSteps(state, piece) > 1 ? reachable : 0;
    options.push({
      id: 'internal', choice: { pieceId, method: 'INTERNAL' },
      label: `Internal stocks (marked ${level === 'LOW' ? 'Exhausted' : 'Low'})${wasted > 0 ? `; the ${wasted}T in reach is spent anyway` : ''}`,
      hexIds: wasted > 0 ? dumps.map((dump) => dump.hexId) : [], wastedTokens: wasted,
    });
  }
  const reason = options.length > 0 ? null
    : `Needs ${need}T but ${reachable > 0 ? `only ${reachable}T is` : 'no SP is'} in reach${prior.length > 0 ? ' after the units above' : ''}, and its internal stocks are Exhausted (12.10c).`;
  return { pieceId, need, reachable, options, reason };
};

/**
 * A legal declaration for these attackers when nobody chooses (AI candidates, tests): Exhausted units declare first, so the SP
 * in reach goes to those that cannot attack without it (12.10c), and each unit takes its first option. Null when some unit has none.
 */
export const defaultAttackerSupply = (state: GameState, actorId: PlayerId, attackerIds: readonly PieceId[]): readonly AttackerSupplyChoice[] | null => {
  const attackers = attackerIds.flatMap((id) => pieceById(state, id) ?? []);
  if (attackers.length !== attackerIds.length) return null;
  const ordered = stableSort(attackers, (left, right) =>
    Number(internalStocksOf(right) === 'EXHAUSTED') - Number(internalStocksOf(left) === 'EXHAUSTED'));
  const choices: AttackerSupplyChoice[] = [];
  for (const piece of ordered) {
    const option = attackerSupplyOptions(state, actorId, choices, piece.id)?.options[0];
    if (!option) return null;
    choices.push(option.choice);
  }
  return choices;
};

export const defenderSupplyTokens = (state: GameState, defenders: readonly PieceState[]): number =>
  defenders.reduce((total, piece) => total + reTicksOf(state, piece), 0) <= COMBAT_SUPPLY.smallDefenderMaximumReTicks
    ? COMBAT_SUPPLY.smallDefenderTokens : COMBAT_SUPPLY.defenderTokens;

type CombatDeclaration = Extract<GameAction, { readonly kind: 'DECLARE_COMBAT' }>;

const combatPhaseAllows = (state: GameState, action: CombatDeclaration): RuleViolation | null => {
  const { phase, segment } = state.sequence;
  if (action.combatKind === 'REGULAR') {
    const ok = segment === 'COMBAT' && (phase === 'COMBAT' || phase === 'EXPLOITATION')
      && action.actorId === state.sequence.phasingPlayerId;
    return ok ? null : violation('INVALID_COMBAT_PHASE', ['sequence'], 'Regular combat happens in the phasing player\'s Combat Segments.', '9.0');
  }
  const ok = segment === 'MOVEMENT' && ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(phase);
  return ok ? null : violation('INVALID_OVERRUN_PHASE', ['sequence'], 'Overruns happen in Movement Segments.', '8.0');
};

export const validateCombatDeclaration = (state: GameState, action: CombatDeclaration): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const overrun = action.combatKind === 'OVERRUN';
  if (action.actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Actor does not own the current sequence step.', '9.1a'));
  const phase = combatPhaseAllows(state, action);
  if (phase) issues.push(phase);
  if (action.attackerIds.length === 0 || new Set(action.attackerIds).size !== action.attackerIds.length) {
    issues.push(violation('INVALID_ATTACKERS', ['attackerIds'], 'Attackers must be a non-empty unique list.', '9.1'));
    return issues;
  }
  const attackers = action.attackerIds.map((id) => pieceById(state, id));
  if (attackers.some((piece) => !piece)) return [...issues, violation('UNKNOWN_ATTACKER', ['attackerIds'], 'Unknown attacker.', '9.1')];
  const pieces = attackers as PieceState[];
  const enemyInHex = enemyCombatUnitsAt(state, action.actorId, action.targetHexId);
  if (enemyInHex.length === 0) issues.push(violation('NO_ENEMY_COMBAT_UNITS', ['targetHexId'], 'Only Hexes with enemy combat units can be attacked.', '9.0'));
  const expected = new Set(enemyInHex.map(({ id }) => String(id)));
  if (action.defenderIds.length !== expected.size || action.defenderIds.some((id) => !expected.has(String(id)))) {
    issues.push(violation('WHOLE_HEX_MUST_DEFEND', ['defenderIds'], 'Every combat unit in the Hex defends together.', '9.1d'));
  }
  if (!action.attackerIds.includes(action.leadAttackerId)) {
    issues.push(violation('LEAD_ATTACKER_NOT_PARTICIPATING', ['leadAttackerId'], 'The Action Rating unit must take part in the attack.', '9.6'));
  }
  for (const [index, piece] of pieces.entries()) {
    const path = ['attackerIds', index];
    const hexId = hexOf(piece);
    if (piece.ownerId !== action.actorId) issues.push(violation('NOT_PIECE_OWNER', path, 'Attackers must be friendly.', '9.1a'));
    if (!hexId || !isAdjacent(hexId, action.targetHexId)) issues.push(violation('ATTACKER_NOT_ADJACENT', path, 'Attackers must be adjacent to the defending Hex.', '9.0'));
    if (!isAttackCapable(state, piece)) issues.push(violation('ATTACKER_NOT_CAPABLE', path, `${unitName(state, piece)} is not Attack-Capable (parenthesized, Strat, or unreleased Reserve).`, '4.4'));
    const usage = usageOf(state, piece);
    if (!overrun && usage.attacked) issues.push(violation('ATTACKER_ALREADY_USED', path, 'A unit may attack only once per Combat Segment.', '9.1c'));
    if (state.sequence.phase === 'EXPLOITATION' && !(piece.mode === 'EXPLOITATION' || usage.reserveReleased)) {
      issues.push(violation('EXPLOITATION_REQUIRES_EXPLOIT_OR_RESERVE', path, 'Only Exploit Mode units and released Reserves fight in the Exploitation Phase.', '11.0a'));
    }
    if (hexId) {
      const entry = canEnterForCombat(state, piece, action.targetHexId, overrun);
      if (entry) issues.push({ ...entry, path });
    }
    if (overrun) {
      if (piece.mode === 'DG') issues.push(violation('DG_CANNOT_OVERRUN', path, 'DG units cannot overrun.', '5.10b'));
      if (!['COMBAT', 'MOVE', 'EXPLOITATION'].includes(piece.mode ?? '')) issues.push(violation('OVERRUN_MODE', path, 'Overrunning units must be in Combat, Move, or Exploitation Mode.', '8.1'));
      if (!isEligibleMover(state, piece)) issues.push(violation('OVERRUN_REQUIRES_ELIGIBLE_MOVER', path, 'Only units that may move this phase can overrun.', state.sequence.phase === 'REACTION' ? '7.0a' : '11.0a'));
      if (usage.moved && state.currentMoverId !== piece.id) issues.push(violation('MOVEMENT_ALREADY_FINISHED', path, 'This unit finished moving.', '6.1g'));
      if (usage.negationLocked) issues.push(violation('NEGATING_UNIT_LOCKED', path, 'This unit is negating an enemy ZOC.', '4.5b'));
      if (movementAllowanceTicks(state, piece) - usage.movementSpentTicks < 12) issues.push(violation('OVERRUN_NEEDS_3_MP', path, 'Units with fewer than 3 MP remaining cannot overrun.', '8.1a'));
      // 12.5b: overruns require fuel even from a standing start.
      if (needsFuel(state, piece) && !isFueled(state, piece)) issues.push(violation('FUEL_REQUIRED', path, 'Overrunning Truck and Track units must be fueled.', '12.5b'));
    }
  }
  if (!overrun && state.ledger.attackedHexIds.includes(action.targetHexId)) {
    issues.push(violation('HEX_ALREADY_ATTACKED', ['targetHexId'], 'A Hex can be attacked only once per Combat Segment.', '9.1c'));
  }
  if (overrun && issues.length === 0) {
    const hexes = attackingHexes(state, action.attackerIds);
    const starts = new Set(pieces.map((piece) => String(usageOf(state, piece).phaseStartHexId ?? hexOf(piece))));
    if (hexes.length !== 1 || starts.size !== 1) issues.push(violation('OVERRUN_STACK_MUST_START_TOGETHER', ['attackerIds'], 'Only units that started the phase stacked together can overrun together.', '8.1'));
    const stackTicks = [...friendlyCombatUnitsAt(state, action.actorId, hexes[0]!)].reduce((total, piece) => total + reTicksOf(state, piece), 0);
    if (stackTicks > state.configuration.stackingLimitReTicks) issues.push(violation('OVERRUN_OVERSTACKED', ['attackerIds'], 'Overrunning units and friendly units in their Hex cannot exceed 10 RE.', '4.8a'));
  }
  if (issues.length === 0) {
    issues.push(...settleDeclaredAttackerSupply(state, action.actorId, action.attackerIds, action.attackerSupply).violations);
  }
  return issues;
};

/** Preview of a declaration for the UI and explanations; the defender's supply choice is shown both ways. */
export interface CombatPreview {
  readonly supplied: CombatOdds;
  readonly unsupplied: CombatOdds;
  readonly attackerSupplyTokens: number;
  /** Attackers that would have to use internal stocks because on-map SP is short (12.10a). */
  readonly attackerInternalCount: number;
  readonly defenderSupplyTokens: number;
  readonly defenderCanPay: boolean;
}

export const previewCombat = (
  state: GameState,
  actorId: PlayerId,
  attackerIds: readonly PieceId[],
  targetHexId: HexId,
  leadAttackerId: PieceId,
  attackerSupply: readonly AttackerSupplyChoice[],
): CombatPreview => {
  const defenders = enemyCombatUnitsAt(state, actorId, targetHexId);
  const attackers = attackerIds.flatMap((id) => pieceById(state, id) ?? []);
  const tokens = defenderSupplyTokens(state, defenders);
  const defenderOwner = defenders[0]?.ownerId ?? opponentOf(state, actorId);
  const internal = settleDeclaredAttackerSupply(state, actorId, attackerIds, attackerSupply).internalIds.length;
  const defenderIds = defenders.map(({ id }) => id);
  return {
    supplied: calculateCombatOdds(state, attackerIds, defenderIds, targetHexId, defenderIds, leadAttackerId, null),
    unsupplied: calculateCombatOdds(state, attackerIds, defenderIds, targetHexId, [], leadAttackerId, null),
    attackerSupplyTokens: attackers.reduce((total, piece) => total + attackerNeed(piece), 0),
    attackerInternalCount: internal,
    defenderSupplyTokens: tokens,
    defenderCanPay: allocateSupply(state, defenderOwner, defenders, tokens) !== null
      || defenders.some((piece) => internalStocksOf(piece) !== 'EXHAUSTED'),
  };
};

const emptyTransaction = (
  state: GameState,
  actionId: string,
  kind: RuleTransaction['kind'],
  ownerId: PlayerId,
): Omit<RuleTransaction, 'attackerIds' | 'defenderIds' | 'targetHexId' | 'leadAttackerId' | 'step' | 'payment'> => ({
  id: transactionIdFor(actionId),
  kind,
  ownerId,
  defenderOwnerId: opponentOf(state, ownerId),
  originRevision: state.revision,
  leadDefenderId: null,
  attackerPayments: [],
  defenderPayments: [],
  attackerInternalIds: [],
  defenderSupplied: false,
  defenderInternalIds: [],
  defenderTerrainId: null,
  surpriseRoll: null,
  shiftDie: null,
  roll: null,
  result: null,
  queue: [],
  lossLedger: [],
  attackerRetreated: false,
  blockedHexIds: [],
  air: null,
});

export const declareCombat = (state: GameState, action: CombatDeclaration): Transition => {
  const attackers = action.attackerIds.map((id) => pieceById(state, id)!);
  const overrun = action.combatKind === 'OVERRUN';
  // 9.5: the attackers' supply was declared with the attack and is paid with it.
  const declared = settleDeclaredAttackerSupply(state, action.actorId, action.attackerIds, action.attackerSupply);
  const transaction: RuleTransaction = {
    ...emptyTransaction(state, action.actionId, overrun ? 'OVERRUN' : 'COMBAT', action.actorId),
    step: 'ATTACKER_SUPPLY',
    attackerIds: [...action.attackerIds],
    defenderIds: [...action.defenderIds],
    targetHexId: action.targetHexId,
    leadAttackerId: action.leadAttackerId,
    attackerPayments: declared.payments,
    attackerInternalIds: declared.internalIds,
    payment: { side: 'ATTACKER', queue: [], paid: 0 },
    blockedHexIds: [...new Set(state.pieceState.pieces
      .filter((piece) => piece.ownerId === action.actorId && isCombatUnit(state, piece) && hexOf(piece) !== null)
      .map((piece) => hexOf(piece)!))],
  };
  let next: GameState = {
    ...state,
    activeTransaction: transaction,
    currentMoverId: overrun ? action.leadAttackerId : state.currentMoverId,
    ledger: overrun ? state.ledger : { ...state.ledger, attackedHexIds: [...state.ledger.attackedHexIds, action.targetHexId] },
  };
  for (const piece of attackers) {
    next = { ...next, usage: withUsage(next, { ...usageOf(next, piece), attacked: true }) };
    if (overrun) next = commitFuelForMove(next, pieceById(next, piece.id)!);
  }
  const events: RuleEvent[] = [{ kind: 'TRANSACTION_DECLARED', sequence: 0, transactionId: transaction.id, transactionKind: transaction.kind }];
  const settled = continueSetup(next);
  return { state: settled.state, events: renumber([...events, ...settled.events]) };
};

// ─── Supply payments (9.2 step 2, 12.4, 12.10, 10.1b) ─────────────────────────────────────────

const consumerPieces = (state: GameState, consumer: PaymentConsumer): readonly PieceState[] =>
  consumer.pieceIds.flatMap((id) => pieceById(state, id) ?? []);

const reservedDumpIds = (transaction: RuleTransaction): readonly PieceId[] =>
  transaction.attackerPayments.map(({ resourcePieceId }) => resourcePieceId);

/** 10.1bA: a barrage is paid through one HQ, or from one dump if no HQ is used. */
const barrageRouteKeys = (state: GameState, dump: PieceState, firers: readonly PieceState[]): ReadonlySet<string> => {
  const sets = firers.map((piece) => new Set(routesFromDump(state, dump, piece).map((route) => route.method === 'DRAW' ? 'DRAW' : `HQ:${route.hqId}`)));
  return new Set([...(sets[0] ?? [])].filter((key) => sets.every((set) => set.has(key))));
};

const payableDumps = (state: GameState): readonly DumpAccess[] => {
  const transaction = state.activeTransaction!;
  const payment = transaction.payment!;
  const owner = payment.side === 'ATTACKER' ? transaction.ownerId : transaction.defenderOwnerId;
  const consumer = payment.queue[0]!;
  const pieces = consumerPieces(state, consumer);
  const dumps = dumpsReachingAll(state, owner, pieces);
  if (transaction.kind !== 'BARRAGE') return dumps;
  const reserved = reservedDumpIds(transaction);
  if (reserved.length === 0) return dumps.filter((dump) => barrageRouteKeys(state, pieceById(state, dump.pieceId)!, pieces).size > 0);
  const shared = reserved.map((id) => barrageRouteKeys(state, pieceById(state, id)!, pieces));
  return dumps.filter((dump) => reserved.includes(dump.pieceId) || [...barrageRouteKeys(state, pieceById(state, dump.pieceId)!, pieces)]
    .some((key) => key.startsWith('HQ:') && shared.every((set) => set.has(key))));
};

const withReservation = (state: GameState, side: CombatSide, reservation: ResourceReservation): GameState => {
  const transaction = state.activeTransaction!;
  const key = side === 'ATTACKER' ? 'attackerPayments' : 'defenderPayments';
  return { ...state, activeTransaction: { ...transaction, [key]: mergePayments([...transaction[key], reservation]) } };
};

const reservation = (state: GameState, dumpId: PieceId, quantity: number): ResourceReservation => ({
  resourcePieceId: dumpId,
  quantity,
  unitDefinitionId: definitionOf(state, pieceById(state, dumpId)!)!.resource!.unitDefinitionId,
});

/**
 * After a part payment only dumps can pay the rest (internal stocks are offered before anything is paid), and a
 * barrage narrows the dumps to those sharing the paid dump's route (10.1b). Offer a part payment only when the
 * dumps still payable afterwards cover the rest, so a choice never leads to a payment with no legal option.
 */
const partialPaymentCompletes = (state: GameState, dumpId: PieceId, tokens: number, remaining: number): boolean => {
  const transaction = state.activeTransaction!;
  const payment = transaction.payment!;
  const reserved = withReservation(state, payment.side, reservation(state, dumpId, tokens));
  const after: GameState = { ...reserved, activeTransaction: { ...reserved.activeTransaction!, payment: { ...payment, paid: payment.paid + tokens } } };
  return payableDumps(after).reduce((total, dump) => total + dump.availableQuantity, 0) >= remaining - tokens;
};

const paymentOptions = (state: GameState): PendingDecision['options'] => {
  const transaction = state.activeTransaction!;
  const payment = transaction.payment!;
  const consumer = payment.queue[0]!;
  const pieces = consumerPieces(state, consumer);
  const remaining = consumer.tokens - payment.paid;
  const dumps = payableDumps(state);
  const available = dumps.reduce((total, dump) => total + dump.availableQuantity, 0);
  const options: PendingDecision['options'][number][] = [];
  if (available >= remaining) {
    for (const dump of dumps) {
      const take = Math.min(remaining, dump.availableQuantity);
      const candidates = take > 1 && dumps.length > 1 ? [take, 1] : [take];
      for (const tokens of candidates) {
        if (tokens < remaining && !partialPaymentCompletes(state, dump.pieceId, tokens, remaining)) continue;
        options.push({ id: `pay:${dump.pieceId}:${tokens}`, label: `Pay ${tokens}T from the dump at ${dump.hexId} (${dump.availableQuantity}T available)`, hexId: dump.hexId });
      }
    }
  }
  // Attackers declare their supply with the attack (9.5); after it only the defender and a barrage pay here.
  if (transaction.kind !== 'BARRAGE' && payment.paid === 0) {
    const waste = available > 0 && available < remaining ? ` (the ${available}T in reach is spent anyway)` : '';
    if (payment.side === 'DEFENDER' && available < remaining && pieces.some((piece) => internalStocksOf(piece) !== 'EXHAUSTED')) {
      options.push({ id: 'internal', label: `Defenders use internal stocks (each is marked)${waste}`, hexId: null });
    }
  }
  if (payment.side === 'DEFENDER') options.push({ id: 'withhold', label: 'No combat supply: defend at half strength', hexId: null });
  return options;
};

const popConsumer = (state: GameState, patch: Partial<RuleTransaction> = {}): GameState => {
  const transaction = state.activeTransaction!;
  const payment = transaction.payment!;
  const [, ...queue] = payment.queue;
  return { ...state, activeTransaction: { ...transaction, ...patch, payment: { ...payment, queue, paid: 0 } } };
};

const applyPaymentChoice = (state: GameState, choiceId: string): GameState => {
  const transaction = state.activeTransaction!;
  const payment = transaction.payment!;
  const consumer = payment.queue[0]!;
  const pieces = consumerPieces(state, consumer);
  if (choiceId === 'withhold') return popConsumer(state, { defenderPayments: [], defenderSupplied: false });
  if (choiceId === 'internal') {
    // 12.10h: SP in reach that cannot cover a multi-step unit is still spent.
    const dumps = payableDumps(state);
    const available = dumps.reduce((total, dump) => total + dump.availableQuantity, 0);
    let next = state;
    const remaining = consumer.tokens - payment.paid;
    // Only the defender is offered internal stocks here (attackers declare theirs, 9.5).
    if (available > 0 && available < remaining) {
      for (const dump of dumps) next = withReservation(next, payment.side, reservation(next, dump.pieceId, dump.availableQuantity));
    }
    return popConsumer(next, { defenderInternalIds: pieces.filter((piece) => internalStocksOf(piece) !== 'EXHAUSTED').map(({ id }) => id) });
  }
  // `pay:<dump id>:<tokens>`; dump IDs themselves contain colons.
  const body = choiceId.slice('pay:'.length);
  const dumpId = body.slice(0, body.lastIndexOf(':')) as PieceId;
  const quantityText = body.slice(body.lastIndexOf(':') + 1);
  const next = withReservation(state, payment.side, reservation(state, dumpId, Number(quantityText)));
  const paid = payment.paid + Number(quantityText);
  if (paid < consumer.tokens) return { ...next, activeTransaction: { ...next.activeTransaction!, payment: { ...payment, paid } } };
  return popConsumer(next, payment.side === 'DEFENDER' ? { defenderSupplied: true } : {});
};

const setupDecision = (state: GameState, kind: PendingDecision['kind'], ownerId: PlayerId, prompt: string, options: PendingDecision['options']): PendingDecision => ({
  id: decisionId(`decision:${state.activeTransaction!.id}:${kind}:${state.revision}:${state.activeTransaction!.payment?.queue.length ?? 0}:${state.activeTransaction!.payment?.paid ?? 0}`),
  kind, ownerId, transactionId: state.activeTransaction!.id, prompt, options,
});

/**
 * Run the declaration steps of 9.2 (and 10.1b for barrages) until a player must choose, then roll.
 * Choices with a single legal option are made automatically.
 */
const continueSetup = (input: GameState): Transition => {
  let state = input;
  const events: RuleEvent[] = [];
  for (let guard = 0; guard < 200; guard += 1) {
    const transaction = state.activeTransaction!;
    const payment = transaction.payment;
    if (transaction.step === 'ATTACKER_SUPPLY' || transaction.step === 'DEFENDER_SUPPLY' || transaction.step === 'BARRAGE_SUPPLY') {
      if (payment && payment.queue.length > 0) {
        const options = paymentOptions(state);
        if (options.length === 1) { state = applyPaymentChoice(state, options[0]!.id); continue; }
        if (options.length === 0) throw new Error('Combat supply payment has no legal option.');
        const consumer = payment.queue[0]!;
        const side = transaction.step === 'DEFENDER_SUPPLY' ? 'DEFENDER' : 'ATTACKER';
        const owner = side === 'DEFENDER' ? transaction.defenderOwnerId : transaction.ownerId;
        const subject = transaction.kind === 'BARRAGE' ? `Barrage on ${transaction.targetHexId}`
          : side === 'DEFENDER' ? `Defending ${transaction.targetHexId}` : unitName(state, pieceById(state, consumer.pieceIds[0]!));
        const prompt = `${subject}: ${consumer.tokens - payment.paid}T of combat supply still to pay. Choose where it comes from.`;
        const pending = setupDecision(state, 'SUPPLY_SOURCE', owner, prompt, options);
        events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: pending });
        return { state: { ...state, pendingDecision: pending }, events };
      }
      if (transaction.step === 'BARRAGE_SUPPLY') {
        const rolled = rollBarrage({ ...state, activeTransaction: { ...transaction, step: 'RESOLVING', payment: null } });
        return { state: rolled.state, events: [...events, ...rolled.events] };
      }
      if (transaction.step === 'ATTACKER_SUPPLY') {
        const defenders = transaction.defenderIds.flatMap((id) => pieceById(state, id) ?? []);
        state = { ...state, activeTransaction: { ...transaction, step: 'DEFENDER_SUPPLY', payment: { side: 'DEFENDER', queue: [{ pieceIds: transaction.defenderIds, tokens: defenderSupplyTokens(state, defenders) }], paid: 0 } } };
        continue;
      }
      state = { ...state, activeTransaction: { ...transaction, step: 'DEFENDER_LEAD', payment: null } };
      continue;
    }
    if (transaction.step === 'DEFENDER_LEAD') {
      const defenders = transaction.defenderIds.flatMap((id) => pieceById(state, id) ?? []);
      // 9.6: show the DRM each choice produces, so the defender sees the consequence before choosing.
      const drmWith = (piece: PieceState): number => calculateCombatOdds(state, transaction.attackerIds, transaction.defenderIds, transaction.targetHexId,
        suppliedDefenderIds(transaction), transaction.leadAttackerId, piece.id).drm;
      const signed = (value: number): string => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');
      const options = defenders.map((piece) => ({ id: `lead:${piece.id}`, label: `${unitName(state, piece)} (AR ${combatActionRating(state, piece)}): combat DRM ${signed(drmWith(piece))}`, hexId: null }));
      if (options.length === 1) { state = { ...state, activeTransaction: { ...transaction, leadDefenderId: defenders[0]!.id, step: 'DEFENDER_TERRAIN' } }; continue; }
      const lead = pieceById(state, transaction.leadAttackerId!);
      const pending = setupDecision(state, 'DEFENDER_LEAD', transaction.defenderOwnerId,
        `The attacker's Action Rating unit is ${unitName(state, lead)} (AR ${combatActionRating(state, lead)}). Choose the unit whose Action Rating leads the defense; it takes the first step lost.`, options);
      events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: pending });
      return { state: { ...state, pendingDecision: pending }, events };
    }
    if (transaction.step === 'DEFENDER_TERRAIN') {
      const choices = terrainChoices(state);
      if (choices.length <= 1) {
        state = { ...state, activeTransaction: { ...transaction, defenderTerrainId: choices[0]?.id.slice('terrain:'.length) ?? null, step: 'RESOLVING' } };
        const rolled = rollCombat(state);
        return { state: rolled.state, events: [...events, ...rolled.events] };
      }
      const pending = setupDecision(state, 'DEFENDER_TERRAIN', transaction.defenderOwnerId,
        `Choose the terrain in ${transaction.targetHexId} that modifies your defense and sets the Combat Table line.`, choices);
      events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: pending });
      return { state: { ...state, pendingDecision: pending }, events };
    }
    throw new Error(`Combat setup cannot continue from ${transaction.step}.`);
  }
  throw new Error('Combat setup did not settle.');
};

const suppliedDefenderIds = (transaction: RuleTransaction): readonly PieceId[] =>
  transaction.defenderSupplied ? transaction.defenderIds : transaction.defenderInternalIds;

const terrainLabel = (terrainId: string): string => terrainId.split(':').at(-1)!.replace(/-/gu, ' ');

const terrainChoices = (state: GameState): PendingDecision['options'] => {
  const transaction = state.activeTransaction!;
  return defenseTerrainChoices(state, transaction.attackerIds, transaction.defenderIds, transaction.targetHexId,
    suppliedDefenderIds(transaction), transaction.leadAttackerId, transaction.leadDefenderId)
    .map(({ terrainId, odds }) => ({
      id: `terrain:${terrainId}`,
      label: `${terrainLabel(terrainId)}: ${odds.line.replace('_', ' ').toLowerCase()} line, ${odds.attackerStrength.toFixed(1).replace(/\.0$/u, '')} vs ${odds.defenderStrength.toFixed(1).replace(/\.0$/u, '')}, ${odds.oddsText}`,
      hexId: null,
    }));
};

const markInternalStocks = (state: GameState, ids: readonly PieceId[], events: RuleEvent[]): GameState => {
  let pieceState = state.pieceState;
  for (const id of ids) {
    const piece = pieceState.pieces.find((candidate) => candidate.id === id);
    if (!piece) continue;
    // 12.10b: Low, or Exhausted if already Low.
    const level: InternalStocksLevel = internalStocksOf(piece) === 'FULL' ? 'LOW' : 'EXHAUSTED';
    pieceState = upsertPieceState(pieceState, withInternalStocks(piece, level));
    events.push({ kind: 'INTERNAL_STOCKS_CHANGED', sequence: events.length, pieceId: id, level });
  }
  return { ...state, pieceState };
};

const consume = (state: GameState, payments: readonly ResourceReservation[], transactionId: RuleTransaction['id'], events: RuleEvent[]): GameState => {
  for (const reservationEntry of payments) events.push({ kind: 'RESOURCE_CONSUMED', sequence: events.length, transactionId, reservation: reservationEntry });
  return { ...state, pieceState: spendReservations(state, payments) };
};

const rollCombat = (state: GameState): Transition => {
  const transaction = state.activeTransaction!;
  const events: RuleEvent[] = [];
  let next = consume(state, [...transaction.attackerPayments, ...transaction.defenderPayments], transaction.id, events);
  next = markInternalStocks(next, [...transaction.attackerInternalIds, ...transaction.defenderInternalIds], events);
  const odds = calculateCombatOdds(state, transaction.attackerIds, transaction.defenderIds, transaction.targetHexId,
    suppliedDefenderIds(transaction), transaction.leadAttackerId, transaction.leadDefenderId, transaction.defenderTerrainId);
  const overrun = transaction.kind === 'OVERRUN';
  // 8.1a: each overrun costs the moving units 3 MP.
  if (overrun) {
    for (const id of transaction.attackerIds) {
      const piece = pieceById(next, id)!;
      const usage = usageOf(next, piece);
      next = { ...next, usage: withUsage(next, { ...usage, moved: true, movementSpentTicks: usage.movementSpentTicks + 12 }) };
    }
  }
  // 9.8 Surprise: 2d6 + AR DRM (-1 with a defending hedgehog, 16.0d); on Surprise one die gives the number of column shifts.
  const surprise = rollTwoDice(next.rng);
  next = { ...next, rng: surprise.rng };
  events.push({ kind: 'DICE_ROLLED', sequence: events.length, transactionId: transaction.id, purpose: 'SURPRISE', roll: surprise.roll });
  const threshold = SURPRISE_THRESHOLDS[overrun ? 'OVERRUN' : 'REGULAR'];
  const surpriseTotal = surprise.roll.total + odds.drm + (odds.hedgehogLevel > 0 ? HEDGEHOG_SURPRISE_DRM : 0);
  let shift = 0;
  let shiftDie: number | null = null;
  if (surpriseTotal >= threshold.attacker || surpriseTotal <= threshold.defender) {
    const die = rollDie(next.rng);
    next = { ...next, rng: die.rng };
    shiftDie = die.value;
    shift = surpriseTotal >= threshold.attacker ? die.value : -die.value;
  }
  const column = Math.max(0, Math.min(odds.columns.length - 1, odds.columnIndex + shift));
  const roll = rollTwoDice(next.rng);
  next = { ...next, rng: roll.rng };
  events.push({ kind: 'DICE_ROLLED', sequence: events.length, transactionId: transaction.id, purpose: 'COMBAT', roll: roll.roll });
  // 9.9, 16.0d: subtract the full Level of the defender's hedgehog from the combat roll.
  const cell = COMBAT_TABLE_ROWS[combatTableRowIndex(roll.roll.total + odds.drm - odds.hedgehogLevel)]![column]!;
  const result = parseCombatResult(cell);
  // 5.7d: Reserve markers come off defending stacks that receive any result.
  let pieceState = next.pieceState;
  for (const id of transaction.defenderIds) {
    const piece = pieceState.pieces.find((candidate) => candidate.id === id)!;
    if (piece.mode === 'RESERVE') pieceState = upsertPieceState(pieceState, { ...piece, mode: faceMode(piece) });
  }
  next = { ...next, pieceState };
  const queue: ResolutionStep[] = [
    { kind: 'LOSS', side: 'ATTACKER', count: result.attacker.loss, distribution: 'COMBAT', pieceIds: transaction.attackerIds },
    { kind: 'OPTION', side: 'ATTACKER', points: result.attacker.option },
    ...(result.exploitRating !== null ? [{ kind: 'EXPLOIT' as const, rating: result.exploitRating }] : []),
    ...(result.defenderDisorganized ? [{ kind: 'DEFENDER_DG' as const }] : []),
    { kind: 'LOSS', side: 'DEFENDER', count: result.defender.loss, distribution: 'COMBAT', pieceIds: transaction.defenderIds },
    { kind: 'OPTION', side: 'DEFENDER', points: result.defender.option },
    { kind: 'ADVANCE' },
  ];
  next = {
    ...next,
    activeTransaction: {
      ...next.activeTransaction!,
      step: 'RESOLVING', surpriseRoll: surprise.roll, shiftDie, roll: roll.roll, result: cell, queue,
    },
  };
  const processed = processQueue(next);
  return { state: processed.state, events: [...events, ...processed.events.map((event, index) => ({ ...event, sequence: events.length + index }))] };
};

// ─── Resolution queue ──────────────────────────────────────────────────────────────────────────

const sideOwner = (transaction: RuleTransaction, side: CombatSide): PlayerId =>
  side === 'ATTACKER' ? transaction.ownerId : transaction.defenderOwnerId;

const survivors = (state: GameState, ids: readonly PieceId[]): readonly PieceState[] =>
  ids.flatMap((id) => { const piece = pieceById(state, id); return piece && piece.location.kind === 'ON_MAP' ? [piece] : []; });

const removeStep = (state: GameState, piece: PieceState, events: RuleEvent[]): GameState => {
  const remaining = stepsOf(piece) - 1;
  const updated: PieceState = remaining > 0 ? { ...piece, remainingSteps: remaining } : { ...piece, location: { kind: 'ELIMINATED' } };
  events.push({ kind: 'STEP_LOST', sequence: events.length, pieceId: piece.id, remainingSteps: remaining > 0 ? remaining : null });
  const transaction = state.activeTransaction;
  const ledger = transaction ? [
    ...transaction.lossLedger.filter(({ pieceId }) => pieceId !== piece.id),
    { pieceId: piece.id, steps: (transaction.lossLedger.find(({ pieceId }) => pieceId === piece.id)?.steps ?? 0) + 1 },
  ].sort((left, right) => String(left.pieceId).localeCompare(String(right.pieceId))) : [];
  return {
    ...state,
    pieceState: upsertPieceState(state.pieceState, updated),
    activeTransaction: transaction ? { ...transaction, lossLedger: ledger } : null,
  };
};

/** 9.11c: the AR unit loses the first step; nobody loses a second step before all lost one. */
const lossCandidates = (state: GameState, step: Extract<ResolutionStep, { kind: 'LOSS' }>): readonly PieceState[] => {
  const transaction = state.activeTransaction!;
  const alive = survivors(state, step.pieceIds);
  if (step.distribution === 'FREE') return alive;
  const taken = (piece: PieceState) => transaction.lossLedger.find(({ pieceId }) => pieceId === piece.id)?.steps ?? 0;
  const sideTaken = step.pieceIds.reduce((total, id) => total + (transaction.lossLedger.find(({ pieceId }) => pieceId === id)?.steps ?? 0), 0);
  const lead = step.side === 'ATTACKER' ? transaction.leadAttackerId : transaction.leadDefenderId;
  const leadPiece = alive.find(({ id }) => id === lead);
  if (sideTaken === 0 && leadPiece) return [leadPiece];
  const minimum = Math.min(...alive.map(taken));
  return alive.filter((piece) => taken(piece) === minimum);
};

const decision = (state: GameState, kind: PendingDecision['kind'], ownerId: PlayerId, prompt: string, options: PendingDecision['options']): PendingDecision => ({
  id: decisionId(`decision:${state.activeTransaction!.id}:${kind}:${state.revision}:${state.rng.draws}:${state.activeTransaction!.queue.length}:${state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP').length}`),
  kind,
  ownerId,
  transactionId: state.activeTransaction!.id,
  prompt,
  options,
});

const withQueue = (state: GameState, queue: readonly ResolutionStep[], patch: Partial<RuleTransaction> = {}): GameState => ({
  ...state, activeTransaction: { ...state.activeTransaction!, ...patch, queue },
});

/** DG every combat unit of `playerId` in the hex (9.12a/e, 10.0a). */
export const setModeForHex = (state: GameState, hexId: HexId, playerId: PlayerId, events: RuleEvent[]): GameState => {
  let pieceState = state.pieceState;
  for (const piece of friendlyCombatUnitsAt(state, playerId, hexId)) {
    if (piece.mode === 'DG' || isTransportPoint(state, piece)) continue;
    pieceState = upsertPieceState(pieceState, withInvoluntaryMode(piece, 'DG'));
    events.push({ kind: 'MODE_CHANGED', sequence: events.length, pieceId: piece.id, from: piece.mode, to: 'DG' });
  }
  return { ...state, pieceState };
};

export interface RetreatPlan {
  readonly destination: HexId;
  readonly path: readonly HexId[];
  readonly zocEntries: number;
}

/**
 * 9.12: every destination exactly `hexes` from the start (as the crow flies) reachable by a legal
 * path for all retreating units, avoiding Hexes that held enemy combat units when combat began and
 * prohibited terrain. Among paths to a destination, the fewest enemy ZOC entries (9.12e) is kept;
 * the player picks the destination. Retreats may end overstacked (4.8a is checked at segment end).
 * `opponentHexes` holds the Hexes of the enemy units in the combat (9.12c): destinations next to them are
 * dropped when a destination away from them is no more costly in enemy ZOC entries.
 */
export const retreatPlans = (
  state: GameState,
  pieces: readonly PieceState[],
  hexes: number,
  blocked: ReadonlySet<HexId>,
  opponentHexes: ReadonlySet<HexId>,
): readonly RetreatPlan[] => {
  const origin = pieces[0] ? hexOf(pieces[0]) : null;
  if (!origin || hexes <= 0) return [];
  const owner = pieces[0]!.ownerId;
  const mobilities = [...new Set(pieces.map((piece) => mobilityOf(state, piece) ?? 'leg'))];
  const models = mobilities.map((mobility) => playerCostModel(state, owner, mobility));
  const strat = pieces.some((piece) => piece.mode === 'STRAT');
  // 4.8c: only Attack-Capable units may pass Hexes holding enemy non-combat units.
  const allAttackCapable = pieces.every((piece) => isAttackCapable(state, piece));
  const plans = new Map<HexId, RetreatPlan>();
  // A retreat may zig-zag around prohibited terrain but must end the full distance away (9.12);
  // paths never move back toward the start and are extended by at most two Hexes.
  const walk = (path: readonly HexId[], zoc: number): void => {
    const current = path.at(-1)!;
    const distance = hexDistanceBetween(origin, current);
    if (distance === hexes) {
      const existing = plans.get(current);
      if (!existing || zoc < existing.zocEntries || (zoc === existing.zocEntries && (path.length < existing.path.length
        || (path.length === existing.path.length && path.join('|') < existing.path.join('|'))))) {
        plans.set(current, { destination: current, path, zocEntries: zoc });
      }
      return;
    }
    if (path.length - 1 >= hexes + 2) return;
    for (const next of adjacentHexIds(current)) {
      if (path.includes(next) || blocked.has(next) || enemyCombatUnitsAt(state, owner, next).length > 0) continue;
      if (!allAttackCapable && (piecesAt(state, next).some((piece) => piece.ownerId !== owner) || enemyPortIn(state, owner, next))) continue;
      if (hexDistanceBetween(origin, next) < distance) continue;
      if (models.some((model) => model.evaluate(current, next).kind !== 'COST')) continue;
      const zocHere = inEnemyZoc(state, owner, next);
      if (strat && zocHere) continue;
      walk([...path, next], zoc + (zocHere ? 1 : 0));
    }
  };
  walk([origin], 0);
  // 9.12c: a retreat is generally away from the enemy units in the combat, but may bend that to avoid
  // losses. A destination next to one of them is therefore dropped only when a destination that is not
  // next to any of them costs no more enemy-ZOC entries (9.12e: DG, then step losses).
  const nextToOpponent = (hexId: HexId): boolean => adjacentHexIds(hexId).some((adjacent) => opponentHexes.has(adjacent));
  const all = [...plans.values()];
  const clear = all.filter((plan) => !nextToOpponent(plan.destination));
  const offered = all.filter((plan) => !nextToOpponent(plan.destination) || !clear.some(({ zocEntries }) => zocEntries <= plan.zocEntries));
  return stableSort(offered, (left, right) => left.zocEntries - right.zocEntries || String(left.destination).localeCompare(String(right.destination)));
};

/**
 * 9.12f: the defender may not retreat through Hexes that held attacking combat units when the
 * combat began, even if vacated since. The attacker retreats before the defender moves, so current
 * enemy occupation (checked by `retreatPlans`) covers its case.
 */
const retreatBlocks = (transaction: RuleTransaction, side: CombatSide): ReadonlySet<HexId> =>
  side === 'DEFENDER' ? new Set(transaction.blockedHexIds) : new Set();

/** 9.12c: where the surviving enemy units in this combat stand, so a retreat can be generally away from them. */
const retreatOpponentHexes = (state: GameState, transaction: RuleTransaction, side: CombatSide): ReadonlySet<HexId> =>
  new Set(survivors(state, side === 'ATTACKER' ? transaction.defenderIds : transaction.attackerIds)
    .flatMap((piece) => piece.location.kind === 'ON_MAP' ? [piece.location.hexId] : []));

const optionChoices = (state: GameState, side: CombatSide, points: number): PendingDecision['options'] => {
  const transaction = state.activeTransaction!;
  const ids = side === 'ATTACKER' ? transaction.attackerIds : transaction.defenderIds;
  const alive = survivors(state, ids);
  const totalSteps = alive.reduce((total, piece) => total + stepsOf(piece), 0);
  const choices: PendingDecision['options'][number][] = [];
  const blocked = retreatBlocks(transaction, side);
  const opponentHexes = retreatOpponentHexes(state, transaction, side);
  for (let losses = points; losses >= 0; losses -= 1) {
    const retreat = points - losses;
    // 9.12: units that cannot retreat the full distance are eliminated; say so when it would happen.
    const trapped = retreat > 0 ? alive.filter((piece) => retreatPlans(state, [piece], retreat, blocked, opponentHexes).length === 0).length : 0;
    if (retreat > 0 && trapped === alive.length) continue;
    const label = (retreat === 0
      ? `Lose ${Math.min(losses, totalSteps)} step${losses === 1 ? '' : 's'}`
      : losses === 0 ? `Retreat ${retreat} hex${retreat === 1 ? '' : 'es'}` : `Lose ${losses} step${losses === 1 ? '' : 's'}, retreat ${retreat}`)
      + (trapped > 0 ? ` (${trapped} unit${trapped === 1 ? '' : 's'} cannot retreat and ${trapped === 1 ? 'is' : 'are'} eliminated)` : '');
    choices.push({ id: `option:${losses}:${retreat}`, label, hexId: null });
  }
  if (side === 'DEFENDER') {
    const attackersGone = survivors(state, transaction.attackerIds).length === 0;
    // Ignoring the option is strictly better than any loss/retreat split, so it is the only offer once it is allowed.
    if (transaction.attackerRetreated || attackersGone) return [{ id: 'option:ignore', label: 'Ignore the option (attacker retreated or was destroyed)', hexId: null }];
  }
  // 9.12: with no legal retreat at all, the whole option must be taken as losses.
  if (choices.length === 0) choices.push({ id: `option:${points}:0`, label: `Lose ${Math.min(points, totalSteps)} step${points === 1 ? '' : 's'} (no legal retreat)`, hexId: null });
  return choices;
};

const applyRetreat = (state: GameState, side: CombatSide, stack: readonly PieceState[], plan: RetreatPlan, events: RuleEvent[]): { state: GameState; zocLossIds: PieceId[] } => {
  let next = state;
  const owner = stack[0]!.ownerId;
  const zocLossIds: PieceId[] = [];
  let ids = stack.map(({ id }) => id);
  for (const [index, hexId] of plan.path.slice(1).entries()) {
    const current = ids.flatMap((id) => pieceById(next, id) ?? []).filter((piece) => piece.location.kind === 'ON_MAP');
    const dgBefore = current.filter((piece) => piece.mode === 'DG').map(({ id }) => id);
    let pieceState = next.pieceState;
    for (const piece of current) {
      // 9.12b: a unit with no MA on its current face changes to Move Mode before retreating.
      const zeroMa = Number(stepOf(next, piece)?.movementPointTicks ?? 0) === 0;
      const flipped = zeroMa && definitionOf(next, piece)?.faces.some(({ id }) => id === 'move')
        ? { ...piece, currentFaceId: 'move' as PieceState['currentFaceId'], mode: piece.mode === 'COMBAT' ? 'MOVE' as const : piece.mode } : piece;
      pieceState = upsertPieceState(pieceState, { ...flipped, location: { kind: 'ON_MAP', hexId }, stackOrder: nextStackOrder(pieceState.pieces, hexId, piece.id) });
    }
    next = { ...next, pieceState };
    // 9.12f: retreats through enemy non-combat units handle them as movement does (9.14).
    next = captureAt(next, owner, hexId, events);
    const secondHex = index === 1;
    const zoc = inEnemyZoc(next, owner, hexId);
    // 9.12a/e, 5.10a: second hex of retreat, or entering an enemy ZOC, disorganizes every combat unit in the Hex.
    if (secondHex || zoc) next = setModeForHex(next, hexId, owner, events);
    if (zoc && dgBefore.length > 0) zocLossIds.push(...dgBefore);
    ids = ids.filter((id) => pieceById(next, id)?.location.kind === 'ON_MAP');
  }
  for (const id of ids) events.push({ kind: 'PIECE_RETREATED', sequence: events.length, pieceId: id, toHexId: plan.destination });
  if (side === 'ATTACKER') next = withQueue(next, next.activeTransaction!.queue, { attackerRetreated: true });
  return { state: next, zocLossIds: [...new Set(zocLossIds)] };
};

const exploitAllowed = (state: GameState): boolean => {
  const transaction = state.activeTransaction!;
  if (transaction.kind !== 'COMBAT' || state.sequence.phase !== 'COMBAT' || transaction.attackerRetreated) return false;
  const hexes = attackingHexes(state, transaction.attackerIds);
  // 9.13bC: at most two attacking stacks, and they must be adjacent to each other.
  return hexes.length === 1 || (hexes.length === 2 && isAdjacent(hexes[0]!, hexes[1]!));
};

/** 19.0, 3.3c: a port held by the other side counts as an enemy non-combat unit in its Hex. */
const enemyPortIn = (state: GameState, owner: PlayerId, hexId: HexId): boolean => {
  const port = portAt(state, hexId);
  return port !== undefined && port.controllerId !== null && port.controllerId !== owner;
};

export const nextStackOrder = (pieces: readonly PieceState[], hexId: HexId, movingId: PieceId): number =>
  pieces.reduce((highest, piece) => piece.id !== movingId && piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId
    ? Math.max(highest, piece.stackOrder) : highest, -1) + 1;

const advanceInto = (state: GameState, ids: readonly PieceId[], events: RuleEvent[]): GameState => {
  const transaction = state.activeTransaction!;
  let next = state;
  for (const id of ids) {
    const piece = pieceById(next, id);
    if (!piece || piece.location.kind !== 'ON_MAP') continue;
    next = { ...next, pieceState: upsertPieceState(next.pieceState, { ...piece, location: { kind: 'ON_MAP', hexId: transaction.targetHexId }, stackOrder: nextStackOrder(next.pieceState.pieces, transaction.targetHexId, piece.id) }) };
    events.push({ kind: 'PIECE_ADVANCED', sequence: events.length, pieceId: id, toHexId: transaction.targetHexId });
  }
  if (ids.length > 0) {
    // 9.12gC: advancing captures or displaces enemy non-combat units per 9.14.
    next = captureAt(next, transaction.ownerId, transaction.targetHexId, events, true);
    // 13.3h: only a combat unit entering a Hex changes its control.
    if (ids.some((id) => { const piece = pieceById(next, id); return piece !== undefined && isCombatUnit(next, piece); })) {
      next = { ...next, mapState: setHexControl(next.mapState, transaction.targetHexId, transaction.ownerId) };
    }
  }
  return next;
};

/** 9.12g: surviving attackers that paid combat supply, can move, and are not yet in the Hex. */
const advanceCandidates = (state: GameState): readonly PieceState[] => {
  const transaction = state.activeTransaction!;
  return survivors(state, transaction.attackerIds).filter((piece) => hexOf(piece) !== transaction.targetHexId
    && mobilityOf(state, piece) !== null && Number(stepOf(state, piece)?.movementPointTicks ?? 0) > 0);
};

const retreatOptions = (state: GameState, step: Extract<ResolutionStep, { kind: 'RETREAT' }>): PendingDecision['options'] => {
  const transaction = state.activeTransaction!;
  const alive = survivors(state, step.pieceIds);
  const blocked = retreatBlocks(transaction, step.side);
  const opponentHexes = retreatOpponentHexes(state, transaction, step.side);
  const options: PendingDecision['options'][number][] = retreatPlans(state, alive, step.hexes, blocked, opponentHexes).map((plan) => ({
    id: `hex:${plan.destination}`,
    label: `${alive.length > 1 ? `All ${alive.length} units retreat` : `${unitName(state, alive[0])} retreats`} to ${plan.destination}${plan.zocEntries > 0 ? ` (through ${plan.zocEntries} enemy ZOC: DG)` : ''}`,
    hexId: plan.destination,
  }));
  if (step.side === 'ATTACKER') {
    // 9.12d: combat units in the Hex that did not attack may join the retreat.
    const hexId = hexOf(alive[0]!)!;
    const tagalongs = friendlyCombatUnitsAt(state, transaction.ownerId, hexId).filter((piece) => !transaction.attackerIds.includes(piece.id) && !step.pieceIds.includes(piece.id));
    if (tagalongs.length > 0) {
      for (const plan of retreatPlans(state, [...alive, ...tagalongs], step.hexes, blocked, opponentHexes)) {
        options.push({ id: `with:${plan.destination}`, label: `Retreat to ${plan.destination} with the ${tagalongs.length} non-attacking unit${tagalongs.length === 1 ? '' : 's'} in the Hex`, hexId: plan.destination });
      }
    }
  }
  if (alive.length > 1) options.push({ id: 'split', label: 'Retreat the units separately', hexId: null });
  // 20.0a: a multi-step unit may detach Breakdowns as it begins to retreat; they retreat too, together or separately.
  if (options.length > 0) {
    for (const piece of alive.filter((candidate) => mayCreateBreakdown(state, candidate))) {
      options.push({ id: `${BREAKDOWN_RETREAT_PREFIX}${piece.id}`, label: `Detach a Breakdown from ${unitName(state, piece)} first (it retreats too)`, hexId: null });
    }
  }
  return options;
};

/** Run resolution steps until a player must decide or the combat is over. */
export const processQueue = (input: GameState): Transition => {
  let state = input;
  const events: RuleEvent[] = [];
  for (let guard = 0; guard < 300; guard += 1) {
    const transaction = state.activeTransaction!;
    // Captured trucks and collapsing Extenders are placed by their owner before anything else.
    if (state.interrupts.length > 0) {
      const settled = settleInterrupts(state, transaction.id);
      state = settled.state;
      events.push(...settled.events.map((event) => ({ ...event, sequence: events.length })));
      if (state.pendingDecision) return { state, events: renumber(events) };
      continue;
    }
    const [step, ...rest] = transaction.queue;
    if (!step) {
      events.push({ kind: 'TRANSACTION_RESOLVED', sequence: events.length, transactionId: transaction.id, result: transaction.result ?? 'NONE' });
      const overrunMover = transaction.kind === 'OVERRUN' && !transaction.attackerRetreated
        ? survivors(state, transaction.attackerIds)[0]?.id ?? null : null;
      return { state: { ...state, activeTransaction: null, pendingDecision: null, currentMoverId: transaction.kind === 'OVERRUN' ? overrunMover : state.currentMoverId }, events };
    }
    switch (step.kind) {
      case 'LOSS': {
        const alive = survivors(state, step.pieceIds);
        if (step.count <= 0 || alive.length === 0) { state = withQueue(state, rest); break; }
        const candidates = lossCandidates(state, step);
        if (candidates.length === 1) {
          state = removeStep(withQueue(state, [{ ...step, count: step.count - 1 }, ...rest]), candidates[0]!, events);
          break;
        }
        const pending = decision(state, 'STEP_LOSS', sideOwner(transaction, step.side),
          `${step.side === 'ATTACKER' ? 'Attacker' : 'Defender'} loses ${step.count} step${step.count === 1 ? '' : 's'}: choose the unit to lose the next step.`,
          candidates.map((piece) => ({ id: `piece:${piece.id}`, label: `${unitName(state, piece)} (${stepsOf(piece)} step${stepsOf(piece) === 1 ? '' : 's'})`, hexId: null })));
        events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: pending });
        return { state: { ...state, pendingDecision: pending }, events };
      }
      case 'OPTION': {
        if (step.points <= 0 || survivors(state, step.side === 'ATTACKER' ? transaction.attackerIds : transaction.defenderIds).length === 0) {
          state = withQueue(state, rest); break;
        }
        const choices = optionChoices(state, step.side, step.points);
        if (choices.length === 1) { state = applyOptionChoice(state, step, rest, choices[0]!.id); break; }
        const pending = decision(state, 'OPTION_SPLIT', sideOwner(transaction, step.side),
          `${step.side === 'ATTACKER' ? 'Attacker' : 'Defender'} option ${step.points}: take it as step losses, retreat, or both.`, choices);
        events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: pending });
        return { state: { ...state, pendingDecision: pending }, events };
      }
      case 'RETREAT': {
        const alive = survivors(state, step.pieceIds);
        if (alive.length === 0) { state = withQueue(state, rest); break; }
        const options = retreatOptions(state, step);
        const destinations = options.filter(({ id }) => id !== 'split' && !id.startsWith(BREAKDOWN_RETREAT_PREFIX));
        if (destinations.length === 0) {
          if (alive.length > 1) {
            // No common path: each unit retreats on its own (9.12c).
            state = withQueue(state, [...alive.map((piece) => ({ ...step, pieceIds: [piece.id] })), ...rest]);
            break;
          }
          // 9.12: a unit that cannot retreat the full distance is eliminated.
          state = withQueue(state, rest);
          state = { ...state, pieceState: upsertPieceState(state.pieceState, { ...alive[0]!, location: { kind: 'ELIMINATED' } }) };
          events.push({ kind: 'STEP_LOST', sequence: events.length, pieceId: alive[0]!.id, remainingSteps: null });
          break;
        }
        if (options.length === 1) { state = applyRetreatChoice(state, step, rest, options[0]!.id, events); break; }
        const pending = decision(state, 'RETREAT_HEX', sideOwner(transaction, step.side),
          `Retreat ${step.hexes} hex${step.hexes === 1 ? '' : 'es'}: choose where ${alive.length > 1 ? 'the units end' : `${unitName(state, alive[0])} ends`} the retreat.`, options);
        events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: pending });
        return { state: { ...state, pendingDecision: pending }, events };
      }
      case 'EXPLOIT': {
        let next = withQueue(state, rest);
        if (exploitAllowed(state)) {
          let pieceState = next.pieceState;
          for (const piece of survivors(next, transaction.attackerIds)) {
            if (piece.mode === 'DG' || !isAttackCapable(next, piece) || combatActionRating(next, piece) < step.rating) continue;
            pieceState = upsertPieceState(pieceState, withInvoluntaryMode(piece, 'EXPLOITATION'));
            events.push({ kind: 'MODE_CHANGED', sequence: events.length, pieceId: piece.id, from: piece.mode, to: 'EXPLOITATION' });
          }
          next = { ...next, pieceState };
        }
        state = next;
        break;
      }
      case 'DEFENDER_DG':
        state = setModeForHex(withQueue(state, rest), transaction.targetHexId, transaction.defenderOwnerId, events);
        break;
      case 'ADVANCE': {
        const vacated = enemyCombatUnitsAt(state, transaction.ownerId, transaction.targetHexId).length === 0;
        const advancers = advanceCandidates(state);
        if (transaction.kind === 'BARRAGE' || !vacated || transaction.attackerRetreated || advancers.length === 0) { state = withQueue(state, rest); break; }
        // 9.12gD: a successful overrun must enter the Hex.
        if (transaction.kind === 'OVERRUN') { state = advanceInto(withQueue(state, rest), advancers.map(({ id }) => id), events); break; }
        const advanced = survivors(state, transaction.attackerIds).some((piece) => hexOf(piece) === transaction.targetHexId);
        const pending = decision(state, 'ADVANCE_HEX', transaction.ownerId,
          `${transaction.targetHexId} is vacant: choose attackers to advance after combat, one at a time or all together.`,
          [
            { id: 'advance:done', label: advanced ? 'Stop advancing' : 'Do not advance', hexId: null },
            ...(advancers.length > 1 ? [{ id: 'advance:all', label: `Advance all ${advancers.length} remaining attackers`, hexId: null }] : []),
            ...advancers.map((piece) => ({ id: `advance:${piece.id}`, label: `Advance ${unitName(state, piece)}`, hexId: null })),
            // 20.0a: a multi-step attacker may detach Breakdowns as it begins to advance, so part of it can advance alone.
            ...advancers.filter((piece) => mayCreateBreakdown(state, piece)).map((piece) => ({
              id: `${BREAKDOWN_ADVANCE_PREFIX}${piece.id}`, label: `Detach a Breakdown from ${unitName(state, piece)} (it may advance on its own)`, hexId: null,
            })),
          ]);
        events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: pending });
        return { state: { ...state, pendingDecision: pending }, events };
      }
    }
  }
  throw new Error('Combat resolution did not terminate.');
};

const applyOptionChoice = (
  state: GameState,
  step: Extract<ResolutionStep, { kind: 'OPTION' }>,
  rest: readonly ResolutionStep[],
  choiceId: string,
): GameState => {
  const transaction = state.activeTransaction!;
  if (choiceId === 'option:ignore') return withQueue(state, rest);
  const [, lossText, retreatText] = choiceId.split(':');
  const losses = Number(lossText);
  const retreat = Number(retreatText);
  const ids = step.side === 'ATTACKER' ? transaction.attackerIds : transaction.defenderIds;
  // Attacking stacks retreat separately (each from its own Hex); the defending stack retreats together unless split.
  const stacks = step.side === 'ATTACKER'
    ? [...new Set(survivors(state, ids).map((piece) => String(hexOf(piece))))].map((hexId) => survivors(state, ids).filter((piece) => String(hexOf(piece)) === hexId).map(({ id }) => id))
    : [survivors(state, ids).map(({ id }) => id)];
  const followUp: ResolutionStep[] = [
    ...(losses > 0 ? [{ kind: 'LOSS' as const, side: step.side, count: losses, distribution: 'COMBAT' as const, pieceIds: ids }] : []),
    // The retreat applies to whoever survives the losses.
    ...(retreat > 0 ? stacks.map((pieceIds) => ({ kind: 'RETREAT' as const, side: step.side, hexes: retreat, pieceIds })) : []),
  ];
  // 9.10d: an attacker who retreats forfeits any exploit result.
  const remaining = step.side === 'ATTACKER' && retreat > 0 ? rest.filter(({ kind }) => kind !== 'EXPLOIT') : rest;
  return withQueue(state, [...followUp, ...remaining], step.side === 'ATTACKER' && retreat > 0 ? { attackerRetreated: true } : {});
};

const applyRetreatChoice = (
  state: GameState,
  step: Extract<ResolutionStep, { kind: 'RETREAT' }>,
  rest: readonly ResolutionStep[],
  choiceId: string,
  events: RuleEvent[],
): GameState => {
  const transaction = state.activeTransaction!;
  const alive = survivors(state, step.pieceIds);
  if (choiceId === 'split') return withQueue(state, [...alive.map((piece) => ({ ...step, pieceIds: [piece.id] })), ...rest]);
  if (choiceId.startsWith(BREAKDOWN_RETREAT_PREFIX)) {
    // The retreat is asked again with the new Breakdown in it (20.0a).
    const detached = detachInCombat(state, choiceId.slice(BREAKDOWN_RETREAT_PREFIX.length) as PieceId, events);
    return withQueue(detached.state, [{ ...step, pieceIds: [...step.pieceIds, detached.breakdownId] }, ...rest]);
  }
  const withTagalongs = choiceId.startsWith('with:');
  const destination = choiceId.slice(withTagalongs ? 'with:'.length : 'hex:'.length);
  const hexId = hexOf(alive[0]!)!;
  const group = withTagalongs
    ? [...alive, ...friendlyCombatUnitsAt(state, transaction.ownerId, hexId).filter((piece) => !transaction.attackerIds.includes(piece.id) && !step.pieceIds.includes(piece.id))]
    : alive;
  const plan = retreatPlans(state, group, step.hexes, retreatBlocks(transaction, step.side), retreatOpponentHexes(state, transaction, step.side)).find((candidate) => candidate.destination === destination)!;
  const moved = applyRetreat(withQueue(state, rest), step.side, group, plan, events);
  return moved.zocLossIds.length > 0
    ? withQueue(moved.state, [{ kind: 'LOSS', side: step.side, count: 1, distribution: 'FREE', pieceIds: moved.zocLossIds }, ...moved.state.activeTransaction!.queue])
    : moved.state;
};

export const resolveDecision = (state: GameState, choiceId: string): Transition => {
  const pending = state.pendingDecision!;
  const cleared: GameState = { ...state, pendingDecision: null };
  const transaction = cleared.activeTransaction!;
  if (pending.kind === 'SUPPLY_SOURCE') {
    const settled = continueSetup(applyPaymentChoice(cleared, choiceId));
    return { state: settled.state, events: renumber(settled.events) };
  }
  if (pending.kind === 'DEFENDER_LEAD') {
    const settled = continueSetup({ ...cleared, activeTransaction: { ...transaction, leadDefenderId: choiceId.slice('lead:'.length) as PieceId, step: 'DEFENDER_TERRAIN' } });
    return { state: settled.state, events: renumber(settled.events) };
  }
  if (pending.kind === 'DEFENDER_TERRAIN') {
    const rolled = rollCombat({ ...cleared, activeTransaction: { ...transaction, defenderTerrainId: choiceId.slice('terrain:'.length), step: 'RESOLVING' } });
    return { state: rolled.state, events: renumber(rolled.events) };
  }
  const [step, ...rest] = transaction.queue;
  const events: RuleEvent[] = [];
  let next = cleared;
  if (pending.kind === 'DISPLACEMENT_HEX' || pending.kind === 'ATTRITION_LOSS') {
    const applied = applyInterruptChoice(cleared, choiceId);
    next = applied.state;
    events.push(...applied.events);
  } else if (pending.kind === 'STEP_LOSS' && step?.kind === 'LOSS') {
    const piece = pieceById(cleared, choiceId.slice('piece:'.length) as PieceId)!;
    next = removeStep(withQueue(cleared, [{ ...step, count: step.count - 1 }, ...rest]), piece, events);
  } else if (pending.kind === 'OPTION_SPLIT' && step?.kind === 'OPTION') {
    next = applyOptionChoice(cleared, step, rest, choiceId);
  } else if (pending.kind === 'RETREAT_HEX' && step?.kind === 'RETREAT') {
    next = applyRetreatChoice(cleared, step, rest, choiceId, events);
  } else if (pending.kind === 'ADVANCE_HEX' && step?.kind === 'ADVANCE') {
    if (choiceId.startsWith(BREAKDOWN_ADVANCE_PREFIX)) {
      // The new Breakdown joins the attackers that may advance; the advance step stays queued (20.0a).
      const detached = detachInCombat(cleared, choiceId.slice(BREAKDOWN_ADVANCE_PREFIX.length) as PieceId, events);
      const current = detached.state.activeTransaction!;
      next = { ...detached.state, activeTransaction: { ...current, attackerIds: [...current.attackerIds, detached.breakdownId] } };
    } else if (choiceId === 'advance:done') next = withQueue(cleared, rest);
    else if (choiceId === 'advance:all') next = advanceInto(withQueue(cleared, rest), advanceCandidates(cleared).map(({ id }) => id), events);
    // One unit advances; the step stays queued so more may follow.
    else next = advanceInto(cleared, [choiceId.slice('advance:'.length) as PieceId], events);
  } else {
    throw new Error(`Decision ${pending.kind} does not match the resolution queue.`);
  }
  const processed = processQueue(next);
  return { state: processed.state, events: renumber([...events, ...processed.events]) };
};

// ─── Barrage (10.0, 10.1) ─────────────────────────────────────────────────────────────────────

type BarrageDeclaration = Extract<GameAction, { readonly kind: 'DECLARE_BARRAGE' }>;

export interface BarragePreview {
  readonly strength: number;
  readonly initialColumn: number;
  readonly finalColumn: number;
  readonly supplyTokens: number;
  readonly spotter: boolean;
  readonly shifts: readonly { readonly reason: string; readonly shift: number }[];
}

/** 10.0a density: combat-unit RE in the Hex, a multi-unit formation (or any unit) counting at most 3 RE. */
const densityTicks = (state: GameState, targets: readonly PieceState[]): number => {
  const byGroup = new Map<string, number>();
  for (const piece of targets) {
    const formation = formationOf(state, piece);
    const key = isMultiUnitFormation(state, formation) ? `formation:${formation}` : `unit:${piece.id}`;
    byGroup.set(key, (byGroup.get(key) ?? 0) + reTicksOf(state, piece));
  }
  return [...byGroup.values()].reduce((total, ticks) => total + Math.min(12, ticks), 0);
};

/** 10.0b: a correct spotter is a friendly combat unit adjacent to the target hex. */
export const hasCorrectSpotter = (state: GameState, actorId: PlayerId, targetHexId: HexId): boolean =>
  adjacentHexIds(targetHexId).some((hexId) => friendlyCombatUnitsAt(state, actorId, hexId).length > 0);

/**
 * Barrage Table shifts that depend on the target (10.0a): density, the target's best terrain,
 * spotter, and Strat Mode. `spotted: false` forces the no-spotter shift (14.1eA Strategic Bombers).
 */
export const barrageTargetShifts = (
  state: GameState,
  actorId: PlayerId,
  targetHexId: HexId,
  spotted = true,
): { readonly shifts: readonly { readonly reason: string; readonly shift: number }[]; readonly spotter: boolean } => {
  const targets = enemyCombatUnitsAt(state, actorId, targetHexId);
  const shifts: { reason: string; shift: number }[] = [{ reason: 'Density', shift: barrageDensityShift(densityTicks(state, targets)) }];
  // 10.0a: the targeted player picks the terrain; the largest left shift is always his best pick.
  const terrainShift = Math.min(0, ...hexCombatTerrains(state, targetHexId).map(({ line }) =>
    line === 'EXTREMELY_CLOSE' ? -2 : line === 'CLOSE' || line === 'VERY_CLOSE' ? -1 : 0));
  if (terrainShift !== 0) shifts.push({ reason: 'Terrain', shift: terrainShift });
  // 10.0a: a hedgehog of any Level in the target hex shifts one column left.
  const hog = hedgehogAt(state, targetHexId);
  if (hog && hog.ownerId !== actorId) shifts.push({ reason: `Hedgehog L${hedgehogLevel(hog)}`, shift: HEDGEHOG_BARRAGE_SHIFT });
  const spotter = spotted && hasCorrectSpotter(state, actorId, targetHexId);
  if (!spotter) shifts.push({ reason: 'No spotter', shift: -3 });
  if (targets.some((piece) => piece.mode === 'STRAT')) shifts.push({ reason: 'Strat Mode target', shift: 3 });
  return { shifts, spotter };
};

export const previewBarrage = (state: GameState, actorId: PlayerId, firerIds: readonly PieceId[], targetHexId: HexId): BarragePreview => {
  const firers = firerIds.flatMap((id) => pieceById(state, id) ?? []);
  const strength = roundOcs(firers.reduce((total, piece) => total + barrageStrengthOf(state, piece), 0));
  const initialColumn = barrageColumnIndex(strength);
  const { shifts, spotter } = barrageTargetShifts(state, actorId, targetHexId);
  const finalColumn = Math.max(0, Math.min(BARRAGE_TABLE_COLUMNS.length - 1, initialColumn + shifts.reduce((total, { shift }) => total + shift, 0)));
  return { strength, initialColumn, finalColumn, supplyTokens: BARRAGE_TABLE_COLUMNS[initialColumn]!.supplyTokens, spotter, shifts };
};

/** Can the barrage be paid through one HQ, or from one dump (10.1bA)? */
const barragePayable = (state: GameState, firers: readonly PieceState[], tokens: number): boolean => {
  const owner = firers[0]?.ownerId;
  if (!owner) return false;
  const dumps = dumpsReachingAll(state, owner, firers);
  const byKey = new Map<string, number>();
  for (const dump of dumps) {
    for (const key of barrageRouteKeys(state, pieceById(state, dump.pieceId)!, firers)) {
      // A direct draw must come from a single dump; an HQ may draw from several.
      const bucket = key === 'DRAW' ? `DRAW:${dump.pieceId}` : key;
      byKey.set(bucket, (byKey.get(bucket) ?? 0) + dump.availableQuantity);
    }
  }
  return [...byKey.values()].some((total) => total >= tokens);
};

export const validateBarrageDeclaration = (state: GameState, action: BarrageDeclaration): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const { phase, segment } = state.sequence;
  if (action.actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Actor does not own the current sequence step.', '10.0e'));
  if (segment !== 'BARRAGE' || !['REACTION', 'COMBAT', 'EXPLOITATION'].includes(phase)) {
    issues.push(violation('INVALID_BARRAGE_PHASE', ['sequence'], phase === 'MOVEMENT'
      ? 'Only air and naval barrages occur in the Movement Phase.' : 'Artillery barrages happen in Reaction, Combat, and Exploitation Barrage Segments.', '10.0e'));
  }
  if (action.firerIds.length === 0 || new Set(action.firerIds).size !== action.firerIds.length) {
    return [...issues, violation('INVALID_BARRAGE_FIRERS', ['firerIds'], 'Firers must be a non-empty unique list.', '10.0')];
  }
  const firers = action.firerIds.map((id) => pieceById(state, id));
  if (firers.some((piece) => !piece)) return [...issues, violation('UNKNOWN_FIRER', ['firerIds'], 'Unknown firer.', '10.0')];
  const targets = enemyCombatUnitsAt(state, action.actorId, action.targetHexId);
  const expected = new Set(targets.map(({ id }) => String(id)));
  if (targets.length === 0) issues.push(violation('NO_BARRAGE_TARGET', ['targetHexId'], 'The Barrage Table is used against enemy combat units.', '10.0a'));
  if (action.targetPieceIds.length !== expected.size || action.targetPieceIds.some((id) => !expected.has(String(id)))) {
    issues.push(violation('WHOLE_HEX_IS_TARGET', ['targetPieceIds'], 'A barrage attacks every combat unit in the Hex.', '10.0a'));
  }
  if (state.ledger.barragedHexIds.includes(action.targetHexId)) issues.push(violation('HEX_ALREADY_BARRAGED', ['targetHexId'], 'Only one barrage per Hex per phase.', '10.0e'));
  for (const [index, candidate] of firers.entries()) {
    const piece = candidate!;
    const path = ['firerIds', index];
    const hexId = hexOf(piece);
    if (piece.ownerId !== action.actorId) issues.push(violation('NOT_PIECE_OWNER', path, 'Firers must be friendly.', '10.0'));
    if (!isArtillery(state, piece)) issues.push(violation('FIRER_NOT_ARTILLERY', path, 'Only artillery barrages among ground units.', '10.1'));
    if (piece.mode === 'RESERVE' || piece.mode === 'STRAT') issues.push(violation('ARTILLERY_MODE_CANNOT_BARRAGE', path, 'Artillery in Reserve or Strat Mode cannot barrage.', '13.4a'));
    const usage = usageOf(state, piece);
    if (usage.barraged) issues.push(violation('ARTILLERY_ALREADY_BARRAGED', path, 'A unit barrages only once per phase.', '10.0e'));
    if (phase === 'REACTION' && !usage.reserveReleased) issues.push(violation('REACTION_REQUIRES_RELEASED_RESERVE', path, 'Only released artillery barrages in the Reaction Phase.', '7.0a'));
    if (phase === 'EXPLOITATION' && !(usage.reserveReleased || piece.mode === 'EXPLOITATION')) issues.push(violation('EXPLOITATION_REQUIRES_EXPLOIT_OR_RESERVE', path, 'Only Exploit Mode units and released Reserves barrage in the Exploitation Phase.', '11.0a'));
    const range = stepOf(state, piece)?.range ?? 0;
    if (!hexId || hexDistanceBetween(hexId, action.targetHexId) > range || hexDistanceBetween(hexId, action.targetHexId) < 1) {
      issues.push(violation('BARRAGE_OUT_OF_RANGE', path, 'Target is outside the firer\'s range.', '10.1a'));
    }
  }
  if (issues.length === 0) {
    const preview = previewBarrage(state, action.actorId, action.firerIds, action.targetHexId);
    if (preview.strength < 1) issues.push(violation('BARRAGE_STRENGTH_TOO_LOW', ['firerIds'], 'It takes at least one point to get on the table.', '10.0'));
    else if (!barragePayable(state, firers as PieceState[], preview.supplyTokens)) {
      issues.push(violation('BARRAGE_SUPPLY_UNAVAILABLE', ['firerIds'], `This barrage needs ${preview.supplyTokens}T through one HQ, or from one dump, reaching every firer (never internal stocks).`, '10.1b'));
    }
  }
  return issues;
};

export const declareBarrage = (state: GameState, action: BarrageDeclaration): Transition => {
  const firers = action.firerIds.map((id) => pieceById(state, id)!);
  const preview = previewBarrage(state, action.actorId, action.firerIds, action.targetHexId);
  const transaction: RuleTransaction = {
    ...emptyTransaction(state, action.actionId, 'BARRAGE', action.actorId),
    step: 'BARRAGE_SUPPLY',
    attackerIds: [...action.firerIds],
    defenderIds: [...action.targetPieceIds],
    targetHexId: action.targetHexId,
    leadAttackerId: null,
    payment: { side: 'ATTACKER', queue: [{ pieceIds: action.firerIds, tokens: preview.supplyTokens }], paid: 0 },
  };
  let next: GameState = { ...state, activeTransaction: transaction, ledger: { ...state.ledger, barragedHexIds: [...state.ledger.barragedHexIds, action.targetHexId] } };
  for (const piece of firers) next = { ...next, usage: withUsage(next, { ...usageOf(next, piece), barraged: true }) };
  const events: RuleEvent[] = [{ kind: 'TRANSACTION_DECLARED', sequence: 0, transactionId: transaction.id, transactionKind: 'BARRAGE' }];
  const settled = continueSetup(next);
  return { state: settled.state, events: renumber([...events, ...settled.events]) };
};

const rollBarrage = (state: GameState): Transition => {
  const transaction = state.activeTransaction!;
  const events: RuleEvent[] = [];
  const preview = previewBarrage(state, transaction.ownerId, transaction.attackerIds, transaction.targetHexId);
  let next = consume(state, transaction.attackerPayments, transaction.id, events);
  const roll = rollTwoDice(next.rng);
  next = { ...next, rng: roll.rng };
  events.push({ kind: 'DICE_ROLLED', sequence: events.length, transactionId: transaction.id, purpose: 'BARRAGE', roll: roll.roll });
  const cell = BARRAGE_TABLE_ROWS[roll.roll.total]![preview.finalColumn]!;
  let result = parseBarrageResult(cell);
  // 10.0c: [1/2] is DG without a correct spotter or against a Level-3+ hedgehog (no air or ships in the ground game), else 1/2.
  if (result.kind === 'BRACKETED_HALF') {
    const dug = defendingHedgehogLevel(state, transaction.defenderOwnerId, transaction.targetHexId) >= HEDGEHOG_BRACKETED_LEVEL;
    result = preview.spotter && !dug ? { ...result, kind: 'HALF' } : { ...result, kind: 'DG' };
  }
  let losses = result.kind === 'STEPS' ? result.steps : 0;
  if (result.kind === 'HALF') {
    const die = rollDie(next.rng);
    next = { ...next, rng: die.rng };
    losses = die.value >= 4 ? 1 : 0;
  }
  if (result.kind !== 'NONE') next = setModeForHex(next, transaction.targetHexId, transaction.defenderOwnerId, events);
  next = {
    ...next,
    activeTransaction: {
      ...next.activeTransaction!, step: 'RESOLVING', roll: roll.roll, result: cell,
      queue: losses > 0 ? [{ kind: 'LOSS', side: 'DEFENDER', count: losses, distribution: 'FREE', pieceIds: transaction.defenderIds }] : [],
    },
  };
  const processed = processQueue(next);
  return { state: processed.state, events: [...events, ...processed.events.map((event, index) => ({ ...event, sequence: events.length + index }))] };
};

/** Hexes with an enemy combat unit adjacent to a friendly unit, for UI targeting. */
export const attackableHexes = (state: GameState, playerId: PlayerId): readonly HexId[] =>
  [...new Set(state.pieceState.pieces.filter((piece) => piece.ownerId !== playerId && isCombatUnit(state, piece) && hexOf(piece) !== null)
    .map((piece) => hexOf(piece)!))];
