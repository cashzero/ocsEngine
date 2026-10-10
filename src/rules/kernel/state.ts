import {
  FOUNDATION_SCHEMA_VERSION,
  err,
  ok,
  revision,
  schemaVersion,
  type Result,
  type ValidationIssue,
} from '../../core/index.js';
import { validateMapState } from '../../domain/map/index.js';
import { validatePieceRuntimeState } from '../../domain/piece/index.js';
import { validateScenarioDefinition, type ScenarioDefinition } from '../../domain/scenario/index.js';
import { hexOf, isCombatUnit } from '../pieces.js';
import { activeAircraftAt, activeAircraftLimit, friendlyAirBaseAt, isAirBase, isAircraft } from '../air/aircraft.js';
import { createInitialSequence, PHASE_SEGMENTS } from '../sequence/sequence.js';
import { createRulesRng } from './rng.js';
import { SEQUENCE_DECISION_KINDS, type GameState, type RuleConfiguration } from './model.js';
import { settleInitialSequence } from './reducer.js';

const issue = (code: string, path: readonly (string | number)[], message: string): ValidationIssue => ({
  code, path, severity: 'ERROR', message,
});

const validMultiplier = (value: { numerator: number; denominator: number }): boolean =>
  Number.isSafeInteger(value.numerator) && Number.isSafeInteger(value.denominator) && value.numerator >= 0 && value.denominator > 0;

export const validateRuleConfiguration = (
  configuration: RuleConfiguration,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!schemaVersion(configuration.schemaVersion).ok) issues.push(issue('INVALID_RULE_CONFIGURATION_VERSION', ['schemaVersion'], 'Rule configuration schema version is invalid.'));
  for (const [field, value, minimum] of [
    ['defaultTerrainCostTicks', configuration.defaultTerrainCostTicks, 0],
    ['minimumMoveTicks', configuration.minimumMoveTicks, 0],
    ['stackingLimitReTicks', configuration.stackingLimitReTicks, 1],
    ['supplyDrawRangeTicks', configuration.supplyDrawRangeTicks, 0],
    ['turnLimit', configuration.turnLimit, 1],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', [field], `${field} is invalid.`));
    }
  }
  for (const [field, entries] of [
    ['terrainMovementCosts', configuration.terrainMovementCosts],
    ['hexsideMovementCosts', configuration.hexsideMovementCosts],
    ['roadMovementCosts', configuration.roadMovementCosts],
  ] as const) {
    const ids = entries.map((entry) => 'terrainDefinitionId' in entry ? entry.terrainDefinitionId : entry.featureDefinitionId);
    if (new Set(ids).size !== ids.length) issues.push(issue('DUPLICATE_RULE_CONFIGURATION_ID', [field], `${field} contains duplicate Definition IDs.`));
    const costs = entries.flatMap(({ costs: byMobility }) => [byMobility.leg, byMobility.truck, byMobility.tracked]);
    if (costs.some((cost) => cost.kind === 'MP' && !Number.isSafeInteger(cost.ticks))) {
      issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', [field], `${field} costs must be exact integer ticks.`));
    }
    if (field !== 'terrainMovementCosts' && costs.some(({ kind }) => kind === 'OTHER_TERRAIN')) {
      issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', [field], `${field} cannot defer to other terrain.`));
    }
    if (field === 'roadMovementCosts' && costs.some((cost) => cost.kind === 'MP' && cost.ticks < 0)) {
      issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', [field], `${field} costs cannot be negative.`));
    }
  }
  if (configuration.railroads) {
    const lines = configuration.railroads.lines.map(({ featureDefinitionId }) => String(featureDefinitionId));
    if (new Set(lines).size !== lines.length) {
      issues.push(issue('DUPLICATE_RULE_CONFIGURATION_ID', ['railroads', 'lines'], 'Railroad lines contain duplicate Definition IDs.'));
    }
    // 6.2a: a railroad is a road for movement, so every line needs a road cost.
    const roads = new Set(configuration.roadMovementCosts.map(({ featureDefinitionId }) => String(featureDefinitionId)));
    lines.forEach((line, index) => {
      if (!roads.has(line)) issues.push(issue('RAILROAD_WITHOUT_ROAD_COST', ['railroads', 'lines', index], `Railroad ${line} has no road movement cost (6.2a).`));
    });
  }
  if (configuration.rivers) {
    const { minorFeatureDefinitionIds: minor, majorFeatureDefinitionIds: major } = configuration.rivers;
    const ids = [...minor, ...major].map(String);
    if (new Set(ids).size !== ids.length) {
      issues.push(issue('DUPLICATE_RULE_CONFIGURATION_ID', ['rivers'], 'A river feature is listed twice.'));
    }
    // 13.8b: a bridged Major River costs what a Minor River does, so there must be one to copy.
    if (major.length > 0 && minor.length === 0) {
      issues.push(issue('MAJOR_RIVER_WITHOUT_MINOR', ['rivers', 'minorFeatureDefinitionIds'], 'Bridging a Major River needs a Minor River cost (13.8b).'));
    }
    const hexsides = new Set(configuration.hexsideMovementCosts.map(({ featureDefinitionId }) => String(featureDefinitionId)));
    ids.forEach((river) => {
      if (!hexsides.has(river)) issues.push(issue('RIVER_WITHOUT_HEXSIDE_COST', ['rivers'], `River ${river} has no hexside movement cost (6.2b).`));
    });
  }
  if (configuration.railCapacity) {
    const players = configuration.railCapacity.map(({ playerId }) => String(playerId));
    if (new Set(players).size !== players.length) issues.push(issue('DUPLICATE_RULE_CONFIGURATION_ID', ['railCapacity'], 'Rail Cap lists a player twice.'));
    configuration.railCapacity.forEach(({ points }, index) => {
      if (!Number.isSafeInteger(points) || points < 0) issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', ['railCapacity', index, 'points'], 'Rail Cap is a whole number of points, 0 or more (13.3b).'));
    });
  }
  if (configuration.seaCapacity) {
    const players = configuration.seaCapacity.map(({ playerId }) => String(playerId));
    if (new Set(players).size !== players.length) issues.push(issue('DUPLICATE_RULE_CONFIGURATION_ID', ['seaCapacity'], 'Sea Cap lists a player twice.'));
    configuration.seaCapacity.forEach(({ points }, index) => {
      if (!Number.isSafeInteger(points) || points < 0) issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', ['seaCapacity', index, 'points'], 'Sea Cap is a whole number of points, 0 or more (19.0f).'));
    });
  }
  // A side landing everything by sea needs Sea Cap to land it with.
  for (const [index, playerId] of (configuration.seaArrivals ?? []).entries()) {
    if (!configuration.seaCapacity?.some((entry) => entry.playerId === playerId)) {
      issues.push(issue('SEA_ARRIVALS_WITHOUT_SEA_CAP', ['seaArrivals', index], 'A side whose reinforcements come by sea needs Sea Cap (19.0f).'));
    }
  }
  const weather = configuration.weather;
  if (weather !== null) {
    const days = (month: number, day: number) => month >= 1 && month <= 12 && day >= 1 && day <= 31;
    if (!days(weather.startMonth, weather.startDay) || weather.turnDays.length === 0
      || weather.turnDays.some((day) => !days(1, day)) || weather.table.length === 0) {
      issues.push(issue('INVALID_WEATHER_CONFIGURATION', ['weather'], 'Weather needs a valid start date, turn days, and table rows.'));
    }
    for (const [index, row] of weather.table.entries()) {
      const covered = Array.from({ length: 6 }, (_, face) => row.ground.filter(({ minimum, maximum }) => face + 1 >= minimum && face + 1 <= maximum).length);
      if (!days(row.month, row.firstDay) || !days(row.month, row.lastDay) || row.firstDay > row.lastDay || covered.some((count) => count !== 1)) {
        issues.push(issue('INVALID_WEATHER_ROW', ['weather', 'table', index], 'Each Weather Table row must give exactly one ground condition for every die face.'));
      }
    }
  }
  const arrivals = configuration.supplyArrivals;
  if (arrivals !== null) {
    const width = arrivals.rows[0]?.points.length ?? 0;
    const covered = Array.from({ length: 11 }, (_, index) => arrivals.rows.filter(({ minimum, maximum }) => index + 2 >= minimum && index + 2 <= maximum).length);
    if (width === 0 || covered.some((count) => count !== 1) || arrivals.rows.some(({ points }) => points.length !== width || points.some((value) => !Number.isSafeInteger(value) || value < 0))) {
      issues.push(issue('INVALID_SUPPLY_TABLE', ['supplyArrivals', 'rows'], 'The Supply Table must cover every 2d6 total with one row of non-negative SP.'));
    }
    if (arrivals.players.some(({ status }) => !Number.isSafeInteger(status) || status < 1 || status > width)) {
      issues.push(issue('INVALID_SUPPLY_STATUS', ['supplyArrivals', 'players'], 'Each Supply Status must name a table column.'));
    }
  }
  for (const [field, entries] of [
    ['terrainCombatEffects', configuration.terrainCombatEffects],
    ['hexsideCombatEffects', configuration.hexsideCombatEffects],
  ] as const) {
    const ids = entries.map((entry) => 'terrainDefinitionId' in entry ? entry.terrainDefinitionId : entry.featureDefinitionId);
    if (new Set(ids).size !== ids.length) issues.push(issue('DUPLICATE_RULE_CONFIGURATION_ID', [field], `${field} contains duplicate Definition IDs.`));
    if (entries.some(({ multipliers }) => ![multipliers.armor, multipliers.mech, multipliers.other].every(validMultiplier))) {
      issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', [field], `${field} multipliers must be integer fractions.`));
    }
  }
  return issues;
};

export const createInitialGameState = (
  scenario: ScenarioDefinition,
  configuration: RuleConfiguration,
  rulesSeed: number,
): Result<GameState, readonly ValidationIssue[]> => {
  const issues = [
    ...validateScenarioDefinition(scenario),
    ...validateRuleConfiguration(configuration),
  ];
  if (issues.length > 0) return err(issues);
  const initialRevision = revision(0);
  if (!initialRevision.ok) throw new Error('Revision zero must be valid.');
  const state: GameState = {
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    revision: initialRevision.value,
    scenarioId: scenario.id,
    scenario,
    configuration,
    sequence: createInitialSequence(scenario.players.map(({ id }) => id), scenario.turnStart.firstPlayerId),
    mapState: scenario.initialMapState,
    pieceState: scenario.initialPieceState,
    usage: [],
    ledger: { attackedHexIds: [], barragedHexIds: [] },
    currentMoverId: null,
    rng: createRulesRng(rulesSeed),
    activeTransaction: null,
    pendingDecision: null,
    weather: { groundCondition: 'DRY', month: null, day: null, roll: null },
    fuel: { formations: [], hqIds: [] },
    interrupts: [],
    formationTraces: [],
    victory: {
      scores: scenario.players.map(({ id }) => ({ playerId: id, points: 0 })),
      winnerId: null,
      reason: null,
    },
    air: { missionFlownIds: [], refittedBaseIds: [], reducedBaseIds: [], trainbusting: [], builtHexIds: [], builderIds: [], dropPlans: [], unloaded: [], droppedIds: [] },
    replacements: { lostTrucks: [] },
  };
  const settled = settleInitialSequence(state);
  const invariant = validateGameState(settled);
  return invariant.length > 0 ? err(invariant) : ok(settled);
};

export const validateGameState = (state: GameState): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!schemaVersion(state.schemaVersion).ok) issues.push(issue('INVALID_GAME_STATE_VERSION', ['schemaVersion'], 'GameState schema version is invalid.'));
  if (!revision(state.revision).ok) issues.push(issue('INVALID_GAME_STATE_REVISION', ['revision'], 'GameState revision is invalid.'));
  if (state.schemaVersion !== FOUNDATION_SCHEMA_VERSION) issues.push(issue('UNSUPPORTED_GAME_STATE_VERSION', ['schemaVersion'], 'Unsupported GameState schema version.'));
  if (state.scenarioId !== state.scenario.id) issues.push(issue('SCENARIO_ID_MISMATCH', ['scenarioId'], 'GameState Scenario ID does not match its Scenario.'));
  issues.push(...validateRuleConfiguration(state.configuration).map((entry) => ({ ...entry, path: ['configuration', ...entry.path] })));
  issues.push(...validateMapState(state.scenario.mapDefinition, state.mapState).map((entry) => ({ ...entry, path: ['mapState', ...entry.path] })));
  issues.push(...validatePieceRuntimeState(state.scenario.pieceCatalog, state.pieceState).map((entry) => ({ ...entry, path: ['pieceState', ...entry.path] })));
  const playerIds = new Set(state.scenario.players.map(({ id }) => id));
  const { sequence } = state;
  if (![sequence.phasingPlayerId, sequence.actingPlayerId, sequence.firstPlayerId].every((id) => playerIds.has(id))) {
    issues.push(issue('UNKNOWN_SEQUENCE_PLAYER', ['sequence'], 'Sequence references an undeclared Player.'));
  }
  const allowedSegments = PHASE_SEGMENTS[sequence.phase] ?? ['NONE'];
  if (!allowedSegments.includes(sequence.segment)) {
    issues.push(issue('INVALID_SEQUENCE_SEGMENT', ['sequence', 'segment'], 'Segment does not belong to the current Phase.'));
  }
  if ((sequence.phase === 'REACTION') === (sequence.actingPlayerId === sequence.phasingPlayerId)) {
    issues.push(issue('INVALID_SEQUENCE_ACTOR', ['sequence', 'actingPlayerId'], 'Reaction belongs to the non-phasing player; other phases to the phasing player.'));
  }
  const pieceIds = new Set(state.pieceState.pieces.map(({ id }) => id));
  const usageIds = state.usage.map(({ pieceId }) => pieceId);
  if (new Set(usageIds).size !== usageIds.length) issues.push(issue('DUPLICATE_USAGE_PIECE', ['usage'], 'Usage ledger contains duplicate Pieces.'));
  for (const [index, usage] of state.usage.entries()) {
    if (!pieceIds.has(usage.pieceId)) issues.push(issue('UNKNOWN_USAGE_PIECE', ['usage', index, 'pieceId'], 'Usage references an unknown Piece.'));
    if (!Number.isFinite(usage.movementSpentTicks) || usage.movementSpentTicks < 0) {
      issues.push(issue('INVALID_USAGE_QUANTITY', ['usage', index, 'movementSpentTicks'], 'Movement spent must be a non-negative quantity.'));
    }
  }
  if (!Number.isSafeInteger(state.rng.state) || state.rng.state < 0 || state.rng.state > 0xffff_ffff
    || !Number.isSafeInteger(state.rng.draws) || state.rng.draws < 0) {
    issues.push(issue('INVALID_RULE_RNG_STATE', ['rng'], 'RNG state must be uint32 with a non-negative draw count.'));
  }
  if (state.currentMoverId !== null && !pieceIds.has(state.currentMoverId)) {
    issues.push(issue('UNKNOWN_CURRENT_MOVER', ['currentMoverId'], 'Current mover references an unknown Piece.'));
  }
  const pending = state.pendingDecision;
  if (pending !== null) {
    if (pending.transactionId !== null && state.activeTransaction?.id !== pending.transactionId) {
      issues.push(issue('ORPHAN_PENDING_DECISION', ['pendingDecision'], 'Pending decision does not reference the active transaction.'));
    }
    if (pending.transactionId === null && !SEQUENCE_DECISION_KINDS.includes(pending.kind)) {
      issues.push(issue('ORPHAN_PENDING_DECISION', ['pendingDecision'], 'Only sequence decisions exist outside a transaction.'));
    }
    if (pending.options.length === 0) issues.push(issue('EMPTY_PENDING_DECISION', ['pendingDecision', 'options'], 'Pending decision requires at least one option.'));
    const optionIds = pending.options.map(({ id }) => id);
    if (new Set(optionIds).size !== optionIds.length) issues.push(issue('DUPLICATE_DECISION_OPTION', ['pendingDecision', 'options'], 'Pending decision option IDs must be unique.'));
  }
  const transaction = state.activeTransaction;
  if (transaction !== null) {
    for (const pieceId of [...transaction.attackerIds, ...transaction.defenderIds]) {
      if (!pieceIds.has(pieceId)) issues.push(issue('STALE_TRANSACTION_PARTICIPANT', ['activeTransaction'], `Unknown participant ${pieceId}.`));
    }
    if (pending?.transactionId !== transaction.id) {
      issues.push(issue('TRANSACTION_DECISION_MISMATCH', ['activeTransaction', 'step'], 'An unresolved transaction always waits on its own decision.'));
    }
    for (const [index, reservation] of [...transaction.attackerPayments, ...transaction.defenderPayments].entries()) {
      if (!pieceIds.has(reservation.resourcePieceId) || !Number.isSafeInteger(reservation.quantity) || reservation.quantity <= 0) {
        issues.push(issue('INVALID_RESOURCE_RESERVATION', ['activeTransaction', 'payments', index], 'Payments require a known dump and a positive Token quantity.'));
      }
    }
  }
  // 14.2a, 15.0bD: a friendly Air Base never holds more Active aircraft than 4 + its Level.
  for (const base of state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && isAirBase(state, piece))) {
    const hexId = hexOf(base)!;
    if (activeAircraftAt(state, base.ownerId, hexId).length > activeAircraftLimit(state, base)) {
      issues.push(issue('AIR_BASE_ACTIVE_LIMIT', ['pieceState', hexId], `Air Base ${hexId} holds more Active aircraft than its Level allows.`));
    }
  }
  // 14.2c: aircraft on the map are always at a friendly Air Base (missions are resolved inside a transaction).
  for (const piece of state.pieceState.pieces.filter((candidate) => candidate.location.kind === 'ON_MAP' && isAircraft(state, candidate))) {
    if (!friendlyAirBaseAt(state, piece.ownerId, hexOf(piece)!) && !state.interrupts.some((interrupt) => interrupt.kind === 'AIR_DISPLACEMENT' && interrupt.pieceIds.includes(piece.id))) {
      issues.push(issue('AIRCRAFT_OFF_BASE', ['pieceState', piece.id], `Aircraft ${piece.id} is not at a friendly Air Base.`));
    }
  }
  // 4.8c: combat units of both sides never share a Hex.
  const owners = new Map<string, Set<string>>();
  for (const piece of state.pieceState.pieces) {
    if (piece.location.kind !== 'ON_MAP' || !isCombatUnit(state, piece)) continue;
    const set = owners.get(piece.location.hexId) ?? new Set<string>();
    set.add(piece.ownerId);
    owners.set(piece.location.hexId, set);
  }
  for (const [hexId, set] of owners) {
    if (set.size > 1) issues.push(issue('OPPOSING_COMBAT_UNITS_SHARE_HEX', ['pieceState', hexId], `Hex ${hexId} holds combat units of both sides.`));
  }
  const attack = state.configuration.attackVictory;
  if (attack && (!playerIds.has(attack.attackerId) || !Number.isSafeInteger(attack.attackerPoints) || attack.attackerPoints < 1)) {
    issues.push(issue('INVALID_ATTACK_VICTORY', ['configuration', 'attackVictory'], 'An attack needs a Scenario Player as attacker and a VP target of at least 1.'));
  }
  const scoreIds = state.victory.scores.map(({ playerId }) => playerId);
  if (new Set(scoreIds).size !== scoreIds.length || scoreIds.length !== playerIds.size || scoreIds.some((id) => !playerIds.has(id))) {
    issues.push(issue('INVALID_VICTORY_SCORE_PLAYERS', ['victory', 'scores'], 'Victory scores must contain each Scenario Player exactly once.'));
  }
  if (state.victory.winnerId !== null && !playerIds.has(state.victory.winnerId)) {
    issues.push(issue('UNKNOWN_VICTORY_WINNER', ['victory', 'winnerId'], 'Victory winner is not a Scenario Player.'));
  }
  return issues;
};
