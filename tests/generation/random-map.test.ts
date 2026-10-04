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

  it.each(['TEMPERATE_INLAND', 'MEDITERRANEAN_COAST', 'EASTERN_EUROPE'] as const)(
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

  it('builds a BtR-scale road mesh: dense, looped, every place on a road, no unserved district', () => {
    for (const style of ['TEMPERATE_INLAND', 'MEDITERRANEAN_COAST'] as const) for (const seed of [3, 1943, 31337, 2024]) {
      const generated = generateRandomMap({ width: 32, height: 24, seed, style });
      expect(generated.ok).toBe(true);
      if (!generated.ok) continue;
      const { metrics, mapDefinition } = generated.value;
      // 3.5-mile Hexes: about one road Hexside per two land Hexes, most of it Secondary Road.
      expect(metrics.roadEdges / metrics.landHexes).toBeGreaterThan(0.4);
      expect(metrics.primaryRoadEdges / metrics.landHexes).toBeGreaterThan(0.25);
      expect(metrics.settlements / metrics.landHexes).toBeGreaterThan(0.08);
      expect(metrics.roadGapExcess).toBe(0);
      expect(metrics.maximumRoadGap).toBeLessThanOrEqual(3);
      const roadHexes = new Map<string, number>();
      for (const { hexsideId, featureDefinitionIds } of mapDefinition.hexsides) {
        if (!featureDefinitionIds.some((id) => /^edge:(?:primary-)?road$/u.test(String(id)))) continue;
        const parsed = parseHexsideId(hexsideId);
        if (!parsed.ok) continue;
        for (const hexId of [parsed.value.firstHexId, parsed.value.secondHexId]) roadHexes.set(hexId, (roadHexes.get(hexId) ?? 0) + 1);
      }
      const places = mapDefinition.hexes.filter(({ features }) => features.some(({ definitionId }) => String(definitionId).startsWith('settlement:')));
      expect(places.every(({ id }) => roadHexes.has(id))).toBe(true);
      // A tree has one fewer edge than nodes; a road mesh has many loops.
      expect(metrics.roadEdges).toBeGreaterThan(roadHexes.size * 1.1);
      const towns = places.filter(({ features }) => features.some(({ definitionId }) => String(definitionId) === 'settlement:town'));
      expect(towns.reduce((sum, { id }) => sum + roadHexes.get(id)!, 0) / towns.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('lays one railway network, much sparser than the roads, with a multi-track trunk and every entry on the rails (12.6a, 13.3)', () => {
    for (const style of ['TEMPERATE_INLAND', 'MEDITERRANEAN_COAST'] as const) for (const seed of [3, 1943, 31337, 2024]) {
      const generated = generateRandomMap({ width: 32, height: 24, seed, style });
      expect(generated.ok).toBe(true);
      if (!generated.ok) continue;
      const { metrics, mapDefinition, strategicRegions } = generated.value;
      expect(metrics.connectedRailComponents).toBe(1);
      // Railways are a sparse strategic net: well under half the road density, but present.
      expect(metrics.railEdges / metrics.roadEdges).toBeGreaterThan(0.12);
      expect(metrics.railEdges / metrics.roadEdges).toBeLessThan(0.4);
      expect(metrics.railStations).toBeGreaterThan(0);
      const rail = new Map<string, string[]>();
      const multi = new Map<string, string[]>();
      for (const { hexsideId, featureDefinitionIds } of mapDefinition.hexsides) {
        const ids = featureDefinitionIds.map(String);
        if (!ids.some((id) => /^edge:(?:multi-track-)?rail$/u.test(id))) continue;
        const parsed = parseHexsideId(hexsideId);
        if (!parsed.ok) continue;
        const { firstHexId: a, secondHexId: b } = parsed.value;
        for (const target of ids.includes('edge:multi-track-rail') ? [rail, multi] : [rail]) {
          target.set(a, [...(target.get(a) ?? []), b]);
          target.set(b, [...(target.get(b) ?? []), a]);
        }
      }
      for (const entry of [...strategicRegions.firstEntryHexIds, ...strategicRegions.secondEntryHexIds]) expect(rail.has(entry)).toBe(true);
      // The trunk: the two main entries are joined by multi-track alone.
      const start = strategicRegions.firstEntryHexIds[0]!;
      const seen = new Set<string>([start]);
      const queue: string[] = [start];
      while (queue.length > 0) for (const next of multi.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
      expect(seen.has(strategicRegions.secondEntryHexIds[0]!)).toBe(true);
    }
  });

  it('makes Eastern Europe flatter and emptier than BtR: fewer roads, railways and towns on the same seeds (docs/generator/11)', () => {
    for (const seed of [3, 1943, 31337, 2024]) {
      const western = generateRandomMap({ width: 32, height: 24, seed, style: 'TEMPERATE_INLAND' });
      const generated = generateRandomMap({ width: 32, height: 24, seed, style: 'EASTERN_EUROPE' });
      expect(western.ok && generated.ok).toBe(true);
      if (!western.ok || !generated.ok) continue;
      const west = western.value.metrics;
      const { metrics, mapDefinition, strategicRegions, options: normalized } = generated.value;
      const share = (value: number, of: typeof metrics) => value / of.landHexes;
      // Flatter: steppe and farmland, low hills in patches, no mountains, no sea.
      expect(metrics.terrainCounts.MOUNTAIN).toBe(0);
      expect(metrics.terrainCounts.WATER).toBe(0);
      expect(share(metrics.terrainCounts.CLEAR, metrics)).toBeGreaterThan(0.7);
      expect(share(metrics.terrainCounts.ROUGH, metrics)).toBeLessThan(share(west.terrainCounts.ROUGH, west) / 2);
      // Emptier: about half the places, half the roads, and a thinner rail net than the BtR calibration.
      expect(normalized.settlementDensity).toBe(0.05);
      expect(share(metrics.settlements, metrics)).toBeLessThan(share(west.settlements, west) * 0.7);
      expect(share(metrics.roadEdges, metrics)).toBeLessThan(share(west.roadEdges, west) * 0.6);
      expect(share(metrics.roadEdges, metrics)).toBeGreaterThan(0.18);
      expect(share(metrics.primaryRoadEdges, metrics)).toBeLessThan(share(west.primaryRoadEdges, west) * 0.6);
      expect(share(metrics.railEdges, metrics)).toBeLessThan(share(west.railEdges, west) * 0.85);
      // Steppe may lie four Hexes from a road (five in woods and hills), but no farther.
      expect(metrics.roadGapExcess).toBe(0);
      expect(metrics.maximumRoadGap).toBeLessThanOrEqual(5);
      expect(metrics.maximumRoadGap).toBeGreaterThan(west.maximumRoadGap);
      // The structural guarantees still hold: one road net reaching every place, one rail net reaching every entry.
      expect(metrics.connectedRoadComponents).toBe(1);
      expect(metrics.connectedRailComponents).toBe(1);
      const roadHexes = new Set<string>();
      const railHexes = new Set<string>();
      for (const { hexsideId, featureDefinitionIds } of mapDefinition.hexsides) {
        const parsed = parseHexsideId(hexsideId);
        if (!parsed.ok) continue;
        const ids = featureDefinitionIds.map(String);
        const ends = [parsed.value.firstHexId, parsed.value.secondHexId];
        if (ids.some((id) => /^edge:(?:primary-)?road$/u.test(id))) ends.forEach((id) => roadHexes.add(id));
        if (ids.some((id) => /^edge:(?:multi-track-)?rail$/u.test(id))) ends.forEach((id) => railHexes.add(id));
      }
      expect(mapDefinition.hexes.filter(({ features }) => features.some(({ definitionId }) => String(definitionId).startsWith('settlement:')))
        .every(({ id }) => roadHexes.has(id))).toBe(true);
      expect([...strategicRegions.firstEntryHexIds, ...strategicRegions.secondEntryHexIds].every((id) => railHexes.has(id))).toBe(true);
    }
  });

  it('rejects invalid generation options without partial output', () => {
    const generated = generateRandomMap({ width: 4, height: 99, seed: -1, style: 'TEMPERATE_INLAND' });
    expect(generated.ok).toBe(false);
    if (!generated.ok) expect(generated.error.map(({ path }) => path[0])).toEqual(['width', 'height', 'seed']);
  });
});
