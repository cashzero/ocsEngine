import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  GENERATED_PLAYERS,
  RAIL_CAP_PER_DIVISION,
  defaultRailCap,
  prepareNewGame,
  validateNewGameRequest,
} from '../../src/index.js';

const railCapOf = (request: Parameters<typeof prepareNewGame>[0]) => {
  const prepared = prepareNewGame(request);
  if (!prepared.ok) throw new Error(prepared.error.map(({ code }) => code).join(', '));
  const points = (side: 'ALLIED' | 'AXIS') => prepared.value.configuration.railCapacity?.find(({ playerId }) => playerId === GENERATED_PLAYERS[side])?.points;
  return { allied: points('ALLIED'), axis: points('AXIS') };
};

describe('New Game Rail Cap (13.3b, docs/roadmap/15-rail-cap-wbs.md)', () => {
  it('gives each side the default points per division unless the request sets them', () => {
    const divisions = DEFAULT_NEW_GAME_REQUEST.oob.divisionsPerSide;
    const even = Math.max(1, Math.round(divisions * RAIL_CAP_PER_DIVISION));
    expect(railCapOf(DEFAULT_NEW_GAME_REQUEST)).toEqual({ allied: even, axis: even });
    // The attacker fields more divisions (ATTACKER_FORCE_RATIO), so its default Rail Cap is larger too.
    const attack = { ...DEFAULT_NEW_GAME_REQUEST, engagement: 'ALLIED_ATTACKS' as const };
    expect(railCapOf(attack)).toEqual(defaultRailCap(attack));
    expect(defaultRailCap(attack).allied).toBeGreaterThan(defaultRailCap(attack).axis);
    expect(railCapOf({ ...DEFAULT_NEW_GAME_REQUEST, railCap: { allied: 7, axis: 0 } })).toEqual({ allied: 7, axis: 0 });
  });

  it('rejects Rail Cap that is not a whole number of points from 0 to the limit', () => {
    const codes = (railCap: { allied: number; axis: number }) => validateNewGameRequest({ ...DEFAULT_NEW_GAME_REQUEST, railCap }).map(({ code, path }) => `${code}:${path.join('.')}`);
    expect(codes({ allied: -1, axis: 2 })).toEqual(['INVALID_RAIL_CAP:railCap.allied']);
    expect(codes({ allied: 2, axis: 1.5 })).toEqual(['INVALID_RAIL_CAP:railCap.axis']);
    expect(codes({ allied: 31, axis: 0 })).toEqual(['INVALID_RAIL_CAP:railCap.allied']);
    expect(codes({ allied: 30, axis: 0 })).toEqual([]);
  });
});
