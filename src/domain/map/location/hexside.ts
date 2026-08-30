import {
  compareHexCoordinates,
  formatHexId,
  hexDistance,
  neighbor,
  oppositeDirection,
  parseHexCoordinateId,
  type Brand,
  type DefinitionId,
  type HexCoordinate,
  type HexDirection,
  type HexId,
  type Result,
  err,
  ok,
} from '../../../core/index.js';

export type HexsideId = Brand<string, 'HexsideId'>;

export interface DirectedHexsideRef {
  readonly hexId: HexId;
  readonly direction: HexDirection;
}

export interface CanonicalHexside {
  readonly id: HexsideId;
  readonly firstHexId: HexId;
  readonly secondHexId: HexId;
}

export interface HexsideFeatureCollection {
  readonly hexsideId: HexsideId;
  readonly featureDefinitionIds: readonly DefinitionId[];
}

export interface HexsideError {
  readonly code: 'INVALID_HEXSIDE';
  readonly value: string;
  readonly reason: 'MALFORMED' | 'INVALID_HEX_ID' | 'HEXES_NOT_ADJACENT' | 'NOT_CANONICAL';
}

const fromEndpoints = (
  left: HexCoordinate,
  right: HexCoordinate,
): CanonicalHexside => {
  const [first, second] = compareHexCoordinates(left, right) <= 0
    ? [left, right]
    : [right, left];
  const firstHexId = formatHexId(first);
  const secondHexId = formatHexId(second);
  return {
    id: `${firstHexId}|${secondHexId}` as HexsideId,
    firstHexId,
    secondHexId,
  };
};

export const directedHexside = (
  coordinate: HexCoordinate,
  direction: HexDirection,
): DirectedHexsideRef => ({ hexId: formatHexId(coordinate), direction });

export const reciprocalHexside = (
  reference: DirectedHexsideRef,
): Result<DirectedHexsideRef, HexsideError> => {
  const coordinate = parseHexCoordinateId(reference.hexId);
  if (!coordinate.ok) {
    return err({
      code: 'INVALID_HEXSIDE',
      value: `${reference.hexId}/${reference.direction}`,
      reason: 'INVALID_HEX_ID',
    });
  }
  return ok({
    hexId: formatHexId(neighbor(coordinate.value, reference.direction)),
    direction: oppositeDirection(reference.direction),
  });
};

export const canonicalizeHexside = (
  reference: DirectedHexsideRef,
): Result<CanonicalHexside, HexsideError> => {
  const coordinate = parseHexCoordinateId(reference.hexId);
  if (!coordinate.ok) {
    return err({
      code: 'INVALID_HEXSIDE',
      value: `${reference.hexId}/${reference.direction}`,
      reason: 'INVALID_HEX_ID',
    });
  }
  return ok(fromEndpoints(
    coordinate.value,
    neighbor(coordinate.value, reference.direction),
  ));
};

export const parseHexsideId = (value: string): Result<CanonicalHexside, HexsideError> => {
  const parts = value.split('|');
  if (parts.length !== 2) {
    return err({ code: 'INVALID_HEXSIDE', value, reason: 'MALFORMED' });
  }

  const first = parseHexCoordinateId(parts[0]!);
  const second = parseHexCoordinateId(parts[1]!);
  if (!first.ok || !second.ok) {
    return err({ code: 'INVALID_HEXSIDE', value, reason: 'INVALID_HEX_ID' });
  }
  if (hexDistance(first.value, second.value) !== 1) {
    return err({ code: 'INVALID_HEXSIDE', value, reason: 'HEXES_NOT_ADJACENT' });
  }

  const canonical = fromEndpoints(first.value, second.value);
  return canonical.id === value
    ? ok(canonical)
    : err({ code: 'INVALID_HEXSIDE', value, reason: 'NOT_CANONICAL' });
};
