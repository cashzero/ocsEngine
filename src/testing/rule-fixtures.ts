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
import type { GameAction, GameState, MobilityMovementCosts, RuleConfiguration, RulePhase, RuleSegment } from '../rules/kernel/index.js';
import { parseRuleActionId } from '../rules/kernel/index.js';
import { createInitialGameState } from '../rules/kernel/index.js';
import { createFoundationScenarioFixture } from './foundation-fixtures.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Rule fixture literal is invalid.');
  return result.value;
};
const definitionId = (value: string): DefinitionId => must(parseDefinitionId(value));

const unit = { numerator: 1, denominator: 1, attackOnly: false } as const;

/** The same exact-tick cost for every mobility type. */
export const uniformCosts = (ticks: number): MobilityMovementCosts => {
  const cost = { kind: 'MP', ticks } as const;
  return { leg: cost, truck: cost, tracked: cost };
};

export const createRuleConfigurationFixture = (): RuleConfiguration => ({
  schemaVersion: must(schemaVersion(1)),
  id: definitionId('rules:ocs-4.3-ground-mvp'),
  rulesVersion: 'OCS 4.3 ground/logistics MVP',
  terrainMovementCosts: [{ terrainDefinitionId: definitionId('terrain:plain'), costs: uniformCosts(4), weather: [] }],
  hexsideMovementCosts: [
    { featureDefinitionId: definitionId('edge:river'), costs: uniformCosts(4), weather: [] },
    { featureDefinitionId: definitionId('edge:bridge'), costs: uniformCosts(-4), weather: [] },
  ],
  roadMovementCosts: [
    { featureDefinitionId: definitionId('edge:road'), costs: uniformCosts(4), weather: [] },
    { featureDefinitionId: definitionId('edge:rail'), costs: uniformCosts(4), weather: [] },
  ],
  defaultTerrainCostTicks: 4,
  minimumMoveTicks: 4,
  stackingLimitReTicks: 40,
  terrainCombatEffects: [{
    terrainDefinitionId: definitionId('terrain:plain'), line: 'OPEN',
    multipliers: { armor: unit, mech: unit, other: unit },
  }],
  hexsideCombatEffects: [],
  supplyDrawRangeTicks: 20,
  weather: null,
  supplyArrivals: null,
  reinforcementBoxes: [],
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
