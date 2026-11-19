import type { RuleFact } from '../rules/index.js';
import {
  BARRAGE_TABLE_ROWS,
  COMBAT_TABLE_COLUMNS,
  COMBAT_TABLE_ROWS,
  FACILITY_TABLE_ROWS,
  FACILITY_TABLE_COLUMNS,
  PORT_DAMAGE_CAPACITY_PERCENT,
  PORT_MAXIMUM_HITS,
  PORT_SOURCE_MINIMUM_TOKENS,
  SURPRISE_THRESHOLDS,
  parseFacilityResult,
  combatTableRowIndex,
  parseBarrageResult,
  parseCombatResult,
  type CombatLine,
} from '../rules/tables/ocs-4.3.js';

/** Probability of each 2d6 total. */
const TWO_DICE: readonly { readonly total: number; readonly p: number }[] = Array.from({ length: 11 }, (_, index) => ({
  total: index + 2, p: (6 - Math.abs(index + 2 - 7)) / 36,
}));

const fact = (facts: readonly RuleFact[], key: string): string | number | boolean | undefined =>
  facts.find((entry) => entry.key === key)?.value;

/** Expected outcome of a declared combat, read from the printed Combat Table (9.9) with Surprise shifts (9.8). */
export interface CombatForecast {
  readonly odds: string;
  readonly columnIndex: number;
  readonly drm: number;
  readonly supplyTokens: number;
  readonly attackerLosses: number;
  readonly attackerOptions: number;
  readonly defenderLosses: number;
  readonly defenderOptions: number;
  /** Chance the defender suffers at least one loss or option point. */
  readonly defenderHit: number;
  readonly defenderDisorganized: number;
  /** Chance the attacker takes a required step loss. */
  readonly attackerHurt: number;
}

export const forecastCombat = (facts: readonly RuleFact[], combatKind: 'REGULAR' | 'OVERRUN' = 'REGULAR'): CombatForecast | null => {
  const line = fact(facts, 'combat.line') as CombatLine | undefined;
  const column = String(fact(facts, 'combat.column') ?? '');
  const odds = String(fact(facts, 'combat.odds') ?? column);
  const arDrm = Number(fact(facts, 'combat.drm') ?? 0);
  const hedgehogLevel = Number(fact(facts, 'combat.hedgehogLevel') ?? 0);
  // 16.0d: the defender's hedgehog subtracts its Level from the combat roll, and 1 from the Surprise roll.
  const drm = arDrm - hedgehogLevel;
  const surpriseDrm = arDrm + (hedgehogLevel > 0 ? -1 : 0);
  if (!line || !COMBAT_TABLE_COLUMNS[line]) return null;
  const columns = COMBAT_TABLE_COLUMNS[line];
  let columnIndex = columns.findIndex(({ attacker, defender }) => `${attacker}:${defender}` === column);
  if (columnIndex < 0) {
    // Beyond the printed columns: the strength ratio decides which end of the table applies.
    const [attacker, defender] = column.split(':').map(Number);
    columnIndex = (attacker ?? 0) >= (defender ?? 1) ? columns.length - 1 : 0;
  }
  // 9.8 Surprise: 2d6 + AR DRM (-1 vs hedgehog); on Surprise one die shifts the column left or right.
  const threshold = SURPRISE_THRESHOLDS[combatKind];
  let pAttackerSurprise = 0;
  let pDefenderSurprise = 0;
  for (const { total, p } of TWO_DICE) {
    if (total + surpriseDrm >= threshold.attacker) pAttackerSurprise += p;
    else if (total + surpriseDrm <= threshold.defender) pDefenderSurprise += p;
  }
  const columnWeights = new Array<number>(columns.length).fill(0);
  columnWeights[columnIndex] = 1 - pAttackerSurprise - pDefenderSurprise;
  for (let die = 1; die <= 6; die += 1) {
    columnWeights[Math.min(columns.length - 1, columnIndex + die)]! += pAttackerSurprise / 6;
    columnWeights[Math.max(0, columnIndex - die)]! += pDefenderSurprise / 6;
  }
  let attackerLosses = 0; let attackerOptions = 0; let defenderLosses = 0; let defenderOptions = 0;
  let defenderHit = 0; let defenderDisorganized = 0; let attackerHurt = 0;
  for (let col = 0; col < columns.length; col += 1) {
    const colWeight = columnWeights[col]!;
    if (colWeight <= 0) continue;
    for (const { total, p } of TWO_DICE) {
      const weight = colWeight * p;
      const result = parseCombatResult(COMBAT_TABLE_ROWS[combatTableRowIndex(total + drm)]![col]!);
      attackerLosses += weight * result.attacker.loss;
      attackerOptions += weight * result.attacker.option;
      defenderLosses += weight * result.defender.loss;
      defenderOptions += weight * result.defender.option;
      if (result.defender.loss + result.defender.option > 0) defenderHit += weight;
      if (result.defenderDisorganized) defenderDisorganized += weight;
      if (result.attacker.loss > 0) attackerHurt += weight;
    }
  }
  return {
    odds, columnIndex, drm, supplyTokens: Number(fact(facts, 'combat.attackerSupplyTokens') ?? 0),
    attackerLosses, attackerOptions, defenderLosses, defenderOptions, defenderHit, defenderDisorganized, attackerHurt,
  };
};

/** Expected effect of a barrage on the printed Barrage Table (10.0a) at its final column. */
export interface BarrageForecast {
  readonly finalColumn: number;
  readonly supplyTokens: number;
  /** Chance of DG or better. */
  readonly disrupt: number;
  readonly expectedSteps: number;
}

export const forecastBarrage = (facts: readonly RuleFact[]): BarrageForecast | null => {
  if (facts.some(({ key, value }) => key === 'barrage.target' && value !== 'COMBAT_UNITS')) return null;
  const finalColumn = fact(facts, 'barrage.finalColumn');
  if (typeof finalColumn !== 'number') return null;
  let disrupt = 0; let expectedSteps = 0;
  for (const { total, p } of TWO_DICE) {
    const row = BARRAGE_TABLE_ROWS[total]!;
    const result = parseBarrageResult(row[Math.max(0, Math.min(row.length - 1, finalColumn))]!);
    if (result.kind !== 'NONE') disrupt += p;
    // A half result costs a step on a 4-6 (10.0a); bracketed only when the hex holds several units.
    expectedSteps += p * (result.kind === 'STEPS' ? result.steps : result.kind === 'HALF' ? 0.5 : result.kind === 'BRACKETED_HALF' ? 0.25 : 0);
  }
  return { finalColumn, supplyTokens: Number(fact(facts, 'barrage.supplyTokens') ?? 0), disrupt, expectedSteps };
};


/** Only printed facilities and aircraft actually visible to the acting player. */
export type PublicFacilityTarget =
  | { readonly kind: 'PORT'; readonly printedTokens: number; readonly hits: number }
  | { readonly kind: 'AIR_BASE'; readonly level: number; readonly strip: boolean; readonly visibleAircraft: number };

export interface FacilityForecast {
  readonly finalColumn: number;
  readonly supplyTokens: number;
  readonly expectedPortCapacityTokensLost: number;
  readonly expectedPortSourceLoss: number;
  readonly expectedBaseLevelsLost: number;
  readonly expectedAircraftSteps: number;
}

/** One equally likely roll for each printed Facility Table row; aircraft checks use their own die. */
export const forecastFacilityBarrage = (facts: readonly RuleFact[], target: PublicFacilityTarget): FacilityForecast | null => {
  if (fact(facts, 'barrage.target') !== target.kind) return null;
  const finalColumn = fact(facts, 'barrage.finalColumn');
  if (typeof finalColumn !== 'number' || !Number.isInteger(finalColumn) || finalColumn < 0 || finalColumn >= FACILITY_TABLE_COLUMNS.length) return null;
  let expectedPortCapacityTokensLost = 0; let expectedPortSourceLoss = 0; let expectedBaseLevelsLost = 0; let expectedAircraftSteps = 0;
  for (let die = 1; die <= 6; die += 1) {
    const result = parseFacilityResult(FACILITY_TABLE_ROWS[die]![finalColumn]!);
    if (target.kind === 'PORT') {
      const capacity = (hits: number) => Math.round(target.printedTokens * PORT_DAMAGE_CAPACITY_PERCENT[Math.min(PORT_MAXIMUM_HITS, hits)]! / 100);
      expectedPortCapacityTokensLost += (capacity(target.hits) - capacity(target.hits + result.levels)) / 6;
      if (capacity(target.hits) >= PORT_SOURCE_MINIMUM_TOKENS && capacity(target.hits + result.levels) < PORT_SOURCE_MINIMUM_TOKENS) expectedPortSourceLoss += 1 / 6;
    } else {
      expectedBaseLevelsLost += (target.strip ? 0 : Math.min(Math.max(0, target.level - 1), result.levels)) / 6;
      expectedAircraftSteps += result.aircraftCheck === null ? 0 : target.visibleAircraft * (7 - result.aircraftCheck) / 36;
    }
  }
  return { finalColumn, supplyTokens: Number(fact(facts, 'barrage.supplyTokens') ?? 0),
    expectedPortCapacityTokensLost, expectedPortSourceLoss, expectedBaseLevelsLost, expectedAircraftSteps };
};
