import { err, ok, type HexCoordinate, type Result } from '../../core/index.js';

export interface AxialBounds {
  readonly minQ: number;
  readonly maxQ: number;
  readonly minR: number;
  readonly maxR: number;
}

export interface AxialBoundsError {
  readonly code: 'INVALID_AXIAL_BOUNDS';
  readonly bounds: AxialBounds;
  readonly reason: 'NOT_SAFE_INTEGER' | 'INVERTED_RANGE';
}

export const createAxialBounds = (
  bounds: AxialBounds,
): Result<AxialBounds, AxialBoundsError> => {
  const values = [bounds.minQ, bounds.maxQ, bounds.minR, bounds.maxR];
  if (!values.every(Number.isSafeInteger)) {
    return err({ code: 'INVALID_AXIAL_BOUNDS', bounds, reason: 'NOT_SAFE_INTEGER' });
  }
  if (bounds.minQ > bounds.maxQ || bounds.minR > bounds.maxR) {
    return err({ code: 'INVALID_AXIAL_BOUNDS', bounds, reason: 'INVERTED_RANGE' });
  }
  return ok({ ...bounds });
};

export const axialBoundsContain = (
  bounds: AxialBounds,
  coordinate: HexCoordinate,
): boolean => coordinate.q >= bounds.minQ
  && coordinate.q <= bounds.maxQ
  && coordinate.r >= bounds.minR
  && coordinate.r <= bounds.maxR;
