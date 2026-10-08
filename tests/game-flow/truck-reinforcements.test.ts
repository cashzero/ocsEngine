import { describe, expect, it } from 'vitest';
import { DEFAULT_NEW_GAME_REQUEST, GENERATED_PLAYERS, TRUCKS_AT_START_SHARE, prepareNewGame } from '../../src/index.js';

describe('trucks as reinforcements (OOB 0.5.0)', () => {
  it('starts half of each side\'s trucks on the map; the rest wait in the reinforcement box for Turn 2, 3, …', () => {
    for (const engagement of ['MEETING', 'ALLIED_ATTACKS'] as const) {
      const prepared = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, engagement });
      if (!prepared.ok) throw new Error('The game must be prepared.');
      const { scenario } = prepared.value;
      for (const side of ['ALLIED', 'AXIS'] as const) {
        const trucks = scenario.initialPieceState.pieces.filter((piece) => piece.ownerId === GENERATED_PLAYERS[side] && /independent-transport-/u.test(piece.id));
        const onMap = trucks.filter(({ location }) => location.kind === 'ON_MAP');
        const waiting = trucks.filter(({ location }) => location.kind === 'OFF_MAP_BOX');
        expect(onMap.length).toBe(Math.max(1, Math.ceil(trucks.length * TRUCKS_AT_START_SHARE)));
        expect(onMap.length + waiting.length).toBe(trucks.length);
        const turns = waiting.map((piece) => piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === 'status:return-turn')?.value)
          .map((value) => (value as { value: number }).value).sort();
        expect(turns).toEqual(waiting.map((_, index) => 2 + index));
      }
    }
  });
});
