// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
  type NewGameRequest,
} from '../../src/index.js';
import type { DeckState } from '../../src/ui/command-deck.js';
import { commandDeckHtml } from './render-view.js';

vi.setConfig({ testTimeout: 60000 });

const newDeck = (): DeckState => ({ search: '', working: false });

/** A generated game in the first Movement Phase, and the own pieces standing where something can entrain. */
const start = async (request: NewGameRequest) => {
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const created = await createNewGameOrchestrator(engine).create(request);
  if (!created.ok) throw new Error('The game must be created.');
  const { session, scenario, bindings } = created.value;
  const controller = createUiController({ engine, session, scenario, bindings });
  const own = () => controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces)
    .filter((piece) => piece.ownerId === controller.getSnapshot().view.playerId && piece.location.kind === 'ON_MAP');
  const onRail = (role: string) => own().filter((piece) => piece.role === role).find((piece) => {
    controller.selectPiece(piece.id);
    return controller.getSnapshot().rail !== null;
  });
  return { controller, own, onRail, configuration: created.value.configuration };
};

describe('rail transport in the command deck (13.3)', () => {
  it('sends SP from a station by rail: Tokens, a highlighted destination, the cost and the Rail Cap left', async () => {
    const { controller, own, onRail, configuration } = await start(DEFAULT_NEW_GAME_REQUEST);
    const dump = onRail('DUMP');
    expect(dump).toBeDefined();
    const before = controller.getSnapshot().rail!;
    const points = configuration.railCapacity!.find(({ playerId }) => playerId === controller.getSnapshot().view.playerId)!.points;
    expect(before).toMatchObject({ capacityPoints: points, remainingQuarters: points * 4, toHexId: null, costQuarters: null, allowed: false });
    expect(commandDeckHtml(controller.getSnapshot(), newDeck())).toContain('rail-panel');

    const destination = before.destinations[0]!.hexId;
    controller.setRailTokens(dump!.id, 4);
    await controller.clickHex(destination);
    const ready = controller.getSnapshot().rail!;
    expect(ready.toHexId).toBe(destination);
    expect(ready.costQuarters).toBeGreaterThan(0);
    expect(ready.allowed).toBe(true);
    const html = commandDeckHtml(controller.getSnapshot(), newDeck());
    expect(html).toMatch(/Costs [\d /]+ of [\d /]+ Rail Cap left/u);
    expect(html).toContain('id="confirm-rail"');

    await controller.confirmRailMove();
    const arrived = own().find((piece) => piece.role === 'DUMP' && piece.location.kind === 'ON_MAP' && piece.location.hexId === destination);
    expect(arrived?.resourceQuantity).toBeGreaterThanOrEqual(4);
    expect(controller.getSnapshot().notice).toMatch(/Moved 4T by rail/u);
    controller.selectPiece(arrived!.id);
    const after = controller.getSnapshot().rail;
    // 12.2a: what just detrained cannot entrain again this phase.
    if (after) expect(after.remainingQuarters).toBe(points * 4 - ready.costQuarters!);
    controller.dispose();
  });

  it('carries a ticked unit, and says why a unit that cannot ride is greyed out', async () => {
    const { controller, onRail } = await start({ ...DEFAULT_NEW_GAME_REQUEST, engagement: 'ALLIED_ATTACKS' });
    const unit = onRail('COMBAT');
    expect(unit).toBeDefined();
    const panel = controller.getSnapshot().rail!;
    const rider = panel.units.find(({ problem }) => problem === null);
    expect(rider).toBeDefined();
    controller.toggleRailUnit(rider!.pieceId);
    controller.chooseRailDestination(panel.destinations.at(-1)!.hexId);
    const ready = controller.getSnapshot().rail!;
    expect(ready.units.find(({ pieceId }) => pieceId === rider!.pieceId)?.selected).toBe(true);
    expect(ready.allowed).toBe(true);
    await controller.confirmRailMove();
    const moved = controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces).find(({ id }) => id === rider!.pieceId)!;
    expect(moved.location).toEqual({ kind: 'ON_MAP', hexId: panel.destinations.at(-1)!.hexId });
    controller.dispose();
  });
});
