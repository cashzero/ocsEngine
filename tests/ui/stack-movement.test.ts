import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
  type UiController,
} from '../../src/index.js';

const hexOf = (controller: UiController, pieceId: string): string | null => {
  const piece = controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces).find(({ id }) => id === pieceId);
  return piece?.location.kind === 'ON_MAP' ? piece.location.hexId : null;
};

describe('moving a stack together from the command deck (6.1f)', () => {
  it('ticks stack mates, moves them as one, keeps the stack ticked, and drops off an unticked unit', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
    if (!created.ok) throw new Error('Default game must be created.');
    const { session, scenario, bindings } = created.value;
    const controller = createUiController({ engine, session, scenario, bindings });
    const start = controller.getSnapshot();
    expect(start.view.projection?.sequence.phase).toBe('MOVEMENT');

    // A unit sharing its Hex with others that can move with it, once each is fueled as a player would (12.5a).
    const own = start.view.projection!.stacks.flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.ownerId === start.view.playerId && piece.location.kind === 'ON_MAP' && piece.mode !== null);
    const hexes = [...new Set(own.map((piece) => hexOf(controller, piece.id)!))]
      .filter((hexId) => own.filter((piece) => hexOf(controller, piece.id) === hexId).length >= 2);
    let leader: string | null = null;
    for (const hexId of hexes) {
      const stack = own.filter((piece) => hexOf(controller, piece.id) === hexId);
      for (const piece of stack) {
        controller.selectPiece(piece.id);
        const fuel = controller.getSnapshot().unitActions.find(({ group }) => group === 'FUEL');
        if (fuel) await controller.runAction(fuel.key);
      }
      controller.selectPiece(stack[0]!.id);
      const snapshot = controller.getSnapshot();
      if (snapshot.reachable.size > 0 && snapshot.stackMates.some(({ blocker }) => blocker === null)) { leader = stack[0]!.id; break; }
    }
    expect(leader).not.toBeNull();
    const alone = controller.getSnapshot();
    expect(alone.stackMates.every(({ together }) => !together)).toBe(true);

    controller.moveWholeStack();
    const stacked = controller.getSnapshot();
    const mates = stacked.stackMates.filter(({ blocker }) => blocker === null).map(({ piece }) => piece.id);
    expect(stacked.stackMates.filter(({ together }) => together).map(({ piece }) => piece.id)).toEqual(mates);
    // The stack reaches no farther than the selected unit alone.
    for (const hexId of stacked.reachable.keys()) expect(alone.reachable.has(hexId)).toBe(true);

    const destination = [...stacked.reachable.entries()].find(([hexId]) => !stacked.moveRange.get(hexId)!.endsMovement
      && stacked.moveRange.get(hexId)!.remainingAfterTicks > 0)?.[0];
    expect(destination).toBeDefined();
    await controller.clickHex(destination!);
    const preview = controller.getSnapshot().movePreview!;
    expect(preview.action).toMatchObject({ kind: 'MOVE_PIECE', pieceId: leader, companionIds: mates });
    expect(preview.explanation.allowed).toBe(true);
    await controller.confirmMove();

    const moved = controller.getSnapshot();
    for (const id of [leader!, ...mates]) expect(hexOf(controller, id)).toBe(destination);
    expect(moved.view.projection?.movingStackIds).toEqual([leader, ...mates]);
    expect(moved.selectedIsMoving).toBe(true);
    // A save made mid-move replays the stack move and keeps the stack moving (6.1f).
    const loaded = await engine.loadSession(session.serializeSave());
    const reloaded = createUiController({ engine, session: loaded, scenario, bindings });
    expect(reloaded.getSnapshot().view.projection?.movingStackIds).toEqual([leader, ...mates]);
    reloaded.dispose();
    // The stack now moving stays ticked by default.
    expect(moved.stackMates.filter(({ together }) => together).map(({ piece }) => piece.id)).toEqual(mates);
    expect(moved.droppedOffIds).toEqual([]);

    // Untick one: the next move leaves it behind for good.
    const dropped = mates[0]!;
    controller.toggleStackMate(dropped);
    const dropping = controller.getSnapshot();
    expect(dropping.droppedOffIds).toEqual([dropped]);
    const onward = [...dropping.reachable.keys()][0];
    if (onward !== undefined) {
      await controller.clickHex(onward);
      await controller.confirmMove();
      expect(hexOf(controller, dropped)).toBe(destination);
      expect(hexOf(controller, leader!)).toBe(onward);
      expect(controller.getSnapshot().view.projection?.movingStackIds).not.toContain(dropped);
      controller.selectPiece(dropped);
      expect(controller.getSnapshot().reachable.size).toBe(0);
    }
    controller.dispose();
  });
});
