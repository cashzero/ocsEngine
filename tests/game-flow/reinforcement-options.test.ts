import { describe, expect, it } from 'vitest';
import { DEFAULT_NEW_GAME_REQUEST, GENERATED_PLAYERS, latestFirstReinforcementTurn, prepareNewGame, type NewGameRequest } from '../../src/index.js';

const turnsOf = (request: NewGameRequest, side: 'ALLIED' | 'AXIS'): readonly number[] => {
  const prepared = prepareNewGame(request);
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
  const formations = prepared.value.generatedOob.sides.find((entry) => entry.side === side)!.formations;
  const members = new Set(formations.flatMap(({ units }) => units.map(({ id }) => id)));
  const turns = new Map<string, number>();
  for (const piece of prepared.value.scenario.initialPieceState.pieces) {
    if (piece.ownerId !== GENERATED_PLAYERS[side] || !members.has(piece.id) || piece.location.kind !== 'OFF_MAP_BOX') continue;
    turns.set(piece.id, (piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === 'status:return-turn')!.value as { value: number }).value);
  }
  return [...new Set(turns.values())].sort((a, b) => a - b);
};

describe('reinforcement options', () => {
  it('holds back whole divisions, one arriving per Game Turn from the first turn', () => {
    const request = { ...DEFAULT_NEW_GAME_REQUEST, reinforcements: { allied: 50, axis: 0, firstTurn: 4 } };
    expect(turnsOf(request, 'ALLIED')).toEqual([4, 5, 6]);
    expect(turnsOf(request, 'AXIS')).toEqual([]);
  });

  it('rejects a schedule whose last division would have under two Game Turns on the map', () => {
    const late = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, turnLimit: 8, reinforcements: { allied: 75, axis: 0, firstTurn: 5 } });
    expect(!late.ok && late.error.map(({ code }) => code)).toContain('REINFORCEMENTS_TOO_LATE');
    const fits = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, turnLimit: 8, reinforcements: { allied: 75, axis: 0, firstTurn: 3 } });
    expect(fits.ok).toBe(true);
    expect(latestFirstReinforcementTurn(8, 5)).toBe(3);
  });

  it('reports and deploys the same capped division count, including 100% API requests and a single division', async () => {
    const { reinforcementDivisionsOf } = await import('../../src/index.js');
    for (const divisions of [1, 6]) {
      const request: NewGameRequest = { ...DEFAULT_NEW_GAME_REQUEST,
        oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: divisions, armoredDivisionsPerSide: 0 },
        reinforcements: { allied: 100, axis: 0, firstTurn: 3 } };
      expect(reinforcementDivisionsOf(request, 'ALLIED')).toBe(divisions - 1);
      expect(turnsOf(request, 'ALLIED')).toEqual(Array.from({ length: divisions - 1 }, (_, index) => 3 + index));
    }
  });
});

describe('fitReinforcements', () => {
  it('lowers the first arrival turn, then the share, to keep two Game Turns on the map', async () => {
    const { fitReinforcements } = await import('../../src/index.js');
    const fitted = fitReinforcements({ ...DEFAULT_NEW_GAME_REQUEST, turnLimit: 8, reinforcements: { allied: 75, axis: 0, firstTurn: 6 } });
    expect(fitted.reinforcements).toEqual({ allied: 75, axis: 0, firstTurn: 3 });
    const cut = fitReinforcements({ ...DEFAULT_NEW_GAME_REQUEST, oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: 12 }, turnLimit: 4, reinforcements: { allied: 100, axis: 0, firstTurn: 2 } });
    expect(cut.reinforcements?.firstTurn).toBe(2);
    expect(cut.reinforcements!.allied).toBeLessThan(100);
  });

  it('keeps reinforcement settings while related numbers are incomplete or invalid', async () => {
    const { fitReinforcements } = await import('../../src/index.js');
    const request = { ...DEFAULT_NEW_GAME_REQUEST, reinforcements: { allied: 75, axis: 0, firstTurn: 3 } };
    expect(fitReinforcements({ ...request, turnLimit: 0 }).reinforcements).toEqual(request.reinforcements);
    expect(fitReinforcements({ ...request, reinforcements: { ...request.reinforcements, allied: 1e20 } }).reinforcements?.allied).toBe(1e20);
    expect(fitReinforcements({ ...request, turnLimit: 10 }).reinforcements).toEqual(request.reinforcements);
  });

  it('reduces only to offered percentages and retains automatic Turn 2 fitting', async () => {
    const { fitReinforcements } = await import('../../src/index.js');
    const fitted = fitReinforcements({ ...DEFAULT_NEW_GAME_REQUEST,
      oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: 12 },
      turnLimit: 4, reinforcements: { allied: 75, axis: 0, firstTurn: 4 } });
    expect(fitted.reinforcements).toEqual({ allied: 0, axis: 0, firstTurn: 2 });
    const eight = fitReinforcements({ ...DEFAULT_NEW_GAME_REQUEST,
      oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: 8 }, turnLimit: 8,
      reinforcements: { allied: 75, axis: 0, firstTurn: 4 } });
    expect(eight.reinforcements).toEqual({ allied: 75, axis: 0, firstTurn: 2 });
  });
});
