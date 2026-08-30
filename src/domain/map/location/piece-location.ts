import {
  compareNumber,
  compareHexIds,
  compareText,
  parseHexCoordinateId,
  parsePieceId,
  stableKey,
  type HexId,
  type PieceId,
  type ValidationIssue,
} from '../../../core/index.js';
import {
  parseMapBoxId,
  parseMapTrackId,
  parsePiecePoolId,
  type MapBoxId,
  type MapTrackId,
  type PiecePoolId,
} from './ids.js';

export type PieceLocation =
  | { readonly kind: 'ON_MAP'; readonly hexId: HexId }
  | { readonly kind: 'OFF_MAP_BOX'; readonly boxId: MapBoxId }
  | { readonly kind: 'HOLDING_AREA'; readonly boxId: MapBoxId }
  | { readonly kind: 'TURN_TRACK'; readonly trackId: MapTrackId; readonly position: number }
  | { readonly kind: 'POOL'; readonly poolId: PiecePoolId }
  | { readonly kind: 'ELIMINATED' }
  | { readonly kind: 'CONTAINER'; readonly containerId: PieceId };

const LOCATION_KIND_ORDER: Readonly<Record<PieceLocation['kind'], number>> = {
  ON_MAP: 0,
  OFF_MAP_BOX: 1,
  HOLDING_AREA: 2,
  TURN_TRACK: 3,
  POOL: 4,
  CONTAINER: 5,
  ELIMINATED: 6,
};

const invalidReference = (field: string, value: string): ValidationIssue => ({
  code: 'INVALID_LOCATION_REFERENCE',
  path: [field],
  severity: 'ERROR',
  message: `Location ${field} is not a valid canonical ID: ${value}.`,
});

export const validatePieceLocation = (
  location: PieceLocation,
  ownerId?: PieceId,
): readonly ValidationIssue[] => {
  switch (location.kind) {
    case 'ON_MAP':
      return parseHexCoordinateId(location.hexId).ok
        ? []
        : [invalidReference('hexId', location.hexId)];
    case 'OFF_MAP_BOX':
    case 'HOLDING_AREA':
      return parseMapBoxId(location.boxId).ok
        ? []
        : [invalidReference('boxId', location.boxId)];
    case 'TURN_TRACK': {
      const issues: ValidationIssue[] = [];
      if (!parseMapTrackId(location.trackId).ok) {
        issues.push(invalidReference('trackId', location.trackId));
      }
      if (!Number.isSafeInteger(location.position) || location.position < 0) {
        issues.push({
          code: 'INVALID_TURN_TRACK_POSITION',
          path: ['position'],
          severity: 'ERROR',
          message: `Turn-track position must be a non-negative safe integer: ${location.position}.`,
        });
      }
      return issues;
    }
    case 'POOL':
      return parsePiecePoolId(location.poolId).ok
        ? []
        : [invalidReference('poolId', location.poolId)];
    case 'CONTAINER': {
      const issues: ValidationIssue[] = [];
      if (!parsePieceId(location.containerId).ok) {
        issues.push(invalidReference('containerId', location.containerId));
      }
      if (ownerId === location.containerId) {
        issues.push({
          code: 'SELF_CONTAINER_LOCATION',
          path: ['containerId'],
          severity: 'ERROR',
          message: 'A Piece cannot use itself as its container.',
        });
      }
      return issues;
    }
    case 'ELIMINATED':
      return [];
  }
};

interface LocationSortComponents {
  readonly rank: number;
  readonly text: string;
  readonly first: number;
  readonly second: number;
}

const sortComponents = (location: PieceLocation): LocationSortComponents => {
  switch (location.kind) {
    case 'ON_MAP': {
      const coordinate = parseHexCoordinateId(location.hexId);
      return coordinate.ok
        ? { rank: LOCATION_KIND_ORDER.ON_MAP, text: '', first: coordinate.value.q, second: coordinate.value.r }
        : { rank: LOCATION_KIND_ORDER.ON_MAP, text: location.hexId, first: 0, second: 0 };
    }
    case 'OFF_MAP_BOX':
      return { rank: LOCATION_KIND_ORDER.OFF_MAP_BOX, text: location.boxId, first: 0, second: 0 };
    case 'HOLDING_AREA':
      return { rank: LOCATION_KIND_ORDER.HOLDING_AREA, text: location.boxId, first: 0, second: 0 };
    case 'TURN_TRACK':
      return { rank: LOCATION_KIND_ORDER.TURN_TRACK, text: location.trackId, first: location.position, second: 0 };
    case 'POOL':
      return { rank: LOCATION_KIND_ORDER.POOL, text: location.poolId, first: 0, second: 0 };
    case 'CONTAINER':
      return { rank: LOCATION_KIND_ORDER.CONTAINER, text: location.containerId, first: 0, second: 0 };
    case 'ELIMINATED':
      return { rank: LOCATION_KIND_ORDER.ELIMINATED, text: '', first: 0, second: 0 };
  }
};

export const comparePieceLocations = (left: PieceLocation, right: PieceLocation): number => {
  if (left.kind === 'ON_MAP' && right.kind === 'ON_MAP') {
    return compareHexIds(left.hexId, right.hexId);
  }
  const leftKey = sortComponents(left);
  const rightKey = sortComponents(right);
  return compareNumber(leftKey.rank, rightKey.rank)
    || compareText(leftKey.text, rightKey.text)
    || compareNumber(leftKey.first, rightKey.first)
    || compareNumber(leftKey.second, rightKey.second);
};

export const pieceLocationKey = (location: PieceLocation): string => {
  switch (location.kind) {
    case 'ON_MAP':
      return stableKey([location.kind, location.hexId]);
    case 'OFF_MAP_BOX':
    case 'HOLDING_AREA':
      return stableKey([location.kind, location.boxId]);
    case 'TURN_TRACK':
      return stableKey([location.kind, location.trackId, String(location.position)]);
    case 'POOL':
      return stableKey([location.kind, location.poolId]);
    case 'CONTAINER':
      return stableKey([location.kind, location.containerId]);
    case 'ELIMINATED':
      return stableKey([location.kind]);
  }
};

export const pieceLocationsEqual = (left: PieceLocation, right: PieceLocation): boolean =>
  pieceLocationKey(left) === pieceLocationKey(right);
