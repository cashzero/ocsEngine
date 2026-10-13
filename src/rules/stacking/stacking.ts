import type { HexId, PieceId } from '../../core/index.js';
import {
  createPieceDefinitionCatalogIndex,
  isGroundUnitDefinition,
  type PieceRuntimeState,
  type PieceState,
} from '../../domain/piece/index.js';
import type { GameState } from '../kernel/model.js';
import type { RuleQueryResult } from '../query/model.js';

export const derivePieceReTicks = (state: GameState, piece: PieceState): number => {
  const definition = createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog).get(piece.definitionId);
  if (!definition || !isGroundUnitDefinition(definition) || piece.currentFaceId === null || piece.remainingSteps === null) return 0;
  const face = definition.faces.find(({ id }) => id === piece.currentFaceId);
  return face?.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps)
    ?.regimentalEquivalentTicks ?? 0;
};

export interface StackingValue {
  readonly usedReTicks: number;
  readonly limitReTicks: number;
  readonly pieceIds: readonly PieceId[];
}

export const nextStackOrderAtHex = (
  pieceState: PieceRuntimeState,
  hexId: HexId,
  movingPieceId: PieceId,
): number => pieceState.pieces.reduce((highest, piece) => piece.id !== movingPieceId
  && piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId
  ? Math.max(highest, piece.stackOrder) : highest, -1) + 1;

export const queryStacking = (
  state: GameState,
  hexId: HexId,
  addedPieceId: PieceId | null = null,
): RuleQueryResult<StackingValue> => {
  const pieces = state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP'
    && piece.location.hexId === hexId
    && piece.id !== addedPieceId);
  const added = addedPieceId === null
    ? undefined
    : state.pieceState.pieces.find(({ id }) => id === addedPieceId);
  const participants = added ? [...pieces, added] : pieces;
  const usedReTicks = participants.reduce((total, piece) => total + derivePieceReTicks(state, piece), 0);
  const allowed = usedReTicks <= state.configuration.stackingLimitReTicks;
  return {
    allowed,
    value: {
      usedReTicks,
      limitReTicks: state.configuration.stackingLimitReTicks,
      pieceIds: participants.map(({ id }) => id),
    },
    reasons: [{
      code: allowed ? 'STACKING_WITHIN_LIMIT' : 'STACKING_LIMIT_EXCEEDED',
      allowed,
      message: `${usedReTicks}/${state.configuration.stackingLimitReTicks} quarter-RE ticks used.`,
      rule: '4.8',
    }],
    facts: [{ key: 'stacking.usedReTicks', value: usedReTicks, visibility: 'PUBLIC', ownerId: null }],
    dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `stack:${hexId}` }],
  };
};
