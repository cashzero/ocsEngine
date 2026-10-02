// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';
import { deckTabs, selectDeckTab, type DeckState } from '../../src/ui/command-deck.js';
import { commandDeckHtml } from './render-view.js';

vi.setConfig({ testTimeout: 30000 });

const startMovement = async () => {
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
  if (!created.ok) throw new Error('Default game must be created.');
  const { session, scenario, bindings } = created.value;
  const controller = createUiController({ engine, session, scenario, bindings });
  for (const arrival of controller.getSnapshot().arrivals) {
    controller.selectPiece(arrival.pieceId);
    await controller.clickHex(arrival.entryHexIds[0]!);
  }
  await controller.endStep();
  return controller;
};
const own = (controller: Awaited<ReturnType<typeof startMovement>>) => controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces)
  .filter((piece) => piece.ownerId === controller.getSnapshot().view.playerId);

describe('the supply ledger (A5)', () => {
  it('has no Ledger tab until something is paid, then lists the payment with its source and what is left', async () => {
    const controller = await startMovement();
    const deck: DeckState = { search: '', working: false };
    expect(deckTabs(controller.getSnapshot()).map(({ id }) => id)).not.toContain('ledger');
    expect(controller.getSnapshot().ledger).toEqual([]);

    // A tracked unit that needs fuel, paid for from a dump.
    const unit = own(controller).find((piece) => piece.role === 'COMBAT' && controller.getSnapshot().scenario.pieceCatalog.definitions
      .find(({ id }) => id === piece.definitionId)?.faces.some(({ mobilityClassDefinitionId }) => String(mobilityClassDefinitionId) === 'mobility:tracked'))!;
    controller.selectPiece(unit.id);
    const fuel = controller.getSnapshot().unitActions.find(({ action }) => action.kind === 'PAY_FUEL' && action.method === 'SINGLE_UNIT')!;
    expect(fuel, 'a single-unit fuel payment is offered').toBeDefined();
    const sourceId = (fuel.action as { sourcePieceId: string }).sourcePieceId;
    const source = own(controller).find(({ id }) => id === sourceId)!;
    const before = source.resourceQuantity ?? 0;
    await controller.runAction(fuel.key);

    const snapshot = controller.getSnapshot();
    expect(snapshot.ledger).toHaveLength(1);
    const line = snapshot.ledger[0]!;
    expect(line.spent).toBe(1);
    // It names the unit and the source the player picked, and what that source holds after the payment.
    expect(line.text).toContain('Fuel 1T');
    expect(line.text).toContain('this unit');
    expect(line.text).toContain('from the dump at ');
    const remaining = own(controller).find(({ id }) => id === source.id)?.resourceQuantity ?? 0;
    expect(remaining).toBe(before - 1);
    expect(line.text).toContain(remaining > 0 ? `(${remaining}T there now)` : '(used up)');

    // The ledger is read from the state, so a save loaded later (here into the same controller after the state changed)
    // gives the same words, whatever the page remembers.
    const saved = controller.serializeSave();
    const text = controller.getSnapshot().ledger.map((entry) => entry.text);
    controller.selectPiece(unit.id);
    await controller.endStep();
    await controller.loadSave(saved);
    expect(controller.getSnapshot().ledger.map((entry) => entry.text)).toEqual(text);

    // The tab appears after the unit's own tab, and shows the total paid.
    expect(deckTabs(snapshot).map(({ id }) => id)).toContain('ledger');
    selectDeckTab(snapshot, deck, 'ledger');
    const html = commandDeckHtml(snapshot, deck);
    expect(html).toContain('Supply this turn');
    expect(html).toContain('1T paid');
    expect(html).toContain('Fuel 1T for Recon Detachment 1');
    expect(html).toContain('from the ');
    controller.dispose();
  });

  it('counts loads and unloads without counting them as paid, and drops a line when Undo takes the action back', async () => {
    const controller = await startMovement();
    const truck = own(controller).find(({ role }) => role === 'TRUCK')!;
    const hexOf = (piece: { readonly location: unknown }) => (piece.location as { hexId?: string }).hexId!;
    const dump = own(controller).find((piece) => piece.role === 'DUMP' && hexOf(piece) !== hexOf(truck) && (piece.resourceQuantity ?? 0) > 0)!;
    controller.selectPiece(truck.id);
    await controller.clickHex(hexOf(dump));
    await controller.confirmMove();
    await controller.transferSupply('LOAD', controller.getSnapshot().transportOptions!.loads[0]!.pieceId, 2);
    expect(controller.getSnapshot().ledger).toEqual([expect.objectContaining({ spent: 0, text: 'Loaded 2T onto a truck.' })]);
    await controller.undoStep();
    expect(controller.getSnapshot().ledger).toEqual([]);
    controller.dispose();
  });
});
