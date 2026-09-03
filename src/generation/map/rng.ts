export interface SeededRandom {
  readonly next: () => number;
  readonly integer: (minimum: number, maximum: number) => number;
  readonly pick: <T>(values: readonly T[]) => T;
  readonly shuffle: <T>(values: readonly T[]) => readonly T[];
}

export const mixUint32 = (value: number): number => {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
};
export const createSeededRandom = (seed: number): SeededRandom => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
  return {
    next,
    integer: (minimum, maximum) => minimum + Math.floor(next() * (maximum - minimum + 1)),
    pick: <T>(values: readonly T[]): T => {
      if (values.length === 0) throw new RangeError('Cannot pick from an empty collection.');
      return values[Math.floor(next() * values.length)]!;
    },
    shuffle: <T>(values: readonly T[]): readonly T[] => {
      const result = [...values];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const other = Math.floor(next() * (index + 1));
        [result[index], result[other]] = [result[other]!, result[index]!];
      }
      return result;
    },
  };
};
