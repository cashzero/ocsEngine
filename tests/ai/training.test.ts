import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEURISTIC_WEIGHTS,
  WHOLE_NUMBER_WEIGHTS,
  heuristicWeights,
  mutateWeights,
  signTestPValue,
  trainingRandom,
} from '../../src/index.js';

describe('self-play training helpers', () => {
  it('computes the one-sided sign test', () => {
    expect(signTestPValue(0, 0)).toBe(1);
    expect(signTestPValue(5, 5)).toBeCloseTo(0.623, 3);
    expect(signTestPValue(9, 1)).toBeCloseTo(11 / 1024, 6);
    expect(signTestPValue(10, 0)).toBeCloseTo(1 / 1024, 6);
    expect(signTestPValue(15, 5)).toBeLessThan(0.05);
  });

  it('mutates one to three weights deterministically and keeps counts whole and at least 1', () => {
    const first = mutateWeights(DEFAULT_HEURISTIC_WEIGHTS, trainingRandom(42));
    const again = mutateWeights(DEFAULT_HEURISTIC_WEIGHTS, trainingRandom(42));
    expect(again).toEqual(first);
    const random = trainingRandom(7);
    for (let index = 0; index < 500; index += 1) {
      const { weights, changed } = mutateWeights(DEFAULT_HEURISTIC_WEIGHTS, random);
      const keys = Object.keys(changed);
      expect(keys.length).toBeGreaterThanOrEqual(1);
      expect(keys.length).toBeLessThanOrEqual(3);
      for (const key of WHOLE_NUMBER_WEIGHTS) {
        expect(Number.isInteger(weights[key])).toBe(true);
        expect(weights[key]).toBeGreaterThanOrEqual(1);
      }
      expect(weights.vacateOptionShare).toBeLessThanOrEqual(1);
      expect(() => heuristicWeights(weights as unknown as Record<string, number>)).not.toThrow();
    }
  });

  it('rejects unknown or non-finite weights', () => {
    expect(() => heuristicWeights({ captur: 1 })).toThrow(/Unknown heuristic weight/u);
    expect(() => heuristicWeights({ capture: Number.NaN })).toThrow(/finite/u);
    expect(heuristicWeights({ capture: 50 }).capture).toBe(50);
  });
});
