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
import { createInitialSequence } from '../sequence/sequence.js';
import { createRulesRng } from './rng.js';
import type { GameState, RuleConfiguration } from './model.js';

const issue = (code: string, path: readonly (string | number)[], message: string): ValidationIssue => ({
  code, path, severity: 'ERROR', message,
});

export const validateRuleConfiguration = (
  configuration: RuleConfiguration,
): readonly ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!schemaVersion(configuration.schemaVersion).ok) issues.push(issue('INVALID_RULE_CONFIGURATION_VERSION', ['schemaVersion'], 'Rule configuration schema version is invalid.'));
  for (const [field, value, minimum] of [
    ['defaultTerrainCostTicks', configuration.defaultTerrainCostTicks, 0],
    ['minimumMoveTicks', configuration.minimumMoveTicks, 0],
    ['stackingLimitReTicks', configuration.stackingLimitReTicks, 1],
    ['supplyTraceRange', configuration.supplyTraceRange, 0],
    ['combatSupplyTokenCost', configuration.combatSupplyTokenCost, 0],
    ['turnLimit', configuration.turnLimit, 1],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', [field], `${field} is invalid.`));
    }
  }
  if (configuration.combatTable.length === 0) issues.push(issue('MISSING_RULE_TABLE', ['combatTable'], 'Combat table is required.'));
  if (configuration.barrageTable.length === 0) issues.push(issue('MISSING_RULE_TABLE', ['barrageTable'], 'Barrage table is required.'));
  for (const [field, entries] of [
    ['terrainMovementCosts', configuration.terrainMovementCosts],
    ['hexsideMovementCosts', configuration.hexsideMovementCosts],
    ['roadMovementCosts', configuration.roadMovementCosts],
  ] as const) {
    const ids = entries.map((entry) => 'terrainDefinitionId' in entry
      ? entry.terrainDefinitionId : entry.featureDefinitionId);
    if (new Set(ids).size !== ids.length) issues.push(issue('DUPLICATE_RULE_CONFIGURATION_ID', [field], `${field} contains duplicate Definition IDs.`));
    const costs = entries.flatMap(({ costs: byMobility }) => [byMobility.leg, byMobility.truck, byMobility.tracked]);
    if (costs.some((cost) => cost.kind === 'MP' && !Number.isSafeInteger(cost.ticks))) {
      issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', [field], `${field} costs must be exact integer ticks.`));
    }
    // "ot" only makes sense for a Hex; roads must be enterable or prohibited, never additive.
    if (field !== 'terrainMovementCosts' && costs.some(({ kind }) => kind === 'OTHER_TERRAIN')) {
      issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', [field], `${field} cannot defer to other terrain.`));
    }
    if (field === 'roadMovementCosts' && costs.some((cost) => cost.kind === 'MP' && cost.ticks < 0)) {
      issues.push(issue('INVALID_RULE_CONFIGURATION_QUANTITY', [field], `${field} costs cannot be negative.`));
    }
  }
  for (const [field, table] of [
    ['combatTable', configuration.combatTable],
    ['barrageTable', configuration.barrageTable],
  ] as const) {
    for (const [index, band] of table.entries()) {
      const results = band.resultsByTwoDiceTotal;
      if (Array.from({ length: 11 }, (_, offset) => offset + 2).some((total) => results[total] === undefined)) {
        issues.push(issue('INCOMPLETE_RULE_TABLE_BAND', [field, index], 'Every 2d6 total from 2 through 12 requires a result.'));
      }
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
  return ok({
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    revision: initialRevision.value,
    scenarioId: scenario.id,
    scenario,
    configuration,
    sequence: createInitialSequence(
      scenario.players.map(({ id }) => id),
      scenario.turnStart.firstPlayerId,
    ),
    mapState: scenario.initialMapState,
    pieceState: scenario.initialPieceState,
    usage: [],
    currentMoverId: null,
    rng: createRulesRng(rulesSeed),
    activeTransaction: null,
    pendingDecision: null,
    victory: {
      scores: scenario.players.map(({ id }) => ({ playerId: id, points: 0 })),
      winnerId: null,
      reason: null,
    },
  });
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
  if (!playerIds.has(state.sequence.phasingPlayerId) || !playerIds.has(state.sequence.actingPlayerId)) {
    issues.push(issue('UNKNOWN_SEQUENCE_PLAYER', ['sequence'], 'Sequence references an undeclared Player.'));
  }
  const segmented: Readonly<Record<string, readonly string[]>> = {
    MOVEMENT: ['MOVEMENT', 'BARRAGE'], REACTION: ['MOVEMENT', 'BARRAGE'],
    COMBAT: ['BARRAGE', 'COMBAT'], EXPLOITATION: ['MOVEMENT', 'BARRAGE', 'COMBAT'],
  };
  const allowedSegments = segmented[state.sequence.phase] ?? ['NONE'];
  if (!allowedSegments.includes(state.sequence.segment)) {
    issues.push(issue('INVALID_SEQUENCE_SEGMENT', ['sequence', 'segment'], 'Segment does not belong to the current Phase.'));
  }
  if ((state.sequence.phase === 'REACTION') === (state.sequence.actingPlayerId === state.sequence.phasingPlayerId)) {
    issues.push(issue('INVALID_SEQUENCE_ACTOR', ['sequence', 'actingPlayerId'], 'Reaction must belong to the opponent; other Phases belong to the phasing Player.'));
  }
  const pieceIds = new Set(state.pieceState.pieces.map(({ id }) => id));
  const usageIds = state.usage.map(({ pieceId }) => pieceId);
  if (new Set(usageIds).size !== usageIds.length) issues.push(issue('DUPLICATE_USAGE_PIECE', ['usage'], 'Usage ledger contains duplicate Pieces.'));
  for (const [index, usage] of state.usage.entries()) {
    if (!pieceIds.has(usage.pieceId)) issues.push(issue('UNKNOWN_USAGE_PIECE', ['usage', index, 'pieceId'], 'Usage references an unknown Piece.'));
    if (!Number.isSafeInteger(usage.movementSpentTicks) || usage.movementSpentTicks < 0) {
      issues.push(issue('INVALID_USAGE_QUANTITY', ['usage', index, 'movementSpentTicks'], 'Movement spent must be a non-negative integer tick quantity.'));
    }
  }
  if (!Number.isSafeInteger(state.rng.state) || state.rng.state < 0 || state.rng.state > 0xffff_ffff
    || !Number.isSafeInteger(state.rng.draws) || state.rng.draws < 0) {
    issues.push(issue('INVALID_RULE_RNG_STATE', ['rng'], 'RNG state must be uint32 with a non-negative draw count.'));
  }
  if (state.currentMoverId !== null && !pieceIds.has(state.currentMoverId)) {
    issues.push(issue('UNKNOWN_CURRENT_MOVER', ['currentMoverId'], 'Current mover references an unknown Piece.'));
  }
  if (state.pendingDecision !== null && state.activeTransaction?.id !== state.pendingDecision.transactionId) {
    issues.push(issue('ORPHAN_PENDING_DECISION', ['pendingDecision'], 'Pending decision does not reference the active transaction.'));
  }
  if (state.pendingDecision !== null) {
    if (state.pendingDecision.options.length === 0) issues.push(issue('EMPTY_PENDING_DECISION', ['pendingDecision', 'options'], 'Pending decision requires at least one option.'));
    const optionIds = state.pendingDecision.options.map(({ id }) => id);
    if (new Set(optionIds).size !== optionIds.length) issues.push(issue('DUPLICATE_DECISION_OPTION', ['pendingDecision', 'options'], 'Pending decision option IDs must be unique.'));
  }
  if (state.activeTransaction !== null) {
    for (const pieceId of [...state.activeTransaction.attackerIds, ...state.activeTransaction.defenderIds]) {
      if (!pieceIds.has(pieceId)) issues.push(issue('STALE_TRANSACTION_PARTICIPANT', ['activeTransaction'], `Unknown participant ${pieceId}.`));
    }
    const expectsDecision = state.activeTransaction.step !== 'READY';
    if (expectsDecision !== (state.pendingDecision !== null)) {
      issues.push(issue('TRANSACTION_DECISION_MISMATCH', ['activeTransaction', 'step'], 'Transaction step and pending decision disagree.'));
    }
    for (const [index, reservation] of state.activeTransaction.reservations.entries()) {
      if (!pieceIds.has(reservation.resourcePieceId) || !Number.isSafeInteger(reservation.quantity) || reservation.quantity <= 0) {
        issues.push(issue('INVALID_RESOURCE_RESERVATION', ['activeTransaction', 'reservations', index], 'Reservation requires a known resource Piece and positive integer quantity.'));
      }
    }
  }
  const scoreIds = state.victory.scores.map(({ playerId }) => playerId);
  if (new Set(scoreIds).size !== scoreIds.length || scoreIds.length !== playerIds.size
    || scoreIds.some((id) => !playerIds.has(id))) {
    issues.push(issue('INVALID_VICTORY_SCORE_PLAYERS', ['victory', 'scores'], 'Victory scores must contain each Scenario Player exactly once.'));
  }
  if (state.victory.winnerId !== null && !playerIds.has(state.victory.winnerId)) {
    issues.push(issue('UNKNOWN_VICTORY_WINNER', ['victory', 'winnerId'], 'Victory winner is not a Scenario Player.'));
  }
  return issues;
};
