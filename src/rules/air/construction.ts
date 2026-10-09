import type { HexId, PieceId, PlayerId } from '../../core/index.js';
import { upsertPieceState, type PieceDefinition, type PieceState } from '../../domain/piece/index.js';
import { nextStackOrder } from '../combat/combat.js';
import type { GameAction, GameState, RuleEvent, RuleViolation } from '../kernel/model.js';
import { definitionOf, hexOf, isEngineerCapable, opponentOf, pieceById, usageOf, withUsage } from '../pieces.js';
import { dumpsReaching, spendReservations, supplyPathCosts } from '../supply/supply.js';
import { violation } from '../validation/violation.js';
import { airBaseAt, airBaseLevel, AIR_BASE_FACILITY, AIR_STRIP_FACILITY, isAirStrip, withAirBaseLevel } from './aircraft.js';

/**
 * Engineer construction of Air Bases and Air Strips (13.8d, 15.2, 15.3). An Engineer-Capable unit in the Movement
 * Phase builds or improves one hex within a 2 MP Leg path of itself, paying SP drawn or thrown to that hex.
 */

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };
type BuildAction = Extract<GameAction, { readonly kind: 'BUILD_AIR_BASE' }>;

/** 15.3: building or improving one Air Base Level costs 1 SP (4 Tokens). */
export const AIR_BASE_LEVEL_TOKENS = 4;
/** 15.2A: an Air Strip costs 1T; upgrading it to a Level-1 Air Base costs 3T. */
export const AIR_STRIP_TOKENS = 1;
export const AIR_STRIP_UPGRADE_TOKENS = 3;
/** 15.3: Air Bases are never improved above Level 3. */
export const MAXIMUM_AIR_BASE_LEVEL = 3;
/** 13.8d: construction reaches a 2-hex radius, with terrain counted as Leg MP (4 ticks per MP). */
export const CONSTRUCTION_RADIUS_TICKS = 2 * 4;

/** Capability on a template Definition (generated with the side's air forces) that new Air Bases and Strips are made from. */
export const AIR_FACILITY_TEMPLATE = 'AIR_FACILITY_TEMPLATE';

export type BuildFacility = 'AIR_STRIP' | 'AIR_BASE';

export interface ConstructionPlan {
  readonly facility: BuildFacility;
  /** What the hex holds now. */
  readonly from: 'NOTHING' | 'AIR_STRIP' | 'AIR_BASE';
  readonly existing: PieceState | null;
  readonly cost: number;
  /** Level of the Air Base afterwards; 0 for an Air Strip. */
  readonly level: number;
}

export { isEngineerCapable };

const sideOf = (state: GameState, playerId: PlayerId) => state.scenario.players.find(({ id }) => id === playerId)?.sideDefinitionId ?? null;

/** The Definition a player's new Air Bases or Air Strips are made from, if the game provides one (15.2: "only if specifically allowed"). */
export const facilityTemplate = (state: GameState, playerId: PlayerId, facility: BuildFacility): PieceDefinition | undefined => {
  const wanted = facility === 'AIR_STRIP' ? AIR_STRIP_FACILITY : AIR_BASE_FACILITY;
  const side = sideOf(state, playerId);
  return state.scenario.pieceCatalog.definitions.find((definition) => definition.family === 'FACILITY'
    && definition.facility?.facilityTypeDefinitionId === wanted && definition.ownership.sideDefinitionId === side
    && definition.capabilities.some(({ id }) => id === AIR_FACILITY_TEMPLATE));
};

/** What building `facility` in `hexId` would do, or why it cannot be done. */
export const constructionPlan = (state: GameState, playerId: PlayerId, hexId: HexId, facility: BuildFacility): { readonly plan: ConstructionPlan } | { readonly problem: RuleViolation } => {
  const existing = airBaseAt(state, hexId) ?? null;
  if (existing && existing.ownerId !== playerId) {
    return { problem: violation('ENEMY_AIR_BASE', ['hexId'], 'An enemy Air Base holds this hex.', '15.0a') };
  }
  if (!facilityTemplate(state, playerId, facility)) {
    return { problem: violation('FACILITY_NOT_ALLOWED', ['facility'], facility === 'AIR_STRIP' ? 'This game provides no Air Strips.' : 'This game provides no Air Base counters to build.', facility === 'AIR_STRIP' ? '15.2' : '15.3') };
  }
  if (!existing) {
    return facility === 'AIR_STRIP'
      ? { plan: { facility, from: 'NOTHING', existing: null, cost: AIR_STRIP_TOKENS, level: 0 } }
      : { plan: { facility, from: 'NOTHING', existing: null, cost: AIR_BASE_LEVEL_TOKENS, level: 1 } };
  }
  if (isAirStrip(state, existing)) {
    return facility === 'AIR_BASE'
      ? { plan: { facility, from: 'AIR_STRIP', existing, cost: AIR_STRIP_UPGRADE_TOKENS, level: 1 } }
      : { problem: violation('ALREADY_AIR_STRIP', ['facility'], 'There is already an Air Strip here; upgrade it to an Air Base.', '15.0a') };
  }
  if (facility === 'AIR_STRIP') return { problem: violation('AIR_BASE_EXISTS', ['facility'], 'No more than one air base can exist in a hex.', '15.0a') };
  const level = airBaseLevel(state, existing);
  if (level >= MAXIMUM_AIR_BASE_LEVEL) return { problem: violation('AIR_BASE_MAXIMUM_LEVEL', ['hexId'], `This Air Base is already Level ${MAXIMUM_AIR_BASE_LEVEL}.`, '15.3') };
  return { plan: { facility, from: 'AIR_BASE', existing, cost: AIR_BASE_LEVEL_TOKENS, level: level + 1 } };
};

/** Hexes an Engineer-Capable unit can build in this phase: within 2 MP of Leg movement, enemy ZOC ignored (13.8d). */
export const constructionHexes = (state: GameState, engineer: PieceState): readonly HexId[] => {
  const origin = hexOf(engineer);
  if (origin === null) return [];
  return [...supplyPathCosts(state, engineer.ownerId, origin, 'leg', CONSTRUCTION_RADIUS_TICKS).keys()].sort();
};

/** Dumps that can pay for construction in `hexId` (12.3 Direct Draw or HQ Throw, as for any supply need). */
export const constructionSources = (state: GameState, playerId: PlayerId, hexId: HexId) => dumpsReaching(state, playerId, hexId);

const hasMoved = (state: GameState, piece: PieceState): boolean => {
  const usage = usageOf(state, piece);
  return usage.moved || usage.movementSpentTicks > 0;
};

export const validateBuildAirBase = (state: GameState, action: BuildAction): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const { phase, segment, phasingPlayerId } = state.sequence;
  if (phase !== 'MOVEMENT' || segment !== 'MOVEMENT' || action.actorId !== phasingPlayerId) {
    issues.push(violation('INVALID_CONSTRUCTION_PHASE', ['sequence'], 'Construction happens only in your own Movement Phase.', '13.8d'));
  }
  const engineer = pieceById(state, action.engineerId);
  if (!engineer || engineer.ownerId !== action.actorId || !isEngineerCapable(state, engineer)) {
    return [...issues, violation('NOT_ENGINEER_CAPABLE', ['engineerId'], 'Only an HQ or Engineer in Combat Mode (or DG oriented to Combat Mode) can build.', '13.8a')];
  }
  if (state.air.builderIds.includes(engineer.id)) issues.push(violation('ENGINEER_ALREADY_BUILT', ['engineerId'], 'An Engineer-Capable unit constructs in a single hex per phase.', '13.8d'));
  else if (hasMoved(state, engineer)) issues.push(violation('ENGINEER_MOVED', ['engineerId'], 'An Engineer-Capable unit cannot move in the phase it performs construction.', '13.8d'));
  if (!constructionHexes(state, engineer).includes(action.hexId)) {
    issues.push(violation('CONSTRUCTION_OUT_OF_RANGE', ['hexId'], 'Construction reaches only a 2-hex radius (counted as Leg MP, enemy ZOC ignored).', '13.8d'));
  }
  if (state.air.builtHexIds.includes(action.hexId)) issues.push(violation('LEVEL_ONE_PER_TURN', ['hexId'], 'An Air Base Level rises by only one per turn.', '15.3'));
  const planned = constructionPlan(state, action.actorId, action.hexId, action.facility);
  if ('problem' in planned) return [...issues, planned.problem];
  // One type of construction per unit and phase is implied by "one hex, one task"; a second order is refused above.
  const sources = constructionSources(state, action.actorId, action.hexId);
  let total = 0;
  const used = new Set<PieceId>();
  for (const [index, payment] of action.payments.entries()) {
    const source = sources.find(({ pieceId }) => pieceId === payment.sourcePieceId);
    if (!source || used.has(payment.sourcePieceId) || !Number.isInteger(payment.tokens) || payment.tokens <= 0 || payment.tokens > source.availableQuantity) {
      issues.push(violation('CONSTRUCTION_SUPPLY_UNAVAILABLE', ['payments', index], 'Pay from distinct dumps whose supply can be drawn or thrown to the construction hex.', '12.9'));
    } else {
      used.add(payment.sourcePieceId);
      total += payment.tokens;
    }
  }
  if (total !== planned.plan.cost) {
    issues.push(violation('CONSTRUCTION_COST', ['payments'], `This construction costs exactly ${planned.plan.cost}T of supply (${total}T offered).`, action.facility === 'AIR_STRIP' || planned.plan.from === 'AIR_STRIP' ? '15.2A' : '15.3'));
  }
  return issues;
};

export const applyBuildAirBase = (state: GameState, action: BuildAction): Transition => {
  const planned = constructionPlan(state, action.actorId, action.hexId, action.facility);
  if (!('plan' in planned)) throw new Error('Construction was validated before it was applied.');
  const { plan } = planned;
  const events: RuleEvent[] = [];
  let pieceState = state.pieceState;
  for (const payment of action.payments) {
    const dump = pieceById(state, payment.sourcePieceId)!;
    const unit = definitionOf(state, dump)!.resource!.unitDefinitionId;
    pieceState = spendReservations({ ...state, pieceState }, [{ resourcePieceId: dump.id, quantity: payment.tokens, unitDefinitionId: unit }]);
    events.push({ kind: 'SUPPLY_SPENT', sequence: events.length, resourcePieceId: dump.id, quantity: payment.tokens });
  }
  let builtId: PieceId;
  if (plan.existing) {
    // Improving a base raises its Level; upgrading a strip turns the same counter into a Level-1 Air Base.
    builtId = plan.existing.id;
    const template = plan.from === 'AIR_STRIP' ? facilityTemplate(state, action.actorId, 'AIR_BASE')! : null;
    const base: PieceState = template ? { ...plan.existing, definitionId: template.id } : plan.existing;
    pieceState = upsertPieceState(pieceState, withAirBaseLevel(base, plan.level));
  } else {
    const template = facilityTemplate(state, action.actorId, plan.facility)!;
    builtId = `air-built:${action.actorId}:${state.sequence.gameTurn}:${action.hexId}` as PieceId;
    const fresh: PieceState = {
      id: builtId, definitionId: template.id, ownerId: action.actorId, location: { kind: 'ON_MAP', hexId: action.hexId },
      currentFaceId: null, remainingSteps: null, mode: null, statuses: [], resourceQuantity: null,
      stackOrder: nextStackOrder(pieceState.pieces, action.hexId, builtId),
    };
    pieceState = upsertPieceState(pieceState, plan.level > 0 ? withAirBaseLevel(fresh, plan.level) : fresh);
  }
  events.push({ kind: 'AIR_BASE_BUILT', sequence: events.length, pieceId: builtId, hexId: action.hexId, level: plan.level, strip: plan.level === 0 });
  const engineer = pieceById(state, action.engineerId)!;
  const next: GameState = {
    ...state,
    pieceState,
    usage: withUsage(state, { ...usageOf(state, engineer), moved: true }),
    air: { ...state.air, builtHexIds: [...state.air.builtHexIds, action.hexId], builderIds: [...state.air.builderIds, action.engineerId] },
  };
  return { state: next, events };
};

/** 13.8d: an Engineer-Capable unit that has built (or reduced) this phase may not move. */
export const hasConstructed = (state: GameState, pieceId: PieceId): boolean => state.air.builderIds.includes(pieceId);

/** Bases and strips this engineer could build or improve right now, for candidate generation and the UI. */
export const constructionOptions = (state: GameState, engineer: PieceState): readonly { readonly hexId: HexId; readonly plan: ConstructionPlan }[] => {
  if (!isEngineerCapable(state, engineer) || state.air.builderIds.includes(engineer.id) || hasMoved(state, engineer)) return [];
  const options: { hexId: HexId; plan: ConstructionPlan }[] = [];
  for (const hexId of constructionHexes(state, engineer)) {
    if (state.air.builtHexIds.includes(hexId) || opponentHasUnits(state, engineer.ownerId, hexId)) continue;
    for (const facility of ['AIR_BASE', 'AIR_STRIP'] as const) {
      const planned = constructionPlan(state, engineer.ownerId, hexId, facility);
      if ('plan' in planned && constructionSources(state, engineer.ownerId, hexId).reduce((sum, { availableQuantity }) => sum + availableQuantity, 0) >= planned.plan.cost) {
        options.push({ hexId, plan: planned.plan });
      }
    }
  }
  return options;
};

const opponentHasUnits = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  state.pieceState.pieces.some((piece) => piece.ownerId === opponentOf(state, playerId) && piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId);

/**
 * Pay `cost` Tokens from the largest dumps first. Used by the UI and candidate generation so a legal order is always available
 * when the dumps together hold enough.
 */
export const largestFirstPayments = (state: GameState, playerId: PlayerId, hexId: HexId, cost: number): readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[] | null => {
  const payments: { sourcePieceId: PieceId; tokens: number }[] = [];
  let remaining = cost;
  for (const source of constructionSources(state, playerId, hexId)) {
    if (remaining <= 0) break;
    const tokens = Math.min(remaining, source.availableQuantity);
    payments.push({ sourcePieceId: source.pieceId, tokens });
    remaining -= tokens;
  }
  return remaining === 0 ? payments : null;
};
