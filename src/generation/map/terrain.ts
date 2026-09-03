import type { HexId } from '../../core/index.js';
import { fractalNoise2d } from './noise.js';
import type { GeneratedTerrainKind, NormalizedMapGenerationOptions } from './model.js';
import { coordinateKey, rectangularCoordinates, type GeneratedCell } from './internal.js';

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
export const generateTerrainCells = (
  options: NormalizedMapGenerationOptions,
): Map<HexId, GeneratedCell> => {
  const { width, height, seed, style } = options;
  const result = new Map<HexId, GeneratedCell>();
  for (const coordinate of rectangularCoordinates(width, height)) {
    const normalizedX = coordinate.q / Math.max(1, width - 1);
    const normalizedY = coordinate.r / Math.max(1, height - 1);
    const elevation = fractalNoise2d(normalizedX * 3.2, normalizedY * 3.2, seed ^ 0x2f6e2b1);
    const moisture = fractalNoise2d(normalizedX * 3.5 + 11, normalizedY * 3.5 - 7, seed ^ 0x86b2a91);
    const roughness = fractalNoise2d(normalizedX * 7.5 - 3, normalizedY * 7.5 + 5, seed ^ 0x1473d5f);
    const temperature = 1 - normalizedY * 0.45 + fractalNoise2d(normalizedX * 2 + 19, normalizedY * 2, seed ^ 0x51c8d3a) * 0.25;
    const coastNoise = fractalNoise2d(normalizedY * 2.3, 0.5, seed ^ 0xc04a57) - 0.5;
    const coastColumn = Math.max(0, Math.min(width - 3, Math.floor(width * (0.12 + coastNoise * 0.12))));
    const water = style === 'MEDITERRANEAN_COAST' && coordinate.q <= coastColumn;
    const corridorRow = Math.floor(height / 2);
    const corridor = Math.abs(coordinate.r - corridorRow) <= 1 && coordinate.q > coastColumn;
    const id = coordinateKey(coordinate) as HexId;
    result.set(id, {
      coordinate, id,
      terrain: water ? 'WATER' : classifyLand(elevation, moisture, roughness, temperature, corridor),
      elevation, moisture, roughness, temperature, features: [],
    });
  }
  return result;
};
