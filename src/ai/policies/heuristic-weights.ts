/**
 * Every number the heuristic policy weighs with, so self-play training (scripts/ai-train.mjs) can tune them.
 * Defaults: heuristic@3 (heuristic@1 as accepted in docs/reports/M9-bot-behavior-baseline.md, plus the replay-study
 * changes of heuristic@2 and @3 in docs/reports/M9-replay-study.md).
 */
export interface HeuristicWeights {
  // Operational plan.
  readonly garrisonThreatened: number;
  /** A held objective with no friendly combat unit on it (replays: empty objectives are what changes hands). */
  readonly garrisonEmpty: number;
  readonly garrisonCalm: number;
  readonly garrisonSecondUnitThreat: number;
  readonly captureBaseUnits: number;
  readonly captureStrengthPerUnit: number;
  readonly huntValue: number;
  readonly huntInfiltrationRadius: number;
  readonly huntAnchorRadius: number;
  readonly huntStrengthPerUnit: number;
  // Combat units moving.
  readonly capture: number;
  /** Share of the capture value when the unit only passes through and nobody stays (it is taken back next turn). */
  readonly passThroughShare: number;
  /** Per VP: the only garrison of a held objective leaving it. */
  readonly abandonObjective: number;
  readonly holdAtEnd: number;
  readonly crowding: number;
  readonly stratNearEnemy: number;
  readonly stratSafeDistance: number;
  readonly progressFront: number;
  readonly progressTarget: number;
  readonly huntAdjacent: number;
  // Main effort (bot-offensive-axis): one defended enemy objective attacked by a group with HQ and SP behind it.
  /** Assault group strength over the defenders' before the effort is launched and while it gathers. */
  readonly assaultRatio: number;
  /** Friendly combat units counted within this many hexes when judging whether an effort is feasible. */
  readonly assaultReach: number;
  readonly assaultMaxUnits: number;
  readonly assaultPosition: number;
  /** Multiplies the objective term of a combat against the main effort's target. */
  readonly assaultObjective: number;
  readonly barrageMainEffort: number;
  readonly garrisonStay: number;
  readonly contactGood: number;
  readonly contactBad: number;
  readonly contactRatio: number;
  readonly exposureSupport: number;
  readonly outOfSupply: number;
  readonly outOfSupplyFed: number;
  readonly fedRadius: number;
  readonly hqDependentSupply: number;
  // Support units moving.
  readonly hqWithArmy: number;
  readonly hqExposed: number;
  readonly hqOutOfSupply: number;
  readonly hqExposure: number;
  readonly artilleryInRange: number;
  readonly artilleryBeyondRange: number;
  readonly artilleryWithArmy: number;
  readonly artilleryExposed: number;
  /** Artillery within this many hexes of the enemy needs a friendly combat unit in its hex (replays: half the units attacked were lone artillery). */
  readonly artilleryEscortDistance: number;
  readonly artilleryUnescorted: number;
  readonly artilleryExposure: number;
  readonly rearExposure: number;
  readonly rearExposed: number;
  readonly truckTowardGoal: number;
  readonly truckExposed: number;
  readonly truckExposure: number;
  // Modes.
  readonly combatModeDistance: number;
  readonly stratModeEnemyDistance: number;
  readonly stratModeTargetDistance: number;
  readonly hqCombatModeRadius: number;
  // Combat.
  readonly attackThreshold: number;
  readonly overrunThresholdFactor: number;
  readonly defenderLoss: number;
  readonly defenderOption: number;
  readonly attackerLoss: number;
  readonly attackerOption: number;
  readonly combatSupply: number;
  readonly objectiveTaken: number;
  readonly vacateOptionShare: number;
  readonly protectObjective: number;
  readonly disorganize: number;
  readonly minimumOdds: number;
  // Barrage.
  readonly barrageThreshold: number;
  readonly barrageDisruptBeforeAttack: number;
  readonly barrageDisrupt: number;
  readonly barrageSteps: number;
  readonly barrageSupply: number;
  readonly barrageNearObjective: number;
}

export const DEFAULT_HEURISTIC_WEIGHTS: HeuristicWeights = Object.freeze({
  garrisonThreatened: 1.3, garrisonEmpty: 1.5, garrisonCalm: 0.8, garrisonSecondUnitThreat: 6, captureBaseUnits: 2, captureStrengthPerUnit: 6,
  huntValue: 3, huntInfiltrationRadius: 3, huntAnchorRadius: 2, huntStrengthPerUnit: 5,
  capture: 40, passThroughShare: 0.25, abandonObjective: 30, holdAtEnd: 15, crowding: 3, stratNearEnemy: 60, stratSafeDistance: 3, progressFront: 6, progressTarget: 10,
  huntAdjacent: 15, assaultRatio: 2.5, assaultReach: 8, assaultMaxUnits: 6, assaultPosition: 20, assaultObjective: 2, barrageMainEffort: 5, garrisonStay: 30, contactGood: 6, contactBad: 8, contactRatio: 1.5, exposureSupport: 1.5,
  outOfSupply: 60, outOfSupplyFed: 10, fedRadius: 3, hqDependentSupply: 8,
  hqWithArmy: 6, hqExposed: 60, hqOutOfSupply: 60, hqExposure: 2,
  artilleryInRange: 20, artilleryBeyondRange: 4, artilleryWithArmy: 6, artilleryExposed: 60, artilleryEscortDistance: 3, artilleryUnescorted: 40, artilleryExposure: 1.5,
  rearExposure: 4, rearExposed: 80, truckTowardGoal: 5, truckExposed: 80, truckExposure: 4,
  combatModeDistance: 3, stratModeEnemyDistance: 10, stratModeTargetDistance: 8, hqCombatModeRadius: 3,
  attackThreshold: 4, overrunThresholdFactor: 2, defenderLoss: 10, defenderOption: 5, attackerLoss: 10, attackerOption: 3,
  combatSupply: 1.5, objectiveTaken: 25, vacateOptionShare: 0.7, protectObjective: 8, disorganize: 4, minimumOdds: 1,
  barrageThreshold: 2, barrageDisruptBeforeAttack: 10, barrageDisrupt: 4, barrageSteps: 10, barrageSupply: 1.2, barrageNearObjective: 2,
});

/** Weights that count hexes or units: mutations keep them whole numbers of at least 1. */
export const WHOLE_NUMBER_WEIGHTS: readonly (keyof HeuristicWeights)[] = [
  'garrisonSecondUnitThreat', 'artilleryEscortDistance', 'assaultReach', 'assaultMaxUnits', 'captureBaseUnits', 'huntInfiltrationRadius', 'huntAnchorRadius', 'stratSafeDistance', 'fedRadius',
  'combatModeDistance', 'stratModeEnemyDistance', 'stratModeTargetDistance', 'hqCombatModeRadius',
];

/** Complete weights from a partial set (unknown keys are rejected so a typo cannot silently fall back to a default). */
export const heuristicWeights = (overrides: Partial<Record<string, number>> = {}): HeuristicWeights => {
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in DEFAULT_HEURISTIC_WEIGHTS)) throw new Error(`Unknown heuristic weight ${key}.`);
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Heuristic weight ${key} must be a finite number.`);
  }
  return Object.freeze({ ...DEFAULT_HEURISTIC_WEIGHTS, ...overrides }) as HeuristicWeights;
};
