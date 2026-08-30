import {
  FOUNDATION_SCHEMA_VERSION,
  formatHexId,
  hex,
  parseDefinitionId,
  schemaVersion,
  type DefinitionId,
  type PlayerId,
  type Result,
} from '../core/index.js';
import type { GameAction, GameState, RuleConfiguration, RulePhase, RuleSegment } from '../rules/kernel/index.js';
import { parseRuleActionId } from '../rules/kernel/index.js';
import { createInitialGameState } from '../rules/kernel/index.js';
import { createFoundationScenarioFixture } from './foundation-fixtures.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Rule fixture literal is invalid.');
  return result.value;
};
const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));

export const createRuleConfigurationFixture = (): RuleConfiguration => ({
  schemaVersion: must(schemaVersion(1)),
  id: definitionId('rules:ocs-4.3-ground-mvp'),
  rulesVersion: 'OCS 4.3 ground/logistics MVP',
  terrainMovementCosts: [{ terrainDefinitionId: definitionId('terrain:plain'), costTicks: 4 }],
  hexsideMovementCosts: [
    { featureDefinitionId: definitionId('edge:river'), costTicks: 4 },
    { featureDefinitionId: definitionId('edge:bridge'), costTicks: -4 },
    { featureDefinitionId: definitionId('edge:road'), costTicks: 0 },
    { featureDefinitionId: definitionId('edge:rail'), costTicks: 0 },
  ],
  defaultTerrainCostTicks: 4,
  minimumMoveTicks: 4,
  stackingLimitReTicks: 40,
  supplyTraceRange: 6,
  combatSupplyTokenCost: 1,
  combatTable: [
    {
      minimumOdds: 0,
      resultsByTwoDiceTotal: {
        2: 'ATTACKER_STEP_LOSS', 3: 'ATTACKER_STEP_LOSS', 4: 'NO_EFFECT',
        5: 'NO_EFFECT', 6: 'NO_EFFECT', 7: 'DEFENDER_RETREAT',
        8: 'DEFENDER_RETREAT', 9: 'DEFENDER_STEP_LOSS', 10: 'DEFENDER_STEP_LOSS',
        11: 'DEFENDER_STEP_LOSS_AND_RETREAT', 12: 'DEFENDER_STEP_LOSS_AND_RETREAT',
      },
    },
    {
      minimumOdds: 2,
      resultsByTwoDiceTotal: {
        2: 'NO_EFFECT', 3: 'NO_EFFECT', 4: 'DEFENDER_RETREAT', 5: 'DEFENDER_RETREAT',
        6: 'DEFENDER_RETREAT', 7: 'DEFENDER_STEP_LOSS', 8: 'DEFENDER_STEP_LOSS',
        9: 'DEFENDER_STEP_LOSS_AND_RETREAT', 10: 'DEFENDER_STEP_LOSS_AND_RETREAT',
        11: 'DEFENDER_STEP_LOSS_AND_RETREAT', 12: 'DEFENDER_STEP_LOSS_AND_RETREAT',
      },
    },
  ],
  barrageTable: [
    {
      minimumStrength: 0, supplyTokenCost: 1,
      resultsByTwoDiceTotal: {
        2: 'NO_EFFECT', 3: 'NO_EFFECT', 4: 'NO_EFFECT', 5: 'NO_EFFECT',
        6: 'DG', 7: 'DG', 8: 'DG', 9: 'DG', 10: 'STEP_LOSS_AND_DG',
        11: 'STEP_LOSS_AND_DG', 12: 'STEP_LOSS_AND_DG',
      },
    },
    {
      minimumStrength: 4, supplyTokenCost: 1,
      resultsByTwoDiceTotal: {
        2: 'NO_EFFECT', 3: 'NO_EFFECT', 4: 'DG', 5: 'DG', 6: 'DG', 7: 'DG',
        8: 'STEP_LOSS_AND_DG', 9: 'STEP_LOSS_AND_DG', 10: 'STEP_LOSS_AND_DG',
        11: 'STEP_LOSS_AND_DG', 12: 'STEP_LOSS_AND_DG',
      },
    },
  ],
  turnLimit: 2,
  objectives: [{ hexId: formatHexId(hex(4, 4)), points: 5 }],
});

export const createRuleGameStateFixture = (overrides: Partial<GameState> = {}): GameState => {
  const scenario = createFoundationScenarioFixture();
  const firstPlayer = scenario.players[0]!.id;
  const secondPlayer = scenario.players[1]!.id;
  const pieces = scenario.initialPieceState.pieces.map((piece) => {
    if (piece.id === 'piece:ground') {
      return { ...piece, ownerId: secondPlayer, location: { kind: 'ON_MAP' as const, hexId: formatHexId(hex(3, 1)) }, mode: 'COMBAT' as const };
    }
    if (piece.id === 'piece:artillery') {
      return { ...piece, location: { kind: 'ON_MAP' as const, hexId: formatHexId(hex(1, 3)) }, mode: 'COMBAT' as const };
    }
    if (piece.id === 'piece:hq') {
      return { ...piece, location: { kind: 'ON_MAP' as const, hexId: formatHexId(hex(0, 1)) }, mode: 'COMBAT' as const };
    }
    return piece;
  });
  const adjusted = {
    ...scenario,
    initialPieceState: { ...scenario.initialPieceState, pieces },
    turnStart: { ...scenario.turnStart, firstPlayerId: firstPlayer },
  };
  const created = createInitialGameState(adjusted, createRuleConfigurationFixture(), 0x12345678);
  if (!created.ok) throw new Error(`Rule fixture failed: ${created.error.map(({ code }) => code).join(',')}`);
  return { ...created.value, ...overrides, schemaVersion: FOUNDATION_SCHEMA_VERSION };
};

export const setRuleSequenceFixture = (
  state: GameState,
  phase: RulePhase,
  segment: RuleSegment,
  actorId: PlayerId = state.scenario.players[0]!.id,
): GameState => ({
  ...state,
  sequence: {
    ...state.sequence,
    phase,
    segment,
    phasingPlayerId: phase === 'REACTION'
      ? state.scenario.players.find(({ id }) => id !== actorId)!.id
      : actorId,
    actingPlayerId: actorId,
  },
});

export const ruleActionBase = (
  state: GameState,
  actorId: PlayerId,
  scope: string,
): Pick<GameAction, 'actionId' | 'actorId' | 'expectedRevision'> => ({
  actionId: must(parseRuleActionId(`action:${scope}:${state.revision}`)),
  actorId,
  expectedRevision: state.revision,
});
