import { describe, expect, it } from 'vitest';
import {
  generateRandomMap,
  hexDistance,
  parseHexCoordinateId,
  parseHexsideId,
  serializeGeneratedMap,
  validateGeneratedMap,
  validateMapDefinition,
} from '../../src/index.js';

const options = {
  width: 18, height: 12, seed: 1943,
  style: 'TEMPERATE_INLAND' as const,
};

describe('M6 deterministic random map pipeline', () => {
  it('returns byte-identical Foundation map data for the same seed', () => {
    const first = generateRandomMap(options);
    const second = generateRandomMap(options);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(serializeGeneratedMap(first.value)).toEqual(serializeGeneratedMap(second.value));
    expect(validateMapDefinition(first.value.mapDefinition)).toEqual([]);
  });

  it.each(['TEMPERATE_INLAND', 'MEDITERRANEAN_COAST'] as const)(
    'generates valid %s terrain, rivers, strategic regions, and roads',
    (style) => {
      const generated = generateRandomMap({ ...options, style, seed: style.length * 101 });
      expect(generated.ok).toBe(true);
      if (!generated.ok) return;
      const result = generated.value;
      expect(result.mapDefinition.hexes).toHaveLength(options.width * options.height);
      expect(result.metrics).toMatchObject({ connectedRoadComponents: 1 });
      expect(result.metrics.roadEdges).toBeGreaterThan(0);
      expect(result.metrics.riverEdges).toBeGreaterThan(0);
      expect(result.metrics.settlements).toBeGreaterThanOrEqual(4);
      expect(validateGeneratedMap(result.mapDefinition, result.strategicRegions, style).valid).toBe(true);
      expect(result.mapDefinition.hexsides.every(({ hexsideId }) => parseHexsideId(hexsideId).ok)).toBe(true);
      if (style === 'MEDITERRANEAN_COAST') expect(result.metrics.terrainCounts.WATER).toBeGreaterThan(0);
      else expect(result.metrics.terrainCounts.WATER).toBe(0);
    },
  );

  it('draws rivers as corner-connected channels that join into few systems', () => {
    type Side = readonly [ReturnType<typeof hexOf>, ReturnType<typeof hexOf>];
    function hexOf(id: string) {
      const parsed = parseHexCoordinateId(id as never);
      if (!parsed.ok) throw new Error('bad hex');
      return parsed.value;
    }
    for (const seed of [1, 7, 1943, 31337, 5, 99, 2024, 777]) {
      const generated = generateRandomMap({ ...options, seed });
      expect(generated.ok).toBe(true);
      if (!generated.ok) continue;
      const sides: Side[] = generated.value.mapDefinition.hexsides
        .filter(({ featureDefinitionIds }) => featureDefinitionIds.some((id) => /^edge:(?:major-)?river$/u.test(String(id))))
        .map(({ hexsideId }) => {
          const parsed = parseHexsideId(hexsideId);
          if (!parsed.ok) throw new Error('bad hexside');
          return [hexOf(parsed.value.firstHexId), hexOf(parsed.value.secondHexId)] as const;
        });
      // Two Hexsides meet at a corner when they share one Hex and their other Hexes are adjacent.
      const meets = (left: Side, right: Side): boolean => {
        const shared = left.filter((a) => right.some((b) => hexDistance(a, b) === 0));
        if (shared.length !== 1) return false;
        const a = left.find((hex) => hexDistance(hex, shared[0]!) !== 0)!;
        const b = right.find((hex) => hexDistance(hex, shared[0]!) !== 0)!;
        return hexDistance(a, b) === 1;
      };
      const parent = sides.map((_, index) => index);
      const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index]!)));
      sides.forEach((left, i) => sides.forEach((right, j) => { if (j > i && meets(left, right)) parent[find(i)] = find(j); }));
      sides.forEach((side, i) => expect(sides.some((other, j) => j !== i && meets(side, other))).toBe(true));
      expect(new Set(sides.map((_, i) => find(i))).size).toBeLessThanOrEqual(4);
    }
  });

  it('rejects invalid generation options without partial output', () => {
    const generated = generateRandomMap({ width: 4, height: 99, seed: -1, style: 'TEMPERATE_INLAND' });
    expect(generated.ok).toBe(false);
    if (!generated.ok) expect(generated.error.map(({ path }) => path[0])).toEqual(['width', 'height', 'seed']);
  });
});
