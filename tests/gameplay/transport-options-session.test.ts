import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
} from '../../src/index.js';

describe('session transport options (A1)', () => {
  it('answers for the active seat\'s own Transport Point and refuses anything else', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
    if (!created.ok) throw new Error('Default game must be created.');
    const { session, scenario } = created.value;
    const seat = session.getMetadata().activeSeatId;
    const view = session.getView(seat);
    const pieces = view.projection!.stacks.flatMap(({ pieces: stack }) => stack);
    const kindOf = (definitionId: string) => scenario.pieceCatalog.definitions.find(({ id }) => id === definitionId)?.counter?.kind;
    const truck = pieces.find((piece) => piece.ownerId === view.playerId && kindOf(piece.definitionId) === 'TRANSPORT')!;
    const infantry = pieces.find((piece) => piece.ownerId === view.playerId && kindOf(piece.definitionId) === 'COMBAT')!;

    const result = session.getTransportOptions(seat, truck.id);
    expect(result.allowed).toBe(true);
    expect(result.value).toMatchObject({ truckId: truck.id, points: 2, capacityTokens: 8, loadedTokens: 0, unload: null });
    // Nothing is in its Hex at the start, and the answer is a copy: changing it cannot change the session.
    expect(result.value!.loads).toEqual([]);
    (result.value as { loadedTokens: number }).loadedTokens = 99;
    expect(session.getTransportOptions(seat, truck.id).value!.loadedTokens).toBe(0);

    const notATruck = session.getTransportOptions(seat, infantry.id);
    expect(notATruck.allowed).toBe(false);
    expect(notATruck.value).toBeNull();
    expect(notATruck.reasons[0]).toMatchObject({ code: 'INVALID_TRANSPORT_POINT', rule: '13.2' });
  });
});
