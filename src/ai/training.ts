import { WHOLE_NUMBER_WEIGHTS, type HeuristicWeights } from './policies/heuristic-weights.js';

/** Self-play training helpers (scripts/ai-train.mjs): significance of a head-to-head result and weight mutation. */

const logChoose = (n: number, k: number): number => {
  let total = 0;
  for (let index = 1; index <= k; index += 1) total += Math.log(n - k + index) - Math.log(index);
  return total;
};

/**
 * One-sided sign test: P(X >= wins) for X ~ Binomial(wins + losses, 1/2), the chance that a candidate no better than
 * the champion wins at least this often. Draws carry no information about which is stronger and are left out.
 */
export const signTestPValue = (wins: number, losses: number): number => {
  const games = wins + losses;
  if (games === 0) return 1;
  let p = 0;
  for (let k = wins; k <= games; k += 1) p += Math.exp(logChoose(games, k) - games * Math.LN2);
  return Math.min(1, p);
};

/** Deterministic random numbers in [0, 1) for the trainer. */
export const trainingRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export interface WeightMutation {
  readonly weights: HeuristicWeights;
  readonly changed: Readonly<Record<string, { readonly from: number; readonly to: number }>>;
}

/**
 * One to three weights changed: real weights scaled by a log-normal factor (`size` is its standard deviation),
 * counts of hexes or units moved one step up or down (never below 1), the option share kept within [0, 1].
 */
export const mutateWeights = (weights: HeuristicWeights, random: () => number, size = 0.35): WeightMutation => {
  const keys = (Object.keys(weights) as (keyof HeuristicWeights)[]).sort();
  const next: Record<string, number> = { ...weights };
  const changed: Record<string, { from: number; to: number }> = {};
  const count = 1 + Math.floor(random() * 3);
  for (let index = 0; index < count; index += 1) {
    const key = keys[Math.floor(random() * keys.length)]!;
    const current = next[key]!;
    let value: number;
    if (WHOLE_NUMBER_WEIGHTS.includes(key)) value = Math.max(1, current + (random() < 0.5 ? -1 : 1));
    else if (current === 0) value = random() * 2;
    else {
      const gaussian = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
      value = current * Math.exp(gaussian * size);
    }
    if (key === 'vacateOptionShare') value = Math.min(1, value);
    next[key] = Number(value.toFixed(4));
    changed[key] = { from: weights[key], to: next[key]! };
  }
  return { weights: next as unknown as HeuristicWeights, changed };
};
