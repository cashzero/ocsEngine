import type { PieceId, PlayerId } from '../../core/index.js';
import { createPieceDefinitionCatalogIndex, createPieceStateIndex, type OcsMode } from '../../domain/piece/index.js';
import { queryZoc } from '../zoc/zoc.js';
import type { GameState, RuleViolation } from '../kernel/model.js';
import { violation } from '../validation/violation.js';

const voluntaryModes: readonly OcsMode[] = ['COMBAT', 'MOVE', 'RESERVE', 'STRAT'];

export const validateModeChange = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
  targetMode: OcsMode,
): readonly RuleViolation[] => {
  const piece = createPieceStateIndex(state.pieceState).get(pieceId);
  if (!piece) return [violation('UNKNOWN_PIECE', ['pieceId'], `Unknown Piece ${pieceId}.`, '5.1')];
  const definition = createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog).get(piece.definitionId);
  const issues: RuleViolation[] = [];
  if (piece.ownerId !== actorId) issues.push(violation('NOT_PIECE_OWNER', ['actorId'], 'Actor does not own the Piece.', '5.4'));
  if (actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Actor does not own the current sequence step.', '2.3'));
  if (state.sequence.phase !== 'MOVEMENT' || state.sequence.segment !== 'MOVEMENT') {
    issues.push(violation('INVALID_MODE_CHANGE_PHASE', ['sequence'], 'Voluntary mode changes require the friendly Movement Segment.', '5.4'));
  }
  if (!voluntaryModes.includes(targetMode)) issues.push(violation('INVOLUNTARY_MODE_REQUESTED', ['mode'], `${targetMode} cannot be chosen voluntarily.`, '5.3'));
  if (piece.mode === 'DG' || piece.mode === 'EXPLOITATION') issues.push(violation('INVOLUNTARY_MODE_LOCK', ['pieceId'], 'An involuntary mode cannot be voluntarily replaced.', '5.4'));
  if (definition?.family !== 'GROUND') issues.push(violation('MODE_NOT_APPLICABLE', ['pieceId'], 'Only Ground Pieces use ground modes.', '5.1'));
  const isTransport = definition?.capabilities.some(({ id }) => id === 'TRANSPORT_CAPACITY') ?? false;
  if (isTransport && targetMode !== 'MOVE' && targetMode !== 'RESERVE') {
    issues.push(violation('TRANSPORT_MODE_RESTRICTION', ['mode'], 'Transport is limited to Move mode in the MVP.', '13.2d'));
  }
  if ((targetMode === 'RESERVE' || targetMode === 'STRAT')
    && piece.location.kind === 'ON_MAP'
    && queryZoc(state, actorId, piece.location.hexId, 'MOVEMENT').value!.sourcePieceIds.length > 0) {
    issues.push(violation('MODE_CHANGE_IN_ENEMY_ZOC', ['mode'], `${targetMode} cannot be entered in enemy ZOC.`, targetMode === 'RESERVE' ? '5.7c' : '5.8a'));
  }
  return issues;
};

export const validateReserveRelease = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
): readonly RuleViolation[] => {
  const piece = createPieceStateIndex(state.pieceState).get(pieceId);
  if (!piece) return [violation('UNKNOWN_PIECE', ['pieceId'], `Unknown Piece ${pieceId}.`, '5.7b')];
  const issues: RuleViolation[] = [];
  if (piece.ownerId !== actorId) issues.push(violation('NOT_PIECE_OWNER', ['actorId'], 'Actor does not own the Reserve.', '5.7b'));
  if (actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Actor does not own the current sequence step.', '2.3'));
  if (piece.mode !== 'RESERVE') issues.push(violation('NOT_IN_RESERVE_MODE', ['pieceId'], 'Only a Reserve Mode Piece can be released.', '5.7b'));
  if (!['REACTION', 'EXPLOITATION'].includes(state.sequence.phase)) issues.push(violation('INVALID_RESERVE_RELEASE_PHASE', ['sequence'], 'Reserve release is limited to Reaction or Exploitation.', '5.7b'));
  if (state.usage.some((usage) => usage.pieceId === pieceId && usage.reserveReleased)) issues.push(violation('RESERVE_ALREADY_RELEASED', ['pieceId'], 'Reserve was already released.', '5.7b'));
  return issues;
};
