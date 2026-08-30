export const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const compareNumber = (left: number, right: number): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const stableKey = (parts: readonly string[]): string =>
  parts.map((part) => `${part.length}:${part}`).join('|');

export const stableSort = <T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
): readonly T[] => values
  .map((value, index) => ({ value, index }))
  .sort((left, right) => compare(left.value, right.value) || left.index - right.index)
  .map(({ value }) => value);

export const duplicateKeys = <T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): readonly string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) duplicates.add(key);
    else seen.add(key);
  }
  return stableSort([...duplicates], compareText);
};
