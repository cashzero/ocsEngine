import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  DEFAULT_NEW_GAME_REQUEST,
  createInitialGameState,
  friendlySupplySources,
  isRailHex,
  prepareNewGame,
  queryRailControl,
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
      // 13.3h: only stations behind the side's own front are detrainable; neutral ground is no source.
      const controller = (hexId: string) => state.mapState.hexControl.find((entry) => entry.hexId === hexId)?.controllerId ?? null;
      expect(sources.filter(({ kind }) => kind === 'DETRAINABLE').every(({ hexId }) => controller(hexId) === playerId)).toBe(true);
    }
  });

  it('reports each rail Hex as own, enemy or neutral, the same split for both players (13.3h)', () => {
    const prepared = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
    if (!prepared.ok) throw new Error('Game must prepare.');
    const created = createInitialGameState(prepared.value.scenario, prepared.value.configuration, 1);
    if (!created.ok) throw new Error('Game must start.');
    const allied = queryRailControl(created.value, ALLIED).value ?? [];
    const axis = new Map((queryRailControl(created.value, AXIS).value ?? []).map(({ hexId, control }) => [hexId, control]));
    expect(allied.length).toBeGreaterThan(0);
    expect(new Set(allied.map(({ control }) => control))).toEqual(new Set(['OWN', 'ENEMY', 'NEUTRAL']));
    const mirror = { OWN: 'ENEMY', ENEMY: 'OWN', NEUTRAL: 'NEUTRAL' } as const;
    for (const { hexId, control } of allied) expect(axis.get(hexId)).toBe(mirror[control]);
  });
});
