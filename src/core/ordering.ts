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

/**
 * Binary heap ordered by `compare`; `pop` returns a least element. Elements that compare equal pop in no
 * particular order, so callers that need a fixed order must make `compare` total.
 */
export class PriorityQueue<T> {
  readonly #compare: (left: T, right: T) => number;
  readonly #values: T[] = [];

  constructor(compare: (left: T, right: T) => number) { this.#compare = compare; }

  get size(): number { return this.#values.length; }

  push(value: T): void {
    const values = this.#values;
    let index = values.push(value) - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.#compare(values[parent]!, value) <= 0) break;
      values[index] = values[parent]!;
      index = parent;
    }
    values[index] = value;
  }

  pop(): T | undefined {
    const values = this.#values;
    const root = values[0];
    const tail = values.pop();
    if (values.length === 0 || tail === undefined) return root;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      if (left >= values.length) break;
      const right = left + 1;
      const child = right < values.length && this.#compare(values[right]!, values[left]!) < 0 ? right : left;
      if (this.#compare(values[child]!, tail) >= 0) break;
      values[index] = values[child]!;
      index = child;
    }
    values[index] = tail;
    return root;
  }
}
