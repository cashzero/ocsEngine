import {
  formatHexId,
  neighbor,
  neighbors,
  parseHexCoordinateId,
  type HexCoordinate,
  type HexId,
  type ValidationIssue,
} from '../../core/index.js';
import {
  parseHexsideId,
  validateMapDefinition,
  type MapDefinition,
} from '../../domain/map/index.js';
import type {
  GeneratedMapMetrics,
  GeneratedMapStrategicRegions,
  GeneratedMapValidation,
  GeneratedTerrainKind,
  MapGenerationStyle,
  MapSeaPlacement,
} from './model.js';
import { MAP_STYLE_PROFILES, roadGapLimitFor } from './styles.js';

const error = (code: string, message: string, path: readonly (string | number)[] = []): ValidationIssue => ({
  code, message, path, severity: 'ERROR',
});

const terrainKind = (definitionId: string): GeneratedTerrainKind => {
  const value = definitionId.split(':').at(-1)?.toUpperCase();
  return value === 'WOODS' || value === 'ROUGH' || value === 'MOUNTAIN'
    || value === 'MARSH' || value === 'WATER' ? value : 'CLEAR';
};

const featureEdges = (map: MapDefinition, pattern: RegExp) => map.hexsides
  .filter(({ featureDefinitionIds }) => featureDefinitionIds.some((id) => pattern.test(String(id))))
  .flatMap(({ hexsideId }) => {
    const parsed = parseHexsideId(hexsideId);
    return parsed.ok ? [[parsed.value.firstHexId, parsed.value.secondHexId] as const] : [];
  });

const componentCount = (edges: readonly (readonly [HexId, HexId])[]): number => {
  const adjacency = new Map<HexId, Set<HexId>>();
  for (const [left, right] of edges) {
    const leftSet = adjacency.get(left) ?? new Set<HexId>();
    const rightSet = adjacency.get(right) ?? new Set<HexId>();
    leftSet.add(right); rightSet.add(left);
    adjacency.set(left, leftSet); adjacency.set(right, rightSet);
  }
  let components = 0;
  const unseen = new Set(adjacency.keys());
  while (unseen.size > 0) {
    components += 1;
    const stack = [unseen.values().next().value!];
    unseen.delete(stack[0]!);
    while (stack.length > 0) for (const next of adjacency.get(stack.pop()!) ?? []) {
      if (unseen.delete(next)) stack.push(next);
    }
  }
  return components;
};

const isPort = ({ features }: MapDefinition['hexes'][number]): boolean =>
  features.some(({ kind, definitionId }) => kind === 'FACILITY' && String(definitionId) === 'facility:port');

const RAIL_PATTERN = /^edge:(?:multi-track-)?rail$/u;

/** Largest distance from any road, in Hexes, of each passable Hex kind that must be served. */
const roadGaps = (map: MapDefinition, roadEdges: readonly (readonly [HexId, HexId])[], style: MapGenerationStyle) => {
  const measured = map.hexes.filter((hex) => roadGapLimitFor(style, terrainKind(hex.terrainDefinitionIds[0]!)) !== undefined
    && parseHexCoordinateId(hex.id).ok);
  // Hex distance to the nearest road Hex, by stepping out from every road Hex at once over the unbounded hex grid
  // (a step there is exactly one unit of hex distance), until every measured Hex is reached.
  const nearestRoad = new Map<string, number>();
  let frontier: HexCoordinate[] = [];
  for (const id of new Set(roadEdges.flat())) {
    const parsed = parseHexCoordinateId(id);
    if (!parsed.ok || nearestRoad.has(String(id))) continue;
    nearestRoad.set(String(id), 0);
    frontier.push(parsed.value);
  }
  let remaining = measured.filter((hex) => !nearestRoad.has(String(hex.id))).length;
  const isMeasured = new Set(measured.map((hex) => String(hex.id)));
  for (let steps = 1; frontier.length > 0 && remaining > 0; steps += 1) {
    const next: HexCoordinate[] = [];
    for (const coordinate of frontier) {
      for (const adjacent of neighbors(coordinate)) {
        const key = formatHexId(adjacent);
        if (nearestRoad.has(key)) continue;
        nearestRoad.set(key, steps);
        if (isMeasured.has(key)) remaining -= 1;
        next.push(adjacent);
      }
    }
    frontier = next;
  }
  const gaps: Partial<Record<GeneratedTerrainKind, number>> = {};
  for (const hex of measured) {
    const kind = terrainKind(hex.terrainDefinitionIds[0]!);
    const nearest = nearestRoad.get(String(hex.id)) ?? Number.POSITIVE_INFINITY;
    // A map without roads reports its size, so the metric stays a finite, serializable number.
    gaps[kind] = Math.max(gaps[kind] ?? 0, Number.isFinite(nearest) ? nearest : map.hexes.length);
  }
  return gaps;
};

/**
 * Road-gap limits are the style's (docs/generator/10 and 11): in the western themes open ground lies within
 * two Hexes of a road and woods and hills within three; eastern steppe allows four and five.
 */
export const measureGeneratedMap = (map: MapDefinition, style: MapGenerationStyle = 'TEMPERATE_INLAND'): GeneratedMapMetrics => {
  const terrainCounts: Record<GeneratedTerrainKind, number> = {
    CLEAR: 0, WOODS: 0, ROUGH: 0, MOUNTAIN: 0, MARSH: 0, WATER: 0,
  };
  map.hexes.forEach((hex) => { terrainCounts[terrainKind(hex.terrainDefinitionIds[0]!)] += 1; });
  const roadEdges = featureEdges(map, /^edge:(?:primary-)?road$/u);
  const gaps = roadGaps(map, roadEdges, style);
  const railEdges = featureEdges(map, RAIL_PATTERN);
  const railHexes = new Set(railEdges.flat());
  return {
    terrainCounts,
    landHexes: map.hexes.length - terrainCounts.WATER,
    roadEdges: roadEdges.length,
    primaryRoadEdges: featureEdges(map, /^edge:primary-road$/u).length,
    riverEdges: featureEdges(map, /^edge:(?:major-)?river$/u).length,
    majorRiverEdges: featureEdges(map, /^edge:major-river$/u).length,
    settlements: map.hexes.filter(({ features }) => features.some(({ definitionId }) => String(definitionId).startsWith('settlement:'))).length,
    connectedRoadComponents: componentCount(roadEdges),
    maximumRoadGap: Math.max(0, ...Object.values(gaps)),
    roadGapExcess: Math.max(0, ...Object.entries(gaps).map(([kind, gap]) => gap - roadGapLimitFor(style, kind as GeneratedTerrainKind)!)),
    railEdges: railEdges.length,
    multiTrackRailEdges: featureEdges(map, /^edge:multi-track-rail$/u).length,
    railStations: map.hexes.filter(({ id, features }) => railHexes.has(id)
      && features.some(({ definitionId }) => String(definitionId).startsWith('settlement:'))).length,
    connectedRailComponents: componentCount(railEdges),
    ports: map.hexes.filter(isPort).length,
  };
};

const reachable = (
  map: MapDefinition,
  start: HexId,
  allowed: ReadonlySet<HexId>,
  roadOnly: boolean,
): ReadonlySet<HexId> => {
  const adjacency = new Map<HexId, Set<HexId>>();
  if (roadOnly) {
    for (const [left, right] of featureEdges(map, /^edge:(?:primary-)?road$/u)) {
      const leftSet = adjacency.get(left) ?? new Set<HexId>();
      const rightSet = adjacency.get(right) ?? new Set<HexId>();
      leftSet.add(right); rightSet.add(left);
      adjacency.set(left, leftSet); adjacency.set(right, rightSet);
    }
  }
  const visited = new Set<HexId>();
  const queue: HexId[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current) || !allowed.has(current)) continue;
    visited.add(current);
    if (roadOnly) queue.push(...(adjacency.get(current) ?? []));
    else {
      const parsed = parseHexCoordinateId(current);
      if (parsed.ok) for (const direction of ['NE', 'E', 'SE', 'SW', 'W', 'NW'] as const) {
        const next = neighbor(parsed.value, direction);
        queue.push(`${next.q},${next.r}` as HexId);
      }
    }
  }
  return visited;
};

export const validateGeneratedMap = (
  map: MapDefinition,
  regions: GeneratedMapStrategicRegions,
  style: MapGenerationStyle,
  sea: MapSeaPlacement = MAP_STYLE_PROFILES[style].sea,
): GeneratedMapValidation => {
  const issues = [...validateMapDefinition(map)];
  const metrics = measureGeneratedMap(map, style);
  const land = new Set(map.hexes
    .filter(({ terrainDefinitionIds }) => terrainKind(terrainDefinitionIds[0]!) !== 'WATER')
    .map(({ id }) => id));
  const strategic = [...regions.firstEntryHexIds, ...regions.secondEntryHexIds,
    ...regions.firstSupplyHexIds, ...regions.secondSupplyHexIds, ...regions.settlementHexIds];
  if (metrics.settlements < 4) issues.push(error('TOO_FEW_SETTLEMENTS', 'Generated map requires at least four settlements.'));
  if (metrics.riverEdges < 1) issues.push(error('MISSING_RIVER_NETWORK', 'Generated map requires at least one river.'));
  if (metrics.connectedRoadComponents !== 1) issues.push(error('DISCONNECTED_ROAD_NETWORK', 'All generated roads must form one component.'));
  if (metrics.roadGapExcess > 0) issues.push(error('ROAD_COVERAGE_GAP', 'Open ground, woods and hills must lie within the map style\'s distance of a road.'));
  if (strategic.some((hexId) => !land.has(hexId))) issues.push(error('STRATEGIC_REGION_ON_WATER', 'Entry, supply, and settlement Hexes must be on land.'));
  const roadReach = reachable(map, strategic[0]!, land, true);
  if (strategic.some((hexId) => !roadReach.has(hexId))) issues.push(error('STRATEGIC_NODE_OFF_ROAD', 'Every strategic node must join the road network.'));
  // 12.6a: entry Hexes are the map-edge railroad Supply Sources, so each lies on the one rail network.
  if (metrics.connectedRailComponents !== 1) issues.push(error('DISCONNECTED_RAIL_NETWORK', 'All generated railroads must form one component.'));
  const railHexes = new Set(featureEdges(map, RAIL_PATTERN).flat());
  if ([...regions.firstEntryHexIds, ...regions.secondEntryHexIds].some((hexId) => !railHexes.has(hexId))) {
    issues.push(error('ENTRY_OFF_RAIL', 'Every entry Hex must be a railroad Hex, the map-edge Supply Source of 12.6a.'));
  }
  const landReach = reachable(map, regions.firstEntryHexIds[0]!, land, false);
  if (!landReach.has(regions.secondEntryHexIds[0]!)) issues.push(error('NO_OPERATIONAL_CORRIDOR', 'Opposing entry regions require a continuous land corridor.'));
  const severe = metrics.terrainCounts.MOUNTAIN + metrics.terrainCounts.MARSH;
  if (severe / Math.max(1, metrics.landHexes) > 0.4) issues.push(error('EXCESS_SEVERE_TERRAIN', 'Mountain and marsh exceed 40% of land.'));
  const waterRatio = metrics.terrainCounts.WATER / map.hexes.length;
  if (sea === 'NONE' && waterRatio > 0.02) issues.push(error('INLAND_WATER_EXCESS', 'A map without a sea cannot contain one.'));
  // 19.0: a port lies in a coastal place on the road network, and a sea has at least one.
  const portHexes = map.hexes.filter(isPort);
  if (sea === 'NONE' && portHexes.length > 0) issues.push(error('PORT_WITHOUT_SEA', 'A map without a sea cannot have a port.'));
  if (sea !== 'NONE' && portHexes.length === 0) issues.push(error('SEA_WITHOUT_PORT', 'A map with a sea needs at least one port.'));
  const water = new Set(map.hexes.filter(({ terrainDefinitionIds }) => terrainKind(terrainDefinitionIds[0]!) === 'WATER').map(({ id }) => String(id)));
  for (const port of portHexes) {
    const parsed = parseHexCoordinateId(port.id);
    const onShore = land.has(port.id) && parsed.ok && neighbors(parsed.value).some((next) => water.has(formatHexId(next)));
    const inPlace = port.features.some(({ definitionId }) => String(definitionId).startsWith('settlement:'));
    if (!onShore || !inPlace || !roadReach.has(port.id)) {
      issues.push(error('PORT_MISPLACED', `Port ${port.id} must be a coastal settlement on the road network.`, ['hexes', port.id]));
    }
  }
  if (sea !== 'NONE' && (waterRatio < 0.06 || waterRatio > 0.35)) {
    issues.push(error('COAST_WATER_RATIO', 'A map with a sea must give it 6% to 35% of the map.'));
  }
  return { valid: issues.length === 0, issues, metrics };
};
