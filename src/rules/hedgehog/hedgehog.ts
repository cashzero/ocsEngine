import { parseDefinitionId, type DefinitionId, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { upsertPieceState, type PieceDefinition, type PieceState } from '../../domain/piece/index.js';
import type { GameAction, GameState, RuleEvent, RuleViolation } from '../kernel/model.js';
import {
  definitionOf,
  hexOf,
  isCombatUnit,
  opponentOf,
  pieceById,
  piecesAt,
  reTicksOf,
  usageOf,
  withStatus,
  withUsage,
} from '../pieces.js';
import { dumpsReaching, spendReservations } from '../supply/supply.js';
import { violation } from '../validation/violation.js';
import { constructionHexes, hasConstructed, isEngineerCapable } from '../air/construction.js';

/**
 * Hedgehogs (16.0): field works, wire and mines that protect a hex. A hedgehog is a non-combat counter of Level 1-4
 * that never moves, never needs supply, and is captured when an enemy Attack-Capable unit enters its hex (9.14e).
 * One RE of Combat Mode units that do not move (or an Engineer-Capable unit within 2 hexes, 13.8d) builds or improves
 * one Level for 2 SP, or reduces one Level for free, in the Movement Phase; a hex rises or falls one Level per turn.
 */

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };
type BuildAction = Extract<GameAction, { readonly kind: 'BUILD_HEDGEHOG' }>;
type ReduceAction = Extract<GameAction, { readonly kind: 'REDUCE_HEDGEHOG' }>;

const statusId = (value: string): DefinitionId => {
  const parsed = parseDefinitionId(value);
  if (!parsed.ok) throw new Error(`Status ID ${value} is invalid.`);
  return parsed.value;
};

export const HEDGEHOG_FACILITY = 'facility:hedgehog';
/** Capability on each side's hedgehog Definition: new and scenario hedgehogs are counters of it. */
export const HEDGEHOG_TEMPLATE = 'HEDGEHOG_TEMPLATE';
/** 16.0a: the hedgehog's Level (1-4). Printed on the counter, so the enemy sees it (4.9a). */
export const HEDGEHOG_LEVEL_STATUS = statusId('status:hedgehog-level');
/** Game Turn in which the hex's Level last rose or fell: each changes by one per turn (16.0b, 16.0c). */
export const HEDGEHOG_RAISED_TURN_STATUS = statusId('status:hedgehog-raised-turn');
export const HEDGEHOG_LOWERED_TURN_STATUS = statusId('status:hedgehog-lowered-turn');

/** 16.0a: no hedgehog can ever exceed Level 4. */
export const MAXIMUM_HEDGEHOG_LEVEL = 4;
/** 16.0b: each Level costs 2 SP (8 Tokens). */
export const HEDGEHOG_LEVEL_TOKENS = 8;
/** 16.0b, 16.0c: the work needs one RE of units (4 ticks). */
const ONE_RE_TICKS = 4;
/** 16.0d: a hedgehog of any Level gives the defender -1 on the Surprise roll. */
export const HEDGEHOG_SURPRISE_DRM = -1;
/** 10.0a: a hedgehog of any Level shifts the Barrage Table one column left. */
export const HEDGEHOG_BARRAGE_SHIFT = -1;
/** 10.0c: [1/2] is DG against a target in a Level-3 or higher hedgehog. */
export const HEDGEHOG_BRACKETED_LEVEL = 3;

export const isHedgehog = (state: GameState, piece: PieceState): boolean =>
  definitionOf(state, piece)?.facility?.facilityTypeDefinitionId === HEDGEHOG_FACILITY;

const integerStatus = (piece: PieceState, id: DefinitionId): number | null => {
  const value = piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === id)?.value;
  return value?.kind === 'INTEGER' ? value.value : null;
};

export const hedgehogLevel = (piece: PieceState): number => integerStatus(piece, HEDGEHOG_LEVEL_STATUS) ?? 1;

export const withHedgehogLevel = (piece: PieceState, level: number): PieceState =>
  withStatus(piece, HEDGEHOG_LEVEL_STATUS, { kind: 'INTEGER', value: level });

/** 16.0g: never more than one hedgehog in a hex. */
export const hedgehogAt = (state: GameState, hexId: HexId): PieceState | undefined =>
  state.pieceState.pieces.find((piece) => piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId && isHedgehog(state, piece));

/** Level of the hedgehog that protects `ownerId`'s units in `hexId`, 0 when there is none. */
export const defendingHedgehogLevel = (state: GameState, ownerId: PlayerId, hexId: HexId): number => {
  const hog = hedgehogAt(state, hexId);
  return hog && hog.ownerId === ownerId ? hedgehogLevel(hog) : 0;
};

export const friendlyHedgehogs = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && isHedgehog(state, piece))
    .sort((left, right) => String(hexOf(left)).localeCompare(String(hexOf(right))));

const sideOf = (state: GameState, playerId: PlayerId) => state.scenario.players.find(({ id }) => id === playerId)?.sideDefinitionId ?? null;

/** The Definition a player's hedgehogs are counters of; games made before hedgehogs have none. */
export const hedgehogTemplate = (state: GameState, playerId: PlayerId): PieceDefinition | undefined => {
  const side = sideOf(state, playerId);
  return state.scenario.pieceCatalog.definitions.find((definition) => definition.family === 'FACILITY'
    && definition.facility?.facilityTypeDefinitionId === HEDGEHOG_FACILITY && definition.ownership.sideDefinitionId === side
    && definition.capabilities.some(({ id }) => id === HEDGEHOG_TEMPLATE));
};

const changedThisTurn = (state: GameState, piece: PieceState | undefined, status: DefinitionId): boolean =>
  piece !== undefined && integerStatus(piece, status) === state.sequence.gameTurn;

const movedThisPhase = (state: GameState, piece: PieceState): boolean => {
  const usage = usageOf(state, piece);
  return usage.moved || usage.movementSpentTicks > 0;
};

const workPhaseIssues = (state: GameState, actorId: PlayerId, rule: string): RuleViolation[] => {
  const { phase, segment, phasingPlayerId } = state.sequence;
  return phase !== 'MOVEMENT' || segment !== 'MOVEMENT' || actorId !== phasingPlayerId
    ? [violation('INVALID_HEDGEHOG_PHASE', ['sequence'], 'Hedgehogs are built and reduced only in your own Movement Phase.', rule)]
    : [];
};

/**
 * Who does the work (16.0b, 16.0c): one RE of friendly Combat Mode units in the hex that have not moved, or an
 * Engineer-Capable unit (13.8a) that has not moved or constructed this phase, with the hex in its 2-hex radius (13.8d).
 */
const workerIssues = (state: GameState, actorId: PlayerId, hexId: HexId, pieceIds: readonly PieceId[], engineerId: PieceId | null | undefined, rule: string): RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (engineerId) {
    const engineer = pieceById(state, engineerId);
    if (pieceIds.length > 0) issues.push(violation('HEDGEHOG_ONE_CREW', ['pieceIds'], 'Either one RE of units in the hex or one Engineer-Capable unit does the work.', rule));
    if (!engineer || engineer.ownerId !== actorId || !isEngineerCapable(state, engineer)) {
      return [...issues, violation('NOT_ENGINEER_CAPABLE', ['engineerId'], 'Only an HQ or Engineer in Combat Mode (or DG oriented to Combat Mode) can do engineer work.', '13.8a')];
    }
    if (hasConstructed(state, engineer.id)) issues.push(violation('ENGINEER_ALREADY_BUILT', ['engineerId'], 'An Engineer-Capable unit constructs in a single hex per phase.', '13.8d'));
    else if (movedThisPhase(state, engineer)) issues.push(violation('ENGINEER_MOVED', ['engineerId'], 'An Engineer-Capable unit cannot move in the phase it performs construction.', '13.8d'));
    if (!constructionHexes(state, engineer).includes(hexId)) issues.push(violation('CONSTRUCTION_OUT_OF_RANGE', ['hexId'], 'Construction reaches only a 2-hex radius (counted as Leg MP, enemy ZOC ignored).', '13.8d'));
    return issues;
  }
  if (pieceIds.length === 0 || new Set(pieceIds).size !== pieceIds.length) {
    return [violation('HEDGEHOG_NEEDS_CREW', ['pieceIds'], 'Choose the distinct units that do the work.', rule)];
  }
  let ticks = 0;
  for (const [index, id] of pieceIds.entries()) {
    const piece = pieceById(state, id);
    if (!piece || piece.ownerId !== actorId || !isCombatUnit(state, piece) || hexOf(piece) !== hexId) {
      issues.push(violation('HEDGEHOG_CREW_NOT_IN_HEX', ['pieceIds', index], 'The units doing the work must be friendly combat units in the hex.', rule));
      continue;
    }
    // 5.10e: only engineers keep working while DG; other units must be in Combat Mode.
    if (piece.mode !== 'COMBAT') issues.push(violation('HEDGEHOG_CREW_NOT_COMBAT_MODE', ['pieceIds', index], 'The units doing the work must be in Combat Mode.', rule));
    if (movedThisPhase(state, piece)) issues.push(violation('HEDGEHOG_CREW_MOVED', ['pieceIds', index], 'Units that moved this phase cannot do the work.', rule));
    ticks += reTicksOf(state, piece);
  }
  if (ticks < ONE_RE_TICKS) issues.push(violation('HEDGEHOG_NEEDS_ONE_RE', ['pieceIds'], 'One RE of units is needed for the work.', rule));
  return issues;
};

/** Dumps that can pay for a hedgehog in `hexId` (12.3 Direct Draw or HQ Throw). */
export const hedgehogSources = (state: GameState, playerId: PlayerId, hexId: HexId) => dumpsReaching(state, playerId, hexId);

/** Why `hexId` cannot gain a friendly hedgehog Level now, if it cannot (the workers aside). */
export const hedgehogBuildProblem = (state: GameState, playerId: PlayerId, hexId: HexId): RuleViolation | null => {
  if (!hedgehogTemplate(state, playerId)) return violation('HEDGEHOGS_NOT_AVAILABLE', ['hexId'], 'This game provides no hedgehog counters.', '16.0');
  if (!state.scenario.mapDefinition.hexes.some(({ id }) => id === hexId)) return violation('UNKNOWN_HEX', ['hexId'], 'Unknown hex.', '16.0b');
  const existing = hedgehogAt(state, hexId);
  if (existing && existing.ownerId !== playerId) return violation('ENEMY_HEDGEHOG', ['hexId'], 'An enemy hedgehog holds this hex.', '16.0g');
  if (piecesAt(state, hexId).some((piece) => piece.ownerId === opponentOf(state, playerId))) {
    return violation('ENEMY_IN_HEX', ['hexId'], 'Hedgehogs cannot be built in a hex with enemy units.', '16.0b');
  }
  if (existing && hedgehogLevel(existing) >= MAXIMUM_HEDGEHOG_LEVEL) return violation('HEDGEHOG_MAXIMUM_LEVEL', ['hexId'], `No hedgehog can exceed Level ${MAXIMUM_HEDGEHOG_LEVEL}.`, '16.0a');
  if (changedThisTurn(state, existing, HEDGEHOG_RAISED_TURN_STATUS)) return violation('HEDGEHOG_ONE_LEVEL_PER_TURN', ['hexId'], 'A hex\'s Hedgehog Level rises by only one per turn.', '16.0b');
  // 5.7g: no Reserve Mode unit may be stacked with a hedgehog at the end of a Movement Segment, and reserves cannot leave.
  if (piecesAt(state, hexId).some((piece) => piece.ownerId === playerId && piece.mode === 'RESERVE')) {
    return violation('HEDGEHOG_WITH_RESERVES', ['hexId'], 'Reserve Mode units cannot stack with a hedgehog.', '5.7g');
  }
  return null;
};

export const validateBuildHedgehog = (state: GameState, action: BuildAction): readonly RuleViolation[] => {
  const issues = [...workPhaseIssues(state, action.actorId, '16.0b')];
  const problem = hedgehogBuildProblem(state, action.actorId, action.hexId);
  if (problem) return [...issues, problem];
  issues.push(...workerIssues(state, action.actorId, action.hexId, action.pieceIds, action.engineerId, '16.0b'));
  const sources = hedgehogSources(state, action.actorId, action.hexId);
  let total = 0;
  const used = new Set<PieceId>();
  for (const [index, payment] of action.payments.entries()) {
    const source = sources.find(({ pieceId }) => pieceId === payment.sourcePieceId);
    if (!source || used.has(payment.sourcePieceId) || !Number.isInteger(payment.tokens) || payment.tokens <= 0 || payment.tokens > source.availableQuantity) {
      issues.push(violation('CONSTRUCTION_SUPPLY_UNAVAILABLE', ['payments', index], 'Pay from distinct dumps whose supply can be drawn or thrown to the hedgehog hex.', '12.9'));
    } else {
      used.add(payment.sourcePieceId);
      total += payment.tokens;
    }
  }
  if (total !== HEDGEHOG_LEVEL_TOKENS) {
    issues.push(violation('CONSTRUCTION_COST', ['payments'], `A hedgehog Level costs exactly ${HEDGEHOG_LEVEL_TOKENS}T (2 SP) of supply (${total}T offered).`, '16.0b'));
  }
  return issues;
};

/** The units (and engineer) doing the work do not move this phase; an engineer has constructed (13.8d). */
const markWorkers = (state: GameState, pieceIds: readonly PieceId[], engineerId: PieceId | null | undefined): GameState => {
  let next = state;
  for (const id of engineerId ? [...pieceIds, engineerId] : pieceIds) {
    next = { ...next, usage: withUsage(next, { ...usageOf(next, pieceById(next, id)!), moved: true }) };
  }
  return engineerId ? { ...next, air: { ...next.air, builderIds: [...next.air.builderIds, engineerId] } } : next;
};

export const applyBuildHedgehog = (state: GameState, action: BuildAction): Transition => {
  const events: RuleEvent[] = [];
  let pieceState = state.pieceState;
  for (const payment of action.payments) {
    const dump = pieceById(state, payment.sourcePieceId)!;
    const unit = definitionOf(state, dump)!.resource!.unitDefinitionId;
    pieceState = spendReservations({ ...state, pieceState }, [{ resourcePieceId: dump.id, quantity: payment.tokens, unitDefinitionId: unit }]);
    events.push({ kind: 'SUPPLY_SPENT', sequence: events.length, resourcePieceId: dump.id, quantity: payment.tokens });
  }
  const existing = hedgehogAt(state, action.hexId);
  const level = existing ? hedgehogLevel(existing) + 1 : 1;
  const hog: PieceState = existing ?? (() => {
    const id = `hedgehog:${action.actorId}:${state.sequence.gameTurn}:${action.hexId}` as PieceId;
    // 4.8bF: the hedgehog is the top ground counter of its hex.
    const top = Math.max(-1, ...pieceState.pieces.filter((piece) => hexOf(piece) === action.hexId).map(({ stackOrder }) => stackOrder));
    return {
      id, definitionId: hedgehogTemplate(state, action.actorId)!.id, ownerId: action.actorId, location: { kind: 'ON_MAP', hexId: action.hexId },
      currentFaceId: null, remainingSteps: null, mode: null, statuses: [], resourceQuantity: null, stackOrder: top + 1,
    };
  })();
  const built = withStatus(withHedgehogLevel(hog, level), HEDGEHOG_RAISED_TURN_STATUS, { kind: 'INTEGER', value: state.sequence.gameTurn });
  pieceState = upsertPieceState(pieceState, built);
  events.push({ kind: 'HEDGEHOG_LEVEL_CHANGED', sequence: events.length, pieceId: built.id, hexId: action.hexId, level });
  return { state: markWorkers({ ...state, pieceState }, action.pieceIds, action.engineerId), events };
};

export const validateReduceHedgehog = (state: GameState, action: ReduceAction): readonly RuleViolation[] => {
  const issues = [...workPhaseIssues(state, action.actorId, '16.0c')];
  const hog = pieceById(state, action.hedgehogId);
  if (!hog || !isHedgehog(state, hog) || hog.ownerId !== action.actorId || hexOf(hog) === null) {
    return [...issues, violation('UNKNOWN_HEDGEHOG', ['hedgehogId'], 'Only a friendly hedgehog can be reduced (never by enemy action).', '3.3c')];
  }
  if (changedThisTurn(state, hog, HEDGEHOG_LOWERED_TURN_STATUS)) issues.push(violation('HEDGEHOG_ONE_LEVEL_PER_TURN', ['hedgehogId'], 'A hex\'s Hedgehog Level falls by only one per turn.', '16.0c'));
  issues.push(...workerIssues(state, action.actorId, hexOf(hog)!, action.pieceIds, action.engineerId, '16.0c'));
  return issues;
};

export const applyReduceHedgehog = (state: GameState, action: ReduceAction): Transition => {
  const hog = pieceById(state, action.hedgehogId)!;
  const hexId = hexOf(hog)!;
  const level = hedgehogLevel(hog) - 1;
  // 16.0c: a hedgehog reduced below Level 1 is removed.
  const reduced: PieceState = level > 0
    ? withStatus(withHedgehogLevel(hog, level), HEDGEHOG_LOWERED_TURN_STATUS, { kind: 'INTEGER', value: state.sequence.gameTurn })
    : { ...hog, location: { kind: 'ELIMINATED' } };
  const next = markWorkers({ ...state, pieceState: upsertPieceState(state.pieceState, reduced) }, action.pieceIds, action.engineerId);
  return { state: next, events: [{ kind: 'HEDGEHOG_LEVEL_CHANGED', sequence: 0, pieceId: hog.id, hexId, level }] };
};

/** 9.14e: an Attack-Capable unit entering a hex with an enemy hedgehog captures it (Level unchanged; 21.11c is optional). */
export const captureHedgehog = (state: GameState, capturerId: PlayerId, hexId: HexId, events: RuleEvent[]): GameState => {
  const hog = hedgehogAt(state, hexId);
  if (!hog || hog.ownerId === capturerId) return state;
  events.push({ kind: 'HEDGEHOG_CAPTURED', sequence: events.length, pieceId: hog.id, hexId, capturerId, level: hedgehogLevel(hog) });
  return { ...state, pieceState: upsertPieceState(state.pieceState, { ...hog, ownerId: capturerId }) };
};

// ─── Candidates ───────────────────────────────────────────────────────────────────────────────

/** Friendly Combat Mode units in `hexId` that have not moved, up to one RE (largest first so the crew stays small). */
export const hedgehogCrew = (state: GameState, playerId: PlayerId, hexId: HexId): readonly PieceId[] | null => {
  const ready = piecesAt(state, hexId).filter((piece) => piece.ownerId === playerId && isCombatUnit(state, piece) && piece.mode === 'COMBAT' && !movedThisPhase(state, piece))
    .sort((left, right) => reTicksOf(state, right) - reTicksOf(state, left) || String(left.id).localeCompare(String(right.id)));
  const crew: PieceId[] = [];
  let ticks = 0;
  for (const piece of ready) {
    if (ticks >= ONE_RE_TICKS) break;
    crew.push(piece.id);
    ticks += reTicksOf(state, piece);
  }
  return ticks >= ONE_RE_TICKS ? crew : null;
};

/** Pay the 8T from the largest dumps first; null when the dumps reaching the hex hold less. */
export const hedgehogPayments = (state: GameState, playerId: PlayerId, hexId: HexId): readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[] | null => {
  const payments: { sourcePieceId: PieceId; tokens: number }[] = [];
  let remaining = HEDGEHOG_LEVEL_TOKENS;
  for (const source of [...hedgehogSources(state, playerId, hexId)].sort((left, right) => right.availableQuantity - left.availableQuantity || String(left.pieceId).localeCompare(String(right.pieceId)))) {
    if (remaining <= 0) break;
    const tokens = Math.min(remaining, source.availableQuantity);
    if (tokens <= 0) continue;
    payments.push({ sourcePieceId: source.pieceId, tokens });
    remaining -= tokens;
  }
  return remaining === 0 ? payments : null;
};

export interface HedgehogWork {
  readonly hexId: HexId;
  readonly pieceIds: readonly PieceId[];
  readonly engineerId: PieceId | null;
}

/** Hexes where `playerId` could raise a hedgehog now and who would do it, crews in the hex before engineers. */
export const hedgehogBuildOptions = (state: GameState, playerId: PlayerId, pieceId: PieceId | null): readonly HedgehogWork[] => {
  if (!hedgehogTemplate(state, playerId)) return [];
  const own = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP');
  const options: HedgehogWork[] = [];
  const hexes = [...new Set(own.filter((piece) => isCombatUnit(state, piece) && piece.mode === 'COMBAT').map((piece) => hexOf(piece)!))].sort();
  for (const hexId of hexes) {
    const crew = hedgehogCrew(state, playerId, hexId);
    if (!crew || (pieceId !== null && !crew.includes(pieceId)) || hedgehogBuildProblem(state, playerId, hexId)) continue;
    options.push({ hexId, pieceIds: crew, engineerId: null });
  }
  for (const engineer of own.filter((piece) => (pieceId === null || piece.id === pieceId) && isEngineerCapable(state, piece) && !hasConstructed(state, piece.id) && !movedThisPhase(state, piece))) {
    for (const hexId of constructionHexes(state, engineer)) {
      if (!hedgehogBuildProblem(state, playerId, hexId)) options.push({ hexId, pieceIds: [], engineerId: engineer.id });
    }
  }
  return options;
};

/** Friendly hedgehogs `playerId` could reduce now and who would do it. */
export const hedgehogReduceOptions = (state: GameState, playerId: PlayerId, pieceId: PieceId | null): readonly (HedgehogWork & { readonly hedgehogId: PieceId })[] => {
  const options: (HedgehogWork & { hedgehogId: PieceId })[] = [];
  const hogs = friendlyHedgehogs(state, playerId).filter((hog) => !changedThisTurn(state, hog, HEDGEHOG_LOWERED_TURN_STATUS));
  for (const hog of hogs) {
    const crew = hedgehogCrew(state, playerId, hexOf(hog)!);
    if (crew && (pieceId === null || pieceId === hog.id || crew.includes(pieceId))) options.push({ hedgehogId: hog.id, hexId: hexOf(hog)!, pieceIds: crew, engineerId: null });
  }
  const engineers = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && (pieceId === null || piece.id === pieceId)
    && isEngineerCapable(state, piece) && !hasConstructed(state, piece.id) && !movedThisPhase(state, piece));
  for (const engineer of engineers) {
    const reach = new Set(constructionHexes(state, engineer));
    for (const hog of hogs.filter((candidate) => reach.has(hexOf(candidate)!))) options.push({ hedgehogId: hog.id, hexId: hexOf(hog)!, pieceIds: [], engineerId: engineer.id });
  }
  return options;
};
