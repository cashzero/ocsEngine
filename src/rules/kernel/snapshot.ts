import {
  FOUNDATION_SCHEMA_VERSION,
  err,
  ok,
  parseContentHash,
  parseDefinitionId,
  parseHexCoordinateId,
  parsePieceId,
  parsePlayerId,
  parseScenarioId,
  revision,
  schemaVersion,
  stableSort,
  type ContentHash,
  type HexId,
  type Result,
  type ValidationIssue,
} from '../../core/index.js';
import {
  canonicalJson,
  canonicalizeScenarioDefinition,
  parseScenarioDefinition,
  type Decoder,
  arrayDecoder,
  decoder,
  literalDecoder,
  nullableDecoder,
  objectDecoder,
  refinedDecoder,
  safeIntegerDecoder,
  stringDecoder,
} from '../../serialization/index.js';
import type { ScenarioDefinition } from '../../domain/scenario/index.js';
import { parseRuleDecisionId, parseRuleTransactionId } from './ids.js';
import type {
  BarrageResultCode,
  CombatResultCode,
  GameState,
  PendingDecision,
  PieceUsageState,
  ResourceReservation,
  RuleConfiguration,
  RulesDiceRoll,
  RulesRngState,
  RuleTransaction,
  TurnSequenceState,
  VictoryState,
} from './model.js';
import { validateGameState } from './state.js';

const issue = (code: string, path: readonly (string | number)[], message: string): ValidationIssue => ({
  code, path, severity: 'ERROR', message,
});

const unknownDecoder: Decoder<unknown> = decoder((input) => ok(input));
const fromParser = <T, E>(parse: (value: string) => Result<T, E>, label: string): Decoder<T> =>
  refinedDecoder(stringDecoder, parse, 'INVALID_RULE_SNAPSHOT_ID', (value) => `Invalid ${label}: ${value}.`);
const definitionIdDecoder = fromParser(parseDefinitionId, 'Definition ID');
const pieceIdDecoder = fromParser(parsePieceId, 'Piece ID');
const playerIdDecoder = fromParser(parsePlayerId, 'Player ID');
const scenarioIdDecoder = fromParser(parseScenarioId, 'Scenario ID');
const transactionIdDecoder = fromParser(parseRuleTransactionId, 'Transaction ID');
const decisionIdDecoder = fromParser(parseRuleDecisionId, 'Decision ID');
const hexIdDecoder: Decoder<HexId> = refinedDecoder(
  stringDecoder,
  (value) => parseHexCoordinateId(value).ok ? ok(value as HexId) : err(undefined),
  'INVALID_RULE_SNAPSHOT_ID',
  (value) => `Invalid Hex ID: ${value}.`,
);
const versionDecoder = refinedDecoder(safeIntegerDecoder, schemaVersion, 'INVALID_SCHEMA_VERSION', String);
const revisionDecoder = refinedDecoder(safeIntegerDecoder, revision, 'INVALID_REVISION', String);

const resultMapDecoder = <T extends string>(values: readonly T[]): Decoder<Readonly<Record<number, T>>> =>
  decoder((input, path = []) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected a dice-result object.')]);
    }
    const record = input as Readonly<Record<string, unknown>>;
    const expected = Array.from({ length: 11 }, (_, index) => String(index + 2));
    const issues: ValidationIssue[] = Object.keys(record)
      .filter((key) => !expected.includes(key))
      .map((key) => issue('UNKNOWN_SCHEMA_FIELD', [...path, key], `Unknown dice total ${key}.`));
    const output: Record<number, T> = {};
    for (const key of expected) {
      const value = record[key];
      if (typeof value !== 'string' || !values.includes(value as T)) {
        issues.push(issue('SCHEMA_LITERAL_MISMATCH', [...path, key], `Invalid result for dice total ${key}.`));
      } else output[Number(key)] = value as T;
    }
    return issues.length > 0 ? err(issues) : ok(output);
  });

const combatResults = [
  'NO_EFFECT', 'ATTACKER_STEP_LOSS', 'DEFENDER_STEP_LOSS',
  'DEFENDER_RETREAT', 'DEFENDER_STEP_LOSS_AND_RETREAT',
] as const satisfies readonly CombatResultCode[];
const barrageResults = ['NO_EFFECT', 'DG', 'STEP_LOSS_AND_DG'] as const satisfies readonly BarrageResultCode[];

const configurationDecoder: Decoder<RuleConfiguration> = objectDecoder({
  schemaVersion: versionDecoder,
  id: definitionIdDecoder,
  rulesVersion: stringDecoder,
  terrainMovementCosts: arrayDecoder(objectDecoder({
    terrainDefinitionId: definitionIdDecoder,
    costTicks: safeIntegerDecoder,
  })),
  hexsideMovementCosts: arrayDecoder(objectDecoder({
    featureDefinitionId: definitionIdDecoder,
    costTicks: safeIntegerDecoder,
  })),
  defaultTerrainCostTicks: safeIntegerDecoder,
  minimumMoveTicks: safeIntegerDecoder,
  stackingLimitReTicks: safeIntegerDecoder,
  supplyTraceRange: safeIntegerDecoder,
  combatSupplyTokenCost: safeIntegerDecoder,
  combatTable: arrayDecoder(objectDecoder({
    minimumOdds: safeIntegerDecoder,
    resultsByTwoDiceTotal: resultMapDecoder(combatResults),
  })),
  barrageTable: arrayDecoder(objectDecoder({
    minimumStrength: safeIntegerDecoder,
    supplyTokenCost: safeIntegerDecoder,
    resultsByTwoDiceTotal: resultMapDecoder(barrageResults),
  })),
  turnLimit: safeIntegerDecoder,
  objectives: arrayDecoder(objectDecoder({ hexId: hexIdDecoder, points: safeIntegerDecoder })),
});

const sequenceDecoder: Decoder<TurnSequenceState> = objectDecoder({
  gameTurn: safeIntegerDecoder,
  playerTurnIndex: refinedDecoder(safeIntegerDecoder,
    (value) => value === 0 || value === 1 ? ok(value as 0 | 1) : err(undefined),
    'INVALID_PLAYER_TURN_INDEX', String),
  phase: literalDecoder(
    'WEATHER', 'FIRST_PLAYER', 'AIRCRAFT_REFIT', 'REINFORCEMENT', 'MOVEMENT',
    'SUPPLY', 'REACTION', 'COMBAT', 'EXPLOITATION', 'CLEAN_UP', 'TURN_END', 'COMPLETE',
  ),
  segment: literalDecoder('NONE', 'MOVEMENT', 'BARRAGE', 'COMBAT'),
  phasingPlayerId: playerIdDecoder,
  actingPlayerId: playerIdDecoder,
});

const usageDecoder: Decoder<PieceUsageState> = objectDecoder({
  pieceId: pieceIdDecoder,
  movementSpentTicks: safeIntegerDecoder,
  moved: { decode: (input, path = []) => typeof input === 'boolean' ? ok(input) : err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected boolean.')]) },
  fired: { decode: (input, path = []) => typeof input === 'boolean' ? ok(input) : err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected boolean.')]) },
  attacked: { decode: (input, path = []) => typeof input === 'boolean' ? ok(input) : err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected boolean.')]) },
  barraged: { decode: (input, path = []) => typeof input === 'boolean' ? ok(input) : err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected boolean.')]) },
  reserveReleased: { decode: (input, path = []) => typeof input === 'boolean' ? ok(input) : err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected boolean.')]) },
});

const rngDecoder: Decoder<RulesRngState> = objectDecoder({
  state: safeIntegerDecoder,
  draws: safeIntegerDecoder,
});

const reservationDecoder: Decoder<ResourceReservation> = objectDecoder({
  resourcePieceId: pieceIdDecoder,
  quantity: safeIntegerDecoder,
  unitDefinitionId: definitionIdDecoder,
});

const rollDecoder: Decoder<RulesDiceRoll> = decoder((input, path = []) => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err([issue('SCHEMA_TYPE_MISMATCH', path, 'Expected dice roll object.')]);
  }
  const record = input as Readonly<Record<string, unknown>>;
  const allowed = ['dice', 'total', 'stateBefore', 'stateAfter'];
  const issues = Object.keys(record).filter((key) => !allowed.includes(key))
    .map((key) => issue('UNKNOWN_SCHEMA_FIELD', [...path, key], `Unknown roll field ${key}.`));
  const dice = record.dice;
  const validDice = Array.isArray(dice) && dice.length === 2
    && dice.every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 6);
  if (!validDice) {
    issues.push(issue('INVALID_DICE_ROLL', [...path, 'dice'], 'Dice must contain exactly two integers from 1 through 6.'));
  }
  if (!Number.isSafeInteger(record.total)
    || (validDice && record.total !== Number(dice[0]) + Number(dice[1]))) {
    issues.push(issue('INVALID_DICE_ROLL', [...path, 'total'], 'Dice total must equal the two dice.'));
  }
  for (const key of ['stateBefore', 'stateAfter'] as const) {
    if (!Number.isSafeInteger(record[key]) || Number(record[key]) < 0 || Number(record[key]) > 0xffff_ffff) {
      issues.push(issue('INVALID_DICE_ROLL', [...path, key], `${key} must be uint32.`));
    }
  }
  return issues.length > 0 ? err(issues) : ok({
    dice: [Number((dice as number[])[0]), Number((dice as number[])[1])],
    total: Number(record.total), stateBefore: Number(record.stateBefore), stateAfter: Number(record.stateAfter),
  });
});

const transactionDecoder: Decoder<RuleTransaction> = objectDecoder({
  id: transactionIdDecoder,
  kind: literalDecoder('COMBAT', 'OVERRUN', 'BARRAGE'),
  step: literalDecoder('AWAITING_RESOURCE', 'READY', 'AWAITING_LOSS', 'AWAITING_RETREAT', 'AWAITING_ADVANCE'),
  ownerId: playerIdDecoder,
  originRevision: revisionDecoder,
  attackerIds: arrayDecoder(pieceIdDecoder),
  defenderIds: arrayDecoder(pieceIdDecoder),
  targetHexId: hexIdDecoder,
  reservations: arrayDecoder(reservationDecoder),
  roll: nullableDecoder(rollDecoder),
  result: nullableDecoder(literalDecoder(...combatResults, ...barrageResults)),
});

const decisionDecoder: Decoder<PendingDecision> = objectDecoder({
  id: decisionIdDecoder,
  kind: literalDecoder('RESOURCE_SOURCE', 'STEP_LOSS', 'RETREAT_HEX', 'ADVANCE_HEX'),
  ownerId: playerIdDecoder,
  transactionId: transactionIdDecoder,
  options: arrayDecoder(objectDecoder({ id: stringDecoder, label: stringDecoder })),
});

const victoryDecoder: Decoder<VictoryState> = objectDecoder({
  scores: arrayDecoder(objectDecoder({ playerId: playerIdDecoder, points: safeIntegerDecoder })),
  winnerId: nullableDecoder(playerIdDecoder),
  reason: nullableDecoder(literalDecoder('TURN_LIMIT', 'OBJECTIVES')),
});

interface RawGameState {
  readonly schemaVersion: GameState['schemaVersion'];
  readonly revision: GameState['revision'];
  readonly scenarioId: GameState['scenarioId'];
  readonly scenario: unknown;
  readonly configuration: RuleConfiguration;
  readonly sequence: TurnSequenceState;
  readonly mapState: unknown;
  readonly pieceState: unknown;
  readonly usage: readonly PieceUsageState[];
  readonly currentMoverId: GameState['currentMoverId'];
  readonly rng: RulesRngState;
  readonly activeTransaction: RuleTransaction | null;
  readonly pendingDecision: PendingDecision | null;
  readonly victory: VictoryState;
}

const rawGameStateDecoder: Decoder<RawGameState> = objectDecoder({
  schemaVersion: versionDecoder,
  revision: revisionDecoder,
  scenarioId: scenarioIdDecoder,
  scenario: unknownDecoder,
  configuration: configurationDecoder,
  sequence: sequenceDecoder,
  mapState: unknownDecoder,
  pieceState: unknownDecoder,
  usage: arrayDecoder(usageDecoder),
  currentMoverId: nullableDecoder(pieceIdDecoder),
  rng: rngDecoder,
  activeTransaction: nullableDecoder(transactionDecoder),
  pendingDecision: nullableDecoder(decisionDecoder),
  victory: victoryDecoder,
});

const canonicalStateValue = (state: GameState): GameState => {
  const staticScenario = canonicalizeScenarioDefinition(state.scenario);
  const currentEnvelope = canonicalizeScenarioDefinition({
    ...state.scenario,
    initialMapState: state.mapState,
    initialPieceState: state.pieceState,
  });
  return {
    ...state,
    scenario: staticScenario,
    configuration: {
      ...state.configuration,
      terrainMovementCosts: stableSort(state.configuration.terrainMovementCosts,
        (left, right) => String(left.terrainDefinitionId).localeCompare(String(right.terrainDefinitionId))),
      hexsideMovementCosts: stableSort(state.configuration.hexsideMovementCosts,
        (left, right) => String(left.featureDefinitionId).localeCompare(String(right.featureDefinitionId))),
      combatTable: stableSort(state.configuration.combatTable, (left, right) => left.minimumOdds - right.minimumOdds),
      barrageTable: stableSort(state.configuration.barrageTable, (left, right) => left.minimumStrength - right.minimumStrength),
      objectives: stableSort(state.configuration.objectives, (left, right) => String(left.hexId).localeCompare(String(right.hexId))),
    },
    sequence: { ...state.sequence },
    mapState: currentEnvelope.initialMapState,
    pieceState: currentEnvelope.initialPieceState,
    usage: stableSort(state.usage, (left, right) => String(left.pieceId).localeCompare(String(right.pieceId))),
    activeTransaction: state.activeTransaction === null ? null : {
      ...state.activeTransaction,
      attackerIds: stableSort(state.activeTransaction.attackerIds, (left, right) => String(left).localeCompare(String(right))),
      defenderIds: stableSort(state.activeTransaction.defenderIds, (left, right) => String(left).localeCompare(String(right))),
      reservations: stableSort(state.activeTransaction.reservations,
        (left, right) => String(left.resourcePieceId).localeCompare(String(right.resourcePieceId))),
    },
    pendingDecision: state.pendingDecision === null ? null : {
      ...state.pendingDecision,
      options: stableSort(state.pendingDecision.options, (left, right) => left.id.localeCompare(right.id)),
    },
    victory: {
      ...state.victory,
      scores: stableSort(state.victory.scores, (left, right) => String(left.playerId).localeCompare(String(right.playerId))),
    },
  };
};

export const serializeGameState = (state: GameState): Result<string, readonly ValidationIssue[]> => {
  const issues = [...validateGameState(state)];
  if (issues.length > 0) return err(issues);
  return canonicalJson(canonicalStateValue(state));
};

export const parseGameState = (input: unknown): Result<GameState, readonly ValidationIssue[]> => {
  const raw = rawGameStateDecoder.decode(input);
  if (!raw.ok) return raw;
  if (raw.value.schemaVersion !== FOUNDATION_SCHEMA_VERSION) {
    return err([issue('UNSUPPORTED_GAME_STATE_VERSION', ['schemaVersion'], 'Unsupported GameState schema version.')]);
  }
  const scenario = parseScenarioDefinition(raw.value.scenario);
  if (!scenario.ok) return err(scenario.error.map((entry) => ({ ...entry, path: ['scenario', ...entry.path] })));
  if (typeof raw.value.scenario !== 'object' || raw.value.scenario === null || Array.isArray(raw.value.scenario)) {
    return err([issue('SCHEMA_TYPE_MISMATCH', ['scenario'], 'Expected Scenario object.')]);
  }
  const current = parseScenarioDefinition({
    ...(raw.value.scenario as Readonly<Record<string, unknown>>),
    initialMapState: raw.value.mapState,
    initialPieceState: raw.value.pieceState,
  });
  if (!current.ok) return err(current.error.map((entry) => ({ ...entry, path: ['current', ...entry.path] })));
  const state: GameState = {
    schemaVersion: raw.value.schemaVersion,
    revision: raw.value.revision,
    scenarioId: raw.value.scenarioId,
    scenario: scenario.value,
    configuration: raw.value.configuration,
    sequence: raw.value.sequence,
    mapState: current.value.initialMapState,
    pieceState: current.value.initialPieceState,
    usage: raw.value.usage,
    currentMoverId: raw.value.currentMoverId,
    rng: raw.value.rng,
    activeTransaction: raw.value.activeTransaction,
    pendingDecision: raw.value.pendingDecision,
    victory: raw.value.victory,
  };
  const issues = [...validateGameState(state)];
  return issues.length > 0 ? err(issues) : ok(state);
};

export const parseGameStateJson = (text: string): Result<GameState, readonly ValidationIssue[]> => {
  let input: unknown;
  try { input = JSON.parse(text) as unknown; }
  catch { return err([issue('INVALID_JSON', [], 'Input is not valid JSON.')]); }
  return parseGameState(input);
};

export const hashGameState = async (
  state: GameState,
): Promise<Result<ContentHash, readonly ValidationIssue[]>> => {
  const serialized = serializeGameState(state);
  if (!serialized.ok) return serialized;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized.value));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const parsed = parseContentHash(`sha256:${hex}`);
  return parsed.ok ? ok(parsed.value) : err([issue('CONTENT_HASH_FAILURE', [], 'SHA-256 output is invalid.')]);
};
