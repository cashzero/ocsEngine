const requireIndex = (length: number, index: number): void => {
  if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
    throw new RangeError(`Collection index ${index} is outside 0..${length - 1}.`);
  }
};

export const replaceAt = <T>(
  values: readonly T[],
  index: number,
  replacement: T,
): readonly T[] => {
  requireIndex(values.length, index);
  return values.map((value, currentIndex) => currentIndex === index ? replacement : value);
};

export const updateAt = <T>(
  values: readonly T[],
  index: number,
  update: (value: T) => T,
): readonly T[] => {
  requireIndex(values.length, index);
  return values.map((value, currentIndex) => currentIndex === index ? update(value) : value);
};
