import { describe, expect, it } from 'vitest';
import {
  canonicalizeHexside,
  createAxialBounds,
  createEmptyMapState,
  createMapDefinitionIndex,
  directedHexside,
  formatHexId,
  hex,
  hexRange,
  mapFeaturesAt,
  parseDefinitionId,
  parseMapFeatureStateId,
  parsePlayerId,
  revision,
  schemaVersion,
  setHexControl,
  upsertMapFeatureState,
  validateMapDefinition,
  validateMapState,
  type DefinitionId,
  type MapDefinition,
  type MapFeatureState,
  type MapState,
  type PlayerId,
  type Result,
} from '../../src/index.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Expected a successful test fixture result.');
  return result.value;
};

const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));

const createTestMap = (): MapDefinition => {
  const clear = definitionId('terrain:clear');
  const forest = definitionId('terrain:forest');
  const centerId = formatHexId(hex(0, 0));
  const edge = must(canonicalizeHexside(directedHexside(hex(0, 0), 'E')));

  return {
    id: definitionId('map:synthetic-f4'),
    schemaVersion: must(schemaVersion(1)),
    bounds: must(createAxialBounds({ minQ: -1, maxQ: 1, minR: -1, maxR: 1 })),
    hexes: [...hexRange(hex(0, 0), 1)].reverse().map((coordinate) => ({
      id: formatHexId(coordinate),
      terrainDefinitionIds: coordinate.q === 0 && coordinate.r === 0
        ? [clear, forest]
        : [clear],
      features: coordinate.q === 0 && coordinate.r === 0
        ? [
          { kind: 'FACILITY', definitionId: definitionId('facility:port') },
          { kind: 'SOURCE', definitionId: definitionId('source:primary') },
          { kind: 'ENTRY', definitionId: definitionId('entry:east') },
        ]
        : [],
    })),
    hexsides: [{
      hexsideId: edge.id,
      featureDefinitionIds: [
        definitionId('edge:road'),
        definitionId('edge:major-river'),
      ],
    }],
    provenance: [{ document: 'synthetic fixture', locator: 'map F4' }],
    overrideDefinitionIds: [definitionId('override:synthetic-map')],
  };
};

const featureState = (
  map: MapDefinition,
  overrides: Partial<MapFeatureState> = {},
): MapFeatureState => ({
  id: must(parseMapFeatureStateId('map-feature:bridge-1')),
  kind: 'HEXSIDE_FEATURE',
  definitionId: definitionId('edge:bridge'),
  location: { kind: 'HEXSIDE', hexsideId: map.hexsides[0]!.hexsideId },
  statusDefinitionIds: [definitionId('status:intact')],
  controllerId: null,
  level: 0,
  damage: 0,
  ...overrides,
});

describe('MapDefinition container', () => {
  it('validates bounds and preserves a sparse map envelope', () => {
    expect(createAxialBounds({ minQ: 1, maxQ: -1, minR: 0, maxR: 0 })).toMatchObject({
      ok: false,
      error: { reason: 'INVERTED_RANGE' },
    });

    const map = createTestMap();
    const index = createMapDefinitionIndex(map);
    expect(index.getHex(formatHexId(hex(1, 1)))).toBeUndefined();
    expect(index.orderedHexes()).toHaveLength(7);
  });

  it('provides numeric axial iteration, lookup, neighbors, and featured edges', () => {
    const map = createTestMap();
    const persistentOrder = map.hexes.map(({ id }) => id);
    const index = createMapDefinitionIndex(map);

    expect(index.orderedHexes().map(({ id }) => id)).toEqual([
      '-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0',
    ]);
    expect(index.getNeighbor(formatHexId(hex(0, 0)), 'E')?.id).toBe('1,0');
    expect(index.getNeighbor(formatHexId(hex(1, 0)), 'E')).toBeUndefined();
    expect(index.getHexsideAt(formatHexId(hex(0, 0)), 'E')?.featureDefinitionIds)
      .toEqual(['edge:road', 'edge:major-river']);
    expect(map.hexes.map(({ id }) => id)).toEqual(persistentOrder);
  });

  it('merges multi-terrain printed data with mutable Hex and Hexside overlays', () => {
    const map = createTestMap();
    const index = createMapDefinitionIndex(map);
    const baseState = createEmptyMapState(must(revision(0)));
    const edgeFeature = featureState(map);
    const hexFeature = featureState(map, {
      id: must(parseMapFeatureStateId('map-feature:hedgehog-1')),
      kind: 'FACILITY',
      definitionId: definitionId('facility:hedgehog'),
      location: { kind: 'HEX', hexId: formatHexId(hex(0, 0)) },
      level: 1,
    });
    const state: MapState = { ...baseState, features: [edgeFeature, hexFeature] };

    const atHex = mapFeaturesAt(
      index,
      state,
      { kind: 'HEX', hexId: formatHexId(hex(0, 0)) },
    );
    expect(atHex.map((feature) => feature.origin === 'DEFINITION'
      ? feature.kind
      : feature.feature.kind)).toEqual([
      'TERRAIN', 'TERRAIN', 'FACILITY', 'SOURCE', 'ENTRY', 'FACILITY',
    ]);

    const atEdge = mapFeaturesAt(index, state, edgeFeature.location);
    expect(atEdge.map((feature) => feature.origin === 'DEFINITION'
      ? feature.definitionId
      : feature.feature.definitionId)).toEqual([
      'edge:road', 'edge:major-river', 'edge:bridge',
    ]);
  });
});

describe('map structural validation', () => {
  it('accepts a structurally complete definition and state', () => {
    const map = createTestMap();
    const state = upsertMapFeatureState(
      createEmptyMapState(must(revision(0))),
      featureState(map),
    );
    expect(validateMapDefinition(map)).toEqual([]);
    expect(validateMapState(map, state)).toEqual([]);
  });

  it('reports duplicate Hexes/features and missing or orphan edge endpoints', () => {
    const map = createTestMap();
    const center = map.hexes.find(({ id }) => id === '0,0')!;
    const missingEast = map.hexes.filter(({ id }) => id !== '1,0');
    const orphan = must(canonicalizeHexside(directedHexside(hex(5, 5), 'E')));
    const malformed: MapDefinition = {
      ...map,
      hexes: [
        ...missingEast.map((hexDefinition, index) => index === 0
          ? { ...hexDefinition, terrainDefinitionIds: [] }
          : hexDefinition),
        center,
        {
          ...center,
          terrainDefinitionIds: [
            definitionId('terrain:clear'),
            definitionId('terrain:clear'),
          ],
        },
      ],
      hexsides: [
        {
          ...map.hexsides[0]!,
          featureDefinitionIds: [
            definitionId('edge:road'),
            definitionId('edge:road'),
          ],
        },
        { hexsideId: orphan.id, featureDefinitionIds: [definitionId('edge:road')] },
      ],
      provenance: [{ document: '', locator: '' }],
      overrideDefinitionIds: [' bad-override' as DefinitionId],
    };

    const codes = validateMapDefinition(malformed).map(({ code }) => code);
    expect(codes).toContain('DUPLICATE_HEX_ID');
    expect(codes).toContain('MISSING_BASE_TERRAIN');
    expect(codes).toContain('DUPLICATE_HEX_FEATURE');
    expect(codes).toContain('DUPLICATE_HEXSIDE_FEATURE');
    expect(codes).toContain('MISSING_HEXSIDE_ENDPOINT');
    expect(codes).toContain('ORPHAN_HEXSIDE');
    expect(codes).toContain('INVALID_DEFINITION_REFERENCE');
    expect(codes).toContain('INVALID_MAP_PROVENANCE');
  });

  it('reports bad state references, duplicates, quantities, and location kinds', () => {
    const map = createTestMap();
    const badFeature = featureState(map, {
      location: { kind: 'HEX', hexId: formatHexId(hex(99, 99)) },
      level: -1,
      damage: 0.5,
    });
    const badPlayer = ' bad-player' as PlayerId;
    const state: MapState = {
      schemaVersion: must(schemaVersion(1)),
      revision: must(revision(0)),
      hexControl: [
        { hexId: formatHexId(hex(99, 99)), controllerId: badPlayer },
        { hexId: formatHexId(hex(99, 99)), controllerId: null },
      ],
      features: [badFeature, badFeature],
    };

    const codes = validateMapState(map, state).map(({ code }) => code);
    expect(codes).toContain('DUPLICATE_HEX_CONTROL');
    expect(codes).toContain('INVALID_PLAYER_REFERENCE');
    expect(codes).toContain('DUPLICATE_MAP_FEATURE_STATE_ID');
    expect(codes).toContain('ORPHAN_MAP_STATE_REFERENCE');
    expect(codes).toContain('MAP_FEATURE_LOCATION_KIND_MISMATCH');
    expect(codes.filter((code) => code === 'INVALID_MAP_FEATURE_QUANTITY')).toHaveLength(4);
  });
});

describe('MapState immutable updates', () => {
  it('increments revision, maintains order, and never mutates prior state', () => {
    const map = createTestMap();
    const initial = createEmptyMapState(must(revision(0)));
    const player = must(parsePlayerId('player:axis'));
    const east = setHexControl(initial, formatHexId(hex(1, 0)), player);
    const controlled = setHexControl(east, formatHexId(hex(-1, 0)), player);
    const withFeature = upsertMapFeatureState(controlled, featureState(map));
    const damaged = upsertMapFeatureState(withFeature, featureState(map, { damage: 2 }));

    expect(initial).toEqual({ schemaVersion: 1, revision: 0, hexControl: [], features: [] });
    expect(controlled.revision).toBe(2);
    expect(controlled.hexControl.map(({ hexId }) => hexId)).toEqual(['-1,0', '1,0']);
    expect(withFeature.features[0]?.damage).toBe(0);
    expect(damaged.features[0]?.damage).toBe(2);
    expect(damaged.revision).toBe(4);
  });
});
