import {
  err,
  ok,
  parseStableIdValue,
  type Brand,
  type Result,
  type StableIdValueError,
} from '../../../core/index.js';

export type FaceId = Brand<string, 'FaceId'>;
export type CapabilityId = Brand<string, 'CapabilityId'>;

export interface PieceDefinitionLocalIdError {
  readonly code: 'INVALID_PIECE_DEFINITION_LOCAL_ID';
  readonly kind: 'FACE' | 'CAPABILITY';
  readonly value: string;
  readonly reason: StableIdValueError['reason'];
}

const parseLocalId = <T extends string>(
  kind: PieceDefinitionLocalIdError['kind'],
  value: string,
): Result<T, PieceDefinitionLocalIdError> => {
  const parsed = parseStableIdValue(value);
  return parsed.ok
    ? ok(parsed.value as T)
    : err({
      code: 'INVALID_PIECE_DEFINITION_LOCAL_ID',
      kind,
      value,
      reason: parsed.error.reason,
    });
};

export const parseFaceId = (value: string): Result<FaceId, PieceDefinitionLocalIdError> =>
  parseLocalId<FaceId>('FACE', value);

export const parseCapabilityId = (
  value: string,
): Result<CapabilityId, PieceDefinitionLocalIdError> =>
  parseLocalId<CapabilityId>('CAPABILITY', value);
