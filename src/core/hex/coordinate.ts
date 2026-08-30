import { err, ok, type Result } from '../result.js';
import type { HexId } from '../identity.js';

export interface HexCoordinate {
  readonly q: number;
  readonly r: number;
}

export interface CubeCoordinate {
  readonly q: number;
  readonly r: number;
  readonly s: number;
}

export interface CubeCoordinateError {
  readonly code: 'INVALID_CUBE_COORDINATE';
  readonly coordinate: CubeCoordinate;
  readonly reason: 'NOT_SAFE_INTEGER' | 'NON_ZERO_SUM';
}

export interface HexCoordinateError {
  readonly code: 'INVALID_HEX_COORDINATE';
  readonly q: number;
  readonly r: number;
  readonly reason: 'NOT_SAFE_INTEGER';
}

export interface HexIdParseError {
  readonly code: 'INVALID_HEX_ID';
  readonly value: string;
}

const HEX_ID_PATTERN = /^(?:0|-?[1-9]\d*),(?:0|-?[1-9]\d*)$/;

export const createHexCoordinate = (
  q: number,
  r: number,
): Result<HexCoordinate, HexCoordinateError> => {
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) {
    return err({ code: 'INVALID_HEX_COORDINATE', q, r, reason: 'NOT_SAFE_INTEGER' });
  }
  return ok({
    q: Object.is(q, -0) ? 0 : q,
    r: Object.is(r, -0) ? 0 : r,
  });
};

export const hex = (q: number, r: number): HexCoordinate => {
  const coordinate = createHexCoordinate(q, r);
  if (!coordinate.ok) {
    throw new RangeError(`Hex coordinates must be safe integers: (${q}, ${r}).`);
  }
  return coordinate.value;
};

export const hexEquals = (left: HexCoordinate, right: HexCoordinate): boolean =>
  left.q === right.q && left.r === right.r;

export const axialToCube = (coordinate: HexCoordinate): CubeCoordinate => ({
  q: coordinate.q,
  r: coordinate.r,
  s: -coordinate.q - coordinate.r,
});

export const cubeToAxial = (
  coordinate: CubeCoordinate,
): Result<HexCoordinate, CubeCoordinateError> => {
  if (![coordinate.q, coordinate.r, coordinate.s].every(Number.isSafeInteger)) {
    return err({ code: 'INVALID_CUBE_COORDINATE', coordinate, reason: 'NOT_SAFE_INTEGER' });
  }
  if (coordinate.q + coordinate.r + coordinate.s !== 0) {
    return err({ code: 'INVALID_CUBE_COORDINATE', coordinate, reason: 'NON_ZERO_SUM' });
  }
  return ok(hex(coordinate.q, coordinate.r));
};

export const formatHexId = (coordinate: HexCoordinate): HexId =>
  `${coordinate.q},${coordinate.r}` as HexId;

export const parseHexCoordinateId = (value: string): Result<HexCoordinate, HexIdParseError> => {
  if (!HEX_ID_PATTERN.test(value)) return err({ code: 'INVALID_HEX_ID', value });

  const [qText, rText] = value.split(',');
  const q = Number(qText);
  const r = Number(rText);
  return Number.isSafeInteger(q) && Number.isSafeInteger(r)
    ? ok({ q, r })
    : err({ code: 'INVALID_HEX_ID', value });
};

export const compareHexCoordinates = (
  left: HexCoordinate,
  right: HexCoordinate,
): number => left.q < right.q
  ? -1
  : left.q > right.q
    ? 1
    : left.r < right.r
      ? -1
      : left.r > right.r
        ? 1
        : 0;

export const compareHexIds = (left: HexId, right: HexId): number => {
  const leftCoordinate = parseHexCoordinateId(left);
  const rightCoordinate = parseHexCoordinateId(right);
  if (leftCoordinate.ok && rightCoordinate.ok) {
    return compareHexCoordinates(leftCoordinate.value, rightCoordinate.value);
  }
  return left < right ? -1 : left > right ? 1 : 0;
};
