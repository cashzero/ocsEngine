import {
  err,
  ok,
  parseStableIdValue,
  type Brand,
  type Result,
  type StableIdValueError,
} from '../../../core/index.js';

export type MapNodeId = Brand<string, 'MapNodeId'>;
export type MapRegionId = Brand<string, 'MapRegionId'>;
export type MapTrackId = Brand<string, 'MapTrackId'>;
export type MapBoxId = Brand<string, 'MapBoxId'>;
export type PiecePoolId = Brand<string, 'PiecePoolId'>;

export type MapPlaceIdKind = 'MAP_NODE' | 'MAP_REGION' | 'MAP_TRACK' | 'MAP_BOX' | 'PIECE_POOL';

export interface MapPlaceIdError {
  readonly code: 'INVALID_MAP_PLACE_ID';
  readonly kind: MapPlaceIdKind;
  readonly value: string;
  readonly reason: StableIdValueError['reason'];
}

const parseMapPlaceId = <T extends string>(
  kind: MapPlaceIdKind,
  value: string,
): Result<T, MapPlaceIdError> => {
  const parsed = parseStableIdValue(value);
  return parsed.ok
    ? ok(parsed.value as T)
    : err({ code: 'INVALID_MAP_PLACE_ID', kind, value, reason: parsed.error.reason });
};

export const parseMapNodeId = (value: string): Result<MapNodeId, MapPlaceIdError> =>
  parseMapPlaceId<MapNodeId>('MAP_NODE', value);

export const parseMapRegionId = (value: string): Result<MapRegionId, MapPlaceIdError> =>
  parseMapPlaceId<MapRegionId>('MAP_REGION', value);

export const parseMapTrackId = (value: string): Result<MapTrackId, MapPlaceIdError> =>
  parseMapPlaceId<MapTrackId>('MAP_TRACK', value);

export const parseMapBoxId = (value: string): Result<MapBoxId, MapPlaceIdError> =>
  parseMapPlaceId<MapBoxId>('MAP_BOX', value);

export const parsePiecePoolId = (value: string): Result<PiecePoolId, MapPlaceIdError> =>
  parseMapPlaceId<PiecePoolId>('PIECE_POOL', value);
