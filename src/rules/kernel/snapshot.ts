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
  canonicalizeMapState,
  canonicalizePieceState,
  canonicalizeScenarioDefinition,
  internCanonicalJson,
  parseScenarioDefinition,
  type Decoder,
  arrayDecoder,
  booleanDecoder,
  decoder,
  literalDecoder,
  nullableDecoder,
  optionalDecoder,
  taggedUnionDecoder,
  objectDecoder,
  refinedDecoder,
  safeIntegerDecoder,
  stringDecoder,
} from '../../serialization/index.js';
import { parseMapBoxId } from '../../domain/map/index.js';
import { parseRuleDecisionId, parseRuleTransactionId } from './ids.js';
import { PENDING_DECISION_KINDS } from './model.js';
import type {
  AirMissionState,
  AirState,
  ReplacementState,
  CombatMultiplier,
  FuelState,
  GameState,
  PaymentProgress,
  RuleInterrupt,
  WeatherState,
  MovementCost,
  PendingDecision,
  PieceUsageState,
  ResolutionStep,
  ResourceReservation,
  RuleConfiguration,
  RulesDiceRoll,
  RulesRngState,
  RuleTransaction,
  SegmentLedger,
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
const boxIdDecoder = fromParser(parseMapBoxId, 'Box ID');
const versionDecoder = refinedDecoder(safeIntegerDecoder, schemaVersion, 'INVALID_SCHEMA_VERSION', String);
const revisionDecoder = refinedDecoder(safeIntegerDecoder, revision, 'INVALID_REVISION', String);

const movementCostDecoder: Decoder<MovementCost> = taggedUnionDecoder<MovementCost>('kind', {
  MP: objectDecoder({ kind: literalDecoder('MP'), ticks: safeIntegerDecoder }),
  ALL: objectDecoder({ kind: literalDecoder('ALL') }),
  PROHIBITED: objectDecoder({ kind: literalDecoder('PROHIBITED') }),
  OTHER_TERRAIN: objectDecoder({ kind: literalDecoder('OTHER_TERRAIN') }),
});
const mobilityCostsDecoder = objectDecoder({
  leg: movementCostDecoder, truck: movementCostDecoder, tracked: movementCostDecoder,
});
const weatherColumnsDecoder = arrayDecoder(objectDecoder({
  condition: literalDecoder('MUD', 'SNOW'), costs: mobilityCostsDecoder,
}));
const groundConditionDecoder = literalDecoder('DRY', 'MUD', 'SNOW');
const multiplierDecoder: Decoder<CombatMultiplier> = objectDecoder({
  numerator: safeIntegerDecoder, denominator: safeIntegerDecoder, attackOnly: booleanDecoder,
});
const classMultipliersDecoder = objectDecoder({ armor: multiplierDecoder, mech: multiplierDecoder, other: multiplierDecoder });
const lineDecoder = literalDecoder('OPEN', 'CLOSE', 'VERY_CLOSE', 'EXTREMELY_CLOSE');

const configurationDecoder: Decoder<RuleConfiguration> = objectDecoder({
  schemaVersion: versionDecoder,
  id: definitionIdDecoder,
  rulesVersion: stringDecoder,
  terrainMovementCosts: arrayDecoder(objectDecoder({ terrainDefinitionId: definitionIdDecoder, costs: mobilityCostsDecoder, weather: weatherColumnsDecoder })),
  hexsideMovementCosts: arrayDecoder(objectDecoder({ featureDefinitionId: definitionIdDecoder, costs: mobilityCostsDecoder, weather: weatherColumnsDecoder })),
  roadMovementCosts: arrayDecoder(objectDecoder({ featureDefinitionId: definitionIdDecoder, costs: mobilityCostsDecoder, weather: weatherColumnsDecoder })),
  defaultTerrainCostTicks: safeIntegerDecoder,
  minimumMoveTicks: safeIntegerDecoder,
  terrainCombatEffects: arrayDecoder(objectDecoder({
    terrainDefinitionId: definitionIdDecoder, line: nullableDecoder(lineDecoder), multipliers: classMultipliersDecoder,
  })),
  hexsideCombatEffects: arrayDecoder(objectDecoder({ featureDefinitionId: definitionIdDecoder, multipliers: classMultipliersDecoder })),
  stackingLimitReTicks: safeIntegerDecoder,
  supplyDrawRangeTicks: safeIntegerDecoder,
  weather: nullableDecoder(objectDecoder({
    startMonth: safeIntegerDecoder,
    startDay: safeIntegerDecoder,
    turnDays: arrayDecoder(safeIntegerDecoder),
    table: arrayDecoder(objectDecoder({
      month: safeIntegerDecoder, firstDay: safeIntegerDecoder, lastDay: safeIntegerDecoder,
      ground: arrayDecoder(objectDecoder({ condition: groundConditionDecoder, minimum: safeIntegerDecoder, maximum: safeIntegerDecoder })),
    })),
  })),
  supplyArrivals: nullableDecoder(objectDecoder({
    rows: arrayDecoder(objectDecoder({ minimum: safeIntegerDecoder, maximum: safeIntegerDecoder, points: arrayDecoder(safeIntegerDecoder) })),
    players: arrayDecoder(objectDecoder({ playerId: playerIdDecoder, status: safeIntegerDecoder, resourceDefinitionId: definitionIdDecoder })),
  })),
  reinforcementBoxes: arrayDecoder(objectDecoder({ playerId: playerIdDecoder, boxId: boxIdDecoder })),
  turnLimit: safeIntegerDecoder,
  objectives: arrayDecoder(objectDecoder({ hexId: hexIdDecoder, points: safeIntegerDecoder })),
  railroads: optionalDecoder(objectDecoder({
    lines: arrayDecoder(objectDecoder({ featureDefinitionId: definitionIdDecoder, multiTrack: booleanDecoder })),
    detrainableFeatureDefinitionIds: arrayDecoder(definitionIdDecoder),
  })),
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
  segment: literalDecoder('NONE', 'BREAKOUT', 'MOVEMENT', 'BARRAGE', 'COMBAT'),
  firstPlayerId: playerIdDecoder,
  phasingPlayerId: playerIdDecoder,
  actingPlayerId: playerIdDecoder,
});

const usageDecoder: Decoder<PieceUsageState> = objectDecoder({
  pieceId: pieceIdDecoder,
  movementSpentTicks: safeIntegerDecoder,
  moved: booleanDecoder,
  phaseStartHexId: nullableDecoder(hexIdDecoder),
  attacked: booleanDecoder,
  barraged: booleanDecoder,
  reserveReleased: booleanDecoder,
  negationLocked: booleanDecoder,
  supplyPaid: booleanDecoder,
  fueled: booleanDecoder,
  fuelThrowHexId: nullableDecoder(hexIdDecoder),
  recovered: booleanDecoder,
  breakoutAttempted: booleanDecoder,
  blown: booleanDecoder,
  unloadedTokens: safeIntegerDecoder,
  airCarried: optionalDecoder(booleanDecoder),
});

const ledgerDecoder: Decoder<SegmentLedger> = objectDecoder({
  attackedHexIds: arrayDecoder(hexIdDecoder),
  barragedHexIds: arrayDecoder(hexIdDecoder),
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

const sideDecoder = literalDecoder('ATTACKER', 'DEFENDER');
const resolutionStepDecoder: Decoder<ResolutionStep> = taggedUnionDecoder<ResolutionStep>('kind', {
  LOSS: objectDecoder({
    kind: literalDecoder('LOSS'), side: sideDecoder, count: safeIntegerDecoder,
    distribution: literalDecoder('COMBAT', 'FREE'), pieceIds: arrayDecoder(pieceIdDecoder),
  }),
  OPTION: objectDecoder({ kind: literalDecoder('OPTION'), side: sideDecoder, points: safeIntegerDecoder }),
  RETREAT: objectDecoder({ kind: literalDecoder('RETREAT'), side: sideDecoder, hexes: safeIntegerDecoder, pieceIds: arrayDecoder(pieceIdDecoder) }),
  EXPLOIT: objectDecoder({ kind: literalDecoder('EXPLOIT'), rating: safeIntegerDecoder }),
  DEFENDER_DG: objectDecoder({ kind: literalDecoder('DEFENDER_DG') }),
  ADVANCE: objectDecoder({ kind: literalDecoder('ADVANCE') }),
});

const paymentDecoder: Decoder<PaymentProgress> = objectDecoder({
  side: sideDecoder,
  queue: arrayDecoder(objectDecoder({ pieceIds: arrayDecoder(pieceIdDecoder), tokens: safeIntegerDecoder })),
  paid: safeIntegerDecoder,
});

const airMissionDecoder: Decoder<AirMissionState> = objectDecoder({
  mission: literalDecoder('FIGHTER_SWEEP', 'BARRAGE', 'HIP_SHOOT', 'TRAINBUSTING', 'BASE_TRANSFER'),
  target: nullableDecoder(literalDecoder('COMBAT_UNITS', 'AIR_BASE')),
  stage: literalDecoder('AIR_COMBAT', 'INTERCEPTION', 'FLAK', 'RESOLVE', 'TARGET_LOSS', 'RETURN'),
  aircraft: arrayDecoder(objectDecoder({ pieceId: pieceIdDecoder, baseHexId: hexIdDecoder })),
  combat: nullableDecoder(objectDecoder({
    context: literalDecoder('MISSION_HEX', 'INTERCEPTION'),
    attackerId: playerIdDecoder,
    missionSideIds: arrayDecoder(pieceIdDecoder),
    opposingSideIds: arrayDecoder(pieceIdDecoder),
    abortsPending: arrayDecoder(playerIdDecoder),
    attackerPickId: nullableDecoder(pieceIdDecoder),
    round: safeIntegerDecoder,
  })),
  interceptorId: nullableDecoder(pieceIdDecoder),
  interceptionOffered: booleanDecoder,
  flakTotal: nullableDecoder(safeIntegerDecoder),
  targetLosses: safeIntegerDecoder,
  returns: arrayDecoder(objectDecoder({
    pieceId: pieceIdDecoder, fromHexId: hexIdDecoder, originHexId: optionalDecoder(hexIdDecoder), rangeHexes: optionalDecoder(safeIntegerDecoder), requiredHexId: nullableDecoder(hexIdDecoder), staysActive: booleanDecoder,
  })),
  log: arrayDecoder(stringDecoder),
  cargo: optionalDecoder(nullableDecoder(objectDecoder({
    baseHexId: hexIdDecoder,
    unitIds: arrayDecoder(pieceIdDecoder),
    supply: arrayDecoder(objectDecoder({ sourcePieceId: pieceIdDecoder, tokens: safeIntegerDecoder })),
    routes: arrayDecoder(objectDecoder({ pieceId: pieceIdDecoder, route: literalDecoder('DOUBLE', 'NORMAL', 'NORMAL_STAY', 'HALF', 'HALF_STAY') })),
    drop: nullableDecoder(literalDecoder('PARACHUTE', 'GLIDER')),
  }))),
});

const airStateDecoder: Decoder<AirState> = objectDecoder({
  missionFlownIds: arrayDecoder(pieceIdDecoder),
  refittedBaseIds: arrayDecoder(pieceIdDecoder),
  reducedBaseIds: arrayDecoder(pieceIdDecoder),
  trainbusting: arrayDecoder(objectDecoder({ hexId: hexIdDecoder, ownerId: playerIdDecoder })),
  builtHexIds: arrayDecoder(hexIdDecoder),
  builderIds: arrayDecoder(pieceIdDecoder),
  dropPlans: arrayDecoder(objectDecoder({
    id: stringDecoder, ownerId: playerIdDecoder, unitIds: arrayDecoder(pieceIdDecoder), hexId: hexIdDecoder, turn: safeIntegerDecoder,
  })),
  unloaded: arrayDecoder(objectDecoder({ hexId: hexIdDecoder, tokens: safeIntegerDecoder })),
  droppedIds: arrayDecoder(pieceIdDecoder),
});

/** Air bookkeeping of a state with no air activity yet (also the value 0.2.0 snapshots migrate to). */
export const EMPTY_AIR_STATE: AirState = {
  missionFlownIds: [], refittedBaseIds: [], reducedBaseIds: [], trainbusting: [], builtHexIds: [], builderIds: [], dropPlans: [], unloaded: [], droppedIds: [],
};

const replacementStateDecoder: Decoder<ReplacementState> = objectDecoder({
  lostTrucks: arrayDecoder(objectDecoder({ ownerId: playerIdDecoder, definitionId: definitionIdDecoder, points: safeIntegerDecoder })),
});

/** Replacement bookkeeping of a state where no truck was lost yet (also the value older snapshots migrate to). */
export const EMPTY_REPLACEMENT_STATE: ReplacementState = { lostTrucks: [] };

const transactionDecoder: Decoder<RuleTransaction> = objectDecoder({
  id: transactionIdDecoder,
  kind: literalDecoder('COMBAT', 'OVERRUN', 'BARRAGE', 'AIR_MISSION'),
  step: literalDecoder('ATTACKER_SUPPLY', 'DEFENDER_SUPPLY', 'DEFENDER_LEAD', 'DEFENDER_TERRAIN', 'BARRAGE_SUPPLY', 'RESOLVING', 'AIR_MISSION'),
  ownerId: playerIdDecoder,
  defenderOwnerId: playerIdDecoder,
  originRevision: revisionDecoder,
  attackerIds: arrayDecoder(pieceIdDecoder),
  defenderIds: arrayDecoder(pieceIdDecoder),
  targetHexId: hexIdDecoder,
  leadAttackerId: nullableDecoder(pieceIdDecoder),
  leadDefenderId: nullableDecoder(pieceIdDecoder),
  attackerPayments: arrayDecoder(reservationDecoder),
  defenderPayments: arrayDecoder(reservationDecoder),
  payment: nullableDecoder(paymentDecoder),
  attackerInternalIds: arrayDecoder(pieceIdDecoder),
  defenderSupplied: booleanDecoder,
  defenderInternalIds: arrayDecoder(pieceIdDecoder),
  defenderTerrainId: nullableDecoder(stringDecoder),
  surpriseRoll: nullableDecoder(rollDecoder),
  shiftDie: nullableDecoder(safeIntegerDecoder),
  roll: nullableDecoder(rollDecoder),
  result: nullableDecoder(stringDecoder),
  queue: arrayDecoder(resolutionStepDecoder),
  lossLedger: arrayDecoder(objectDecoder({ pieceId: pieceIdDecoder, steps: safeIntegerDecoder })),
  attackerRetreated: booleanDecoder,
  blockedHexIds: arrayDecoder(hexIdDecoder),
  air: nullableDecoder(airMissionDecoder),
});

const decisionDecoder: Decoder<PendingDecision> = objectDecoder({
  id: decisionIdDecoder,
  kind: literalDecoder(...PENDING_DECISION_KINDS),
  ownerId: playerIdDecoder,
  transactionId: nullableDecoder(transactionIdDecoder),
  prompt: stringDecoder,
  options: arrayDecoder(objectDecoder({ id: stringDecoder, label: stringDecoder, hexId: nullableDecoder(hexIdDecoder) })),
});

const weatherStateDecoder: Decoder<WeatherState> = objectDecoder({
  groundCondition: groundConditionDecoder,
  month: nullableDecoder(safeIntegerDecoder),
  day: nullableDecoder(safeIntegerDecoder),
  roll: nullableDecoder(safeIntegerDecoder),
});

const fuelDecoder: Decoder<FuelState> = objectDecoder({
  formations: arrayDecoder(objectDecoder({
    playerId: playerIdDecoder, formationId: definitionIdDecoder, coveredPieceIds: arrayDecoder(pieceIdDecoder),
  })),
  hqIds: arrayDecoder(pieceIdDecoder),
});

const interruptDecoder: Decoder<RuleInterrupt> = taggedUnionDecoder<RuleInterrupt>('kind', {
  ATTRITION: objectDecoder({
    kind: literalDecoder('ATTRITION'), ownerId: playerIdDecoder, hexId: hexIdDecoder,
    steps: safeIntegerDecoder, pieceIds: arrayDecoder(pieceIdDecoder),
  }),
  DISPLACEMENT: objectDecoder({
    kind: literalDecoder('DISPLACEMENT'), reason: literalDecoder('CAPTURE', 'EXTENDER_COLLAPSE'), ownerId: playerIdDecoder, fromHexId: hexIdDecoder,
    pieceIds: arrayDecoder(pieceIdDecoder), range: safeIntegerDecoder,
  }),
  AIR_DISPLACEMENT: objectDecoder({
    kind: literalDecoder('AIR_DISPLACEMENT'), ownerId: playerIdDecoder, fromHexId: hexIdDecoder, pieceIds: arrayDecoder(pieceIdDecoder),
  }),
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
  readonly ledger: SegmentLedger;
  readonly currentMoverId: GameState['currentMoverId'];
  readonly rng: RulesRngState;
  readonly activeTransaction: RuleTransaction | null;
  readonly pendingDecision: PendingDecision | null;
  readonly weather: WeatherState;
  readonly fuel: FuelState;
  readonly interrupts: readonly RuleInterrupt[];
  readonly formationTraces: GameState['formationTraces'];
  readonly victory: VictoryState;
  readonly air: AirState;
  readonly replacements: ReplacementState;
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
  ledger: ledgerDecoder,
  currentMoverId: nullableDecoder(pieceIdDecoder),
  rng: rngDecoder,
  activeTransaction: nullableDecoder(transactionDecoder),
  pendingDecision: nullableDecoder(decisionDecoder),
  weather: weatherStateDecoder,
  fuel: fuelDecoder,
  interrupts: arrayDecoder(interruptDecoder),
  formationTraces: arrayDecoder(objectDecoder({ formationId: definitionIdDecoder, routeKey: stringDecoder })),
  victory: victoryDecoder,
  air: airStateDecoder,
  replacements: replacementStateDecoder,
});

const byText = <T>(key: (value: T) => string) => (left: T, right: T): number => key(left).localeCompare(key(right));

/** Every GameState of a game shares its immutable Scenario; canonicalize and serialize it once. */
const canonicalScenarios = new WeakMap<GameState['scenario'], GameState['scenario']>();

const canonicalScenarioOf = (scenario: GameState['scenario']): GameState['scenario'] => {
  let canonical = canonicalScenarios.get(scenario);
  if (canonical === undefined) {
    canonical = internCanonicalJson(canonicalizeScenarioDefinition(scenario));
    canonicalScenarios.set(scenario, canonical);
  }
  return canonical;
};

const canonicalStateValue = (state: GameState): GameState => {
  const staticScenario = canonicalScenarioOf(state.scenario);
  return {
    ...state,
    scenario: staticScenario,
    configuration: {
      ...state.configuration,
      terrainMovementCosts: stableSort(state.configuration.terrainMovementCosts, byText(({ terrainDefinitionId }) => String(terrainDefinitionId))),
      hexsideMovementCosts: stableSort(state.configuration.hexsideMovementCosts, byText(({ featureDefinitionId }) => String(featureDefinitionId))),
      roadMovementCosts: stableSort(state.configuration.roadMovementCosts, byText(({ featureDefinitionId }) => String(featureDefinitionId))),
      terrainCombatEffects: stableSort(state.configuration.terrainCombatEffects, byText(({ terrainDefinitionId }) => String(terrainDefinitionId))),
      hexsideCombatEffects: stableSort(state.configuration.hexsideCombatEffects, byText(({ featureDefinitionId }) => String(featureDefinitionId))),
      objectives: stableSort(state.configuration.objectives, byText(({ hexId }) => String(hexId))),
      ...(state.configuration.railroads ? { railroads: {
        lines: stableSort(state.configuration.railroads.lines, byText(({ featureDefinitionId }) => String(featureDefinitionId))),
        detrainableFeatureDefinitionIds: stableSort(state.configuration.railroads.detrainableFeatureDefinitionIds, byText(String)),
      } } : {}),
    },
    sequence: { ...state.sequence },
    mapState: canonicalizeMapState(state.mapState),
    pieceState: canonicalizePieceState(state.pieceState),
    usage: stableSort(state.usage, byText(({ pieceId }) => String(pieceId))),
    fuel: {
      formations: stableSort(state.fuel.formations, byText(({ formationId }) => String(formationId))),
      hqIds: stableSort(state.fuel.hqIds, byText(String)),
    },
    formationTraces: stableSort(state.formationTraces, byText(({ formationId }) => String(formationId))),
    air: {
      ...state.air,
      trainbusting: stableSort(state.air.trainbusting, byText(({ hexId, ownerId }) => `${hexId}|${ownerId}`)),
    },
    replacements: {
      lostTrucks: stableSort(state.replacements.lostTrucks, byText(({ ownerId, definitionId }) => `${ownerId}|${definitionId}`)),
    },
    victory: {
      ...state.victory,
      scores: stableSort(state.victory.scores, byText(({ playerId }) => String(playerId))),
    },
  };
};

/**
 * One serialization per state: game states are immutable, and every accepted action serializes the new
 * state for its hash, the automatic save and the next Undo checkpoint (64x48: ~15 ms each).
 */
const serializedStates = new WeakMap<GameState, Result<string, readonly ValidationIssue[]>>();

export const serializeGameState = (state: GameState): Result<string, readonly ValidationIssue[]> => {
  const cached = serializedStates.get(state);
  if (cached) return cached;
  const issues = [...validateGameState(state)];
  const result = issues.length > 0 ? err(issues) : canonicalJson(canonicalStateValue(state));
  serializedStates.set(state, result);
  return result;
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
    ledger: raw.value.ledger,
    currentMoverId: raw.value.currentMoverId,
    rng: raw.value.rng,
    activeTransaction: raw.value.activeTransaction,
    pendingDecision: raw.value.pendingDecision,
    weather: raw.value.weather,
    fuel: raw.value.fuel,
    interrupts: raw.value.interrupts,
    formationTraces: raw.value.formationTraces,
    victory: raw.value.victory,
    air: raw.value.air,
    replacements: raw.value.replacements,
  };
  const issues = [...validateGameState(state)];
  return issues.length > 0 ? err(issues) : ok(state);
};

/**
 * Upgrade a gameplay 0.2.0 snapshot (before air power) to the current shape: no air bookkeeping and
 * no air mission in progress. Nothing else changed, so the upgraded state replays identically.
 */
export const upgradeLegacyGameStateInput = (input: unknown): unknown => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const record = input as Readonly<Record<string, unknown>>;
  const transaction = record.activeTransaction;
  const air = typeof record.air === 'object' && record.air !== null && !Array.isArray(record.air) ? record.air as Readonly<Record<string, unknown>> : null;
  return {
    ...record,
    // 0.3.0 air bookkeeping gains the construction ledger, Drop Plans and the unload ledger (empty in any older game).
    air: air ? { ...EMPTY_AIR_STATE, ...air } : EMPTY_AIR_STATE,
    // Ground replacements (13.5a-e) add the lost-truck ledger: no truck was recorded as lost in an older game.
    replacements: typeof record.replacements === 'object' && record.replacements !== null ? record.replacements : EMPTY_REPLACEMENT_STATE,
    activeTransaction: typeof transaction === 'object' && transaction !== null && !Array.isArray(transaction)
      ? { air: null, ...(transaction as Readonly<Record<string, unknown>>) } : transaction ?? null,
  };
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
