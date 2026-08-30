import { stableKey } from '../../../core/index.js';
import type { PieceRelation } from './model.js';

export const pieceRelationKey = (relation: PieceRelation): string => {
  switch (relation.kind) {
    case 'CARGO':
      return stableKey([relation.kind, relation.cargoId]);
    case 'ATTACHMENT':
    case 'PARENT':
      return stableKey([relation.kind, relation.childId]);
    case 'GROUP_MEMBERSHIP':
    case 'FORMATION_MEMBERSHIP':
      return stableKey([relation.kind, relation.memberId]);
  }
};
