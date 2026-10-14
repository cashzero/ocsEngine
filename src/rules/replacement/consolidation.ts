import type { HexId, PlayerId } from '../../core/index.js';
import { upsertPieceState, type PieceDefinition, type PieceState } from '../../domain/piece/index.js';
import type { ConsolidationKind, GameAction, GameState, RuleEvent, RuleViolation } from '../kernel/model.js';
import {
  definitionOf, formationOf, hexOf, internalStocksOf, isMultiStepUnit, isMultiUnitFormation, isTransportPoint, pieceById, printedSteps,
} from '../pieces.js';
import { violation } from '../validation/violation.js';
import { isReplacement } from './replacement.js';

/**
 * Unit Consolidation (13.9), ground types 1-3, in the friendly Reinforcement Phase. Type 4, two reduced aircraft, is
 * COMBINE_AIRCRAFT (rules/air/base.ts). A unit removed by a consolidation goes to the Dead Pile, so it can be rebuilt.
 * Generated games have no Organic Trucks, so no Transport Point is ever consolidated.
 */

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };
type ConsolidateAction = Extract<GameAction, { readonly kind: 'CONSOLIDATE_UNITS' }>;

const faceKey = (definition: PieceDefinition): string => JSON.stringify(definition.faces.map((face) => [
  face.id, face.mobilityClassDefinitionId,
  face.steps.map((step) => [step.remainingSteps, step.combatStrength, step.actionRating, step.movementPointTicks, step.regimentalEquivalentTicks, step.range,
    step.ratings.map(({ ratingDefinitionId, value }) => [ratingDefinitionId, value])]),
]));

/**
 * 13.9: identical on both sides of the counter: the same printed values on each face and the same kind of unit (type,
 * class, defensive-only and no-rebuild marks). The name and formation printed on it may differ.
 */
export const identicalCounters = (state: GameState, left: PieceState, right: PieceState): boolean => {
  const a = definitionOf(state, left);
  const b = definitionOf(state, right);
  if (!a?.counter || !b?.counter || a.family !== 'GROUND' || b.family !== 'GROUND') return false;
  if (a.id === b.id) return true;
  const counter = (definition: PieceDefinition) => {
    const { kind, symbol, echelon, nationality, combatCategory, defensiveOnly, rebuildable, showRe, transportPoints } = definition.counter!;
    return JSON.stringify([kind, symbol, echelon, nationality, combatCategory, defensiveOnly, rebuildable, showRe, transportPoints]);
  };
  return counter(a) === counter(b) && faceKey(a) === faceKey(b);
};

/** 13.9: a unit involved in a consolidation cannot be DG or have Low or Exhausted internal stocks. */
const blockers = (piece: PieceState): readonly string[] => [
  ...piece.mode === 'DG' ? ['DG'] : [],
  ...internalStocksOf(piece) !== 'FULL' ? ['internal stocks'] : [],
];

/** Ground combat units a consolidation can involve at all. */
const consolidable = (state: GameState, piece: PieceState): boolean =>
  definitionOf(state, piece)?.family === 'GROUND' && piece.remainingSteps !== null && !isTransportPoint(state, piece) && !isReplacement(state, piece);

export const validateConsolidation = (state: GameState, action: ConsolidateAction): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (state.sequence.phase !== 'REINFORCEMENT' || action.actorId !== state.sequence.actingPlayerId || action.actorId !== state.sequence.phasingPlayerId) {
    issues.push(violation('INVALID_CONSOLIDATION_PHASE', ['sequence'], 'Units are consolidated in your Reinforcement Phase.', '13.9'));
  }
  const piece = pieceById(state, action.pieceId);
  const other = pieceById(state, action.withId);
  if (!piece || !other || piece.id === other.id || piece.ownerId !== action.actorId || other.ownerId !== action.actorId
    || !consolidable(state, piece) || !consolidable(state, other)) {
    return [...issues, violation('INVALID_CONSOLIDATION_UNITS', ['pieceId'], 'Choose two different ground combat units of yours.', '13.9')];
  }
  if (!identicalCounters(state, piece, other)) {
    issues.push(violation('CONSOLIDATION_NOT_IDENTICAL', ['withId'], 'The units must be identical on both sides of the counter.', '13.9'));
  }
  if (action.consolidation === 'MERGE') {
    if (piece.location.kind !== 'ON_MAP' || other.location.kind !== 'ON_MAP' || hexOf(piece) !== hexOf(other)) {
      issues.push(violation('CONSOLIDATION_NOT_STACKED', ['withId'], 'The two units must be in the same hex.', '13.9-1'));
    }
    if (!isMultiStepUnit(state, piece)) issues.push(violation('CONSOLIDATION_NOT_MULTI_STEP', ['pieceId'], 'Only multi-step units combine their steps.', '13.9-1'));
    for (const [field, unit] of [['pieceId', piece], ['withId', other]] as const) {
      for (const blocker of blockers(unit)) issues.push(violation('CONSOLIDATION_BLOCKED', [field], `A unit with ${blocker === 'DG' ? 'a DG marker' : 'Low or Exhausted internal stocks'} cannot be consolidated.`, '13.9'));
    }
    return issues;
  }
  // SWAP: the unit on the map is exchanged for an identical one of another formation from the Dead Pile.
  if (piece.location.kind !== 'ON_MAP') issues.push(violation('CONSOLIDATION_NOT_ON_MAP', ['pieceId'], 'The unit to exchange must be on the map.', '13.9-2'));
  if (other.location.kind !== 'ELIMINATED') issues.push(violation('CONSOLIDATION_NOT_IN_DEAD_PILE', ['withId'], 'The unit it is exchanged for must be in the Dead Pile.', '13.9-2'));
  const formation = formationOf(state, other);
  if (!isMultiUnitFormation(state, formation)) {
    issues.push(violation('CONSOLIDATION_TO_INDEPENDENT', ['withId'], 'A unit can join a multi-unit formation, never leave one to become independent.', '13.9-3'));
  } else if (formationOf(state, piece) === formation) {
    issues.push(violation('CONSOLIDATION_SAME_FORMATION', ['withId'], 'The exchanged unit must belong to a different formation.', '13.9-2'));
  }
  for (const blocker of blockers(piece)) issues.push(violation('CONSOLIDATION_BLOCKED', ['pieceId'], `A unit with ${blocker === 'DG' ? 'a DG marker' : 'Low or Exhausted internal stocks'} cannot be consolidated.`, '13.9'));
  return issues;
};

export const applyConsolidation = (state: GameState, action: ConsolidateAction): Transition => {
  const piece = pieceById(state, action.pieceId)!;
  const other = pieceById(state, action.withId)!;
  const hexId = hexOf(piece)!;
  if (action.consolidation === 'MERGE') {
    // 13.9-1: no unit grows beyond full strength; excess steps are lost.
    const steps = Math.min(printedSteps(state, piece), (piece.remainingSteps ?? 0) + (other.remainingSteps ?? 0));
    let pieceState = upsertPieceState(state.pieceState, { ...piece, remainingSteps: steps });
    pieceState = upsertPieceState(pieceState, { ...other, location: { kind: 'ELIMINATED' }, stackOrder: 0 });
    return {
      state: { ...state, pieceState },
      events: [{ kind: 'UNITS_CONSOLIDATED', sequence: 0, consolidation: 'MERGE', pieceId: piece.id, withId: other.id, hexId, steps: steps - (piece.remainingSteps ?? 0) }],
    };
  }
  // 13.9-2/3: modes and markers stay the same; the incoming unit takes the place, side, steps and markers of the one it replaces.
  let pieceState = upsertPieceState(state.pieceState, {
    ...other, location: piece.location, stackOrder: piece.stackOrder, mode: piece.mode, currentFaceId: piece.currentFaceId,
    remainingSteps: piece.remainingSteps, statuses: piece.statuses,
  });
  pieceState = upsertPieceState(pieceState, { ...piece, location: { kind: 'ELIMINATED' }, stackOrder: 0 });
  return {
    state: { ...state, pieceState, usage: state.usage.map((entry) => entry.pieceId === piece.id ? { ...entry, pieceId: other.id } : entry) },
    events: [{ kind: 'UNITS_CONSOLIDATED', sequence: 0, consolidation: 'SWAP', pieceId: piece.id, withId: other.id, hexId, steps: piece.remainingSteps ?? 0 }],
  };
};

export interface ConsolidationOption {
  readonly consolidation: ConsolidationKind;
  readonly piece: PieceState;
  readonly with: PieceState;
  readonly hexId: HexId;
  /** MERGE: steps the unit regains. SWAP: steps the incoming unit enters with. */
  readonly steps: number;
}

/**
 * Consolidations the player could make now. MERGE pairs keep the stronger unit (the lower id on a tie) and are listed only
 * when it gains a step; SWAP lists each unit on the map against each identical Dead Pile unit of another multi-unit formation.
 */
export const consolidationOptions = (state: GameState, playerId: PlayerId): readonly ConsolidationOption[] => {
  if (state.sequence.phase !== 'REINFORCEMENT' || state.sequence.actingPlayerId !== playerId || state.sequence.phasingPlayerId !== playerId) return [];
  const options: ConsolidationOption[] = [];
  const own = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && consolidable(state, piece));
  const onMap = own.filter((piece) => piece.location.kind === 'ON_MAP' && blockers(piece).length === 0)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const dead = own.filter((piece) => piece.location.kind === 'ELIMINATED' && isMultiUnitFormation(state, formationOf(state, piece)))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  for (const [index, piece] of onMap.entries()) {
    if (!isMultiStepUnit(state, piece)) continue;
    for (const other of onMap.slice(index + 1)) {
      if (hexOf(other) !== hexOf(piece) || !identicalCounters(state, piece, other)) continue;
      const [keep, give] = (other.remainingSteps ?? 0) > (piece.remainingSteps ?? 0) ? [other, piece] : [piece, other];
      const gain = Math.min(printedSteps(state, keep), (keep.remainingSteps ?? 0) + (give.remainingSteps ?? 0)) - (keep.remainingSteps ?? 0);
      if (gain > 0) options.push({ consolidation: 'MERGE', piece: keep, with: give, hexId: hexOf(piece)!, steps: gain });
    }
  }
  for (const piece of onMap) {
    for (const other of dead) {
      if (formationOf(state, other) === formationOf(state, piece) || !identicalCounters(state, piece, other)) continue;
      options.push({ consolidation: 'SWAP', piece, with: other, hexId: hexOf(piece)!, steps: piece.remainingSteps ?? 0 });
    }
  }
  return options;
};
