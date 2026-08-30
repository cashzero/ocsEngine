import { err, ok, type Result, type ValidationIssue } from '../core/index.js';

export interface Decoder<T> {
  readonly decode: (
    input: unknown,
    path?: readonly (string | number)[],
  ) => Result<T, readonly ValidationIssue[]>;
}

type Shape<T extends object> = { readonly [K in keyof T]-?: Decoder<T[K]> };

const issue = (
  code: string,
  path: readonly (string | number)[],
  message: string,
): ValidationIssue => ({ code, path, severity: 'ERROR', message });

export const decoder = <T>(
  decode: Decoder<T>['decode'],
): Decoder<T> => ({ decode });

export const stringDecoder: Decoder<string> = decoder((input, path = []) =>
  typeof input === 'string'
    ? ok(input)
    : err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected a string.')]),
);

export const booleanDecoder: Decoder<boolean> = decoder((input, path = []) =>
  typeof input === 'boolean'
    ? ok(input)
    : err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected a boolean.')]),
);

export const numberDecoder: Decoder<number> = decoder((input, path = []) =>
  typeof input === 'number' && Number.isFinite(input)
    ? ok(Object.is(input, -0) ? 0 : input)
    : err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected a finite number.')]),
);

export const safeIntegerDecoder: Decoder<number> = decoder((input, path = []) =>
  typeof input === 'number' && Number.isSafeInteger(input)
    ? ok(Object.is(input, -0) ? 0 : input)
    : err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected a safe integer.')]),
);

export const literalDecoder = <const T extends string>(
  ...values: readonly T[]
): Decoder<T> => decoder((input, path = []) =>
  typeof input === 'string' && values.includes(input as T)
    ? ok(input as T)
    : err([issue(
      'SCHEMA_LITERAL_MISMATCH',
      path,
      `Expected one of: ${values.join(', ')}.`,
    )]),
);

export const nullableDecoder = <T>(inner: Decoder<T>): Decoder<T | null> =>
  decoder((input, path = []) => input === null ? ok(null) : inner.decode(input, path));

export const optionalDecoder = <T>(inner: Decoder<T>): Decoder<T | undefined> =>
  decoder((input, path = []) => input === undefined ? ok(undefined) : inner.decode(input, path));

export const arrayDecoder = <T>(inner: Decoder<T>): Decoder<readonly T[]> =>
  decoder((input, path = []) => {
    if (!Array.isArray(input)) {
      return err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected an array.')]);
    }
    const values: T[] = [];
    const issues: ValidationIssue[] = [];
    input.forEach((entry, index) => {
      const decoded = inner.decode(entry, [...path, index]);
      if (decoded.ok) values.push(decoded.value);
      else issues.push(...decoded.error);
    });
    return issues.length > 0 ? err(issues) : ok(values);
  });

export const objectDecoder = <T extends object>(shape: Shape<T>): Decoder<T> =>
  decoder((input, path = []) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected an object.')]);
    }
    const record = input as Readonly<Record<string, unknown>>;
    const allowed = new Set(Object.keys(shape));
    const issues: ValidationIssue[] = Object.keys(record)
      .filter((key) => !allowed.has(key))
      .map((key) => issue(
        'UNKNOWN_SCHEMA_FIELD',
        [...path, key],
        `Unknown field ${key}.`,
      ));
    const output: Record<string, unknown> = {};
    for (const [key, fieldDecoder] of Object.entries(shape) as readonly [string, Decoder<unknown>][]) {
      const decoded = fieldDecoder.decode(record[key], [...path, key]);
      if (decoded.ok) output[key] = decoded.value;
      else issues.push(...decoded.error);
    }
    return issues.length > 0 ? err(issues) : ok(output as T);
  });

export const refinedDecoder = <T, U>(
  inner: Decoder<T>,
  refine: (value: T) => Result<U, unknown>,
  code: string,
  message: (value: T) => string,
): Decoder<U> => decoder((input, path = []) => {
  const decoded = inner.decode(input, path);
  if (!decoded.ok) return decoded;
  const refined = refine(decoded.value);
  return refined.ok
    ? ok(refined.value)
    : err([issue(code, path, message(decoded.value))]);
});

export const taggedUnionDecoder = <T>(
  tag: string,
  variants: Readonly<Record<string, Decoder<T>>>,
): Decoder<T> => decoder((input, path = []) => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected a tagged object.')]);
  }
  const tagValue = (input as Readonly<Record<string, unknown>>)[tag];
  if (typeof tagValue !== 'string' || variants[tagValue] === undefined) {
    return err([issue(
      'UNKNOWN_SCHEMA_VARIANT',
      [...path, tag],
      `Unknown ${tag} variant.`,
    )]);
  }
  return variants[tagValue]!.decode(input, path);
});
