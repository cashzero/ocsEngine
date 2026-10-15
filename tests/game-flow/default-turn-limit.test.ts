import { describe, expect, it } from 'vitest';
import { DEFAULT_NEW_GAME_REQUEST, defaultTurnLimit } from '../../src/index.js';

describe('defaultTurnLimit', () => {
  const sized = (width: number, height: number) => ({ map: { ...DEFAULT_NEW_GAME_REQUEST.map, width, height } });

  it('is the default request\'s Turn limit and grows with the map, one turn per five hexes of width plus height', () => {
    expect(DEFAULT_NEW_GAME_REQUEST.turnLimit).toBe(defaultTurnLimit(DEFAULT_NEW_GAME_REQUEST));
    expect([defaultTurnLimit(sized(24, 16)), defaultTurnLimit(sized(32, 24)), defaultTurnLimit(sized(48, 36))]).toEqual([8, 11, 17]);
  });

  it('does not depend on the divisions, and stays within 4 to 60', () => {
    const request = { ...DEFAULT_NEW_GAME_REQUEST, oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: 12 } };
    expect(defaultTurnLimit(request)).toBe(defaultTurnLimit(DEFAULT_NEW_GAME_REQUEST));
    expect(defaultTurnLimit(sized(6, 6))).toBe(4);
    expect(defaultTurnLimit(sized(400, 400))).toBe(60);
  });
});
