import { hex, type HexCoordinate } from './coordinate.js';

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface PointyHexLayout {
  readonly size: number;
  readonly origin: PixelPoint;
}

const validateLayout = (layout: PointyHexLayout): void => {
  if (!Number.isFinite(layout.size) || layout.size <= 0) {
    throw new RangeError(`Hex layout size must be a positive finite number: ${layout.size}.`);
  }
  if (!Number.isFinite(layout.origin.x) || !Number.isFinite(layout.origin.y)) {
    throw new RangeError('Hex layout origin must contain finite coordinates.');
  }
};

export const hexToPixel = (
  coordinate: HexCoordinate,
  layout: PointyHexLayout,
): PixelPoint => {
  validateLayout(layout);
  return {
    x: layout.origin.x
      + layout.size * (Math.sqrt(3) * coordinate.q + (Math.sqrt(3) / 2) * coordinate.r),
    y: layout.origin.y + layout.size * (3 / 2) * coordinate.r,
  };
};

const roundFractionalHex = (q: number, r: number): HexCoordinate => {
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  const s = -q - r;
  const roundedS = Math.round(s);

  const qDifference = Math.abs(roundedQ - q);
  const rDifference = Math.abs(roundedR - r);
  const sDifference = Math.abs(roundedS - s);

  if (qDifference > rDifference && qDifference > sDifference) {
    roundedQ = -roundedR - roundedS;
  } else if (rDifference > sDifference) {
    roundedR = -roundedQ - roundedS;
  }
  return hex(roundedQ, roundedR);
};

export const pixelToHex = (
  point: PixelPoint,
  layout: PointyHexLayout,
): HexCoordinate => {
  validateLayout(layout);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Pixel point must contain finite coordinates.');
  }

  const x = (point.x - layout.origin.x) / layout.size;
  const y = (point.y - layout.origin.y) / layout.size;
  return roundFractionalHex(
    (Math.sqrt(3) / 3) * x - (1 / 3) * y,
    (2 / 3) * y,
  );
};
