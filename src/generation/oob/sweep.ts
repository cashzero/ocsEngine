import { generateRandomOob } from './generator.js';
import type { OobFormationArchetype, OobSeedSweepReport, RandomOobOptions } from './model.js';

export const sweepRandomOobSeeds = (
  requested: Omit<RandomOobOptions, 'seed'>,
  count: number,
  firstSeed = 1,
): OobSeedSweepReport => {
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Sweep count must be a positive integer.');
  let generated = 0;
  let invalid = 0;
  let exceptions = 0;
  let minimumBalanceRatio = 1;
  let minimumUnitsPerSide = Number.POSITIVE_INFINITY;
  let maximumUnitsPerSide = 0;
  const archetypeCounts: Record<OobFormationArchetype, number> = { ARMORED: 0, INFANTRY: 0, MOBILE_INFANTRY: 0 };
  const failures: Array<{ seed: number; codes: readonly string[] }> = [];
  for (let index = 0; index < count; index += 1) {
    const seed = (firstSeed + index) >>> 0;
    try {
      const result = generateRandomOob({ ...requested, seed });
      if (!result.ok) {
        invalid += 1;
        failures.push({ seed, codes: result.error.flatMap(({ issues, code }) => issues?.map((entry) => entry.code) ?? [code]) });
        continue;
      }
      generated += 1;
      minimumBalanceRatio = Math.min(minimumBalanceRatio, result.value.metrics.balanceRatio);
      minimumUnitsPerSide = Math.min(minimumUnitsPerSide, ...Object.values(result.value.metrics.unitsBySide));
      maximumUnitsPerSide = Math.max(maximumUnitsPerSide, ...Object.values(result.value.metrics.unitsBySide));
      for (const formation of result.value.sides[0]!.formations) archetypeCounts[formation.archetype] += 1;
    } catch (error) {
      exceptions += 1;
      failures.push({ seed, codes: [error instanceof Error ? error.name : 'UNKNOWN_EXCEPTION'] });
    }
  }
  return {
    requested: count, generated, invalid, exceptions, minimumBalanceRatio,
    minimumUnitsPerSide: Number.isFinite(minimumUnitsPerSide) ? minimumUnitsPerSide : 0,
    maximumUnitsPerSide, archetypeCounts, failures,
  };
};
