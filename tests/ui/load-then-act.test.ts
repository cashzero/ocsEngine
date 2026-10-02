import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';

vi.setConfig({ testTimeout: 60000 });

const newController = async () => {
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
  if (!created.ok) throw new Error('Default game must be created.');
  const { session, scenario, bindings } = created.value;
  return createUiController({ engine, session, scenario, bindings });
};

describe('acting after a save is loaded into a new page', () => {
  it('is not refused as a duplicate of a request the saved game already made', async () => {
    // One page plays a few actions and saves.
    const first = await newController();
    for (const arrival of first.getSnapshot().arrivals) {
      first.selectPiece(arrival.pieceId);
      await first.clickHex(arrival.entryHexIds[0]!);
    }
    await first.endStep();
    const own = (controller: typeof first) => controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces)
      .filter((piece) => piece.ownerId === controller.getSnapshot().view.playerId && piece.location.kind === 'ON_MAP');
    first.selectPiece(own(first).find(({ role }) => role === 'TRUCK')!.id);
    await first.divideTruck(2);
    const saved = first.serializeSave();

    // A new page starts a fresh game (its own request numbers begin again), loads the save, and acts.
    const second = await newController();
    await second.loadSave(saved);
    const truck = own(second).find(({ role }) => role === 'TRUCK' && (second.getSnapshot().scenario.pieceCatalog.definitions
      .find(({ id }) => id === own(second).find((piece) => piece.role === 'TRUCK')!.definitionId) !== undefined))!;
    second.selectPiece(truck.id);
    const before = own(second).filter(({ role }) => role === 'TRUCK').length;
    await second.divideTruck(1);
    expect(second.getSnapshot().notice, 'the action is accepted, not refused').not.toMatch(/Not allowed|already/iu);
    expect(own(second).filter(({ role }) => role === 'TRUCK').length).toBe(before + 1);
    first.dispose();
    second.dispose();
  });
});
