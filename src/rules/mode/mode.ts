import type { PieceId, PlayerId } from '../../core/index.js';
import type { OcsMode, PieceState } from '../../domain/piece/index.js';
import type { GameState, RuleViolation } from '../kernel/model.js';
import {
  definitionOf,
  faceMode,
  hexOf,
  isTransportPoint,
  pieceById,
  usageOf,
} from '../pieces.js';
import { violation } from '../validation/violation.js';
import { inEnemyZoc } from '../zoc/zoc.js';

const voluntaryModes: readonly OcsMode[] = ['COMBAT', 'MOVE', 'RESERVE', 'STRAT'];

const hasFace = (state: GameState, piece: PieceState, faceId: string): boolean =>
  definitionOf(state, piece)?.faces.some(({ id }) => id === faceId) ?? false;

/**
 * 5.4: voluntary mode changes happen in the friendly Movement Phase as each unit begins to move.
 * A DG unit may only change orientation (Combat or Move side) and stays DG.
 */
export const validateModeChange = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
  targetMode: OcsMode,
): readonly RuleViolation[] => {
  const piece = pieceById(state, pieceId);
  if (!piece) return [violation('UNKNOWN_PIECE', ['pieceId'], `Unknown Piece ${pieceId}.`, '5.1')];
  const issues: RuleViolation[] = [];
  if (piece.ownerId !== actorId) issues.push(violation('NOT_PIECE_OWNER', ['actorId'], 'Actor does not own the Piece.', '5.4'));
  if (actorId !== state.sequence.actingPlayerId || actorId !== state.sequence.phasingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Only the phasing player changes modes.', '5.4'));
  if (state.sequence.phase !== 'MOVEMENT' || state.sequence.segment !== 'MOVEMENT') {
    issues.push(violation('INVALID_MODE_CHANGE_PHASE', ['sequence'], 'Voluntary mode changes require the friendly Movement Segment.', '5.4'));
  }
  if (definitionOf(state, piece)?.family !== 'GROUND' || piece.mode === null) {
    issues.push(violation('MODE_NOT_APPLICABLE', ['pieceId'], 'Only ground units use modes.', '5.1'));
    return issues;
  }
  if (piece.location.kind !== 'ON_MAP') issues.push(violation('PIECE_NOT_ON_MAP', ['pieceId'], 'Only units on the map change mode.', '5.4'));
  const usage = usageOf(state, piece);
  if (usage.moved) issues.push(violation('MODE_CHANGE_AFTER_MOVING', ['pieceId'], 'A mode change happens as the unit begins to move, not after it has moved.', '5.4'));
  if (usage.negationLocked) issues.push(violation('NEGATING_UNIT_LOCKED', ['pieceId'], 'This unit is negating an enemy ZOC and may not begin to move.', '4.5b'));
  if (!voluntaryModes.includes(targetMode)) issues.push(violation('INVOLUNTARY_MODE_REQUESTED', ['mode'], `${targetMode} cannot be chosen voluntarily.`, '5.3'));
  if (piece.mode === 'EXPLOITATION') issues.push(violation('INVOLUNTARY_MODE_LOCK', ['pieceId'], 'An involuntary mode is removed only at Clean Up.', '5.4'));
  if (piece.mode === 'DG' && targetMode !== 'COMBAT' && targetMode !== 'MOVE') {
    issues.push(violation('INVOLUNTARY_MODE_LOCK', ['pieceId'], 'A DG unit can only change its orientation.', '5.4'));
  }
  if (piece.mode === targetMode && piece.mode !== 'DG') issues.push(violation('MODE_UNCHANGED', ['mode'], 'The unit is already in that mode.', '5.4'));
  if ((targetMode === 'COMBAT' || targetMode === 'MOVE') && !hasFace(state, piece, targetMode.toLowerCase())) {
    issues.push(violation('MODE_FACE_MISSING', ['mode'], `This counter has no ${targetMode === 'COMBAT' ? 'Combat' : 'Move'} side.`, targetMode === 'COMBAT' ? '5.5c' : '5.6'));
  }
  if (targetMode === 'STRAT' && !hasFace(state, piece, 'move')) issues.push(violation('STRAT_REQUIRES_MOVE_SIDE', ['mode'], 'Strat Mode units must be oriented to their Move side.', '5.8'));
  if (isTransportPoint(state, piece) && targetMode !== 'MOVE') {
    issues.push(violation('TRANSPORT_MODE_RESTRICTION', ['mode'], 'Transport Points cannot enter Combat, Reserve, or Strat Mode.', targetMode === 'RESERVE' ? '5.7f' : targetMode === 'STRAT' ? '5.8c' : '5.5c'));
  }
  const hexId = hexOf(piece);
  if ((targetMode === 'RESERVE' || targetMode === 'STRAT') && hexId && inEnemyZoc(state, actorId, hexId)) {
    issues.push(violation('MODE_CHANGE_IN_ENEMY_ZOC', ['mode'], `${targetMode === 'RESERVE' ? 'Reserve' : 'Strat'} Mode cannot be entered in an enemy ZOC.`, targetMode === 'RESERVE' ? '5.7c' : '5.8a'));
  }
  return issues;
};

/** Resulting Piece after a legal voluntary mode change. */
export const applyModeChange = (piece: PieceState, targetMode: OcsMode): PieceState => {
  if (piece.mode === 'DG') return { ...piece, currentFaceId: targetMode.toLowerCase() as PieceState['currentFaceId'] };
  if (targetMode === 'COMBAT' || targetMode === 'MOVE') {
    return { ...piece, mode: targetMode, currentFaceId: targetMode.toLowerCase() as PieceState['currentFaceId'] };
  }
  // 5.8: Strat units are oriented to Move; 5.7a: Reserve keeps the chosen orientation.
  if (targetMode === 'STRAT') return { ...piece, mode: 'STRAT', currentFaceId: 'move' as PieceState['currentFaceId'] };
  return { ...piece, mode: targetMode };
};

/** 5.7b: release a Reserve in the Reaction or Exploitation Phase; the marker is removed. */
export const validateReserveRelease = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
): readonly RuleViolation[] => {
  const piece = pieceById(state, pieceId);
  if (!piece) return [violation('UNKNOWN_PIECE', ['pieceId'], `Unknown Piece ${pieceId}.`, '5.7b')];
  const issues: RuleViolation[] = [];
  if (piece.ownerId !== actorId) issues.push(violation('NOT_PIECE_OWNER', ['actorId'], 'Actor does not own the Reserve.', '5.7b'));
  if (actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Actor does not own the current sequence step.', '2.3'));
  if (piece.mode !== 'RESERVE') issues.push(violation('NOT_IN_RESERVE_MODE', ['pieceId'], 'Only a Reserve Mode unit can be released.', '5.7b'));
  if (!['REACTION', 'EXPLOITATION'].includes(state.sequence.phase)) issues.push(violation('INVALID_RESERVE_RELEASE_PHASE', ['sequence'], 'Reserves are released in the Reaction or Exploitation Phase.', '5.7b'));
  if (piece.location.kind !== 'ON_MAP') issues.push(violation('PIECE_NOT_ON_MAP', ['pieceId'], 'Only units on the map are released.', '5.7b'));
  return issues;
};

export const applyReserveRelease = (piece: PieceState): PieceState => ({ ...piece, mode: faceMode(piece) });
