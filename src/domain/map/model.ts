import {
  err,
  ok,
  parseStableIdValue,
  type Brand,
  type DefinitionId,
  type HexId,
  type PlayerId,
  type Result,
  type Revision,
  type SchemaVersion,
  type SourceReference,
  type StableIdValueError,
} from '../../core/index.js';
import type { AxialBounds } from './bounds.js';
import type { HexsideFeatureCollection, HexsideId } from './location/index.js';

export type MapFeatureStateId = Brand<string, 'MapFeatureStateId'>;

export interface MapFeatureStateIdError {
  readonly code: 'INVALID_MAP_FEATURE_STATE_ID';
  readonly value: string;
  readonly reason: StableIdValueError['reason'];
}

export const parseMapFeatureStateId = (
  value: string,
): Result<MapFeatureStateId, MapFeatureStateIdError> => {
  const parsed = parseStableIdValue(value);
  return parsed.ok
    ? ok(parsed.value as MapFeatureStateId)
    : err({ code: 'INVALID_MAP_FEATURE_STATE_ID', value, reason: parsed.error.reason });
};

export type HexFeatureKind = 'PRINTED_FEATURE' | 'FACILITY' | 'SOURCE' | 'ENTRY';
export type MapFeatureKind = HexFeatureKind | 'HEXSIDE_FEATURE';

export interface HexFeatureRef {
  readonly kind: HexFeatureKind;
  readonly definitionId: DefinitionId;
}

export interface HexDefinition {
  readonly id: HexId;
  readonly terrainDefinitionIds: readonly DefinitionId[];
  readonly features: readonly HexFeatureRef[];
}

export interface MapDefinition {
  readonly id: DefinitionId;
  readonly schemaVersion: SchemaVersion;
  readonly bounds: AxialBounds;
  readonly hexes: readonly HexDefinition[];
  readonly hexsides: readonly HexsideFeatureCollection[];
  readonly provenance: readonly SourceReference[];
  readonly overrideDefinitionIds: readonly DefinitionId[];
}

export type MapFeatureLocation =
  | { readonly kind: 'HEX'; readonly hexId: HexId }
  | { readonly kind: 'HEXSIDE'; readonly hexsideId: HexsideId };

export interface MapFeatureState {
  readonly id: MapFeatureStateId;
  readonly kind: MapFeatureKind;
  readonly definitionId: DefinitionId;
  readonly location: MapFeatureLocation;
  readonly statusDefinitionIds: readonly DefinitionId[];
  readonly controllerId: PlayerId | null;
  readonly level: number;
  readonly damage: number;
}

export interface HexControlState {
  readonly hexId: HexId;
  readonly controllerId: PlayerId | null;
}

export interface MapState {
  readonly schemaVersion: SchemaVersion;
  readonly revision: Revision;
  readonly hexControl: readonly HexControlState[];
  readonly features: readonly MapFeatureState[];
}

export type DefinitionMapFeatureKind = 'TERRAIN' | MapFeatureKind;

export type EffectiveMapFeature =
  | {
    readonly origin: 'DEFINITION';
    readonly kind: DefinitionMapFeatureKind;
    readonly definitionId: DefinitionId;
  }
  | {
    readonly origin: 'STATE';
    readonly feature: MapFeatureState;
  };
