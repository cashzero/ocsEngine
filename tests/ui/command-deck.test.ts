import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';
import {
  activeDeckTab, commandDeckHtml, deckTabs, movePopupHtml, phaseControlsHtml, selectDeckTab, syncDeckTab, type DeckState,
} from '../../src/ui/command-deck.js';

const startGame = async () => {
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
  if (!created.ok) throw new Error('Default game must be created.');
  const { session, scenario, bindings } = created.value;
  return createUiController({ engine, session, scenario, bindings });
};
const newDeck = (): DeckState => ({ search: '', working: false });

describe('phase-specific command deck', () => {
  it('opens each phase on its required tab and keeps a picked tab only within that phase', async () => {
    const controller = await startGame();
    const deck = newDeck();

    // Reinforcement: arrivals first, with the number still to place.
    let snapshot = controller.getSnapshot();
    expect(deckTabs(snapshot).map(({ id }) => id)).toEqual(['arrivals', 'unit', 'log']);
    expect(deckTabs(snapshot)[0]!.badge).toBe(snapshot.arrivals.length);
    syncDeckTab(snapshot, deck);
    expect(activeDeckTab(snapshot, deck)).toBe('arrivals');

    // Picking an arrival from its own list must not leave that list.
    controller.selectPiece(snapshot.arrivals[0]!.pieceId);
    snapshot = controller.getSnapshot();
    syncDeckTab(snapshot, deck);
    expect(activeDeckTab(snapshot, deck)).toBe('arrivals');

    for (const arrival of controller.getSnapshot().arrivals) {
      controller.selectPiece(arrival.pieceId);
      await controller.clickHex(arrival.entryHexIds[0]!);
    }
    await controller.endStep();
    snapshot = controller.getSnapshot();
    expect(snapshot.view.projection?.sequence.phase).toBe('MOVEMENT');
    syncDeckTab(snapshot, deck);
    expect(deckTabs(snapshot).map(({ id }) => id)).toEqual(['unit', 'log']);
    expect(activeDeckTab(snapshot, deck)).toBe('unit');

    // A pick sticks within the phase ...
    selectDeckTab(snapshot, deck, 'log');
    syncDeckTab(snapshot, deck);
    expect(activeDeckTab(snapshot, deck)).toBe('log');
    // ... until a unit is chosen, which opens the Unit tab.
    const mover = snapshot.view.projection!.stacks.flatMap(({ pieces }) => pieces)
      .find((piece) => piece.ownerId === snapshot.view.playerId && piece.location.kind === 'ON_MAP')!;
    controller.selectPiece(mover.id);
    snapshot = controller.getSnapshot();
    syncDeckTab(snapshot, deck);
    expect(activeDeckTab(snapshot, deck)).toBe('unit');

    // The next phase forgets a pick made in the previous one.
    selectDeckTab(snapshot, deck, 'log');
    await controller.endStep();
    snapshot = controller.getSnapshot();
    syncDeckTab(snapshot, deck);
    expect(snapshot.view.projection?.sequence.phase).not.toBe('MOVEMENT');
    expect(activeDeckTab(snapshot, deck)).toBe(deckTabs(snapshot)[0]!.id);
    controller.dispose();
  });

  it('moves End phase out of the deck and shows why it cannot end yet', async () => {
    const controller = await startGame();
    const snapshot = controller.getSnapshot();
    const deck = newDeck();
    expect(commandDeckHtml(snapshot, deck)).not.toContain('id="end-phase"');
    const controls = phaseControlsHtml(snapshot, deck);
    expect(controls).toContain('id="end-phase"');
    expect(controls).toContain('disabled');
    expect(controls).toContain('class="end-note"');
    controller.dispose();
  });

  it('confirms a previewed move in a popup anchored to the destination, not in the deck', async () => {
    const controller = await startGame();
    for (const arrival of controller.getSnapshot().arrivals) {
      controller.selectPiece(arrival.pieceId);
      await controller.clickHex(arrival.entryHexIds[0]!);
    }
    await controller.endStep();
    const before = controller.getSnapshot();
    expect(movePopupHtml(before)).toBe('');
    const mover = before.view.projection!.stacks.flatMap(({ pieces }) => pieces)
      .find((piece) => piece.ownerId === before.view.playerId && piece.mode === 'MOVE' && piece.location.kind === 'ON_MAP')!;
    controller.selectPiece(mover.id);
    const fuel = controller.getSnapshot().unitActions.find(({ group }) => group === 'FUEL');
    if (fuel) await controller.runAction(fuel.key);
    const destination = [...controller.getSnapshot().reachable.keys()].at(-1)!;
    await controller.clickHex(destination);

    const snapshot = controller.getSnapshot();
    const popup = movePopupHtml(snapshot);
    expect(popup).toContain(`data-anchor-hex="${destination}"`);
    expect(popup).toContain('id="confirm-move"');
    expect(popup).toContain('id="cancel-move"');
    expect(commandDeckHtml(snapshot, newDeck())).not.toContain('id="confirm-move"');

    // When the engine refuses the move, the popup says why in one line and disables Confirm; the rest waits in the Unit tab.
    const refused = {
      ...snapshot,
      movePreview: {
        ...snapshot.movePreview!,
        explanation: {
          ...snapshot.movePreview!.explanation,
          allowed: false,
          reasons: [
            { code: 'OVERSTACK', allowed: false, message: 'Stack would exceed 10 RE.', rule: '4.8a' },
            { code: 'SECOND', allowed: false, message: 'Second reason.', rule: '6.1' },
            { code: 'THIRD', allowed: false, message: 'Third reason.', rule: '6.2' },
          ],
        },
      },
    } as typeof snapshot;
    // A hex that ends the move (ZOC for trucks, all-MP terrain, minimum move) is said so in the popup.
    const range = snapshot.moveRange.get(destination)!;
    const stopping = { ...snapshot, moveRange: new Map([...snapshot.moveRange, [destination, { ...range, endsMovement: true }]]) } as typeof snapshot;
    expect(movePopupHtml(snapshot)).not.toContain('The move ends there');
    expect(movePopupHtml(stopping)).toContain('The move ends there');
    const blocked = movePopupHtml(refused);
    expect(blocked).toContain('Stack would exceed 10 RE.');
    expect(blocked).not.toContain('Second reason.');
    expect(blocked).toContain('2 more reasons in the Unit tab');
    expect(blocked).toMatch(/id="confirm-move"\s+disabled/u);
    expect(commandDeckHtml(refused, newDeck())).toContain('Second reason.');
    controller.dispose();
  });
});
