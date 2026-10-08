import { describe, expect, it } from 'vitest';
import { sweepRandomOobSeeds } from '../../src/index.js';

// Slow (1,000 OOBs); opt in with `npm run test:sweep`.
describe.skipIf(!process.env.OCS_SWEEP)('M7 Random OOB seed stability', () => {
  it('passes 1,000 deterministic seeds with all formation archetypes represented', () => {
    const report = sweepRandomOobSeeds({ scale: 'STANDARD', divisionsPerSide: 4, armoredDivisionsPerSide: 2 }, 1_000, 1);
    expect(report).toMatchObject({ requested: 1_000, generated: 1_000, invalid: 0, exceptions: 0 });
    expect(report.minimumBalanceRatio).toBeGreaterThanOrEqual(0.9);
    expect(report.minimumUnitsPerSide).toBeGreaterThan(0);
    expect(report.maximumUnitsPerSide).toBeGreaterThanOrEqual(report.minimumUnitsPerSide);
    expect(Object.values(report.archetypeCounts).every((count) => count > 0)).toBe(true);
    expect(report.failures).toEqual([]);
  });
});
