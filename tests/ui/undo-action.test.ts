// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';
import { phaseControlsHtml } from './render-view.js';

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
  const own = () => controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces)
    .filter((piece) => piece.ownerId === controller.getSnapshot().view.playerId);
  const hexOf = (piece: { readonly location: unknown }): string | null => {
    const location = piece.location as { kind: string; hexId?: string };
    return location.kind === 'ON_MAP' ? location.hexId ?? null : null;
  };
  const truck = () => own().find(({ role }) => role === 'TRUCK')!;
  const dumpAway = () => own().find((piece) => piece.role === 'DUMP' && hexOf(piece) !== hexOf(truck()) && (piece.resourceQuantity ?? 0) > 0)!;
  const history = () => session.getHistory({ offset: 0, limit: 1000, actionKind: null }).total;
  return { controller, session, own, hexOf, truck, dumpAway, history };
};

describe('Undo takes back the last action, not the whole step (A4b)', () => {
  it('steps back through a move, a load and a split one at a time', async () => {
    const { controller, session, own, truck, dumpAway, hexOf, history } = await startMovement();
    const dump = dumpAway();
    const origin = hexOf(truck());
    const start = history();
    controller.selectPiece(truck().id);
    await controller.clickHex(hexOf(dump)!);
    await controller.confirmMove();
    await controller.transferSupply('LOAD', controller.getSnapshot().transportOptions!.loads[0]!.pieceId, 2);
    await controller.divideTruck(2);
    expect(history()).toBe(start + 3);
    expect(controller.getSnapshot().undoStep).toMatchObject({ scope: 'ACTION', label: 'Split off 2 truck points.' });
    expect(phaseControlsHtml(controller.getSnapshot(), { search: '', working: false })).toContain('Undo: Split off 2 truck points.');

    // Undo the split: the truck is whole again, still loaded and still at the dump, and still selected.
    await controller.undoStep();
    expect(controller.getSnapshot().selectedPiece?.id).toBe(truck().id);
    expect(controller.getSnapshot().transportOptions).toMatchObject({ points: 5, loadedTokens: 2 });
    expect(history()).toBe(start + 2);
    expect(truck()).toMatchObject({ carriedTokens: 2 });
    expect(hexOf(truck())).toBe(hexOf(dump));
    expect(controller.getSnapshot().undoStep?.scope).toBe('ACTION');
    expect(controller.getSnapshot().undoStep?.label).toMatch(/^Loaded 2T onto the truck at \d{4}\.$/u);
    expect(session.getMetadata().lifecycle).toBe('ACTIVE');

    // Undo the load: the dump is whole again.
    await controller.undoStep();
    expect(history()).toBe(start + 1);
    expect(truck().carriedTokens).toBe(0);
    expect(own().find(({ id }) => id === dump.id)).toMatchObject({ role: 'DUMP', resourceQuantity: dump.resourceQuantity });
    // Undo the move: back where it began, and nothing older is left to take back.
    await controller.undoStep();
    expect(history()).toBe(start);
    expect(hexOf(truck())).toBe(origin);
    expect(controller.getSnapshot().undoStep).toBeNull();
    // The undo points are not shown with the player's own checkpoints.
    expect(controller.getSnapshot().checkpoints.every(({ label }) => !label.startsWith('Before: '))).toBe(true);
    controller.dispose();
  });

  it('forgets what came before an action that cannot be taken back (ending the step)', async () => {
    const { controller, truck, hexOf } = await startMovement();
    controller.selectPiece(truck().id);
    await controller.divideTruck(1);
    expect(controller.getSnapshot().undoStep).not.toBeNull();
    await controller.endStep();
    // The step has changed: the split cannot be undone from here, and no stale point is offered.
    expect(controller.getSnapshot().undoStep?.scope).not.toBe('ACTION');
    expect(hexOf(truck())).not.toBeNull();
    controller.dispose();
  });
});
