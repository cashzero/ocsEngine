import { describe, expect, it } from 'vitest';
import {
  HEX_DIRECTIONS,
  axialToCube,
  createHexCoordinate,
  cubeToAxial,
  findNeighborDirection,
  formatHexId,
  hex,
  hexDistance,
  hexEquals,
  hexLine,
  hexRange,
  hexRing,
  hexToPixel,
  neighbor,
  neighbors,
  oppositeDirection,
  parseHexCoordinateId,
  pixelToHex,
  reflectHex,
  rotateHex,
  rotateHexAround,
  type PointyHexLayout,
} from '../../src/core/index.js';

describe('hex coordinate identity', () => {
  it('formats and parses canonical signed coordinates', () => {
    const coordinate = hex(3, -2);
    expect(formatHexId(coordinate)).toBe('3,-2');
    expect(parseHexCoordinateId('3,-2')).toEqual({ ok: true, value: coordinate });
  });

  it('rejects fractional coordinates and non-canonical IDs', () => {
    expect(createHexCoordinate(1.5, 2)).toMatchObject({ ok: false });
    expect(parseHexCoordinateId('03,-2')).toMatchObject({ ok: false });
    expect(parseHexCoordinateId('3, -2')).toMatchObject({ ok: false });
    expect(parseHexCoordinateId('-0,0')).toMatchObject({ ok: false });
  });

  it('normalizes negative zero at the coordinate boundary', () => {
    expect(hex(-0, -0)).toEqual(hex(0, 0));
    expect(formatHexId(hex(-0, -0))).toBe('0,0');
  });
});

describe('hex direction and distance', () => {
  it('uses the documented pointy-top direction order', () => {
    const origin = hex(0, 0);
    expect(neighbors(origin)).toEqual([
      hex(1, -1),
      hex(1, 0),
      hex(0, 1),
      hex(-1, 1),
      hex(-1, 0),
      hex(0, -1),
    ]);
  });

  it('returns to the origin through every opposite direction', () => {
    const origins = [hex(0, 0), hex(5, -7), hex(-4, 9)];
    for (const origin of origins) {
      for (const direction of HEX_DIRECTIONS) {
        expect(hexEquals(
          neighbor(neighbor(origin, direction), oppositeDirection(direction)),
          origin,
        )).toBe(true);
      }
    }
  });

  it('keeps distance symmetric and satisfies triangle inequality', () => {
    const coordinates = hexRange(hex(0, 0), 4);
    for (const left of coordinates) {
      for (const right of coordinates) {
        expect(hexDistance(left, right)).toBe(hexDistance(right, left));
        expect(hexDistance(left, right)).toBeLessThanOrEqual(
          hexDistance(left, hex(0, 0)) + hexDistance(hex(0, 0), right),
        );
      }
    }
  });

  it('round-trips cube coordinates and rejects invalid cube triples', () => {
    for (const coordinate of hexRange(hex(0, 0), 5)) {
      expect(cubeToAxial(axialToCube(coordinate))).toEqual({ ok: true, value: coordinate });
    }
    expect(cubeToAxial({ q: 1, r: 1, s: 1 })).toMatchObject({
      ok: false,
      error: { reason: 'NON_ZERO_SUM' },
    });
  });

  it('preserves distance through rotations and reflections', () => {
    const center = hex(3, -2);
    const coordinates = hexRange(center, 3);
    for (const coordinate of coordinates) {
      expect(rotateHexAround(coordinate, center, 6)).toEqual(coordinate);
      for (let steps = -6; steps <= 6; steps += 1) {
        expect(hexDistance(center, rotateHexAround(coordinate, center, steps)))
          .toBe(hexDistance(center, coordinate));
      }
      for (const axis of ['Q', 'R', 'S'] as const) {
        expect(reflectHex(reflectHex(coordinate, axis), axis)).toEqual(coordinate);
        expect(hexDistance(hex(0, 0), reflectHex(coordinate, axis)))
          .toBe(hexDistance(hex(0, 0), coordinate));
      }
    }
    expect(rotateHex(hex(1, 0), 1)).toEqual(hex(0, 1));
    expect(() => rotateHex(hex(0, 0), 0.5)).toThrow(RangeError);
  });
});

describe('hex collections and lines', () => {
  it('returns deterministic range and ring cardinalities', () => {
    const center = hex(2, -1);
    for (let radius = 0; radius <= 8; radius += 1) {
      expect(hexRange(center, radius)).toHaveLength(1 + 3 * radius * (radius + 1));
      expect(hexRing(center, radius)).toHaveLength(radius === 0 ? 1 : 6 * radius);
      expect(new Set(hexRange(center, radius).map(formatHexId)).size).toBe(
        1 + 3 * radius * (radius + 1),
      );
    }
    expect(hexRange(center, 2)).toEqual(hexRange(center, 2));
  });

  it('builds a deterministic adjacent line including both endpoints', () => {
    const start = hex(-3, 2);
    const end = hex(4, -2);
    const line = hexLine(start, end);

    expect(line).toHaveLength(hexDistance(start, end) + 1);
    expect(line[0]).toEqual(start);
    expect(line.at(-1)).toEqual(end);
    for (let index = 1; index < line.length; index += 1) {
      const previous = line[index - 1];
      const current = line[index];
      expect(previous && current && hexDistance(previous, current)).toBe(1);
      expect(previous && current && findNeighborDirection(previous, current)).toBeDefined();
    }
  });

  it('keeps every interpolated line adjacent across a local property grid', () => {
    const coordinates = hexRange(hex(0, 0), 3);
    for (const start of coordinates) {
      for (const end of coordinates) {
        const line = hexLine(start, end);
        expect(line).toHaveLength(hexDistance(start, end) + 1);
        for (let index = 1; index < line.length; index += 1) {
          expect(hexDistance(line[index - 1]!, line[index]!)).toBe(1);
        }
      }
    }
  });
});

describe('pointy-top layout', () => {
  const layout: PointyHexLayout = { size: 47.45, origin: { x: 123, y: -88 } };

  it('round-trips logical coordinates through pixels', () => {
    for (const coordinate of hexRange(hex(0, 0), 10)) {
      expect(pixelToHex(hexToPixel(coordinate, layout), layout)).toEqual(coordinate);
    }
  });

  it('rejects invalid layouts and pixels', () => {
    expect(() => hexToPixel(hex(0, 0), { ...layout, size: 0 })).toThrow(RangeError);
    expect(() => pixelToHex({ x: Number.NaN, y: 0 }, layout)).toThrow(RangeError);
  });
});
