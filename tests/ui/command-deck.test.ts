// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';
import { describeRecord } from '../../src/ui/narrative.js';
import { unitLabel } from '../../src/ui/presenter.js';
import {
  activeDeckTab, deckTabs, selectDeckTab, syncDeckTab, type DeckState,
} from '../../src/ui/command-deck.js';
import { commandDeckHtml, movePopupHtml, phaseControlsHtml } from './render-view.js';
import { playUntil } from './play-turn.js';

const startGame = async () => {
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
  if (!created.ok) throw new Error('Default game must be created.');
  const { session, scenario, bindings } = created.value;
  return createUiController({ engine, session, scenario, bindings });
};
/** Nothing arrives on Game Turn 1 (13.6), so the Reinforcement Phase is tested on Game Turn 2. */
const startReinforcement = async () => {
  const controller = await startGame();
  await playUntil(controller, 2, 'REINFORCEMENT');
  return controller;
};
const newDeck = (): DeckState => ({ search: '', working: false });

describe('phase-specific command deck', () => {
  it('opens each phase on its required tab and keeps a picked tab only within that phase', async () => {
    const controller = await startReinforcement();
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
    const controller = await startReinforcement();
    const snapshot = controller.getSnapshot();
    const deck = newDeck();
    expect(commandDeckHtml(snapshot, deck)).not.toContain('id="end-phase"');
    const controls = phaseControlsHtml(snapshot, deck);
    expect(controls).toContain('id="end-phase"');
    expect(controls).toContain('disabled');
    expect(controls).toContain('class="end-note"');
    controller.dispose();
  });

  it('names the step End phase finishes without repeating the phase, and keeps Undo in place when nothing can be undone', async () => {
    const controller = await startReinforcement();
    const deck = newDeck();
    let controls = phaseControlsHtml(controller.getSnapshot(), deck);
    expect(controls).toContain('End Reinforcement Phase');
    expect(controls).toContain('Next: Movement Phase');
    expect(controls).toMatch(/id="undo-step"[^>]*disabled/u);
    for (const arrival of controller.getSnapshot().arrivals) {
      controller.selectPiece(arrival.pieceId);
      await controller.clickHex(arrival.entryHexIds[0]!);
    }
    await controller.endStep();
    controls = phaseControlsHtml(controller.getSnapshot(), deck);
    expect(controls).toContain('End Movement Segment');
    expect(controls).toContain('Next: Barrage Segment');
    expect(controls).not.toContain('Movement · Movement');
    controller.dispose();
  });

  it('plays straight on after a checkpoint restore or a save made while paused: there is no Pause control to resume from', async () => {
    const controller = await startGame();
    controller.createCheckpoint();
    const checkpoint = controller.getSnapshot().checkpoints.at(-1)!;
    await controller.undoTo(checkpoint.id);
    expect(controller.getSnapshot().view.metadata.lifecycle).toBe('ACTIVE');

    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
    if (!created.ok) throw new Error('Default game must be created.');
    expect(created.value.session.pause()).toMatchObject({ ok: true, lifecycle: 'PAUSED' });
    await controller.loadSave(created.value.session.serializeSave());
    expect(controller.getSnapshot().view.metadata.lifecycle).toBe('ACTIVE');
    controller.dispose();
    // Builds the default operation twice (two full games).
  }, 20_000);

  it('confirms a previewed move in a popup anchored to the destination, not in the deck', async () => {
    const controller = await startGame();
    // Nothing arrives on Game Turn 1 (13.6): play opens in the Movement Phase.
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

  it('offers Deselect for an idle pick but only Done for a unit part-way through its move (6.1g)', async () => {
    const controller = await startGame();
    const deck = newDeck();
    // Nothing arrives on Game Turn 1 (13.6): play opens in the Movement Phase.
    const own = () => controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.ownerId === controller.getSnapshot().view.playerId && piece.location.kind === 'ON_MAP');
    let mover: string | undefined;
    let destination: string | undefined;
    for (const piece of own()) {
      controller.selectPiece(piece.id);
      destination = [...controller.getSnapshot().moveRange].find(([, entry]) => entry.remainingAfterTicks > 0 && !entry.endsMovement)?.[0];
      if (destination) { mover = piece.id; break; }
    }
    expect(mover, 'some unit can move and still have MP left').toBeDefined();

    // Not yet moving: a plain Deselect.
    let html = commandDeckHtml(controller.getSnapshot(), deck);
    expect(controller.getSnapshot().selectedIsMoving).toBe(false);
    expect(html).toMatch(/id="deselect"[^>]*>Deselect</u);
    expect(html).not.toContain('id="finish-move"');
    controller.clearSelection();
    expect(controller.getSnapshot().selectedPiece).toBeNull();

    // Part-way through the move: only Done, which states the MP given up.
    controller.selectPiece(mover!);
    await controller.clickHex(destination!);
    await controller.confirmMove();
    let snapshot = controller.getSnapshot();
    expect(snapshot.selection.pieceId).toBe(mover);
    expect(snapshot.selectedIsMoving).toBe(true);
    html = commandDeckHtml(snapshot, deck);
    expect(html).toMatch(/id="finish-move"[^>]*>Done</u);
    expect(html).toMatch(/MP left cannot be used again this phase/u);
    expect(html).not.toContain('id="deselect"');

    // Done ends the move in the game, not just in the UI, and lets go of the unit.
    await controller.finishMove();
    snapshot = controller.getSnapshot();
    expect(snapshot.selectedPiece).toBeNull();
    expect(snapshot.view.projection?.currentMoverId).toBeNull();
    expect(snapshot.history.at(-1)?.action.kind).toBe('END_MOVE');
    controller.selectPiece(mover!);
    snapshot = controller.getSnapshot();
    expect(snapshot.selectedIsMoving).toBe(false);
    expect(snapshot.reachable.size).toBe(0);
    expect(commandDeckHtml(snapshot, deck)).toMatch(/id="deselect"[^>]*>Deselect</u);

    // Done can be taken back like the move itself.
    expect(snapshot.undoStep?.scope).toBe('ACTION');
    await controller.undoStep();
    controller.selectPiece(mover!);
    expect(controller.getSnapshot().selectedIsMoving).toBe(true);
    expect(controller.getSnapshot().reachable.size).toBeGreaterThan(0);
  });

  it('detaches numbered Breakdowns ("1/101.Abn") from a division and lets Undo take one back (20.0)', async () => {
    const controller = await startGame();
    const deck = newDeck();
    // Nothing arrives on Game Turn 1 (13.6): play opens in the Movement Phase.
    const own = () => controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.ownerId === controller.getSnapshot().view.playerId && piece.location.kind === 'ON_MAP');
    const division = own().find((piece) => { controller.selectPiece(piece.id); return controller.getSnapshot().unitActions.some(({ group }) => group === 'BREAKDOWN'); });
    expect(division, 'the default game has a division that can detach Breakdowns').toBeDefined();
    controller.selectPiece(division!.id);
    let snapshot = controller.getSnapshot();
    const html = commandDeckHtml(snapshot, deck);
    expect(html).toContain('<strong>Breakdowns</strong>');
    const offers = snapshot.unitActions.filter(({ group }) => group === 'BREAKDOWN');
    expect(offers.map(({ label }) => label)).toEqual(['Detach a Breakdown (5-4-3, 1 RE; the division loses a step)']);
    const before = own().length;
    const steps = division!.remainingSteps!;
    const divisionName = unitLabel(snapshot.scenario, division!);
    const breakdownNames = () => own().flatMap((piece) => piece.statusValues.some(({ statusDefinitionId }) => statusDefinitionId === 'status:unit-name')
      ? [unitLabel(controller.getSnapshot().scenario, piece)] : []).sort();

    await controller.runAction(offers[0]!.key);
    snapshot = controller.getSnapshot();
    expect(own()).toHaveLength(before + 1);
    expect(own().find(({ id }) => id === division!.id)?.remainingSteps).toBe(steps - 1);
    expect(breakdownNames()).toEqual([`1/${divisionName}`]);
    expect(snapshot.feed.at(-1)?.title).toBe(`${divisionName} detached 1/${divisionName}`);
    // 20.0d: left with its reduced division, it will be absorbed when the phase ends; End phase says so beforehand.
    expect(phaseControlsHtml(snapshot, deck)).toContain(`When this phase ends: 1/${divisionName} rejoins ${divisionName}`);
    // 4.9a: the opponent's log does not reveal which division lost a step.
    const enemyView = describeRecord(snapshot.history.at(-1)!, { viewerId: 'player:axis' as never, playerName: () => 'Axis commander', piece: () => null });
    expect(enemyView.title).toBe('An enemy unit reorganized');
    expect(enemyView.lines.join(' ')).not.toContain(divisionName);
    // The next one is number 2.
    controller.selectPiece(division!.id);
    await controller.runAction(controller.getSnapshot().unitActions.find(({ group }) => group === 'BREAKDOWN')!.key);
    expect(breakdownNames()).toEqual([`1/${divisionName}`, `2/${divisionName}`]);

    expect(controller.getSnapshot().undoStep?.scope).toBe('ACTION');
    await controller.undoStep();
    expect(breakdownNames()).toEqual([`1/${divisionName}`]);
    expect(controller.getSnapshot().undoStep?.scope).toBe('ACTION');
    await controller.undoStep();
    expect(own()).toHaveLength(before);
    expect(own().find(({ id }) => id === division!.id)?.remainingSteps).toBe(steps);
  });

  it('warns in the move popup that moving another unit ends a loaded truck\'s move (6.1g)', async () => {
    const controller = await startGame();
    // Nothing arrives on Game Turn 1 (13.6): play opens in the Movement Phase.
    const own = () => controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.ownerId === controller.getSnapshot().view.playerId && piece.location.kind === 'ON_MAP');
    const kindOf = (id: string) => {
      const piece = own().find((entry) => entry.id === id)!;
      return controller.getSnapshot().scenario.pieceCatalog.definitions.find(({ id: definitionId }) => definitionId === piece.definitionId)?.counter?.kind;
    };
    const hexOf = (piece: { readonly location: unknown }): string | null => {
      const location = piece.location as { kind: string; hexId?: string };
      return location.kind === 'ON_MAP' ? location.hexId ?? null : null;
    };
    const truck = own().find((piece) => kindOf(piece.id) === 'TRANSPORT')!;
    const dump = own().find((piece) => kindOf(piece.id) === 'SUPPLY' && hexOf(piece) !== hexOf(truck) && (piece.resourceQuantity ?? 0) > 0)!;
    controller.selectPiece(truck.id);
    await controller.clickHex(hexOf(dump)!);
    await controller.confirmMove();
    const load = controller.getSnapshot().unitActions.find(({ group, label }) => group === 'TRANSPORT' && label.startsWith('Load'));
    expect(load, 'the truck can load at the dump').toBeDefined();
    await controller.runAction(load!.key);

    // A unit that needs no fuel (it marches on its current face): moving it is allowed, but the popup says what it costs the truck.
    const leg = own().find((piece) => piece.mode === 'MOVE' && piece.id !== truck.id && kindOf(piece.id) === 'COMBAT' && controller.getSnapshot().scenario.pieceCatalog.definitions
      .find(({ id }) => id === piece.definitionId)?.faces.some(({ id, mobilityClassDefinitionId }) => id === piece.currentFaceId
        && String(mobilityClassDefinitionId) === 'mobility:leg'))!;
    controller.selectPiece(leg.id);
    const destination = [...controller.getSnapshot().reachable.keys()][0]!;
    await controller.clickHex(destination);
    const warned = movePopupHtml(controller.getSnapshot());
    expect(warned).toContain('class="warning"');
    expect(warned).toContain('the move of Truck');
    expect(warned).not.toContain('Truck Co');
    expect(warned).toContain('4T');
    expect(warned).toContain('6.1g');
    expect(warned).toMatch(/id="confirm-move"[^>]*>Confirm anyway</u);
    expect(warned).not.toMatch(/id="confirm-move"\s+disabled/u);

    // Without a truck in progress the popup is the plain one.
    const plain = { ...controller.getSnapshot(), movePreview: { ...controller.getSnapshot().movePreview!, explanation: { ...controller.getSnapshot().movePreview!.explanation, facts: controller.getSnapshot().movePreview!.explanation.facts.filter(({ key }) => !key.startsWith('movement.endsOtherMover')) } } };
    expect(movePopupHtml(plain)).not.toContain('class="warning"');
    expect(movePopupHtml(plain)).toMatch(/id="confirm-move"[^>]*>Confirm</u);
    controller.dispose();
  }, 20_000);
});
