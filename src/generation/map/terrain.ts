import type { DefinitionId, HexId } from '../../core/index.js';
import type { HexsideId } from '../../domain/map/index.js';
import { fractalNoise2d } from './noise.js';
import type { GeneratedTerrainKind, NormalizedMapGenerationOptions } from './model.js';
import {
  columnOf,
  coordinateKey,
  hexsideBetween,
  neighborCells,
  rectangularCoordinates,
  type GeneratedCell,
} from './internal.js';
import { mixUint32 } from './rng.js';
import { MAP_STYLE_PROFILES } from './styles.js';

const RIVERS = new Set(['edge:river', 'edge:major-river']);

const classifyLand = (
  elevation: number,
  moisture: number,
  roughness: number,
  temperature: number,
  corridor: boolean,
): GeneratedTerrainKind => {
  if (corridor && elevation < 0.82) return moisture > 0.83 ? 'MARSH' : roughness > 0.67 ? 'ROUGH' : 'CLEAR';
  if (elevation > 0.82 || (elevation > 0.72 && roughness > 0.7)) return 'MOUNTAIN';
  if (elevation > 0.64 || roughness > 0.76) return 'ROUGH';
  if (moisture > 0.81 && elevation < 0.48) return 'MARSH';
  if (moisture > 0.58 && temperature > 0.25) return 'WOODS';
  return 'CLEAR';
};
/**
 * Case Blue / GBII country: open steppe and farmland; low uplands (the brown "hills" of Case Blue, here
 * ROUGH) only where the ground is both high and broken; no mountains; marsh in wet hollows; forest in
 * patches that thicken toward the north edge (the GBII Moscow sheets) while the south stays steppe.
 */
const classifyEastern = (
  elevation: number,
  moisture: number,
  roughness: number,
  north: number,
  corridor: boolean,
): GeneratedTerrainKind => {
  if (corridor) return moisture > 0.84 && elevation < 0.45 ? 'MARSH' : 'CLEAR';
  if (elevation > 0.64 && roughness > 0.58) return 'ROUGH';
  if (moisture > 0.75 && elevation < 0.47) return 'MARSH';
  if (moisture > 0.69 - north * 0.1) return 'WOODS';
  return 'CLEAR';
};

export const generateTerrainCells = (
  options: NormalizedMapGenerationOptions,
): Map<HexId, GeneratedCell> => {
  const { width, height, seed, style } = options;
  const result = new Map<HexId, GeneratedCell>();
  for (const coordinate of rectangularCoordinates(width, height)) {
    const column = columnOf(coordinate);
    const normalizedX = column / Math.max(1, width - 1);
    const normalizedY = coordinate.r / Math.max(1, height - 1);
    const elevation = fractalNoise2d(normalizedX * 3.2, normalizedY * 3.2, seed ^ 0x2f6e2b1);
    const moisture = fractalNoise2d(normalizedX * 3.5 + 11, normalizedY * 3.5 - 7, seed ^ 0x86b2a91);
    const roughness = fractalNoise2d(normalizedX * 7.5 - 3, normalizedY * 7.5 + 5, seed ^ 0x1473d5f);
    const temperature = 1 - normalizedY * 0.45 + fractalNoise2d(normalizedX * 2 + 19, normalizedY * 2, seed ^ 0x51c8d3a) * 0.25;
    const coastNoise = fractalNoise2d(normalizedY * 2.3, 0.5, seed ^ 0xc04a57) - 0.5;
    const coastColumn = Math.max(0, Math.min(width - 3, Math.floor(width * (0.12 + coastNoise * 0.12))));
    const profile = MAP_STYLE_PROFILES[style];
    const water = profile.coast && column <= coastColumn;
    const corridorRow = Math.floor(height / 2);
    const corridor = Math.abs(coordinate.r - corridorRow) <= 1 && column > coastColumn;
    const id = coordinateKey(coordinate) as HexId;
    result.set(id, {
      coordinate, id,
      terrain: water ? 'WATER' : profile.terrain === 'EASTERN'
        ? classifyEastern(elevation, moisture, roughness, 1 - normalizedY, corridor)
        : classifyLand(elevation, moisture, roughness, temperature, corridor),
      elevation, moisture, roughness, temperature, features: [],
    });
  }
  return result;
};

/** Eastern river valleys are wooded on the steppe: open Hexes beside a river become woods in the style's share. */
export const growRiverbankWoods = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  hexsides: ReadonlyMap<HexsideId, ReadonlySet<DefinitionId>>,
  options: NormalizedMapGenerationOptions,
): void => {
  const share = MAP_STYLE_PROFILES[options.style].riverbankWoods;
  if (share <= 0) return;
  for (const cell of cells.values()) {
    if (cell.terrain !== 'CLEAR') continue;
    const onRiver = neighborCells(cell, cells).some((other) =>
      [...hexsides.get(hexsideBetween(cell.id, other.id)) ?? []].some((feature) => RIVERS.has(String(feature))));
    const roll = mixUint32(options.seed ^ 0x7f4a7c15 ^ Math.imul(cell.coordinate.q + 11, 0x2545f491) ^ Math.imul(cell.coordinate.r + 5, 0x9e3779b1)) / 0xffff_ffff;
    if (onRiver && roll < share) cell.terrain = 'WOODS';
  }
};
