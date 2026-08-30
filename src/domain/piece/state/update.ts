import {
  compareText,
  FOUNDATION_SCHEMA_VERSION,
  revision,
  stableSort,
  type Revision,
} from '../../../core/index.js';
import type { PieceRelation, PieceRuntimeState, PieceState } from './model.js';
import { pieceRelationKey } from './relations.js';

const nextRevision = (current: Revision): Revision => {
  const next = revision(current + 1);
  if (!next.ok) {
    throw new RangeError('PieceRuntimeState revision cannot exceed the safe integer range.');
  }
  return next.value;
};

export const createEmptyPieceRuntimeState = (initialRevision: Revision): PieceRuntimeState => ({
  schemaVersion: FOUNDATION_SCHEMA_VERSION,
  revision: initialRevision,
  pieces: [],
  relations: [],
});

export const upsertPieceState = (
  state: PieceRuntimeState,
  piece: PieceState,
): PieceRuntimeState => {
  const found = state.pieces.some(({ id }) => id === piece.id);
  const pieces = found
    ? state.pieces.map((entry) => entry.id === piece.id ? piece : entry)
    : [...state.pieces, piece];
  return {
    ...state,
    revision: nextRevision(state.revision),
    pieces: stableSort(pieces, (left, right) => compareText(left.id, right.id)),
  };
};

export const upsertPieceRelation = (
  state: PieceRuntimeState,
  relation: PieceRelation,
): PieceRuntimeState => {
  const key = pieceRelationKey(relation);
  const found = state.relations.some((entry) => pieceRelationKey(entry) === key);
  const relations = found
    ? state.relations.map((entry) => pieceRelationKey(entry) === key ? relation : entry)
    : [...state.relations, relation];
  return {
    ...state,
    revision: nextRevision(state.revision),
    relations: stableSort(relations, (left, right) =>
      compareText(pieceRelationKey(left), pieceRelationKey(right))),
  };
};
