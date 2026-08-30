import {
  err,
  ok,
  parseContentHash,
  parseHexCoordinateId,
  parsePieceId,
  parsePlayerId,
  revision,
  type Result,
} from '../core/index.js';
import { canonicalJson } from '../serialization/index.js';
import {
  parseRuleActionId,
  parseRuleDecisionId,
  parseRuleTransactionId,
  type GameAction,
} from '../rules/index.js';
import {
  parseCheckpointId,
  parseDispatchRequestId,
  parseSeatId,
  parseSessionId,
} from './ids.js';
import type {
  GameplayError,
  GameplaySaveCheckpoint,
  GameplaySaveActionMetadata,
  GameplaySaveEnvelope,
  SeatBinding,
} from './model.js';

type Path = readonly (string | number)[];
type RecordValue = Readonly<Record<string, unknown>>;

const issue = (code: GameplayError['code'], path: Path, message: string): GameplayError => ({
  code, path, message,
});

const recordAt = (input: unknown, path: Path, issues: GameplayError[]): RecordValue | null => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    issues.push(issue('SAVE_INVALID', path, 'Expected an object.'));
    return null;
  }
  return input as RecordValue;
};

const exactKeys = (record: RecordValue, allowed: readonly string[], path: Path, issues: GameplayError[]): void => {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) issues.push(issue('SAVE_INVALID', [...path, key], `Unknown field ${key}.`));
  }
  for (const key of allowed) {
    if (!(key in record)) issues.push(issue('SAVE_INVALID', [...path, key], `Missing field ${key}.`));
  }
};

const textAt = (record: RecordValue, key: string, path: Path, issues: GameplayError[]): string => {
  const value = record[key];
  if (typeof value !== 'string') {
    issues.push(issue('SAVE_INVALID', [...path, key], 'Expected a string.'));
    return '';
  }
  return value;
};

const integerAt = (record: RecordValue, key: string, path: Path, issues: GameplayError[]): number => {
  const value = record[key];
  if (!Number.isSafeInteger(value)) {
    issues.push(issue('SAVE_INVALID', [...path, key], 'Expected a safe integer.'));
    return 0;
  }
  return value as number;
};

const parseBinding = (input: unknown, path: Path, issues: GameplayError[]): SeatBinding => {
  const record = recordAt(input, path, issues) ?? {};
  exactKeys(record, ['seatId', 'playerId', 'label'], path, issues);
  const seatText = textAt(record, 'seatId', path, issues);
  const playerText = textAt(record, 'playerId', path, issues);
  const seat = parseSeatId(seatText);
  const player = parsePlayerId(playerText);
  if (!seat.ok) issues.push({ ...seat.error, path: [...path, 'seatId'] });
  if (!player.ok) issues.push(issue('SAVE_INVALID', [...path, 'playerId'], 'Invalid Player ID.'));
  return {
    seatId: seat.ok ? seat.value : seatText as SeatBinding['seatId'],
    playerId: player.ok ? player.value : playerText as SeatBinding['playerId'],
    label: textAt(record, 'label', path, issues),
  };
};

const stringArray = (input: unknown, path: Path, issues: GameplayError[]): string[] => {
  if (!Array.isArray(input)) {
    issues.push(issue('SAVE_INVALID', path, 'Expected an array.'));
    return [];
  }
  return input.map((value, index) => {
    if (typeof value !== 'string') {
      issues.push(issue('SAVE_INVALID', [...path, index], 'Expected a string.'));
      return '';
    }
    return value;
  });
};

const parseAction = (input: unknown, path: Path, issues: GameplayError[]): GameAction => {
  const record = recordAt(input, path, issues) ?? {};
  const kind = textAt(record, 'kind', path, issues) as GameAction['kind'];
  const fields: Readonly<Record<GameAction['kind'], readonly string[]>> = {
    ADVANCE_SEQUENCE: [], CHANGE_MODE: ['pieceId', 'mode'], RELEASE_RESERVE: ['pieceId'],
    MOVE_PIECE: ['pieceId', 'path'], CHECK_SUPPLY: ['pieceIds', 'sourcePieceId'],
    DECLARE_COMBAT: ['combatKind', 'attackerIds', 'defenderIds', 'targetHexId'],
    DECLARE_BARRAGE: ['firerIds', 'targetPieceIds', 'targetHexId'],
    RESPOND_DECISION: ['decisionId', 'choiceId'], COMMIT_TRANSACTION: ['transactionId'],
    CANCEL_TRANSACTION: ['transactionId'], PLACE_REINFORCEMENT: ['pieceId', 'hexId'],
  };
  if (!(kind in fields)) issues.push(issue('SAVE_INVALID', [...path, 'kind'], `Unknown action kind ${kind}.`));
  exactKeys(record, ['actionId', 'actorId', 'expectedRevision', 'kind', ...(fields[kind] ?? [])], path, issues);
  const actionText = textAt(record, 'actionId', path, issues);
  const actorText = textAt(record, 'actorId', path, issues);
  const parsedActionId = parseRuleActionId(actionText);
  const actor = parsePlayerId(actorText);
  const expected = revision(integerAt(record, 'expectedRevision', path, issues));
  if (!parsedActionId.ok) issues.push(issue('SAVE_INVALID', [...path, 'actionId'], 'Invalid Rule Action ID.'));
  if (!actor.ok) issues.push(issue('SAVE_INVALID', [...path, 'actorId'], 'Invalid Player ID.'));
  if (!expected.ok) issues.push(issue('SAVE_INVALID', [...path, 'expectedRevision'], 'Invalid revision.'));
  const base = {
    actionId: parsedActionId.ok ? parsedActionId.value : actionText as never,
    actorId: actor.ok ? actor.value : actorText as never,
    expectedRevision: expected.ok ? expected.value : 0 as never,
    kind,
  };
  const piece = (key: string) => {
    const value = textAt(record, key, path, issues);
    const parsed = parsePieceId(value);
    if (!parsed.ok) issues.push(issue('SAVE_INVALID', [...path, key], 'Invalid Piece ID.'));
    return parsed.ok ? parsed.value : value as never;
  };
  const pieces = (key: string) => stringArray(record[key], [...path, key], issues).map((value, index) => {
    const parsed = parsePieceId(value);
    if (!parsed.ok) issues.push(issue('SAVE_INVALID', [...path, key, index], 'Invalid Piece ID.'));
    return parsed.ok ? parsed.value : value as never;
  });
  const hex = (key: string) => {
    const value = textAt(record, key, path, issues);
    if (!parseHexCoordinateId(value).ok) issues.push(issue('SAVE_INVALID', [...path, key], 'Invalid Hex ID.'));
    return value as never;
  };
  switch (kind) {
    case 'ADVANCE_SEQUENCE': return base as GameAction;
    case 'CHANGE_MODE': {
      const mode = textAt(record, 'mode', path, issues);
      if (!['COMBAT', 'MOVE', 'RESERVE', 'STRAT'].includes(mode)) issues.push(issue('SAVE_INVALID', [...path, 'mode'], 'Invalid voluntary mode.'));
      return { ...base, pieceId: piece('pieceId'), mode } as GameAction;
    }
    case 'RELEASE_RESERVE': return { ...base, pieceId: piece('pieceId') } as GameAction;
    case 'MOVE_PIECE': return { ...base, pieceId: piece('pieceId'), path: stringArray(record.path, [...path, 'path'], issues).map((_, index) => hexFromArray(record.path, index, path, issues)) } as GameAction;
    case 'CHECK_SUPPLY': return { ...base, pieceIds: pieces('pieceIds'), sourcePieceId: record.sourcePieceId === null ? null : piece('sourcePieceId') } as GameAction;
    case 'DECLARE_COMBAT': {
      const combatKind = textAt(record, 'combatKind', path, issues);
      if (!['REGULAR', 'OVERRUN'].includes(combatKind)) issues.push(issue('SAVE_INVALID', [...path, 'combatKind'], 'Invalid combat kind.'));
      return { ...base, combatKind, attackerIds: pieces('attackerIds'), defenderIds: pieces('defenderIds'), targetHexId: hex('targetHexId') } as GameAction;
    }
    case 'DECLARE_BARRAGE': return { ...base, firerIds: pieces('firerIds'), targetPieceIds: pieces('targetPieceIds'), targetHexId: hex('targetHexId') } as GameAction;
    case 'RESPOND_DECISION': {
      const value = textAt(record, 'decisionId', path, issues);
      const parsed = parseRuleDecisionId(value);
      if (!parsed.ok) issues.push(issue('SAVE_INVALID', [...path, 'decisionId'], 'Invalid Rule Decision ID.'));
      return { ...base, decisionId: parsed.ok ? parsed.value : value as never, choiceId: textAt(record, 'choiceId', path, issues) } as GameAction;
    }
    case 'COMMIT_TRANSACTION':
    case 'CANCEL_TRANSACTION': {
      const value = textAt(record, 'transactionId', path, issues);
      const parsed = parseRuleTransactionId(value);
      if (!parsed.ok) issues.push(issue('SAVE_INVALID', [...path, 'transactionId'], 'Invalid Rule Transaction ID.'));
      return { ...base, transactionId: parsed.ok ? parsed.value : value as never } as GameAction;
    }
    case 'PLACE_REINFORCEMENT': return { ...base, pieceId: piece('pieceId'), hexId: hex('hexId') } as GameAction;
    default: return base as GameAction;
  }
};

const hexFromArray = (input: unknown, index: number, path: Path, issues: GameplayError[]) => {
  const value = Array.isArray(input) && typeof input[index] === 'string' ? input[index] as string : '';
  if (!parseHexCoordinateId(value).ok) issues.push(issue('SAVE_INVALID', [...path, 'path', index], 'Invalid Hex ID.'));
  return value as never;
};

const parseCheckpoint = (input: unknown, path: Path, issues: GameplayError[]): GameplaySaveCheckpoint => {
  const record = recordAt(input, path, issues) ?? {};
  exactKeys(record, ['id', 'label', 'actionIndex', 'revision', 'stateHash', 'snapshot'], path, issues);
  const idText = textAt(record, 'id', path, issues);
  const hashText = textAt(record, 'stateHash', path, issues);
  const parsedId = parseCheckpointId(idText);
  const parsedRevision = revision(integerAt(record, 'revision', path, issues));
  const hash = parseContentHash(hashText);
  if (!parsedId.ok) issues.push({ ...parsedId.error, path: [...path, 'id'] });
  if (!parsedRevision.ok) issues.push(issue('SAVE_INVALID', [...path, 'revision'], 'Invalid revision.'));
  if (!hash.ok) issues.push(issue('SAVE_INVALID', [...path, 'stateHash'], 'Invalid content hash.'));
  return {
    id: parsedId.ok ? parsedId.value : idText as never,
    label: textAt(record, 'label', path, issues),
    actionIndex: integerAt(record, 'actionIndex', path, issues),
    revision: parsedRevision.ok ? parsedRevision.value : 0 as never,
    stateHash: hash.ok ? hash.value : hashText as never,
    snapshot: textAt(record, 'snapshot', path, issues),
  };
};

const parseActionMetadata = (
  input: unknown,
  path: Path,
  issues: GameplayError[],
): GameplaySaveActionMetadata => {
  const record = recordAt(input, path, issues) ?? {};
  exactKeys(record, ['requestId', 'seatId', 'acceptedAtMs', 'durationMs'], path, issues);
  const requestText = textAt(record, 'requestId', path, issues);
  const seatText = textAt(record, 'seatId', path, issues);
  const requestId = parseDispatchRequestId(requestText);
  const seatId = parseSeatId(seatText);
  const acceptedAtMs = integerAt(record, 'acceptedAtMs', path, issues);
  const durationMs = integerAt(record, 'durationMs', path, issues);
  if (!requestId.ok) issues.push({ ...requestId.error, path: [...path, 'requestId'] });
  if (!seatId.ok) issues.push({ ...seatId.error, path: [...path, 'seatId'] });
  if (acceptedAtMs < 0) issues.push(issue('SAVE_INVALID', [...path, 'acceptedAtMs'], 'Accepted time must be non-negative.'));
  if (durationMs < 0) issues.push(issue('SAVE_INVALID', [...path, 'durationMs'], 'Duration must be non-negative.'));
  return {
    requestId: requestId.ok ? requestId.value : requestText as never,
    seatId: seatId.ok ? seatId.value : seatText as never,
    acceptedAtMs, durationMs,
  };
};

export const serializeGameplaySave = (
  envelope: GameplaySaveEnvelope,
): Result<string, readonly GameplayError[]> => {
  const serialized = canonicalJson(envelope);
  return serialized.ok ? ok(serialized.value) : err(serialized.error.map((entry) =>
    issue('SAVE_INVALID', entry.path, entry.message)));
};

export const parseGameplaySave = (
  serialized: string,
): Result<GameplaySaveEnvelope, readonly GameplayError[]> => {
  let input: unknown;
  try { input = JSON.parse(serialized) as unknown; }
  catch { return err([issue('SAVE_INVALID', [], 'Save is not valid JSON.')]); }
  const issues: GameplayError[] = [];
  const record = recordAt(input, [], issues) ?? {};
  const keys = [
    'schemaVersion', 'gameplayVersion', 'sessionId', 'label', 'createdAtMs', 'lifecycle',
    'activeSeatId', 'bindings', 'scenarioHash', 'initialStateHash', 'finalStateHash',
    'initialSnapshot', 'currentSnapshot', 'acceptedActions', 'acceptedActionMetadata', 'checkpoints',
  ];
  exactKeys(record, keys, [], issues);
  const schema = integerAt(record, 'schemaVersion', [], issues);
  const version = textAt(record, 'gameplayVersion', [], issues);
  if (schema !== 1 || version !== '0.1.0') issues.push(issue('SAVE_INCOMPATIBLE', ['schemaVersion'], 'Unsupported Gameplay save version.'));
  const sessionText = textAt(record, 'sessionId', [], issues);
  const seatText = textAt(record, 'activeSeatId', [], issues);
  const session = parseSessionId(sessionText);
  const seat = parseSeatId(seatText);
  if (!session.ok) issues.push({ ...session.error, path: ['sessionId'] });
  if (!seat.ok) issues.push({ ...seat.error, path: ['activeSeatId'] });
  const lifecycle = textAt(record, 'lifecycle', [], issues);
  if (!['READY', 'ACTIVE', 'PAUSED', 'FINISHED'].includes(lifecycle)) issues.push(issue('SAVE_INVALID', ['lifecycle'], 'Lifecycle cannot be restored.'));
  const hash = (key: string) => {
    const value = textAt(record, key, [], issues);
    const parsed = parseContentHash(value);
    if (!parsed.ok) issues.push(issue('SAVE_INVALID', [key], 'Invalid content hash.'));
    return parsed.ok ? parsed.value : value as never;
  };
  const bindings = Array.isArray(record.bindings)
    ? record.bindings.map((value, index) => parseBinding(value, ['bindings', index], issues))
    : (issues.push(issue('SAVE_INVALID', ['bindings'], 'Expected bindings array.')), []);
  const actions = Array.isArray(record.acceptedActions)
    ? record.acceptedActions.map((value, index) => parseAction(value, ['acceptedActions', index], issues))
    : (issues.push(issue('SAVE_INVALID', ['acceptedActions'], 'Expected actions array.')), []);
  const actionMetadata = Array.isArray(record.acceptedActionMetadata)
    ? record.acceptedActionMetadata.map((value, index) =>
      parseActionMetadata(value, ['acceptedActionMetadata', index], issues))
    : (issues.push(issue('SAVE_INVALID', ['acceptedActionMetadata'], 'Expected action metadata array.')), []);
  if (actions.length !== actionMetadata.length) {
    issues.push(issue('SAVE_INVALID', ['acceptedActionMetadata'], 'Action metadata must align one-to-one with accepted Actions.'));
  }
  if (new Set(actions.map(({ actionId }) => String(actionId))).size !== actions.length) {
    issues.push(issue('SAVE_INVALID', ['acceptedActions'], 'Accepted Action IDs must be unique.'));
  }
  if (new Set(actionMetadata.map(({ requestId }) => String(requestId))).size !== actionMetadata.length) {
    issues.push(issue('SAVE_INVALID', ['acceptedActionMetadata'], 'Dispatch request IDs must be unique.'));
  }
  const checkpoints = Array.isArray(record.checkpoints)
    ? record.checkpoints.map((value, index) => parseCheckpoint(value, ['checkpoints', index], issues))
    : (issues.push(issue('SAVE_INVALID', ['checkpoints'], 'Expected checkpoints array.')), []);
  const envelope: GameplaySaveEnvelope = {
    schemaVersion: 1, gameplayVersion: '0.1.0',
    sessionId: session.ok ? session.value : sessionText as never,
    label: textAt(record, 'label', [], issues),
    createdAtMs: integerAt(record, 'createdAtMs', [], issues),
    lifecycle: lifecycle as GameplaySaveEnvelope['lifecycle'],
    activeSeatId: seat.ok ? seat.value : seatText as never,
    bindings,
    scenarioHash: hash('scenarioHash'), initialStateHash: hash('initialStateHash'),
    finalStateHash: hash('finalStateHash'),
    initialSnapshot: textAt(record, 'initialSnapshot', [], issues),
    currentSnapshot: textAt(record, 'currentSnapshot', [], issues),
    acceptedActions: actions, acceptedActionMetadata: actionMetadata, checkpoints,
  };
  return issues.length > 0 ? err(issues) : ok(envelope);
};
