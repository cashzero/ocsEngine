import {
  compareHexIds,
  compareText,
  formatHexId,
  neighbor,
  parseHexCoordinateId,
  stableSort,
  type HexDirection,
  type HexId,
} from '../../core/index.js';
import {
  canonicalizeHexside,
  directedHexside,
  type HexsideFeatureCollection,
  type HexsideId,
} from './location/index.js';
import type {
  EffectiveMapFeature,
  HexDefinition,
  MapDefinition,
  MapFeatureLocation,
  MapState,
} from './model.js';

export interface MapDefinitionIndex {
  readonly getHex: (hexId: HexId) => HexDefinition | undefined;
  readonly getHexside: (hexsideId: HexsideId) => HexsideFeatureCollection | undefined;
  readonly getNeighbor: (hexId: HexId, direction: HexDirection) => HexDefinition | undefined;
  readonly getHexsideAt: (
    hexId: HexId,
    direction: HexDirection,
  ) => HexsideFeatureCollection | undefined;
  readonly orderedHexes: () => readonly HexDefinition[];
  readonly orderedHexsides: () => readonly HexsideFeatureCollection[];
}

export const createMapDefinitionIndex = (
  definition: MapDefinition,
): MapDefinitionIndex => {
  const hexById = new Map<HexId, HexDefinition>();
  const hexsideById = new Map<HexsideId, HexsideFeatureCollection>();
  for (const hexDefinition of definition.hexes) {
    if (!hexById.has(hexDefinition.id)) hexById.set(hexDefinition.id, hexDefinition);
  }
  for (const hexside of definition.hexsides) {
    if (!hexsideById.has(hexside.hexsideId)) {
      hexsideById.set(hexside.hexsideId, hexside);
    }
  }

  const orderedHexes = Object.freeze(stableSort(definition.hexes, (left, right) =>
    compareHexIds(left.id, right.id)));
  const orderedHexsides = Object.freeze(stableSort(definition.hexsides, (left, right) =>
    compareText(left.hexsideId, right.hexsideId)));

  const getNeighbor = (
    hexId: HexId,
    direction: HexDirection,
  ): HexDefinition | undefined => {
    const coordinate = parseHexCoordinateId(hexId);
    return coordinate.ok
      ? hexById.get(formatHexId(neighbor(coordinate.value, direction)))
      : undefined;
  };

  const getHexsideAt = (
    hexId: HexId,
    direction: HexDirection,
  ): HexsideFeatureCollection | undefined => {
    const coordinate = parseHexCoordinateId(hexId);
    if (!coordinate.ok) return undefined;
    const canonical = canonicalizeHexside(directedHexside(coordinate.value, direction));
    return canonical.ok ? hexsideById.get(canonical.value.id) : undefined;
  };

  return Object.freeze({
    getHex: (hexId: HexId) => hexById.get(hexId),
    getHexside: (hexsideId: HexsideId) => hexsideById.get(hexsideId),
    getNeighbor,
    getHexsideAt,
    orderedHexes: () => orderedHexes,
    orderedHexsides: () => orderedHexsides,
  });
};

const sameLocation = (left: MapFeatureLocation, right: MapFeatureLocation): boolean => {
  if (left.kind === 'HEX') return right.kind === 'HEX' && left.hexId === right.hexId;
  return right.kind === 'HEXSIDE' && left.hexsideId === right.hexsideId;
};

export const mapFeaturesAt = (
  index: MapDefinitionIndex,
  state: MapState,
  location: MapFeatureLocation,
): readonly EffectiveMapFeature[] => {
  const definitionFeatures: EffectiveMapFeature[] = location.kind === 'HEX'
    ? (() => {
      const hexDefinition = index.getHex(location.hexId);
      return hexDefinition
        ? [
          ...hexDefinition.terrainDefinitionIds.map((definitionId) => ({
            origin: 'DEFINITION' as const,
            kind: 'TERRAIN' as const,
            definitionId,
          })),
          ...hexDefinition.features.map(({ kind, definitionId }) => ({
            origin: 'DEFINITION' as const,
            kind,
            definitionId,
          })),
        ]
        : [];
    })()
    : (index.getHexside(location.hexsideId)?.featureDefinitionIds ?? []).map(
      (definitionId) => ({
        origin: 'DEFINITION' as const,
        kind: 'HEXSIDE_FEATURE' as const,
        definitionId,
      }),
    );

  const stateFeatures: EffectiveMapFeature[] = state.features
    .filter((feature) => sameLocation(feature.location, location))
    .map((feature) => ({ origin: 'STATE' as const, feature }));
  return [...definitionFeatures, ...stateFeatures];
};
