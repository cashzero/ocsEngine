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
  it('writes out a ground unit\'s supply, stocks and fuel, and draws them in the deck', async () => {
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
    // Combat/Move carry no marker (5.2); the selection card names the mode.
    expect(keys).not.toContain('mode');

    // Markers appear only when set: fuel, Moved, Attacked and internal stocks come from the engine's own answers.
    const marked = unitStatusRows({ ...snapshot, selectedFuel: 'SINGLE_UNIT', movedThisPhase: new Set([String(ground!.id)]), attackedThisPhase: new Set([String(ground!.id)]) }, ground!)
      .map(({ key }) => key);
    expect(marked).toEqual(expect.arrayContaining(['fuel', 'moved', 'attacked']));
    // Reserve, Strat, DG and Exploit are markers on the counter (5.2): each keeps its mark; Combat and Move have none.
    for (const mode of ['RESERVE', 'STRAT', 'DG', 'EXPLOITATION']) expect(unitStatusRows(snapshot, { ...ground!, mode } as typeof ground & object).map(({ key }) => key)).toContain('mode');
    const lowStocks = { ...ground!, statusValues: [{ statusDefinitionId: 'status:internal-stocks', value: 'LOW' }] } as unknown as typeof ground;
    expect(unitStatusRows(snapshot, lowStocks!).find(({ key }) => key === 'stocks')?.value).toBe('Low');

    controller.selectPiece(ground!.id);
    const markup = commandDeckHtml(controller.getSnapshot(), { search: '', working: false });
    // A fresh unit has no marker, so the panel is absent; mode and steps are on the selection card, not in the panel.
    expect(markup).not.toContain('aria-label="Unit status"');
    expect(markup).not.toContain('data-status="mode"');
    expect(markup).not.toContain('data-status="steps"');
    expect(markup).not.toContain('hexes reachable');
    expect(markup).not.toContain('data-status="supply"');
    controller.dispose();
  }, 20_000);
});
