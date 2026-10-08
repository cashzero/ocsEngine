// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';
import { pieceDefinition } from '../../src/ui/presenter.js';
import { unitStatusRows } from '../../src/ui/unit-status.js';
import { commandDeckHtml } from './render-view.js';
import { playUntil } from './play-turn.js';

describe('selected unit Status panel', () => {
  it('writes out a ground unit\'s mode, steps, supply, stocks and fuel, and draws them in the deck', async () => {
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
    if (!created.ok) throw new Error('Default game must be created.');
    const { session, scenario, bindings } = created.value;
    const controller = createUiController({ engine, session, scenario, bindings });
    await playUntil(controller, 2, 'MOVEMENT');

    const snapshot = controller.getSnapshot();
    const mine = (snapshot.view.projection?.stacks ?? []).flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.ownerId === snapshot.view.playerId && piece.location.kind === 'ON_MAP');
    const ground = mine.find((piece) => {
      const definition = pieceDefinition(snapshot.scenario, piece);
      return definition?.family === 'GROUND' && definition.counter?.kind !== 'TRANSPORT' && piece.mode !== null;
    });
    expect(ground).toBeDefined();

    const keys = unitStatusRows(snapshot, ground!).map(({ key }) => key);
    // A fresh unit carries no marker: no stocks, fuel, supply or step-loss rows.
    expect(keys).not.toEqual(expect.arrayContaining(['stocks']));
    expect(keys).not.toEqual(expect.arrayContaining(['fuel']));
    expect(keys).not.toEqual(expect.arrayContaining(['supply']));
    expect(keys).toEqual(expect.arrayContaining(['mode']));

    // Markers appear only when set: fuel, Moved, Attacked and internal stocks come from the engine's own answers.
    const marked = unitStatusRows({ ...snapshot, selectedFuel: 'SINGLE_UNIT', movedThisPhase: new Set([String(ground!.id)]), attackedThisPhase: new Set([String(ground!.id)]) }, ground!)
      .map(({ key }) => key);
    expect(marked).toEqual(expect.arrayContaining(['fuel', 'moved', 'attacked']));
    const lowStocks = { ...ground!, statusValues: [{ statusDefinitionId: 'status:internal-stocks', value: 'LOW' }] } as unknown as typeof ground;
    expect(unitStatusRows(snapshot, lowStocks!).find(({ key }) => key === 'stocks')?.value).toBe('Low');

    controller.selectPiece(ground!.id);
    const markup = commandDeckHtml(controller.getSnapshot(), { search: '', working: false });
    expect(markup).toContain('aria-label="Unit status"');
    expect(markup).toContain('data-status="mode"');
    expect(markup).not.toContain('data-status="supply"');
    controller.dispose();
  }, 20_000);
});
