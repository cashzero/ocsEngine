import { describe, expect, it } from 'vitest';
import { DEFAULT_NEW_GAME_REQUEST, defaultTurnLimit } from '../../src/index.js';

describe('defaultTurnLimit', () => {
  it('matches the default request and grows with map size and divisions', () => {
    expect(DEFAULT_NEW_GAME_REQUEST.turnLimit).toBe(defaultTurnLimit(DEFAULT_NEW_GAME_REQUEST));
    const bigger = { map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: 48, height: 36 }, oob: DEFAULT_NEW_GAME_REQUEST.oob };
    const moreUnits = { map: DEFAULT_NEW_GAME_REQUEST.map, oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: 12 } };
    expect(defaultTurnLimit(bigger)).toBeGreaterThan(defaultTurnLimit(DEFAULT_NEW_GAME_REQUEST));
    expect(defaultTurnLimit(moreUnits)).toBeGreaterThan(defaultTurnLimit(DEFAULT_NEW_GAME_REQUEST));
  });
});
