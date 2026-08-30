import { err, ok, type Result } from './result.js';
import type { Brand } from './identity.js';

export type SupplyToken = Brand<number, 'SupplyToken'>;
export type MovementPointTick = Brand<number, 'MovementPointTick'>;
export type RegimentalEquivalentTick = Brand<number, 'RegimentalEquivalentTick'>;

export type ExactQuantityKind = 'SUPPLY_TOKEN' | 'MOVEMENT_POINT_TICK' | 'RE_TICK';

export interface ExactQuantityError {
  readonly code: 'INVALID_EXACT_QUANTITY';
  readonly kind: ExactQuantityKind;
  readonly value: number;
  readonly reason: 'NOT_FINITE' | 'NOT_INTEGER' | 'NEGATIVE' | 'NOT_QUARTER_INCREMENT';
}

const parseNonNegativeInteger = <T extends number>(
  kind: ExactQuantityKind,
  value: number,
): Result<T, ExactQuantityError> => {
  let reason: ExactQuantityError['reason'] | undefined;
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    reason = Number.isFinite(value) ? 'NOT_INTEGER' : 'NOT_FINITE';
  } else if (value < 0) {
    reason = 'NEGATIVE';
  }

  return reason
    ? err({ code: 'INVALID_EXACT_QUANTITY', kind, value, reason })
    : ok((Object.is(value, -0) ? 0 : value) as T);
};

const parseQuarterUnits = <T extends number>(
  kind: ExactQuantityKind,
  value: number,
): Result<T, ExactQuantityError> => {
  if (!Number.isFinite(value)) {
    return err({ code: 'INVALID_EXACT_QUANTITY', kind, value, reason: 'NOT_FINITE' });
  }
  if (value < 0) {
    return err({ code: 'INVALID_EXACT_QUANTITY', kind, value, reason: 'NEGATIVE' });
  }

  const ticks = value * 4;
  if (!Number.isSafeInteger(ticks)) {
    return err({
      code: 'INVALID_EXACT_QUANTITY',
      kind,
      value,
      reason: 'NOT_QUARTER_INCREMENT',
    });
  }
  return ok((Object.is(ticks, -0) ? 0 : ticks) as T);
};

export const supplyTokens = (value: number): Result<SupplyToken, ExactQuantityError> =>
  parseNonNegativeInteger<SupplyToken>('SUPPLY_TOKEN', value);

export const supplyPoints = (value: number): Result<SupplyToken, ExactQuantityError> =>
  parseQuarterUnits<SupplyToken>('SUPPLY_TOKEN', value);

export const movementPointTicks = (
  value: number,
): Result<MovementPointTick, ExactQuantityError> =>
  parseNonNegativeInteger<MovementPointTick>('MOVEMENT_POINT_TICK', value);

export const movementPoints = (
  value: number,
): Result<MovementPointTick, ExactQuantityError> =>
  parseQuarterUnits<MovementPointTick>('MOVEMENT_POINT_TICK', value);

export const regimentalEquivalentTicks = (
  value: number,
): Result<RegimentalEquivalentTick, ExactQuantityError> =>
  parseNonNegativeInteger<RegimentalEquivalentTick>('RE_TICK', value);

export const regimentalEquivalents = (
  value: number,
): Result<RegimentalEquivalentTick, ExactQuantityError> =>
  parseQuarterUnits<RegimentalEquivalentTick>('RE_TICK', value);

export const supplyPointsFromTokens = (tokens: SupplyToken): number => tokens / 4;

export const movementPointsFromTicks = (ticks: MovementPointTick): number => ticks / 4;

export const regimentalEquivalentsFromTicks = (
  ticks: RegimentalEquivalentTick,
): number => ticks / 4;
