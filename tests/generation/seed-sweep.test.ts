import { describe, expect, it } from 'vitest';
import { sweepRandomMapSeeds } from '../../src/index.js';

// Slow (1,500 maps); opt in with `npm run test:sweep`.
describe.skipIf(!process.env.OCS_SWEEP)('M6 map seed sweep', () => {
  it.each(['WESTERN_EUROPE', 'EASTERN_EUROPE'] as const)(
    'has no invalid maps or exceptions across 500 %s seeds',
    (style) => {
      const report = sweepRandomMapSeeds({ width: 18, height: 12, style }, 500, style.length * 10_000);
      expect(report).toMatchObject({ requested: 500, generated: 500, invalid: 0, exceptions: 0, failures: [] });
      expect(report.minimumRoadEdges).toBeGreaterThan(0);
      expect(report.maximumSevereTerrainRatio).toBeLessThanOrEqual(0.4);
    },
    60_000,
  );
});
