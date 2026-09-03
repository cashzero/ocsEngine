import { FOUNDATION_SCHEMA_VERSION, parseDefinitionId, type DefinitionId, type Result } from '../core/index.js';
import type { RuleConfiguration } from '../rules/index.js';
import type { GeneratedDeployment } from './model.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Game-flow Definition ID is invalid.');
  return result.value;
};
const id = (value: string): DefinitionId => must(parseDefinitionId(value));

/** Production-owned ground-game configuration; test fixtures are deliberately not imported. */
export const createGeneratedRuleConfiguration = (
  deployment: GeneratedDeployment,
  turnLimit: number,
): RuleConfiguration => ({
  schemaVersion: FOUNDATION_SCHEMA_VERSION,
  id: id('rules:ocs-generated-ground-duel'),
  rulesVersion: 'OCS generated ground duel 0.1.0',
  terrainMovementCosts: [
    ['terrain:clear', 4], ['terrain:woods', 8], ['terrain:rough', 8],
    ['terrain:mountain', 12], ['terrain:marsh', 8], ['terrain:water', 400],
  ].map(([terrainDefinitionId, costTicks]) => ({ terrainDefinitionId: id(String(terrainDefinitionId)), costTicks: Number(costTicks) })),
  hexsideMovementCosts: [
    ['edge:road', 0], ['edge:primary-road', 0], ['edge:river', 4], ['edge:major-river', 8],
  ].map(([featureDefinitionId, costTicks]) => ({ featureDefinitionId: id(String(featureDefinitionId)), costTicks: Number(costTicks) })),
  defaultTerrainCostTicks: 4,
  minimumMoveTicks: 4,
  stackingLimitReTicks: 40,
  supplyTraceRange: 6,
  combatSupplyTokenCost: 1,
  combatTable: [
    {
      minimumOdds: 0,
      resultsByTwoDiceTotal: {
        2: 'ATTACKER_STEP_LOSS', 3: 'ATTACKER_STEP_LOSS', 4: 'NO_EFFECT', 5: 'NO_EFFECT',
        6: 'NO_EFFECT', 7: 'DEFENDER_RETREAT', 8: 'DEFENDER_RETREAT', 9: 'DEFENDER_STEP_LOSS',
        10: 'DEFENDER_STEP_LOSS', 11: 'DEFENDER_STEP_LOSS_AND_RETREAT', 12: 'DEFENDER_STEP_LOSS_AND_RETREAT',
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
        2: 'NO_EFFECT', 3: 'NO_EFFECT', 4: 'NO_EFFECT', 5: 'NO_EFFECT', 6: 'DG', 7: 'DG',
        8: 'DG', 9: 'DG', 10: 'STEP_LOSS_AND_DG', 11: 'STEP_LOSS_AND_DG', 12: 'STEP_LOSS_AND_DG',
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
  turnLimit,
  objectives: deployment.objectiveHexIds.map((hexId) => ({ hexId, points: 5 })),
});
