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
  const onRail = (role: string, accept: (panel: NonNullable<ReturnType<typeof controller.getSnapshot>['rail']>) => boolean = () => true) =>
    own().filter((piece) => piece.role === role).find((piece) => {
      controller.selectPiece(piece.id);
      // The panel stays closed until the player presses Rail transport.
      expect(controller.getSnapshot().rail).toBeNull();
      if (controller.getSnapshot().railOffer === null) return false;
      controller.openRail();
      const panel = controller.getSnapshot().rail;
      return panel !== null && accept(panel);
    });
  return { controller, own, onRail, configuration: created.value.configuration };
};

describe('rail transport in the command deck (13.3)', () => {
  it('sends SP from a station by rail: Tokens, a highlighted destination, the cost and the Rail Cap left', async () => {
    // A seed whose start has a full dump standing on a station (dumps stand where the troops hold the ground, 2026-10-09).
    const { controller, own, onRail, configuration } = await start({ ...DEFAULT_NEW_GAME_REQUEST, seeds: { map: 2, oob: 1, deployment: 1, rules: 1 } });
    const dump = onRail('DUMP');
    expect(dump).toBeDefined();
    // A dump offers only its SP, never the units standing with it.
    expect(controller.getSnapshot().rail!.units).toEqual([]);
    expect(controller.getSnapshot().rail!.dumps.map(({ pieceId }) => pieceId)).toEqual([dump!.id]);
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

    const seat = () => controller.getSnapshot().view.playerId;
    const capOf = () => controller.getSnapshot().view.projection!.railCap!.find(({ playerId }) => playerId === seat())!;
    // The top bar reads the same figures from the projection: the viewer's own Rail Cap only.
    expect(controller.getSnapshot().view.projection!.railCap!.map(({ playerId }) => playerId)).toEqual([seat()]);
    expect(capOf()).toEqual({ playerId: seat(), points, remainingQuarters: points * 4 });
    await controller.confirmRailMove();
    expect(capOf().remainingQuarters).toBe(points * 4 - ready.costQuarters!);
    const arrived = own().find((piece) => piece.role === 'DUMP' && piece.location.kind === 'ON_MAP' && piece.location.hexId === destination);
    expect(arrived?.resourceQuantity).toBeGreaterThanOrEqual(4);
    expect(controller.getSnapshot().notice).toMatch(/Moved 4T by rail/u);
    controller.selectPiece(arrived!.id);
    controller.openRail();
    const after = controller.getSnapshot().rail;
    // 12.2a: what just detrained cannot entrain again this phase.
    if (after) expect(after.remainingQuarters).toBe(points * 4 - ready.costQuarters!);
    controller.dispose();
  });

  it('carries a ticked unit, and says why a unit that cannot ride is greyed out', async () => {
    // The first seed whose start puts a combat unit the Rail Cap can carry, in Move Mode, on a station (units nearer the
    // front start in Combat Mode and cannot ride, 13.3e).
    const carriable = (panel: { readonly remainingQuarters: number; readonly units: readonly { readonly problem: string | null; readonly quarters: number }[] }) =>
      panel.units.some(({ problem, quarters }) => problem === null && quarters <= panel.remainingQuarters);
    let found: { controller: Awaited<ReturnType<typeof start>>['controller'] } | null = null;
    for (let seed = 1; seed <= 30 && found === null; seed += 1) {
      const game = await start({ ...DEFAULT_NEW_GAME_REQUEST, engagement: 'ALLIED_ATTACKS', seeds: { map: seed, oob: seed, deployment: seed, rules: seed } });
      if (game.onRail('COMBAT', carriable)) found = game;
      else game.controller.dispose();
    }
    expect(found).not.toBeNull();
    const { controller } = found!;
    const panel = controller.getSnapshot().rail!;
    const rider = panel.units.find(({ problem, quarters }) => problem === null && quarters <= panel.remainingQuarters);
    expect(rider).toBeDefined();
    expect(panel.dumps).toEqual([]);
    // The selected unit comes ticked when the panel opens; the test only needs the rider ticked.
    if (!controller.getSnapshot().rail!.units.find(({ pieceId }) => pieceId === rider!.pieceId)!.selected) controller.toggleRailUnit(rider!.pieceId);
    // The farthest destination the Rail Cap pays for.
    const destination = [...panel.destinations].reverse().find(({ hexId }) => {
      controller.chooseRailDestination(hexId);
      return controller.getSnapshot().rail!.allowed;
    })!;
    expect(destination).toBeDefined();
    const ready = controller.getSnapshot().rail!;
    expect(ready.units.find(({ pieceId }) => pieceId === rider!.pieceId)?.selected).toBe(true);
    expect(ready.allowed).toBe(true);
    await controller.confirmRailMove();
    const moved = controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces).find(({ id }) => id === rider!.pieceId)!;
    expect(moved.location).toEqual({ kind: 'ON_MAP', hexId: destination.hexId });
    controller.dispose();
  });
});
