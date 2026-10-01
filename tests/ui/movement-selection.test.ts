import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';

describe('map-based movement selection on the generated default game', () => {
  it('shows the whole legal range, previews a path, and moves only on confirmation', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
    if (!created.ok) throw new Error('Default game must be created.');
    const { session, scenario, bindings } = created.value;
    const controller = createUiController({ engine, session, scenario, bindings });
    // Reinforcements arrive first and cannot be delayed (13.6).
    for (const arrival of controller.getSnapshot().arrivals) {
      controller.selectPiece(arrival.pieceId);
      await controller.clickHex(arrival.entryHexIds[0]!);
    }
    await controller.endStep();
    const snapshot = controller.getSnapshot();
    expect(snapshot.view.projection?.sequence.phase).toBe('MOVEMENT');
    const mover = snapshot.view.projection!.stacks.flatMap(({ pieces }) => pieces)
      .find((piece) => piece.ownerId === snapshot.view.playerId && piece.mode === 'MOVE' && piece.location.kind === 'ON_MAP')!;

    controller.selectPiece(mover.id);
    // A Truck or Track unit is fueled first (12.5a); a leg unit moves at once.
    const fuel = controller.getSnapshot().unitActions.find(({ group }) => group === 'FUEL');
    if (fuel) await controller.runAction(fuel.key);
    const range = controller.getSnapshot();
    expect(range.reachable.size).toBeGreaterThan(24);
    expect(range.movePreview).toBeNull();

    const destination = [...range.reachable.keys()].at(-1)!;
    await controller.clickHex(destination);
    const chosen = controller.getSnapshot();
    expect(chosen.movePreview).toMatchObject({ destinationHexId: destination, path: range.reachable.get(destination) });
    expect(chosen.view.stateRevision).toBe(range.view.stateRevision);

    await controller.confirmMove();
    const moved = controller.getSnapshot();
    expect(moved.view.stateRevision).toBe(range.view.stateRevision + 1);
    expect(moved.selection).toMatchObject({ pieceId: mover.id, hexId: destination });
    expect(moved.movePreview).toBeNull();
    controller.dispose();
  });
});
