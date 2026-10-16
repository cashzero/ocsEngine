import { describe, expect, it } from 'vitest';
import {
  BTR_SUPPLY_TABLE, DEFAULT_NEW_GAME_REQUEST, GENERATED_PLAYERS, TRUCK_POINTS_PER_SUPPLY_SP, TRUCKS_AT_START_SHARE,
  expectedSupplyIncome, prepareNewGame,
} from '../../src/index.js';

const prepare = (request: typeof DEFAULT_NEW_GAME_REQUEST) => {
  const prepared = prepareNewGame(request);
  if (!prepared.ok) throw new Error('The game must be prepared.');
  return prepared.value;
};

const trucksOf = (scenario: ReturnType<typeof prepare>['scenario'], side: 'ALLIED' | 'AXIS') => {
  const definitions = new Map(scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
  return scenario.initialPieceState.pieces
    .filter((piece) => piece.ownerId === GENERATED_PLAYERS[side] && definitions.get(piece.definitionId)?.counter?.kind === 'TRANSPORT')
    .map((piece) => ({ piece, points: definitions.get(piece.definitionId)!.counter!.transportPoints! }));
};

describe('trucks follow supply income (OOB 0.5.0)', () => {
  it('starts one truck with half the points on the map; one-point trucks arrive one a turn from Turn 2', () => {
    for (const engagement of ['MEETING', 'ALLIED_ATTACKS'] as const) {
      const { scenario } = prepare({ ...DEFAULT_NEW_GAME_REQUEST, engagement });
      for (const side of ['ALLIED', 'AXIS'] as const) {
        const trucks = trucksOf(scenario, side);
        const total = trucks.reduce((sum, { points }) => sum + points, 0);
        const onMap = trucks.filter(({ piece }) => piece.location.kind === 'ON_MAP');
        const waiting = trucks.filter(({ piece }) => piece.location.kind === 'OFF_MAP_BOX');
        expect(onMap.map(({ points }) => points)).toEqual([Math.ceil(total * TRUCKS_AT_START_SHARE)]);
        expect(waiting.every(({ points }) => points === 1)).toBe(true);
        expect(onMap.length + waiting.length).toBe(trucks.length);
        const turns = waiting.map(({ piece }) => piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === 'status:return-turn')?.value)
          .map((value) => (value as { value: number }).value).sort();
        expect(turns).toEqual(waiting.map((_, index) => 2 + index));
      }
    }
  });

  it('gives each side truck points for half its expected income, so the attacker gets more', () => {
    const { scenario, request, configuration } = prepare({ ...DEFAULT_NEW_GAME_REQUEST, engagement: 'AXIS_ATTACKS' });
    const status = new Map(configuration.supplyArrivals!.players.map(({ playerId, status: column }) => [playerId, column]));
    const points = (side: 'ALLIED' | 'AXIS') => trucksOf(scenario, side).reduce((sum, { points: size }) => sum + size, 0);
    for (const side of ['ALLIED', 'AXIS'] as const) {
      expect(points(side)).toBe(Math.round(expectedSupplyIncome(status.get(GENERATED_PLAYERS[side])!) * TRUCK_POINTS_PER_SUPPLY_SP));
    }
    expect(points('AXIS')).toBeGreaterThan(points('ALLIED'));
    // Far fewer than one five-point truck per three divisions.
    expect(points('AXIS')).toBeLessThan(5 * Math.ceil(request.oob.divisionsPerSide * 1.5 / 3));
  });

  it('expects within 1 SP of the BTR Supply Table average for every Supply Status column', () => {
    const odds = (total: number) => (6 - Math.abs(7 - total)) / 36;
    for (let column = 1; column <= 12; column += 1) {
      let average = 0;
      for (let total = 2; total <= 12; total += 1) {
        const row = BTR_SUPPLY_TABLE.find(({ minimum, maximum }) => total >= minimum && total <= maximum)!;
        average += odds(total) * row.points[column - 1]!;
      }
      expect(Math.abs(expectedSupplyIncome(column) - average), `column ${column}`).toBeLessThanOrEqual(1);
    }
  });
});
