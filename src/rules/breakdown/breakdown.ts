import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { upsertPieceRelation, upsertPieceState, type PieceDefinition, type PieceState } from '../../domain/piece/index.js';
import type { GameState, RuleEvent, RuleViolation } from '../kernel/model.js';
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
 * of its pool (20.0g) and the regiments it can detach. A Breakdown counter carries `BREAKDOWN_UNIT`.
 *
 * Unlike the board game, each Breakdown is linked to the division that detached it (a PARENT relation) and named after
 * one of that division's regiments; the generic Definition still sets its printed values.
 */
export const BREAKDOWN_CAPABILITY = 'BREAKDOWN';
export const BREAKDOWN_UNIT_CAPABILITY = 'BREAKDOWN_UNIT';
/** Separator of the regiment names in the `regiments` TEXT parameter. */
export const BREAKDOWN_REGIMENT_SEPARATOR = '|';

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };

export interface BreakdownProfile {
  /** The Breakdown Definition this unit creates and absorbs (its pool, 20.0g). */
  readonly definition: PieceDefinition;
  /** Regiment names, in the order they are offered. */
  readonly regiments: readonly string[];
}

const textParameter = (definition: PieceDefinition | undefined, capability: string, key: string): string | null => {
  const parameter = definition?.capabilities.find(({ id }) => id === capability)?.parameters.find((entry) => entry.key === key);
  return parameter?.kind === 'TEXT' ? parameter.value : null;
};

export const breakdownProfile = (state: GameState, piece: PieceState): BreakdownProfile | null => {
  const definitionId = textParameter(definitionOf(state, piece), BREAKDOWN_CAPABILITY, 'definitionId');
  const definition = definitionId === null ? undefined : state.scenario.pieceCatalog.definitions.find(({ id }) => id === definitionId);
  if (!definition) return null;
  const regiments = (textParameter(definitionOf(state, piece), BREAKDOWN_CAPABILITY, 'regiments') ?? '')
    .split(BREAKDOWN_REGIMENT_SEPARATOR).map((name) => name.trim()).filter((name) => name.length > 0);
  return { definition, regiments };
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

/**
 * Names the division may give its next Breakdown: each regiment not already detached (in play under that name). Once
 * every regiment is out, the next one is a numbered "Brkdwn".
 */
export const availableBreakdownNames = (state: GameState, parent: PieceState): readonly string[] => {
  const profile = breakdownProfile(state, parent);
  if (!profile) return [];
  const division = definitionOf(state, parent)?.name ?? 'Division';
  const used = new Set(state.pieceState.pieces
    .filter((piece) => piece.ownerId === parent.ownerId && inPlay(piece))
    .flatMap((piece) => pieceNameOf(piece) ?? []));
  const free = profile.regiments.map((regiment) => `${regiment} / ${division}`).filter((name) => !used.has(name));
  if (free.length > 0) return free;
  let ordinal = 1;
  while (used.has(`Brkdwn ${ordinal} / ${division}`)) ordinal += 1;
  return [`Brkdwn ${ordinal} / ${division}`];
};

export const validateCreateBreakdown = (state: GameState, actorId: PlayerId, pieceId: PieceId, name: string): readonly RuleViolation[] => {
  const piece = pieceById(state, pieceId);
  if (!piece) return [violation('UNKNOWN_PIECE', ['pieceId'], 'Unknown Piece.', '20.0')];
  const issues: RuleViolation[] = [];
  if (piece.ownerId !== actorId) issues.push(violation('NOT_PIECE_OWNER', ['actorId'], 'Actor does not own the unit.', '6.3a'));
  if (actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Only the player now moving units can detach Breakdowns.', '20.0a'));
  if (!phaseAllowsMovement(state)) issues.push(violation('INVALID_MOVEMENT_PHASE', ['sequence'], 'Breakdowns are detached when a unit begins to move, in a Movement Segment.', '20.0a'));
  if (piece.location.kind !== 'ON_MAP') issues.push(violation('PIECE_NOT_ON_MAP', ['pieceId'], 'The unit must be on the map.', '20.0'));
  const profile = breakdownProfile(state, piece);
  if (!profile || printedSteps(state, piece) < 2) {
    issues.push(violation('BREAKDOWN_NOT_CAPABLE', ['pieceId'], 'Only multi-step units with a Breakdown pool can detach Breakdowns.', '20.0'));
    return issues;
  }
  if (combatClass(state, piece) !== 'OTHER') issues.push(violation('BREAKDOWN_ARMOR_OR_MECH', ['pieceId'], 'Armor and Mech units cannot create Breakdowns; only "Other" units can.', '20.0'));
  if ((piece.remainingSteps ?? 0) < 2) issues.push(violation('BREAKDOWN_LAST_STEP', ['pieceId'], 'A unit\'s last step can never become a Breakdown.', '20.0'));
  if (issues.length > 0) return issues;
  if (!isEligibleMover(state, piece)) issues.push(violation('BREAKDOWN_NOT_MOVING', ['pieceId'], 'Only a unit that may move in this phase can detach Breakdowns.', '20.0a'));
  const usage = usageOf(state, piece);
  if (usage.moved && state.currentMoverId !== piece.id) issues.push(violation('MOVEMENT_ALREADY_FINISHED', ['pieceId'], 'This unit has finished moving this phase.', '6.1g'));
  else if (usage.movementSpentTicks > 0) issues.push(violation('BREAKDOWN_AFTER_MOVE_BEGAN', ['pieceId'], 'Breakdowns are detached as the unit begins to move, before it spends any MP.', '20.0a'));
  if (usage.negationLocked) issues.push(violation('NEGATING_UNIT_LOCKED', ['pieceId'], 'This unit negated an enemy ZOC and cannot move this phase.', '4.5b'));
  if (breakdownRating(profile, piece) > ratingOf(state, piece)) {
    issues.push(violation('BREAKDOWN_RATING_TOO_HIGH', ['pieceId'], 'A unit can only create a Breakdown with an Action Rating equal to or less than its own.', '20.0b'));
  }
  if (!availableBreakdownNames(state, piece).includes(name)) {
    issues.push(violation('BREAKDOWN_NAME_UNAVAILABLE', ['name'], 'That regiment is already detached; pick one of the division\'s remaining regiments.', '20.0'));
  }
  return issues;
};

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
export const applyCreateBreakdown = (state: GameState, pieceId: PieceId, name: string): Transition => {
  const parent = pieceById(state, pieceId)!;
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

/**
 * 20.0d: at the end of every phase, reduced multi-step units must absorb the eligible Breakdowns they are stacked with,
 * each taking back one step. A Breakdown goes back to the division that detached it when that division can take it;
 * otherwise to another eligible unit of its pool (20.0g).
 */
export const absorbBreakdowns = (state: GameState): Transition => {
  let next = state;
  const events: RuleEvent[] = [];
  const breakdowns = stableSort(state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && isBreakdown(state, piece)),
    (left, right) => String(left.id).localeCompare(String(right.id)));
  for (const { id } of breakdowns) {
    const breakdown = pieceById(next, id)!;
    const hexId = hexOf(breakdown) as HexId;
    const candidates = stableSort(next.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId
      && piece.id !== breakdown.id && mayAbsorb(next, piece, breakdown)), (left, right) => String(left.id).localeCompare(String(right.id)));
    const parentId = breakdownParentId(next, breakdown);
    const absorber = candidates.find((piece) => piece.id === parentId) ?? candidates[0];
    if (!absorber) continue;
    // The absorbed Breakdown goes back to the pool: it leaves play (it was not eliminated, so it is not in the dead pile).
    const pieceState = upsertPieceState(next.pieceState, { ...absorber, remainingSteps: (absorber.remainingSteps ?? 0) + 1 });
    next = {
      ...next,
      pieceState: {
        ...pieceState,
        pieces: pieceState.pieces.filter((entry) => entry.id !== breakdown.id),
        relations: pieceState.relations.filter((relation) => !(relation.kind === 'PARENT' && relation.childId === breakdown.id)),
      },
      usage: next.usage.filter(({ pieceId }) => pieceId !== breakdown.id),
    };
    events.push({ kind: 'BREAKDOWN_ABSORBED', sequence: events.length, pieceId: absorber.id, breakdownId: breakdown.id, name: pieceNameOf(breakdown) ?? 'Breakdown' });
  }
  return { state: next, events };
};
