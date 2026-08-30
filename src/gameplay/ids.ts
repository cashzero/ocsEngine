import { err, ok, parseStableIdValue, type Result } from '../core/index.js';
import type {
  CheckpointId,
  DispatchRequestId,
  GameplayError,
  HandoffToken,
  SeatId,
  SessionId,
} from './model.js';

const parse = <T extends string>(
  code: GameplayError['code'],
  label: string,
  value: string,
): Result<T, GameplayError> => {
  const parsed = parseStableIdValue(value);
  return parsed.ok ? ok(parsed.value as T) : err({
    code, message: `${label} is invalid: ${parsed.error.reason}.`, path: [],
  });
};

export const parseSessionId = (value: string): Result<SessionId, GameplayError> =>
  parse<SessionId>('INVALID_SESSION_ID', 'Session ID', value);
export const parseSeatId = (value: string): Result<SeatId, GameplayError> =>
  parse<SeatId>('INVALID_SEAT_ID', 'Seat ID', value);
export const parseDispatchRequestId = (value: string): Result<DispatchRequestId, GameplayError> =>
  parse<DispatchRequestId>('INVALID_REQUEST_ID', 'Dispatch request ID', value);
export const parseCheckpointId = (value: string): Result<CheckpointId, GameplayError> =>
  parse<CheckpointId>('INVALID_CHECKPOINT_ID', 'Checkpoint ID', value);
export const parseHandoffToken = (value: string): Result<HandoffToken, GameplayError> =>
  parse<HandoffToken>('HANDOFF_INVALID', 'Handoff token', value);
