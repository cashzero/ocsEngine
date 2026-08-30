import { axialToCube, hex, hexEquals, type CubeCoordinate, type HexCoordinate } from './coordinate.js';

export const HEX_DIRECTIONS = ['NE', 'E', 'SE', 'SW', 'W', 'NW'] as const;

export type HexDirection = (typeof HEX_DIRECTIONS)[number];
export type HexReflectionAxis = 'Q' | 'R' | 'S';

const DIRECTION_OFFSETS: Readonly<Record<HexDirection, HexCoordinate>> = {
  NE: { q: 1, r: -1 },
  E: { q: 1, r: 0 },
  SE: { q: 0, r: 1 },
  SW: { q: -1, r: 1 },
  W: { q: -1, r: 0 },
  NW: { q: 0, r: -1 },
};

const OPPOSITE_DIRECTIONS: Readonly<Record<HexDirection, HexDirection>> = {
  NE: 'SW',
  E: 'W',
  SE: 'NW',
  SW: 'NE',
  W: 'E',
  NW: 'SE',
};

export const oppositeDirection = (direction: HexDirection): HexDirection =>
  OPPOSITE_DIRECTIONS[direction];

export const neighbor = (
  coordinate: HexCoordinate,
  direction: HexDirection,
): HexCoordinate => {
  const offset = DIRECTION_OFFSETS[direction];
  return hex(coordinate.q + offset.q, coordinate.r + offset.r);
};

export const neighbors = (coordinate: HexCoordinate): readonly HexCoordinate[] =>
  HEX_DIRECTIONS.map((direction) => neighbor(coordinate, direction));

const rotateCubeClockwise = ({ q, r, s }: CubeCoordinate): CubeCoordinate => ({
  q: -r,
  r: -s,
  s: -q,
});

/** Rotates around the axial origin in normalized 60-degree clockwise steps. */
export const rotateHex = (coordinate: HexCoordinate, clockwiseSteps: number): HexCoordinate => {
  if (!Number.isSafeInteger(clockwiseSteps)) {
    throw new RangeError(`Rotation steps must be a safe integer: ${clockwiseSteps}.`);
  }
  const steps = ((clockwiseSteps % 6) + 6) % 6;
  let cube = axialToCube(coordinate);
  for (let index = 0; index < steps; index += 1) cube = rotateCubeClockwise(cube);
  return hex(cube.q, cube.r);
};

export const rotateHexAround = (
  coordinate: HexCoordinate,
  center: HexCoordinate,
  clockwiseSteps: number,
): HexCoordinate => {
  const relative = hex(coordinate.q - center.q, coordinate.r - center.r);
  const rotated = rotateHex(relative, clockwiseSteps);
  return hex(rotated.q + center.q, rotated.r + center.r);
};

/** Reflects across the named cube axis through the origin by swapping the other axes. */
export const reflectHex = (
  coordinate: HexCoordinate,
  axis: HexReflectionAxis,
): HexCoordinate => {
  const { q, r, s } = axialToCube(coordinate);
  switch (axis) {
    case 'Q': return hex(q, s);
    case 'R': return hex(s, r);
    case 'S': return hex(r, q);
  }
};

export const hexDistance = (left: HexCoordinate, right: HexCoordinate): number => {
  const dq = left.q - right.q;
  const dr = left.r - right.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

const requireRadius = (radius: number): void => {
  if (!Number.isSafeInteger(radius) || radius < 0) {
    throw new RangeError(`Hex radius must be a non-negative safe integer: ${radius}.`);
  }
};

export const hexRange = (
  center: HexCoordinate,
  radius: number,
): readonly HexCoordinate[] => {
  requireRadius(radius);
  const coordinates: HexCoordinate[] = [];

  for (let dq = -radius; dq <= radius; dq += 1) {
    const minDr = Math.max(-radius, -dq - radius);
    const maxDr = Math.min(radius, -dq + radius);
    for (let dr = minDr; dr <= maxDr; dr += 1) {
      coordinates.push(hex(center.q + dq, center.r + dr));
    }
  }
  return coordinates;
};

export const hexRing = (
  center: HexCoordinate,
  radius: number,
): readonly HexCoordinate[] => {
  requireRadius(radius);
  return radius === 0
    ? [center]
    : hexRange(center, radius).filter((coordinate) => hexDistance(center, coordinate) === radius);
};

const cubeRound = ({ q, r, s }: CubeCoordinate): HexCoordinate => {
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
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

export const hexLine = (
  start: HexCoordinate,
  end: HexCoordinate,
): readonly HexCoordinate[] => {
  const distance = hexDistance(start, end);
  if (distance === 0) return [start];

  const startCube: CubeCoordinate = { q: start.q, r: start.r, s: -start.q - start.r };
  const endCube: CubeCoordinate = { q: end.q, r: end.r, s: -end.q - end.r };
  const epsilon = 1e-6;

  return Array.from({ length: distance + 1 }, (_, index) => {
    const ratio = index / distance;
    return cubeRound({
      q: startCube.q + (endCube.q - startCube.q) * ratio + epsilon,
      r: startCube.r + (endCube.r - startCube.r) * ratio + epsilon,
      s: startCube.s + (endCube.s - startCube.s) * ratio - 2 * epsilon,
    });
  });
};

export const findNeighborDirection = (
  from: HexCoordinate,
  to: HexCoordinate,
): HexDirection | undefined =>
  HEX_DIRECTIONS.find((direction) => hexEquals(neighbor(from, direction), to));
