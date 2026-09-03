import { generateRandomMap } from './generator.js';
import type { MapGenerationOptions, MapSeedSweepReport } from './model.js';

export const sweepRandomMapSeeds = (
  requested: Omit<MapGenerationOptions, 'seed'>,
  count: number,
  firstSeed = 1,
): MapSeedSweepReport => {
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Sweep count must be a positive integer.');
  let generated = 0;
  let invalid = 0;
  let exceptions = 0;
  let minimumLandRatio = 1;
  let maximumSevereTerrainRatio = 0;
  let minimumRoadEdges = Number.POSITIVE_INFINITY;
  let maximumRoadEdges = 0;
  const failures: Array<{ seed: number; codes: readonly string[] }> = [];
  for (let index = 0; index < count; index += 1) {
    const seed = (firstSeed + index) >>> 0;
    try {
      const result = generateRandomMap({ ...requested, seed });
      if (!result.ok) {
        invalid += 1;
        failures.push({ seed, codes: result.error.flatMap(({ issues, code }) => issues?.map((issue) => issue.code) ?? [code]) });
        continue;
      }
      generated += 1;
      const metrics = result.value.metrics;
      const total = requested.width * requested.height;
      minimumLandRatio = Math.min(minimumLandRatio, metrics.landHexes / total);
      maximumSevereTerrainRatio = Math.max(maximumSevereTerrainRatio,
        (metrics.terrainCounts.MOUNTAIN + metrics.terrainCounts.MARSH) / metrics.landHexes);
      minimumRoadEdges = Math.min(minimumRoadEdges, metrics.roadEdges);
      maximumRoadEdges = Math.max(maximumRoadEdges, metrics.roadEdges);
    } catch (error) {
      exceptions += 1;
      failures.push({ seed, codes: [error instanceof Error ? error.name : 'UNKNOWN_EXCEPTION'] });
    }
  }
  return {
    requested: count, generated, invalid, exceptions,
    minimumLandRatio, maximumSevereTerrainRatio,
    minimumRoadEdges: Number.isFinite(minimumRoadEdges) ? minimumRoadEdges : 0,
    maximumRoadEdges, failures,
  };
};
