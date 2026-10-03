import type {
  DefinitionId,
  MovementPointTick,
  RegimentalEquivalentTick,
  SchemaVersion,
  SourceReference,
  TypedDataValue,
} from '../../../core/index.js';
import type { CapabilityId, FaceId } from './ids.js';

export const PIECE_FAMILIES = [
  'GROUND',
  'RESOURCE',
  'AIR',
  'NAVAL',
  'FACILITY',
  'MARKER',
  'DEFERRED',
] as const;

export type PieceFamily = (typeof PIECE_FAMILIES)[number];

export interface CounterDefinition {
  readonly kind: 'COMBAT' | 'ARTILLERY' | 'HQ' | 'TRANSPORT' | 'SUPPLY';
  readonly symbol: 'INFANTRY' | 'AIRBORNE' | 'ARMOR' | 'GLIDER' | 'RECON' | 'ARTILLERY' | 'SP_ARTILLERY' | 'ENGINEER' | 'HQ' | 'TRUCK' | 'SUPPLY';
  readonly designation: string;
  readonly affiliation: string;
  readonly echelon: string;
  readonly nationality: 'US' | 'GERMAN';
  readonly combatCategory: 'ARMOR' | 'MECH' | 'OTHER';
  readonly formationColor: string | null;
  readonly defensiveOnly: boolean;
  readonly rebuildable: boolean;
  readonly showRe: boolean;
  readonly transportPoints: number | null;
}

export interface PieceOwnershipDefinition {
  readonly sideDefinitionId: DefinitionId | null;
  readonly factionDefinitionId: DefinitionId | null;
  readonly nationalityDefinitionId: DefinitionId | null;
  readonly formationDefinitionId: DefinitionId | null;
  readonly groupDefinitionId: DefinitionId | null;
}

export type CapabilityParameter = TypedDataValue & { readonly key: string };

export interface CapabilityDeclaration {
  readonly id: CapabilityId;
  readonly parameters: readonly CapabilityParameter[];
}

export interface PrintedRating {
  readonly ratingDefinitionId: DefinitionId;
  readonly value: number | string;
}

export interface PieceStepProfile {
  readonly remainingSteps: number;
  readonly combatStrength: number | null;
  readonly actionRating: number | null;
  readonly movementPointTicks: MovementPointTick | null;
  readonly regimentalEquivalentTicks: RegimentalEquivalentTick | null;
  readonly range: number | null;
  readonly ratings: readonly PrintedRating[];
}

export interface PieceFaceDefinition {
  readonly id: FaceId;
  readonly name: string;
  readonly mobilityClassDefinitionId: DefinitionId | null;
  readonly steps: readonly PieceStepProfile[];
}

export interface ResourceDefinitionProfile {
  readonly resourceDefinitionId: DefinitionId;
  readonly unitDefinitionId: DefinitionId;
  readonly printedQuantity: number;
  readonly capacity: number;
}

export interface FacilityDefinitionProfile {
  readonly facilityTypeDefinitionId: DefinitionId;
}

export interface MarkerDefinitionProfile {
  readonly markerTypeDefinitionId: DefinitionId;
}

export type EvidenceConfidence = 'UNVERIFIED' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';
export type EvidenceReviewStatus = 'UNREVIEWED' | 'NEEDS_REVIEW' | 'REVIEWED' | 'REJECTED';

export interface NormalizationEvidence {
  readonly field: string;
  readonly rawValue: string;
  readonly normalizedValue: string;
  readonly source: SourceReference;
  readonly confidence: EvidenceConfidence;
  readonly reviewStatus: EvidenceReviewStatus;
}

export interface PieceDefinitionSource {
  readonly records: readonly NormalizationEvidence[];
}

export interface PieceDefinition {
  readonly counter: CounterDefinition | null;
  readonly id: DefinitionId;
  readonly family: PieceFamily;
  readonly name: string;
  readonly categoryDefinitionId: DefinitionId;
  readonly ownership: PieceOwnershipDefinition;
  readonly faces: readonly PieceFaceDefinition[];
  readonly capabilities: readonly CapabilityDeclaration[];
  readonly resource: ResourceDefinitionProfile | null;
  readonly facility: FacilityDefinitionProfile | null;
  readonly marker: MarkerDefinitionProfile | null;
  readonly deferredClassification: string | null;
  readonly source: PieceDefinitionSource;
}

export interface PieceDefinitionCatalog {
  readonly id: DefinitionId;
  readonly schemaVersion: SchemaVersion;
  readonly definitions: readonly PieceDefinition[];
  readonly provenance: readonly SourceReference[];
}
