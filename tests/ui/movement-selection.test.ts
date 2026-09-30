import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';

describe('map-based movement selection', () => {
  it('shows the whole legal range and selects nothing until a destination is chosen', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
    if (!created.ok) throw new Error('Default game must be created.');
    const { session, scenario, bindings } = created.value;
    const controller = createUiController({ engine, session, scenario, bindings });
    for (let step = 0; step < 10 && controller.getSnapshot().view.projection?.sequence.phase !== 'MOVEMENT'; step += 1) {
      controller.selectActionKind('ADVANCE_SEQUENCE');
      await controller.executeSelected();
    }
    const snapshot = controller.getSnapshot();
    const mover = snapshot.view.projection!.stacks.flatMap(({ pieces }) => pieces)
      .find((piece) => !piece.redacted && piece.ownerId === snapshot.view.playerId && piece.mode === 'MOVE')!;

    controller.selectActionKind('MOVE_PIECE');
    controller.selectPiece(mover.id);
    const range = controller.getSnapshot();
    expect(range.candidates.length).toBeGreaterThan(24);
    expect(range.candidatesTruncated).toBe(false);
    expect(range.selectedAction).toBeNull();

    const last = range.candidates.at(-1)!;
    const destination = last.kind === 'MOVE_PIECE' ? last.path.at(-1)! : '';
    controller.selectDestination(destination);
    const chosen = controller.getSnapshot();
    expect(chosen.selectedAction).toMatchObject({ kind: 'MOVE_PIECE', pieceId: mover.id });
    expect(chosen.explanation?.allowed).toBe(true);

    await controller.executeSelected();
    const moved = controller.getSnapshot();
    expect(moved.notice).toContain('accepted');
    expect(moved.selection).toMatchObject({ pieceId: mover.id, hexId: destination, destinationHexId: null });
    expect(moved.selectedAction).toBeNull();
    controller.dispose();
  });
});
