import type {
  GroundCondition,
  SupplyTableRow,
  WeatherConfiguration,
  WeatherTableRow,
} from '../rules/index.js';

/**
 * Weather and Supply Tables for generated games, transcribed from the Beyond the Rhine VASSAL
 * module 1.27.0 that the user supplied:
 * - `images/BTR Weather Table.jpg` (Ground Conditions column, one die).
 * - `images/BTR Axis Supply.jpg` (German Supply Table, two dice by Supply Status column).
 * See docs/rules/ocs-4.3-charts.md for hashes and notes. Flight Conditions are not rolled because
 * generated games have no air units.
 */

/** BTR Game Turns fall on these days of every month (the table's date ranges follow them). */
export const BTR_TURN_DAYS: readonly number[] = [1, 5, 8, 12, 15, 19, 22, 26, 29];

const range = (condition: GroundCondition, minimum: number, maximum: number) => ({ condition, minimum, maximum });
const AUTO = (condition: GroundCondition) => [range(condition, 1, 6)];
const row = (month: number, firstDay: number, lastDay: number, ground: WeatherTableRow['ground']): WeatherTableRow =>
  ({ month, firstDay, lastDay, ground });

/** Rows cover every day from 1 September to 30 April; each printed range is widened to the next row. */
export const BTR_WEATHER_TABLE: readonly WeatherTableRow[] = [
  row(9, 1, 30, AUTO('DRY')), // September: Dry Auto
  row(10, 1, 12, AUTO('DRY')), // October 1-12: Dry Auto
  row(10, 13, 31, [range('DRY', 1, 4), range('MUD', 5, 6)]), // October 15-29
  row(11, 1, 15, [range('DRY', 1, 2), range('MUD', 3, 6)]), // November 1-15
  row(11, 16, 30, [range('DRY', 1, 2), range('MUD', 3, 6)]), // November 19-29
  row(12, 1, 19, [range('DRY', 1, 3), range('MUD', 4, 4), range('SNOW', 5, 6)]), // December 1-19
  row(12, 20, 31, [range('DRY', 1, 2), range('SNOW', 3, 6)]), // December 22-29
  row(1, 1, 19, AUTO('SNOW')), // January 1-19: Snow Auto
  row(1, 20, 31, [range('DRY', 1, 1), range('SNOW', 2, 6)]), // January 22-29
  row(2, 1, 15, [range('DRY', 1, 2), range('MUD', 3, 3), range('SNOW', 4, 6)]), // February 1-15
  row(2, 16, 28, [range('DRY', 1, 2), range('MUD', 3, 4), range('SNOW', 5, 6)]), // February 19-26
  row(3, 1, 8, [range('DRY', 1, 3), range('MUD', 4, 5), range('SNOW', 6, 6)]), // March 1-8
  row(3, 9, 19, [range('DRY', 1, 2), range('MUD', 3, 6)]), // March 12-19
  row(3, 20, 31, [range('DRY', 1, 3), range('MUD', 4, 6)]), // March 22-29
  row(4, 1, 30, [range('DRY', 1, 3), range('MUD', 4, 6)]), // April
];

/** Months the table covers, in campaign order. */
export const BTR_CAMPAIGN_MONTHS: readonly number[] = [9, 10, 11, 12, 1, 2, 3, 4];

const DAYS_IN_MONTH: Readonly<Record<number, number>> = { 1: 31, 2: 28, 3: 31, 4: 30, 9: 30, 10: 31, 11: 30, 12: 31 };

/** Calendar date of Game Turn `turn` (1-based) starting on day 1 of `startMonth`, or null past April. */
export const btrTurnDate = (startMonth: number, turn: number): { readonly month: number; readonly day: number } | null => {
  let remaining = turn;
  for (const month of BTR_CAMPAIGN_MONTHS.slice(Math.max(0, BTR_CAMPAIGN_MONTHS.indexOf(startMonth)))) {
    const days = BTR_TURN_DAYS.filter((day) => day <= DAYS_IN_MONTH[month]!);
    if (remaining <= days.length) return { month, day: days[remaining - 1]! };
    remaining -= days.length;
  }
  return null;
};

export const createGeneratedWeather = (startMonth: number): WeatherConfiguration => ({
  startMonth, startDay: 1, turnDays: BTR_TURN_DAYS, table: BTR_WEATHER_TABLE,
});

/**
 * BTR German Supply Table (two dice). Generated games give each side the Supply Status column
 * equal to its number of formations, so the SP income scales with the size of the force.
 */
export const BTR_SUPPLY_TABLE: readonly SupplyTableRow[] = [
  { minimum: 2, maximum: 3, points: [1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10] },
  { minimum: 4, maximum: 5, points: [2, 2, 3, 4, 5, 5, 6, 7, 8, 9, 10, 11] },
  { minimum: 6, maximum: 8, points: [2, 3, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12] },
  { minimum: 9, maximum: 10, points: [2, 3, 4, 6, 7, 7, 8, 9, 10, 11, 12, 13] },
  { minimum: 11, maximum: 12, points: [3, 4, 5, 7, 7, 8, 9, 9, 10, 11, 12, 13] },
];
