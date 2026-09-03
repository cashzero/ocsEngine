import {
  canonicalizeHexside,
  directedHexside,
  type HexsideFeatureCollection,
  type HexsideId,
} from '../../domain/map/index.js';
import {
  findNeighborDirection,
  formatHexId,
  HEX_DIRECTIONS,
  hex,
  hexDistance,
  neighbor,
  parseDefinitionId,
  parseHexCoordinateId,
  type DefinitionId,
  type HexCoordinate,
  type HexId,
} from '../../core/index.js';
import type { GeneratedTerrainKind } from './model.js';

export interface GeneratedCell {
  readonly coordinate: HexCoordinate;
  readonly id: HexId;
  terrain: GeneratedTerrainKind;
  readonly elevation: number;
  readonly moisture: number;
  readonly roughness: number;
  readonly temperature: number;
  readonly features: Array<{ kind: 'PRINTED_FEATURE' | 'FACILITY' | 'SOURCE' | 'ENTRY'; definitionId: DefinitionId }>;
}

export const definitionId = (value: string): DefinitionId => {
  const parsed = parseDefinitionId(value);
  if (!parsed.ok) throw new Error(`Invalid generated Definition ID: ${value}`);
  return parsed.value;
};

export const coordinateKey = (coordinate: HexCoordinate): string => formatHexId(coordinate);

export const coordinateFor = (id: HexId): HexCoordinate => {
  const parsed = parseHexCoordinateId(id);
  if (!parsed.ok) throw new Error(`Invalid generated Hex ID: ${id}`);
  return parsed.value;
};

export const inBounds = (coordinate: HexCoordinate, width: number, height: number): boolean =>
  coordinate.q >= 0 && coordinate.q < width && coordinate.r >= 0 && coordinate.r < height;

export const neighborCells = (
  cell: GeneratedCell,
  cells: ReadonlyMap<string, GeneratedCell>,
): readonly GeneratedCell[] => HEX_DIRECTIONS.flatMap((direction) => {
  const candidate = cells.get(coordinateKey(neighbor(cell.coordinate, direction)));
  return candidate ? [candidate] : [];
});

export const distanceBetween = (left: HexId, right: HexId): number =>
  hexDistance(coordinateFor(left), coordinateFor(right));

export const hexsideBetween = (left: HexId, right: HexId): HexsideId => {
  const leftCoordinate = coordinateFor(left);
  const rightCoordinate = coordinateFor(right);
  const direction = findNeighborDirection(leftCoordinate, rightCoordinate);
  if (!direction) throw new Error(`Generated path contains non-adjacent Hexes: ${left}, ${right}.`);
  const canonical = canonicalizeHexside(directedHexside(leftCoordinate, direction));
  if (!canonical.ok) throw new Error(`Generated Hexside is invalid: ${left}, ${right}.`);
  return canonical.value.id;
};

export const addHexsideFeature = (
  features: Map<HexsideId, Set<DefinitionId>>,
  left: HexId,
  right: HexId,
  definition: DefinitionId,
): void => {
  const id = hexsideBetween(left, right);
  const values = features.get(id) ?? new Set<DefinitionId>();
  values.add(definition);
  features.set(id, values);
};

export const toHexsideCollections = (
  features: ReadonlyMap<HexsideId, ReadonlySet<DefinitionId>>,
): readonly HexsideFeatureCollection[] => [...features.entries()]
  .sort(([left], [right]) => String(left).localeCompare(String(right)))
  .map(([hexsideId, definitions]) => ({
    hexsideId,
    featureDefinitionIds: [...definitions].sort((left, right) => String(left).localeCompare(String(right))),
  }));

export const rectangularCoordinates = (width: number, height: number): readonly HexCoordinate[] =>
  Array.from({ length: height }, (_, r) => Array.from({ length: width }, (__, q) => hex(q, r))).flat();
