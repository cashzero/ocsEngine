import { formatHexId, neighbors, parseHexCoordinateId, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { createPieceDefinitionCatalogIndex } from '../../domain/piece/index.js';
import type { GameState } from '../kernel/model.js';
import type { RuleQueryResult } from '../query/model.js';

export type ZocPurpose = 'MOVEMENT' | 'SUPPLY' | 'RETREAT' | 'COMBAT';

export interface ZocValue {
  readonly sourcePieceIds: readonly PieceId[];
  readonly negated: boolean;
  readonly purpose: ZocPurpose;
}

const hasOutOfSupplyStatus = (piece: GameState['pieceState']['pieces'][number]): boolean =>
  piece.statuses.some(({ statusDefinitionId, value }) => statusDefinitionId === 'status:out-of-supply'
    && value.kind === 'FLAG' && value.value);

const exertsZoc = (state: GameState, piece: GameState['pieceState']['pieces'][number]): boolean => {
  if (piece.mode !== 'COMBAT' && piece.mode !== 'EXPLOITATION') return false;
  if (hasOutOfSupplyStatus(piece)) return false;
  const definition = createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog).get(piece.definitionId);
  const face = definition?.faces.find(({ id }) => id === piece.currentFaceId);
  const step = face?.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps);
  return definition?.family === 'GROUND' && !definition.counter?.defensiveOnly && step?.combatStrength !== null && step?.combatStrength !== undefined;
};

export const queryZoc = (
  state: GameState,
  friendlyPlayerId: PlayerId,
  hexId: HexId,
  purpose: ZocPurpose,
): RuleQueryResult<ZocValue> => {
  const coordinate = parseHexCoordinateId(hexId);
  const adjacent = coordinate.ok ? new Set(neighbors(coordinate.value).map(formatHexId)) : new Set<HexId>();
  const sources = state.pieceState.pieces.filter((piece) => piece.ownerId !== friendlyPlayerId
    && piece.location.kind === 'ON_MAP'
    && adjacent.has(piece.location.hexId)
    && exertsZoc(state, piece));
  const friendlyNegator = state.pieceState.pieces.some((piece) => piece.ownerId === friendlyPlayerId
    && piece.location.kind === 'ON_MAP'
    && piece.location.hexId === hexId
    && createPieceDefinitionCatalogIndex(state.scenario.pieceCatalog).get(piece.definitionId)?.family === 'GROUND');
  const negated = (purpose === 'SUPPLY' || purpose === 'COMBAT') && friendlyNegator;
  const effectiveSources = negated ? [] : sources;
  return {
    allowed: effectiveSources.length === 0,
    value: { sourcePieceIds: effectiveSources.map(({ id }) => id), negated, purpose },
    reasons: [{
      code: effectiveSources.length === 0 ? (negated ? 'ENEMY_ZOC_NEGATED' : 'NO_ENEMY_ZOC') : 'ENEMY_ZOC_PRESENT',
      allowed: effectiveSources.length === 0,
      message: effectiveSources.length === 0 ? 'No effective enemy ZOC.' : `${effectiveSources.length} enemy Piece(s) exert ZOC.`,
      rule: '4.5',
    }],
    facts: [{ key: 'zoc.sourceCount', value: effectiveSources.length, visibility: 'PUBLIC', ownerId: null }],
    dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `zoc:${purpose}:${hexId}` }],
  };
};
