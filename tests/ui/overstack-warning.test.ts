// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';
import { endOverstack, type DeckState } from '../../src/ui/command-deck.js';
import { STACKING_LIMIT_RE_TICKS, stackingReTicks } from '../../src/ui/presenter.js';
import { movePopupHtml, phaseControlsHtml } from './render-view.js';

const newDeck = (): DeckState => ({ search: '', working: false });

/** The default game at the start of its Movement Phase, through the real controller. */
const startMovement = async () => {
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
  if (!created.ok) throw new Error('Default game must be created.');
  const { session, scenario, bindings } = created.value;
  const controller = createUiController({ engine, session, scenario, bindings });
  // Nothing arrives on Game Turn 1 (13.6): play opens in the Movement Phase.
  return controller;
};

describe('overstack warning (4.8a)', () => {
  it('warns in the move preview, keeps warning beside End, and asks twice before ending', async () => {
    const controller = await startMovement();
    const first = controller.getSnapshot();
    expect(first.view.projection?.sequence.phase).toBe('MOVEMENT');
    expect(endOverstack(first)).toEqual([]);
    expect(phaseControlsHtml(first, newDeck())).not.toContain('Overstacked');

    const movers = first.view.projection!.stacks.flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.ownerId === first.view.playerId && piece.location.kind === 'ON_MAP'
        && (piece.role === 'COMBAT' || piece.role === 'ARTILLERY' || piece.role === 'HQ'))
      .map(({ id }) => id);

    // Pile units into one hex: the preview stays quiet while the hex is within 10 RE and warns the moment it is not.
    // The pile goes where the most movers can reach, so the test does not depend on how the deployment lays the army out.
    const reachCounts = new Map<string, number>();
    for (const id of movers) {
      controller.selectPiece(id);
      const fuel = controller.getSnapshot().unitActions.find(({ group }) => group === 'FUEL');
      if (fuel) await controller.runAction(fuel.key);
      for (const hexId of controller.getSnapshot().reachable.keys()) reachCounts.set(hexId, (reachCounts.get(hexId) ?? 0) + 1);
    }
    const target: string | null = [...reachCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
    let warnedAt: string | null = null;
    for (const id of movers) {
      controller.selectPiece(id);
      const fuel = controller.getSnapshot().unitActions.find(({ group }) => group === 'FUEL');
      if (fuel) await controller.runAction(fuel.key);
      const range = controller.getSnapshot();
      if (!target || !range.reachable.has(target)) continue;
      await controller.clickHex(target);
      const preview = controller.getSnapshot();
      if (!preview.movePreview?.explanation.allowed) continue;
      const popup = movePopupHtml(preview);
      const stack = preview.view.projection!.stacks.flatMap(({ pieces }) => pieces)
        .filter((piece) => piece.ownerId === preview.view.playerId && piece.location.kind === 'ON_MAP' && piece.location.hexId === target && piece.id !== id);
      const total = [...stack, preview.selectedPiece!].reduce((sum, piece) => sum + stackingReTicks(preview.scenario, piece), 0);
      if (total <= STACKING_LIMIT_RE_TICKS) {
        expect(popup).not.toContain('Overstack');
        expect(popup).toMatch(/id="confirm-move"[^>]*>Confirm</u);
        await controller.confirmMove();
        continue;
      }
      expect(popup).toContain('overstack-warning');
      expect(popup).toContain(`ending here puts ${total / 4} RE in one hex`);
      expect(popup).toMatch(/id="confirm-move"[^>]*>Confirm anyway</u);
      warnedAt = target;
      await controller.confirmMove();
      break;
    }
    expect(warnedAt).not.toBeNull();

    // The overstack is still there after the move, so the warning stays beside End until the player resolves it.
    const after = controller.getSnapshot();
    const overstacked = endOverstack(after);
    expect(overstacked.map(({ hexId }) => hexId)).toEqual([warnedAt]);
    expect(overstacked[0]!.reTicks).toBeGreaterThan(STACKING_LIMIT_RE_TICKS);
    const bar = phaseControlsHtml(after, newDeck());
    expect(bar).toContain('overstack-note');
    expect(bar).toContain('holds ');
    expect(bar).toContain('(limit 10)');
    // First press only arms the confirmation, and names the cause.
    expect(phaseControlsHtml(after, { ...newDeck(), confirmEnd: true })).toContain('Finish anyway: 1 hex is overstacked');
    controller.dispose();
  });
});
