import type {
  DefinitionId,
  PieceId,
  PlayerId,
  Revision,
  SchemaVersion,
  TypedDataValue,
} from '../../../core/index.js';
import type { PieceLocation } from '../../map/index.js';
import type { FaceId } from '../definition/index.js';

export const OCS_MODES = [
  'COMBAT',
  'MOVE',
  'RESERVE',
  'STRAT',
  'EXPLOITATION',
  'DG',
] as const;

export type OcsMode = (typeof OCS_MODES)[number];

export type PieceStatusValue = TypedDataValue;

export interface PieceStatusState {
  readonly statusDefinitionId: DefinitionId;
  readonly value: PieceStatusValue;
}

export interface PieceState {
  readonly id: PieceId;
  readonly definitionId: DefinitionId;
  readonly ownerId: PlayerId;
  readonly location: PieceLocation;
  readonly currentFaceId: FaceId | null;
  readonly remainingSteps: number | null;
  readonly mode: OcsMode | null;
  readonly statuses: readonly PieceStatusState[];
  readonly stackOrder: number;
  readonly resourceQuantity: number | null;
}

export type PieceRelation =
  | {
    readonly kind: 'CARGO';
    readonly cargoId: PieceId;
    readonly containerId: PieceId;
    readonly loadQuantity: number;
    readonly unitDefinitionId: DefinitionId;
  }
  | {
    readonly kind: 'ATTACHMENT';
    readonly childId: PieceId;
    readonly parentId: PieceId;
  }
  | {
    readonly kind: 'PARENT';
    readonly childId: PieceId;
    readonly parentId: PieceId;
  }
  | {
    readonly kind: 'GROUP_MEMBERSHIP';
    readonly memberId: PieceId;
    readonly groupDefinitionId: DefinitionId;
  }
  | {
    readonly kind: 'FORMATION_MEMBERSHIP';
    readonly memberId: PieceId;
    readonly formationDefinitionId: DefinitionId;
  };

export interface PieceRuntimeState {
  readonly schemaVersion: SchemaVersion;
  readonly revision: Revision;
  readonly pieces: readonly PieceState[];
  readonly relations: readonly PieceRelation[];
}
