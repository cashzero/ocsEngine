export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const mapResult = <T, U, E>(
  result: Result<T, E>,
  map: (value: T) => U,
): Result<U, E> => (result.ok ? ok(map(result.value)) : result);

export const flatMapResult = <T, U, E, F>(
  result: Result<T, E>,
  map: (value: T) => Result<U, F>,
): Result<U, E | F> => (result.ok ? map(result.value) : result);
