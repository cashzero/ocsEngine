import { err, ok, type Result } from './result.js';
import type { Brand } from './identity.js';

export type SchemaVersion = Brand<number, 'SchemaVersion'>;
export type Revision = Brand<number, 'Revision'>;
export type ContentHash = Brand<string, 'ContentHash'>;

/** Current persistent schema emitted by this Foundation package. */
export const FOUNDATION_SCHEMA_VERSION = 1 as SchemaVersion;

export interface SourceReference {
  readonly document: string;
  readonly locator: string;
  readonly note?: string;
}

export interface MetadataScalarError {
  readonly code: 'INVALID_METADATA_SCALAR';
  readonly kind: 'SCHEMA_VERSION' | 'REVISION';
  readonly value: number;
  readonly reason: 'NOT_SAFE_INTEGER' | 'OUT_OF_RANGE';
}

export interface ContentHashError {
  readonly code: 'INVALID_CONTENT_HASH';
  readonly value: string;
  readonly expected: 'sha256:<64-lowercase-hex-digits>';
}

const parseInteger = <T extends number>(
  kind: MetadataScalarError['kind'],
  value: number,
  minimum: number,
): Result<T, MetadataScalarError> => {
  if (!Number.isSafeInteger(value)) {
    return err({ code: 'INVALID_METADATA_SCALAR', kind, value, reason: 'NOT_SAFE_INTEGER' });
  }
  if (value < minimum) {
    return err({ code: 'INVALID_METADATA_SCALAR', kind, value, reason: 'OUT_OF_RANGE' });
  }
  return ok(value as T);
};

export const schemaVersion = (value: number): Result<SchemaVersion, MetadataScalarError> =>
  parseInteger<SchemaVersion>('SCHEMA_VERSION', value, 1);

export const revision = (value: number): Result<Revision, MetadataScalarError> =>
  parseInteger<Revision>('REVISION', value, 0);

const CONTENT_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export const parseContentHash = (value: string): Result<ContentHash, ContentHashError> =>
  CONTENT_HASH_PATTERN.test(value)
    ? ok(value as ContentHash)
    : err({
      code: 'INVALID_CONTENT_HASH',
      value,
      expected: 'sha256:<64-lowercase-hex-digits>',
    });
