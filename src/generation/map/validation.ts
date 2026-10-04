import {
  hexDistance,
  neighbor,
  parseHexCoordinateId,
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
} from './model.js';
import { roadGapLimitFor } from './styles.js';

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

const RAIL_PATTERN = /^edge:(?:multi-track-)?rail$/u;

/** Largest distance from any road, in Hexes, of each passable Hex kind that must be served. */
const roadGaps = (map: MapDefinition, roadEdges: readonly (readonly [HexId, HexId])[], style: MapGenerationStyle) => {
  const roadHexes = [...new Set(roadEdges.flat())].flatMap((id) => {
    const parsed = parseHexCoordinateId(id);
    return parsed.ok ? [parsed.value] : [];
  });
  const gaps: Partial<Record<GeneratedTerrainKind, number>> = {};
  for (const hex of map.hexes) {
    const kind = terrainKind(hex.terrainDefinitionIds[0]!);
    if (roadGapLimitFor(style, kind) === undefined) continue;
    const parsed = parseHexCoordinateId(hex.id);
    if (!parsed.ok) continue;
    let nearest = Number.POSITIVE_INFINITY;
    for (const road of roadHexes) {
      nearest = Math.min(nearest, hexDistance(parsed.value, road));
      if (nearest === 0) break;
    }
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
  if (style !== 'MEDITERRANEAN_COAST' && waterRatio > 0.02) issues.push(error('INLAND_WATER_EXCESS', 'Inland style cannot contain a sea.'));
  if (style === 'MEDITERRANEAN_COAST' && (waterRatio < 0.06 || waterRatio > 0.35)) {
    issues.push(error('COAST_WATER_RATIO', 'Coastal style water must occupy 6% to 35% of the map.'));
  }
  return { valid: issues.length === 0, issues, metrics };
};
