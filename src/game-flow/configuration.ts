import { FOUNDATION_SCHEMA_VERSION, parseDefinitionId, type DefinitionId, type Result } from '../core/index.js';
import type { RuleConfiguration } from '../rules/index.js';
import type { GeneratedDeployment } from './model.js';
import {
  GENERATED_HEXSIDE_MOVEMENT_COSTS,
  GENERATED_ROAD_MOVEMENT_COSTS,
  GENERATED_TERRAIN_MOVEMENT_COSTS,
} from './movement-tec.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Game-flow Definition ID is invalid.');
  return result.value;
};
const id = (value: string): DefinitionId => must(parseDefinitionId(value));

/** OCS 4.8 ten-RE stacking limit in quarter-RE ticks. */
export const GENERATED_STACKING_LIMIT_RE_TICKS = 40;

/** Production-owned ground-game configuration; test fixtures are deliberately not imported. */
export const createGeneratedRuleConfiguration = (
  deployment: GeneratedDeployment,
  turnLimit: number,
): RuleConfiguration => ({
  schemaVersion: FOUNDATION_SCHEMA_VERSION,
  id: id('rules:ocs-generated-ground-duel'),
  rulesVersion: 'OCS generated ground duel 0.1.0',
  terrainMovementCosts: GENERATED_TERRAIN_MOVEMENT_COSTS,
  hexsideMovementCosts: GENERATED_HEXSIDE_MOVEMENT_COSTS,
  roadMovementCosts: GENERATED_ROAD_MOVEMENT_COSTS,
  defaultTerrainCostTicks: 4,
  minimumMoveTicks: 4,
  stackingLimitReTicks: GENERATED_STACKING_LIMIT_RE_TICKS,
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
