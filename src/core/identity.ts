import { err, ok, type Result } from './result.js';

declare const brand: unique symbol;

export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type HexId = Brand<string, 'HexId'>;
export type PieceId = Brand<string, 'PieceId'>;
export type DefinitionId = Brand<string, 'DefinitionId'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type ScenarioId = Brand<string, 'ScenarioId'>;

export type StableIdKind = 'piece' | 'definition' | 'player' | 'scenario';

export interface StableIdError {
  readonly code: 'INVALID_STABLE_ID';
  readonly kind: StableIdKind;
  readonly value: string;
  readonly reason: 'EMPTY' | 'SURROUNDING_WHITESPACE' | 'CONTROL_CHARACTER';
}

export interface StableIdValueError {
  readonly code: 'INVALID_STABLE_ID_VALUE';
  readonly value: string;
  readonly reason: StableIdError['reason'];
}

export const parseStableIdValue = (value: string): Result<string, StableIdValueError> => {
  let reason: StableIdValueError['reason'] | undefined;
  if (value.length === 0) reason = 'EMPTY';
  else if (value.trim() !== value) reason = 'SURROUNDING_WHITESPACE';
  else if (/\p{Cc}/u.test(value)) reason = 'CONTROL_CHARACTER';

  return reason
    ? err({ code: 'INVALID_STABLE_ID_VALUE', value, reason })
    : ok(value);
};

const parseStableId = <T extends string>(
  kind: StableIdKind,
  value: string,
): Result<T, StableIdError> => {
  const parsed = parseStableIdValue(value);
  return parsed.ok
    ? ok(parsed.value as T)
    : err({ code: 'INVALID_STABLE_ID', kind, value, reason: parsed.error.reason });
};

export const parsePieceId = (value: string): Result<PieceId, StableIdError> =>
  parseStableId<PieceId>('piece', value);

export const parseDefinitionId = (value: string): Result<DefinitionId, StableIdError> =>
  parseStableId<DefinitionId>('definition', value);

export const parsePlayerId = (value: string): Result<PlayerId, StableIdError> =>
  parseStableId<PlayerId>('player', value);

export const parseScenarioId = (value: string): Result<ScenarioId, StableIdError> =>
  parseStableId<ScenarioId>('scenario', value);
