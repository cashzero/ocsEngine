import type { RulesDiceRoll, RulesRngState } from './model.js';

const normalizeSeed = (seed: number): number => {
  if (!Number.isSafeInteger(seed)) throw new RangeError('Rules RNG seed must be a safe integer.');
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
};

export const createRulesRng = (seed: number): RulesRngState => ({
  state: normalizeSeed(seed),
  draws: 0,
});

const nextUint32 = (state: number): number => {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
};

export const rollTwoDice = (
  rng: RulesRngState,
): { readonly rng: RulesRngState; readonly roll: RulesDiceRoll } => {
  const firstState = nextUint32(rng.state);
  const secondState = nextUint32(firstState);
  const dice = [firstState % 6 + 1, secondState % 6 + 1] as const;
  return {
    rng: { state: secondState, draws: rng.draws + 2 },
    roll: {
      dice,
      total: dice[0] + dice[1],
      stateBefore: rng.state,
      stateAfter: secondState,
    },
  };
};
