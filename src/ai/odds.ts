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
  parseFacilityResult,
  combatTableRowIndex,
  parseBarrageResult,
  parseCombatResult,
  roundOcs,
  type CombatLine,
  type OddsColumn,
} from '../rules/tables/ocs-4.3.js';

/**
 * The printed column `attack` against `defense` falls in (9.7: divide by the smaller, round, take the highest column not
 * above it), for planning attacks whose units are not yet in place.
 */
export const plannedOddsColumn = (attack: number, defense: number, columns: readonly OddsColumn[]): number => {
  if (attack <= 0) return 0;
  if (defense <= 0) return columns.length - 1;
  const ratio = attack >= defense ? roundOcs(attack / defense) : 1 / roundOcs(defense / attack);
  let index = 0;
  for (const [position, column] of columns.entries()) if (column.attacker / column.defender <= ratio + 1e-9) index = position;
  return index;
};

/** Probability of each 2d6 total. */
const TWO_DICE: readonly { readonly total: number; readonly p: number }[] = Array.from({ length: 11 }, (_, index) => ({
  total: index + 2, p: (6 - Math.abs(index + 2 - 7)) / 36,
}));

const fact = (facts: readonly RuleFact[], key: string): string | number | boolean | undefined =>
  facts.find((entry) => entry.key === key)?.value;

/** Expected outcome of a declared combat, read from the printed Combat Table (9.9); surprise (9.8) is not modelled. */
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

export const forecastCombat = (facts: readonly RuleFact[]): CombatForecast | null => {
  const line = fact(facts, 'combat.line') as CombatLine | undefined;
  const column = String(fact(facts, 'combat.column') ?? '');
  const odds = String(fact(facts, 'combat.odds') ?? column);
  // 16.0d: the defender's hedgehog subtracts its Level from the combat roll.
  const drm = Number(fact(facts, 'combat.drm') ?? 0) - Number(fact(facts, 'combat.hedgehogLevel') ?? 0);
  if (!line || !COMBAT_TABLE_COLUMNS[line]) return null;
  const columns = COMBAT_TABLE_COLUMNS[line];
  let columnIndex = columns.findIndex(({ attacker, defender }) => `${attacker}:${defender}` === column);
  if (columnIndex < 0) {
    // Beyond the printed columns: the strength ratio decides which end of the table applies.
    const [attacker, defender] = column.split(':').map(Number);
    columnIndex = (attacker ?? 0) >= (defender ?? 1) ? columns.length - 1 : 0;
  }
  return { odds, supplyTokens: Number(fact(facts, 'combat.attackerSupplyTokens') ?? 0), ...forecastColumn(columnIndex, drm) };
};

/** Expected results of the printed Combat Table at a column index and roll modifier, whatever brings the attack there. */
export const forecastColumn = (columnIndex: number, drm: number): Omit<CombatForecast, 'odds' | 'supplyTokens'> => {
  let attackerLosses = 0; let attackerOptions = 0; let defenderLosses = 0; let defenderOptions = 0;
  let defenderHit = 0; let defenderDisorganized = 0; let attackerHurt = 0;
  for (const { total, p } of TWO_DICE) {
    const result = parseCombatResult(COMBAT_TABLE_ROWS[combatTableRowIndex(total + drm)]![columnIndex]!);
    attackerLosses += p * result.attacker.loss;
    attackerOptions += p * result.attacker.option;
    defenderLosses += p * result.defender.loss;
    defenderOptions += p * result.defender.option;
    if (result.defender.loss + result.defender.option > 0) defenderHit += p;
    if (result.defenderDisorganized) defenderDisorganized += p;
    if (result.attacker.loss > 0) attackerHurt += p;
  }
  return { columnIndex, drm, attackerLosses, attackerOptions, defenderLosses, defenderOptions, defenderHit, defenderDisorganized, attackerHurt };
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
