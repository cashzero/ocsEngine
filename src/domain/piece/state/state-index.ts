import {
  compareNumber,
  compareText,
  stableSort,
  type PieceId,
} from '../../../core/index.js';
import {
  pieceLocationsEqual,
  type PieceLocation,
} from '../../map/index.js';
import type { PieceRuntimeState, PieceState } from './model.js';

export interface PieceStateIndex {
  readonly get: (pieceId: PieceId) => PieceState | undefined;
  readonly ordered: () => readonly PieceState[];
  readonly atLocation: (location: PieceLocation) => readonly PieceState[];
}

export const createPieceStateIndex = (state: PieceRuntimeState): PieceStateIndex => {
  const byId = new Map<PieceId, PieceState>();
  for (const piece of state.pieces) {
    if (!byId.has(piece.id)) byId.set(piece.id, piece);
  }
  const ordered = Object.freeze(stableSort(
    state.pieces,
    (left, right) => compareText(left.id, right.id),
  ));

  return Object.freeze({
    get: (pieceId: PieceId) => byId.get(pieceId),
    ordered: () => ordered,
    atLocation: (location: PieceLocation) => Object.freeze(stableSort(
      state.pieces.filter((piece) => pieceLocationsEqual(piece.location, location)),
      (left, right) => compareNumber(left.stackOrder, right.stackOrder)
        || compareText(left.id, right.id),
    )),
  });
};
