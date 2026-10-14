import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { upsertPieceRelation, upsertPieceState, type PieceDefinition, type PieceState } from '../../domain/piece/index.js';
import { parseRuleDecisionId } from '../kernel/ids.js';
import type { GameState, PendingDecision, RuleEvent, RuleViolation } from '../kernel/model.js';
import { phaseAllowsMovement } from '../movement/movement.js';
import {
  INTERNAL_STOCKS_STATUS,
  OUT_OF_SUPPLY_STATUS,
  RETURN_TURN_STATUS,
  TRANSPORT_POINTS_STATUS,
  UNIT_NAME_STATUS,
  combatClass,
  definitionOf,
  emptyUsage,
  hexOf,
  isEligibleMover,
  isMoving,
  nextOrderAt,
  pieceById,
  printedSteps,
  usageOf,
  withStatus,
  withUsage,
} from '../pieces.js';
import { violation } from '../validation/violation.js';

/**
 * Breakdowns (20.0). A multi-step "Other" unit carries the `BREAKDOWN` capability naming the generic Breakdown Definition
 * of its pool (20.0g). A Breakdown counter carries `BREAKDOWN_UNIT`.
 *
 * Unlike the board game, each Breakdown is linked to the division that detached it (a PARENT relation) and numbered
 * after it ("1/101.Abn", "2/101.Abn"); the generic Definition still sets its printed values.
 */
export const BREAKDOWN_CAPABILITY = 'BREAKDOWN';
export const BREAKDOWN_UNIT_CAPABILITY = 'BREAKDOWN_UNIT';

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };

export interface BreakdownProfile {
  /** The Breakdown Definition this unit creates and absorbs (its pool, 20.0g). */
  readonly definition: PieceDefinition;
}

const textParameter = (definition: PieceDefinition | undefined, capability: string, key: string): string | null => {
  const parameter = definition?.capabilities.find(({ id }) => id === capability)?.parameters.find((entry) => entry.key === key);
  return parameter?.kind === 'TEXT' ? parameter.value : null;
};

export const breakdownProfile = (state: GameState, piece: PieceState): BreakdownProfile | null => {
  const definitionId = textParameter(definitionOf(state, piece), BREAKDOWN_CAPABILITY, 'definitionId');
  const definition = definitionId === null ? undefined : state.scenario.pieceCatalog.definitions.find(({ id }) => id === definitionId);
  return definition ? { definition } : null;
};

export const isBreakdown = (state: GameState, piece: PieceState): boolean =>
  definitionOf(state, piece)?.capabilities.some(({ id }) => id === BREAKDOWN_UNIT_CAPABILITY) ?? false;

/** The division that detached this Breakdown, if it is still known. */
export const breakdownParentId = (state: GameState, piece: PieceState): PieceId | null => {
  for (const relation of state.pieceState.relations) {
    if (relation.kind === 'PARENT' && relation.childId === piece.id) return relation.parentId;
  }
  return null;
};

export const pieceNameOf = (piece: PieceState): string | null => {
  const value = piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === UNIT_NAME_STATUS)?.value;
  return value?.kind === 'TEXT' ? value.value : null;
};

const inPlay = (piece: PieceState): boolean => piece.location.kind !== 'ELIMINATED';

/** Printed Action Rating of the unit's current step; 20.0b compares printed ratings. */
const printedActionRating = (definition: PieceDefinition, faceId: string | null, steps: number | null): number => {
  const face = definition.faces.find(({ id }) => id === faceId) ?? definition.faces[0];
  const step = face?.steps.find(({ remainingSteps }) => remainingSteps === steps) ?? face?.steps.at(-1);
  return step?.actionRating ?? 0;
};

const ratingOf = (state: GameState, piece: PieceState): number =>
  printedActionRating(definitionOf(state, piece)!, piece.currentFaceId, piece.remainingSteps);

/** A new Breakdown's printed AR when detached from `parent` (same face as the parent). */
const breakdownRating = (profile: BreakdownProfile, parent: PieceState): number =>
  printedActionRating(profile.definition, parent.currentFaceId, 1);

/** The division's next Breakdown name: the lowest number not in play ("1/101.Abn", "2/101.Abn"...). */
export const nextBreakdownName = (state: GameState, parent: PieceState): string => {
  const division = definitionOf(state, parent)?.name ?? 'Division';
  const used = new Set(state.pieceState.pieces
    .filter((piece) => piece.ownerId === parent.ownerId && inPlay(piece))
    .flatMap((piece) => pieceNameOf(piece) ?? []));
  let ordinal = 1;
  while (used.has(`${ordinal}/${division}`)) ordinal += 1;
  return `${ordinal}/${division}`;
};

export const validateCreateBreakdown = (state: GameState, actorId: PlayerId, pieceId: PieceId): readonly RuleViolation[] => {
  const piece = pieceById(state, pieceId);
  if (!piece) return [violation('UNKNOWN_PIECE', ['pieceId'], 'Unknown Piece.', '20.0')];
  const issues: RuleViolation[] = [];
  if (piece.ownerId !== actorId) issues.push(violation('NOT_PIECE_OWNER', ['actorId'], 'Actor does not own the unit.', '6.3a'));
  if (actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Only the player now moving units can detach Breakdowns.', '20.0a'));
  if (!phaseAllowsMovement(state)) issues.push(violation('INVALID_MOVEMENT_PHASE', ['sequence'], 'Breakdowns are detached when a unit begins to move, in a Movement Segment.', '20.0a'));
  if (piece.location.kind !== 'ON_MAP') issues.push(violation('PIECE_NOT_ON_MAP', ['pieceId'], 'The unit must be on the map.', '20.0'));
  const capability = breakdownCapabilityViolations(state, piece);
  if (capability.length > 0 || issues.length > 0) return [...issues, ...capability];
  if (!isEligibleMover(state, piece)) issues.push(violation('BREAKDOWN_NOT_MOVING', ['pieceId'], 'Only a unit that may move in this phase can detach Breakdowns.', '20.0a'));
  const usage = usageOf(state, piece);
  if (usage.moved && !isMoving(state, piece.id)) issues.push(violation('MOVEMENT_ALREADY_FINISHED', ['pieceId'], 'This unit has finished moving this phase.', '6.1g'));
  else if (usage.movementSpentTicks > 0) issues.push(violation('BREAKDOWN_AFTER_MOVE_BEGAN', ['pieceId'], 'Breakdowns are detached as the unit begins to move, before it spends any MP.', '20.0a'));
  if (usage.negationLocked) issues.push(violation('NEGATING_UNIT_LOCKED', ['pieceId'], 'This unit negated an enemy ZOC and cannot move this phase.', '4.5b'));
  return issues;
};

/**
 * Whether this unit can create a Breakdown at all, whatever the timing (20.0, 20.0b): a multi-step "Other" unit with a
 * pool, not on its last step, whose pool's Breakdown has an Action Rating no higher than its own. Retreats and advances
 * after combat (20.0a) check only this.
 */
export const breakdownCapabilityViolations = (state: GameState, piece: PieceState): readonly RuleViolation[] => {
  const profile = breakdownProfile(state, piece);
  if (!profile || printedSteps(state, piece) < 2) {
    return [violation('BREAKDOWN_NOT_CAPABLE', ['pieceId'], 'Only multi-step units with a Breakdown pool can detach Breakdowns.', '20.0')];
  }
  const issues: RuleViolation[] = [];
  if (combatClass(state, piece) !== 'OTHER') issues.push(violation('BREAKDOWN_ARMOR_OR_MECH', ['pieceId'], 'Armor and Mech units cannot create Breakdowns; only "Other" units can.', '20.0'));
  if ((piece.remainingSteps ?? 0) < 2) issues.push(violation('BREAKDOWN_LAST_STEP', ['pieceId'], 'A unit\'s last step can never become a Breakdown.', '20.0'));
  if (breakdownRating(profile, piece) > ratingOf(state, piece)) {
    issues.push(violation('BREAKDOWN_RATING_TOO_HIGH', ['pieceId'], 'A unit can only create a Breakdown with an Action Rating equal to or less than its own.', '20.0b'));
  }
  return issues;
};

export const mayCreateBreakdown = (state: GameState, piece: PieceState): boolean =>
  piece.location.kind === 'ON_MAP' && breakdownCapabilityViolations(state, piece).length === 0;

/** Statuses a Breakdown takes over from its parent (20.0c: the same marker and mode status). */
const inheritedStatuses = (parent: PieceState): PieceState['statuses'] => parent.statuses.filter(({ statusDefinitionId }) =>
  statusDefinitionId !== UNIT_NAME_STATUS && statusDefinitionId !== TRANSPORT_POINTS_STATUS && statusDefinitionId !== RETURN_TURN_STATUS);

const breakdownId = (state: GameState, parentId: PieceId): PieceId => {
  let index = 0;
  let candidate = `${parentId}#breakdown${state.revision}`;
  while (state.pieceState.pieces.some(({ id }) => id === candidate)) { index += 1; candidate = `${parentId}#breakdown${state.revision}.${index}`; }
  return candidate as PieceId;
};

/**
 * 20.0: the parent loses a step (like a combat loss) and a one-step, 1 RE Breakdown appears in its Hex, in the same mode
 * and with the same markers (20.0c). Detaching costs no MP and the Breakdown may still move this phase (20.0e); it does
 * not end another unit's move.
 */
export const applyCreateBreakdown = (state: GameState, pieceId: PieceId): Transition => {
  const parent = pieceById(state, pieceId)!;
  const name = nextBreakdownName(state, parent);
  const profile = breakdownProfile(state, parent)!;
  const id = breakdownId(state, parent.id);
  const faceId = profile.definition.faces.some(({ id: face }) => face === parent.currentFaceId) ? parent.currentFaceId : profile.definition.faces[0]?.id ?? null;
  const created: PieceState = withStatus({
    id, definitionId: profile.definition.id, ownerId: parent.ownerId, location: { ...parent.location },
    currentFaceId: faceId, remainingSteps: 1, mode: parent.mode, statuses: inheritedStatuses(parent),
    stackOrder: nextOrderAt(state.pieceState.pieces, parent.location, id), resourceQuantity: null,
  }, UNIT_NAME_STATUS, { kind: 'TEXT', value: name });
  let pieceState = upsertPieceState(state.pieceState, { ...parent, remainingSteps: (parent.remainingSteps ?? 2) - 1 });
  pieceState = upsertPieceState(pieceState, created);
  pieceState = upsertPieceRelation(pieceState, { kind: 'PARENT', childId: id, parentId: parent.id });
  const next: GameState = { ...state, pieceState };
  const parentUsage = usageOf(state, parent);
  // A Breakdown detached from a released Reserve may move in the Reaction Phase like its parent (7.0a, 20.0e).
  const usage = { ...emptyUsage(id, parentUsage.phaseStartHexId ?? hexOf(parent)), reserveReleased: parentUsage.reserveReleased };
  return {
    state: { ...next, usage: withUsage(next, usage) },
    events: [{ kind: 'BREAKDOWN_CREATED', sequence: 0, pieceId: parent.id, breakdownId: id, name }],
  };
};

/** Statuses that are "markers" for 20.0c: Out of Supply and Low/Exhausted internal stocks. */
const markerKey = (piece: PieceState): string => [OUT_OF_SUPPLY_STATUS, INTERNAL_STOCKS_STATUS]
  .map((id) => JSON.stringify(piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === id)?.value ?? null)).join('|');

const mayAbsorb = (state: GameState, absorber: PieceState, breakdown: PieceState): boolean => {
  const profile = breakdownProfile(state, absorber);
  return profile !== null
    && profile.definition.id === breakdown.definitionId
    && absorber.ownerId === breakdown.ownerId
    && (absorber.remainingSteps ?? 0) < printedSteps(state, absorber)
    && combatClass(state, absorber) === 'OTHER'
    // 20.0b: only a Breakdown with an Action Rating at least the absorber's own; 20.0c: same mode and markers.
    && ratingOf(state, breakdown) >= ratingOf(state, absorber)
    && absorber.mode === breakdown.mode
    && markerKey(absorber) === markerKey(breakdown);
};

const byPieceId = (left: PieceState, right: PieceState): number => String(left.id).localeCompare(String(right.id));

/** Reduced units stacked with the Breakdown that may absorb it (20.0b-d, 20.0g). */
export const absorberCandidates = (state: GameState, breakdown: PieceState): readonly PieceState[] => {
  const hexId = hexOf(breakdown) as HexId | null;
  if (hexId === null) return [];
  return stableSort(state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId
    && piece.id !== breakdown.id && mayAbsorb(state, piece, breakdown)), byPieceId);
};

/**
 * Who absorbs the Breakdown when the phase ends: its own division if that can take it, otherwise the only eligible unit.
 * Null when nobody can, or when the owner must choose among several (see `absorptionDecision`).
 */
const settledAbsorber = (state: GameState, breakdown: PieceState): PieceState | null => {
  const candidates = absorberCandidates(state, breakdown);
  return candidates.find(({ id }) => id === breakdownParentId(state, breakdown)) ?? (candidates.length === 1 ? candidates[0]! : null);
};

const onMapBreakdowns = (state: GameState): readonly PieceState[] =>
  stableSort(state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && isBreakdown(state, piece)), byPieceId);

/** One absorption: the absorber regains a step and the Breakdown returns to the pool (it leaves play, not to the dead pile). */
export const absorbInto = (state: GameState, breakdownId: PieceId, absorberId: PieceId): Transition => {
  const breakdown = pieceById(state, breakdownId)!;
  const absorber = pieceById(state, absorberId)!;
  const pieceState = upsertPieceState(state.pieceState, { ...absorber, remainingSteps: (absorber.remainingSteps ?? 0) + 1 });
  return {
    state: {
      ...state,
      pieceState: {
        ...pieceState,
        pieces: pieceState.pieces.filter((entry) => entry.id !== breakdown.id),
        relations: pieceState.relations.filter((relation) => !(relation.kind === 'PARENT' && relation.childId === breakdown.id)),
      },
      usage: state.usage.filter(({ pieceId }) => pieceId !== breakdown.id),
    },
    events: [{ kind: 'BREAKDOWN_ABSORBED', sequence: 0, pieceId: absorber.id, breakdownId: breakdown.id, name: pieceNameOf(breakdown) ?? 'Breakdown' }],
  };
};

/**
 * 20.0d: at the end of every phase, reduced multi-step units must absorb the eligible Breakdowns they are stacked with,
 * each taking back one step. A Breakdown goes back to the division that detached it when that division can take it;
 * otherwise to another eligible unit of its pool (20.0g). When several could and none is its division, the owner has
 * already chosen through `absorptionDecision`; the first by Piece ID is only a fallback for states that skipped it.
 */
export const absorbBreakdowns = (state: GameState): Transition => {
  let next = state;
  const events: RuleEvent[] = [];
  for (const { id } of onMapBreakdowns(state)) {
    const breakdown = pieceById(next, id)!;
    const absorber = settledAbsorber(next, breakdown) ?? absorberCandidates(next, breakdown)[0];
    if (!absorber) continue;
    const absorbed = absorbInto(next, breakdown.id, absorber.id);
    next = absorbed.state;
    events.push(...absorbed.events.map((event) => ({ ...event, sequence: events.length })));
  }
  return { state: next, events };
};

export const BREAKDOWN_ABSORB_CHOICE_PREFIX = 'absorb:';
const CHOICE_SEPARATOR = '|';

/**
 * 20.0d with 20.0g: before a phase ends, the owner chooses which unit absorbs a Breakdown that several eligible units
 * (none of them its own division) could take. Null when every absorption is settled. The acting player decides first.
 */
export const absorptionDecision = (state: GameState): PendingDecision | null => {
  const owners = [state.sequence.actingPlayerId, ...state.scenario.players.map(({ id }) => id).filter((id) => id !== state.sequence.actingPlayerId)];
  for (const owner of owners) {
    for (const breakdown of onMapBreakdowns(state).filter((piece) => piece.ownerId === owner)) {
      const candidates = absorberCandidates(state, breakdown);
      if (candidates.length < 2 || settledAbsorber(state, breakdown)) continue;
      const name = pieceNameOf(breakdown) ?? 'a Breakdown';
      const id = parseRuleDecisionId(`decision:breakdown-absorb:${state.revision}:${candidates.length}`);
      if (!id.ok) throw new Error('Breakdown absorption decision ID is invalid.');
      return {
        id: id.value, kind: 'BREAKDOWN_ABSORPTION', ownerId: owner, transactionId: null,
        prompt: `The phase ends: ${name} must be absorbed by a reduced unit in its hex (20.0d). Choose which one.`,
        options: candidates.map((piece) => ({
          id: `${BREAKDOWN_ABSORB_CHOICE_PREFIX}${breakdown.id}${CHOICE_SEPARATOR}${piece.id}`,
          label: `${definitionOf(state, piece)?.name ?? 'Unit'} absorbs ${name}`,
          hexId: hexOf(breakdown),
        })),
      };
    }
  }
  return null;
};

export const parseAbsorptionChoice = (choiceId: string): { readonly breakdownId: PieceId; readonly absorberId: PieceId } => {
  const [breakdownId = '', absorberId = ''] = choiceId.slice(BREAKDOWN_ABSORB_CHOICE_PREFIX.length).split(CHOICE_SEPARATOR);
  return { breakdownId: breakdownId as PieceId, absorberId: absorberId as PieceId };
};

/** A Breakdown of `playerId` that will be absorbed when the phase ends, and the units that may take it. */
export interface PendingAbsorption {
  readonly breakdownId: PieceId;
  readonly absorberIds: readonly PieceId[];
}

/** What 20.0d will do to the player's Breakdowns if the phase ended now (one absorber, or the owner's choice among several). */
export const pendingAbsorptions = (state: GameState, playerId: PlayerId): readonly PendingAbsorption[] =>
  onMapBreakdowns(state).filter((piece) => piece.ownerId === playerId).flatMap((breakdown) => {
    const settled = settledAbsorber(state, breakdown);
    const absorberIds = settled ? [settled.id] : absorberCandidates(state, breakdown).map(({ id }) => id);
    return absorberIds.length > 0 ? [{ breakdownId: breakdown.id, absorberIds }] : [];
  });
