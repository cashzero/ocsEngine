import { describe, expect, it } from 'vitest';
import {
  err,
  duplicateKeys,
  flatMapResult,
  hasValidationErrors,
  mapResult,
  movementPointTicks,
  movementPoints,
  movementPointsFromTicks,
  ok,
  parsePieceId,
  parseContentHash,
  replaceAt,
  revision,
  regimentalEquivalentTicks,
  regimentalEquivalents,
  regimentalEquivalentsFromTicks,
  supplyPointsFromTokens,
  supplyPoints,
  supplyTokens,
  schemaVersion,
  stableKey,
  stableSort,
  updateAt,
} from '../../src/core/index.js';

describe('Result', () => {
  it('maps and flat-maps successful values without changing errors', () => {
    expect(mapResult(ok(2), (value) => value * 3)).toEqual(ok(6));
    expect(flatMapResult(ok(2), (value) => ok(String(value)))).toEqual(ok('2'));

    const failure = err({ code: 'FAIL' as const });
    expect(mapResult(failure, () => 3)).toBe(failure);
    expect(flatMapResult(failure, () => ok(3))).toBe(failure);
  });
});

describe('stable identities', () => {
  it('accepts exact persistent IDs and rejects implicit normalization', () => {
    expect(parsePieceId('axis:1-pz')).toEqual({ ok: true, value: 'axis:1-pz' });
    expect(parsePieceId('')).toMatchObject({ ok: false, error: { reason: 'EMPTY' } });
    expect(parsePieceId(' axis:1-pz')).toMatchObject({
      ok: false,
      error: { reason: 'SURROUNDING_WHITESPACE' },
    });
    expect(parsePieceId('axis\n1-pz')).toMatchObject({
      ok: false,
      error: { reason: 'CONTROL_CHARACTER' },
    });
  });

  it('revalidates primitive IDs after a JSON round-trip', () => {
    const encoded = JSON.stringify({ pieceId: 'axis:1-pz', supplyTokens: 7 });
    const decoded = JSON.parse(encoded) as { pieceId: unknown; supplyTokens: unknown };

    expect(typeof decoded.pieceId === 'string' && parsePieceId(decoded.pieceId)).toMatchObject({
      ok: true,
    });
    expect(typeof decoded.supplyTokens === 'number' && supplyTokens(decoded.supplyTokens))
      .toEqual({ ok: true, value: 7 });
  });
});

describe('exact quantities', () => {
  it('stores supply as integer tokens', () => {
    const tokens = supplyTokens(7);
    expect(tokens.ok && supplyPointsFromTokens(tokens.value)).toBe(1.75);
    expect(supplyTokens(1.5)).toMatchObject({ ok: false, error: { reason: 'NOT_INTEGER' } });
    expect(supplyPoints(1.75)).toEqual(supplyTokens(7));
  });

  it('converts MP and RE only at quarter increments', () => {
    const mp = movementPoints(2.75);
    const re = regimentalEquivalents(1.5);

    expect(mp.ok && mp.value).toBe(11);
    expect(mp.ok && movementPointsFromTicks(mp.value)).toBe(2.75);
    expect(re.ok && re.value).toBe(6);
    expect(re.ok && regimentalEquivalentsFromTicks(re.value)).toBe(1.5);
    expect(movementPoints(0.1)).toMatchObject({
      ok: false,
      error: { reason: 'NOT_QUARTER_INCREMENT' },
    });
  });

  it('rejects negative, fractional, and unsafe tick counts', () => {
    expect(movementPointTicks(-1)).toMatchObject({ ok: false, error: { reason: 'NEGATIVE' } });
    expect(regimentalEquivalentTicks(0.5)).toMatchObject({
      ok: false,
      error: { reason: 'NOT_INTEGER' },
    });
    expect(supplyTokens(Number.MAX_SAFE_INTEGER + 1)).toMatchObject({
      ok: false,
      error: { reason: 'NOT_INTEGER' },
    });
  });
});

describe('metadata and deterministic collection primitives', () => {
  it('validates versions, revisions, and content hash envelopes', () => {
    expect(schemaVersion(1)).toEqual({ ok: true, value: 1 });
    expect(schemaVersion(0)).toMatchObject({ ok: false, error: { reason: 'OUT_OF_RANGE' } });
    expect(revision(0)).toEqual({ ok: true, value: 0 });
    expect(parseContentHash(`sha256:${'a'.repeat(64)}`)).toMatchObject({ ok: true });
    expect(parseContentHash(`sha256:${'A'.repeat(64)}`)).toMatchObject({ ok: false });
  });

  it('builds collision-safe keys and reports duplicate IDs deterministically', () => {
    expect(stableKey(['a|b', 'c'])).not.toBe(stableKey(['a', 'b|c']));
    expect(duplicateKeys(['b', 'a', 'b', 'a'], (value) => value)).toEqual(['a', 'b']);
  });

  it('sorts stably without mutating its input', () => {
    const input = [{ rank: 2, id: 'a' }, { rank: 1, id: 'b' }, { rank: 2, id: 'c' }];
    const sorted = stableSort(input, (left, right) => left.rank - right.rank);
    expect(sorted.map(({ id }) => id)).toEqual(['b', 'a', 'c']);
    expect(input.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  it('updates immutable collections and keeps validation severity explicit', () => {
    const input = [{ value: 1 }, { value: 2 }];
    const replaced = replaceAt(input, 0, { value: 3 });
    const updated = updateAt(input, 1, (item) => ({ value: item.value + 1 }));

    expect(replaced).toEqual([{ value: 3 }, { value: 2 }]);
    expect(updated).toEqual([{ value: 1 }, { value: 3 }]);
    expect(input).toEqual([{ value: 1 }, { value: 2 }]);
    expect(hasValidationErrors([
      { code: 'NOTICE', path: [], severity: 'WARNING', message: 'notice' },
    ])).toBe(false);
    expect(hasValidationErrors([
      { code: 'BAD', path: ['piece', 0], severity: 'ERROR', message: 'bad value' },
    ])).toBe(true);
  });
});
