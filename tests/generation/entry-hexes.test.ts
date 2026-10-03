import { describe, expect, it } from 'vitest';
import { generateRandomMap, hexDistance, parseHexCoordinateId, type HexId } from '../../src/index.js';
import { DEFAULT_NEW_GAME_REQUEST, prepareNewGame } from '../../src/game-flow/index.js';
import { entryCountFor } from '../../src/generation/map/network.js';

const coordinate = (hexId: HexId) => {
  const parsed = parseHexCoordinateId(hexId);
  if (!parsed.ok) throw new Error(`Bad Hex ID ${hexId}`);
  return parsed.value;
};
/** Map column in the generator's odd-r offset rectangle. */
const column = (hexId: HexId) => coordinate(hexId).q + Math.floor(coordinate(hexId).r / 2);

describe('reinforcement entry Hexes along each map edge (13.6)', () => {
  it.each([
    [16, 12, 'TEMPERATE_INLAND'], [32, 24, 'TEMPERATE_INLAND'], [32, 24, 'MEDITERRANEAN_COAST'], [64, 48, 'TEMPERATE_INLAND'],
  ] as const)('spreads several entries, each a Supply Source, along each side\'s edge on a %ix%i %s map', (width, height, style) => {
    for (const seed of [1, 7, 1943, 0x0c500001]) {
      const generated = generateRandomMap({ width, height, style, seed });
      expect(generated.ok, `seed ${seed}`).toBe(true);
      if (!generated.ok) return;
      const regions = generated.value.strategicRegions;
      const land = new Set(generated.value.mapDefinition.hexes
        .filter(({ terrainDefinitionIds }) => !String(terrainDefinitionIds[0]).includes('water')).map(({ id }) => id));
      for (const [entries, sources, outward] of [
        [regions.firstEntryHexIds, regions.firstSupplyHexIds, (hexId: HexId) => column(hexId)],
        [regions.secondEntryHexIds, regions.secondSupplyHexIds, (hexId: HexId) => width - 1 - column(hexId)],
      ] as const) {
        expect(entries.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
        expect(entries.length).toBeLessThanOrEqual(entryCountFor(height));
        expect(new Set(entries).size).toBe(entries.length);
        expect(entries.every((hexId) => land.has(hexId))).toBe(true);
        // Every entry is a Supply Source, so an arrival starts in trace supply.
        expect([...sources].sort()).toEqual([...entries].sort());
        // The extra entries stand on the same map edge as the central one, apart from each other.
        expect(entries.every((hexId) => outward(hexId) <= outward(entries[0]!) + 1)).toBe(true);
        for (const [index, hexId] of entries.entries()) {
          for (const other of entries.slice(index + 1)) expect(hexDistance(coordinate(hexId), coordinate(other))).toBeGreaterThanOrEqual(2);
        }
      }
    }
  }, 30_000);

  it('gives each side of the default operation four entry Hexes, all declared in the Scenario', () => {
    const prepared = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const { scenario, generatedMap } = prepared.value;
    expect(generatedMap.strategicRegions.firstEntryHexIds).toHaveLength(4);
    expect(generatedMap.strategicRegions.secondEntryHexIds).toHaveLength(4);
    for (const side of ['side:allied', 'side:axis']) {
      expect(scenario.entries.filter(({ sideDefinitionId }) => sideDefinitionId === side)).toHaveLength(4);
      expect(scenario.sources.filter(({ sideDefinitionId }) => sideDefinitionId === side)).toHaveLength(4);
    }
  });
});
