import type { FlightCondition, GameState, GroundCondition, RuleEvent, WeatherConfiguration } from '../kernel/model.js';
import { rollDie, rollTwoDice } from '../kernel/rng.js';

/** Non-leap calendar: game-specific Weather Tables are dated by month and day. */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Calendar date of Game Turn `turn` (1-based): turns fall on the configured days of each month,
 * starting from the start date.
 */
export const turnDate = (weather: WeatherConfiguration, turn: number): { readonly month: number; readonly day: number } => {
  let month = weather.startMonth;
  let remaining = turn;
  let first = true;
  for (let guard = 0; guard < 1200; guard += 1) {
    const days = weather.turnDays.filter((day) => day <= DAYS_IN_MONTH[month - 1]! && (!first || day >= weather.startDay));
    if (remaining <= days.length) return { month, day: days[remaining - 1]! };
    remaining -= days.length;
    first = false;
    month = month === 12 ? 1 : month + 1;
  }
  throw new Error('Weather calendar did not reach the Game Turn.');
};

/** 17.0: roll one die on the dated Weather Table row for the Game Turn's ground condition. */
export const determineWeather = (state: GameState, events: RuleEvent[]): GameState => {
  const weather = state.configuration.weather;
  if (weather === null) {
    events.push({ kind: 'WEATHER_DETERMINED', sequence: events.length, groundCondition: 'DRY', roll: null, flight: 'NORMAL', flightRoll: null });
    return { ...state, weather: { groundCondition: 'DRY', flight: 'NORMAL', flightRoll: null, month: null, day: null, roll: null } };
  }
  const date = turnDate(weather, state.sequence.gameTurn);
  const row = weather.table.find(({ month, firstDay, lastDay }) => month === date.month && date.day >= firstDay && date.day <= lastDay);
  if (!row) throw new Error(`The Weather Table has no row for ${date.month}/${date.day}.`);
  // "Auto" rows need no roll.
  const auto = row.ground.length === 1;
  const die = auto ? null : rollDie(state.rng);
  const roll = die?.value ?? null;
  const groundCondition: GroundCondition = auto ? row.ground[0]!.condition
    : row.ground.find(({ minimum, maximum }) => roll! >= minimum && roll! <= maximum)!.condition;
  // 14.1f: the game-specific table's Flight Conditions follow the ground roll, two dice; a row without them is Normal.
  const flightRolled = row.flight ? rollTwoDice(die?.rng ?? state.rng) : null;
  const flightRoll = flightRolled?.roll.total ?? null;
  const flight: FlightCondition = row.flight && flightRoll !== null
    ? row.flight.find(({ minimum, maximum }) => flightRoll >= minimum && flightRoll <= maximum)!.condition : 'NORMAL';
  events.push({ kind: 'WEATHER_DETERMINED', sequence: events.length, groundCondition, roll, flight, flightRoll });
  return { ...state, rng: flightRolled?.rng ?? die?.rng ?? state.rng, weather: { groundCondition, flight, flightRoll, month: date.month, day: date.day, roll } };
};
