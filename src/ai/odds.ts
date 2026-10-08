import type { RuleFact } from '../rules/index.js';
import {
  BARRAGE_TABLE_ROWS,
  COMBAT_TABLE_COLUMNS,
  COMBAT_TABLE_ROWS,
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
