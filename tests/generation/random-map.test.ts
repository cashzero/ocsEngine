import { describe, expect, it } from 'vitest';
import {
  generateRandomMap,
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

  it('rejects invalid generation options without partial output', () => {
    const generated = generateRandomMap({ width: 4, height: 99, seed: -1, style: 'TEMPERATE_INLAND' });
    expect(generated.ok).toBe(false);
    if (!generated.ok) expect(generated.error.map(({ path }) => path[0])).toEqual(['width', 'height', 'seed']);
  });
});
