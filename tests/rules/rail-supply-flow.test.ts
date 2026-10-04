import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  DEFAULT_NEW_GAME_REQUEST,
  createInitialGameState,
  friendlySupplySources,
  isRailHex,
  prepareNewGame,
} from '../../src/index.js';

describe('Generated games trace supply along their railways (12.6a, 13.3c, 13.3h)', () => {
  it('starts each side with its map-edge rail entries and the stations it controls as Supply Sources', () => {
    const prepared = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const created = createInitialGameState(prepared.value.scenario, prepared.value.configuration, 1);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state = created.value;
    expect(state.configuration.railroads?.lines).toHaveLength(2);
    for (const playerId of [ALLIED, AXIS]) {
      const sources = friendlySupplySources(state, playerId);
      const edge = sources.filter(({ kind }) => kind === 'MAP_EDGE');
      expect(edge.length).toBeGreaterThan(0);
      expect(edge.every(({ hexId }) => isRailHex(state, hexId))).toBe(true);
      // Rail carries supply forward: stations behind the side's own front are sources from the start.
      expect(sources.filter(({ kind }) => kind === 'DETRAINABLE').length).toBeGreaterThan(0);
    }
    // 13.3h control follows the front line, but the objective starts uncontrolled (no free victory points).
    const objective = state.configuration.objectives[0]!.hexId;
    expect(state.mapState.hexControl.find(({ hexId }) => hexId === objective)).toBeUndefined();
  });
});
