import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';
import { commandDeckHtml, unitRosterHtml, type DeckState } from '../../src/ui/command-deck.js';
import { counterSvgBody, counterView } from '../../src/ui/counter.js';

// Each test plays a few real actions through the controller, which is slower than a unit test under a parallel run.
vi.setConfig({ testTimeout: 30000 });

const newDeck = (): DeckState => ({ search: '', working: false });

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
  return { controller, own, hexOf, truck, dumpAway };
};

describe('the truck\'s supply area (A2)', () => {
  it('says there is nothing to load when no dump is in the Hex, instead of offering nothing', async () => {
    const { controller, truck } = await startMovement();
    controller.selectPiece(truck().id);
    const snapshot = controller.getSnapshot();
    expect(snapshot.transportOptions).toMatchObject({ points: 5, capacityTokens: 20, loadedTokens: 0, loads: [], unload: null });
    const html = commandDeckHtml(snapshot, newDeck());
    expect(html).toContain('transport-panel');
    expect(html).toContain('No friendly supply dump in this hex to load from.');
    expect(html).not.toContain('data-transfer="LOAD"');
    controller.dispose();
  });

  it('loads and unloads the number of Tokens the player chooses, and says what each costs', async () => {
    const { controller, truck, dumpAway, hexOf, own } = await startMovement();
    const dump = dumpAway();
    controller.selectPiece(truck().id);
    await controller.clickHex(hexOf(dump)!);
    await controller.confirmMove();

    const here = controller.getSnapshot();
    const [load] = here.transportOptions!.loads;
    expect(load!.maxTokens).toBe(dump.resourceQuantity);
    const html = commandDeckHtml(here, newDeck());
    expect(html).toContain('data-transfer="LOAD"');
    expect(html).toContain(`max="${load!.maxTokens}"`);
    expect(html).toContain('costs 5 MP');
    // The flat "Load NT from…" button is gone: the area replaces it.
    expect(html).not.toMatch(/data-unit-action="[^"]*">Load \d/u);

    // Load part of the dump: only 1T.
    await controller.transferSupply('LOAD', load!.pieceId, 1);
    let after = controller.getSnapshot();
    expect(after.transportOptions).toMatchObject({ loadedTokens: 1, isCurrentMover: true });
    expect(own().find(({ id }) => id === dump.id)?.resourceQuantity).toBe((dump.resourceQuantity ?? 0) - 1);
    expect(commandDeckHtml(after, newDeck())).toContain('This truck is mid-move');

    // Unload it again where a dump already stands: legal, and the dump is whole again.
    await controller.transferSupply('UNLOAD', null, 1);
    after = controller.getSnapshot();
    expect(after.transportOptions!.loadedTokens).toBe(0);
    controller.dispose();
  });

  it('shows why a load or an unload is blocked, with the rule, rather than hiding it', async () => {
    const { controller, truck, dumpAway, hexOf } = await startMovement();
    controller.selectPiece(truck().id);
    await controller.clickHex(hexOf(dumpAway())!);
    await controller.confirmMove();
    const { loads } = controller.getSnapshot().transportOptions!;
    await controller.transferSupply('LOAD', loads[0]!.pieceId, loads[0]!.maxTokens);

    // Out in the open with a load: no friendly combat unit or dump, so it cannot unload (13.2f).
    const reachable = [...controller.getSnapshot().reachable.keys()];
    const empty = reachable.find((hexId) => !controller.getSnapshot().view.projection!.stacks.some(({ location, pieces }) =>
      location.kind === 'ON_MAP' && location.hexId === hexId && pieces.length > 0));
    expect(empty, 'an empty hex is in reach').toBeDefined();
    await controller.clickHex(empty!);
    await controller.confirmMove();
    const stuck = controller.getSnapshot();
    expect(stuck.transportOptions!.unload).toMatchObject({ available: false });
    const html = commandDeckHtml(stuck, newDeck());
    expect(html).toContain('is-blocked');
    expect(html).toContain('13.2f');
    expect(html).not.toContain('data-transfer="UNLOAD"');
    controller.dispose();
  });

  it('never names a supply dump, and does not count what a truck carries as another unit (A3)', async () => {
    const { controller, truck, dumpAway, hexOf, own } = await startMovement();
    const rosterOf = () => unitRosterHtml(controller.getSnapshot(), newDeck());
    const countOf = () => commandDeckHtml(controller.getSnapshot(), newDeck()).match(/All units \((\d+)\)/u)?.[1];
    const dump = dumpAway();
    // Every dump reads "Supply dump", in the roster and on its selection card, never "Supply Dump 255" or the like.
    expect(rosterOf()).toContain('Supply dump');
    expect(rosterOf()).not.toMatch(/Supply [Dd]ump \d|Nachschublager|Army Supply/u);
    controller.selectPiece(dump.id);
    expect(commandDeckHtml(controller.getSnapshot(), newDeck())).not.toMatch(/Supply [Dd]ump \d|Nachschublager|Army Supply/u);

    const before = countOf();
    controller.selectPiece(truck().id);
    await controller.clickHex(hexOf(dump)!);
    await controller.confirmMove();
    const { loads } = controller.getSnapshot().transportOptions!;
    // Loading the whole dump puts that counter on the truck: it is cargo now and stops being listed as a unit.
    await controller.transferSupply('LOAD', loads[0]!.pieceId, loads[0]!.maxTokens);
    const cargo = own().find(({ id }) => id === dump.id)!;
    expect(cargo.role).toBe('CARGO');
    expect(rosterOf()).not.toContain(`data-roster-pick="${dump.id}"`);
    expect(Number(countOf())).toBe(Number(before) - 1);
    controller.dispose();
  });

  it('draws a truck\'s load on its counter: empty, part-loaded, full (A3)', async () => {
    const { controller, truck, dumpAway, hexOf, own } = await startMovement();
    const gaugeOf = () => {
      const piece = own().find(({ id }) => id === truck().id)!;
      const definition = controller.getSnapshot().scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)!;
      return counterSvgBody(counterView(definition, piece));
    };
    expect(gaugeOf()).toContain('load-empty');
    controller.selectPiece(truck().id);
    await controller.clickHex(hexOf(dumpAway())!);
    await controller.confirmMove();
    const max = controller.getSnapshot().transportOptions!.loads[0]!.maxTokens;
    await controller.transferSupply('LOAD', controller.getSnapshot().transportOptions!.loads[0]!.pieceId, 1);
    expect(gaugeOf()).toContain('load-part');
    expect(gaugeOf()).toContain('>1T<');
    // Split the counter down to one point (4T capacity) and fill it.
    await controller.divideTruck(4);
    const room = controller.getSnapshot().transportOptions!;
    expect(room.capacityTokens).toBe(4);
    const rest = room.loads[0]!;
    await controller.transferSupply('LOAD', rest.pieceId, Math.min(rest.maxTokens, 3));
    expect(max).toBeGreaterThanOrEqual(4);
    expect(gaugeOf()).toContain('load-full');
    controller.dispose();
  });

  it('tells a dump\'s player which trucks here can carry it (A3)', async () => {
    const { controller, truck, dumpAway, hexOf } = await startMovement();
    const dump = dumpAway();
    controller.selectPiece(dump.id);
    expect(commandDeckHtml(controller.getSnapshot(), newDeck())).toContain('No friendly truck in this hex');
    controller.selectPiece(truck().id);
    await controller.clickHex(hexOf(dump)!);
    await controller.confirmMove();
    controller.selectPiece(dump.id);
    const html = commandDeckHtml(controller.getSnapshot(), newDeck());
    expect(html).toContain('Carry with a truck');
    expect(html).toContain(`data-piece="${truck().id}"`);
    controller.dispose();
  });

  it('splits a chosen number of points off the counter without MP cost', async () => {
    const { controller, truck, own } = await startMovement();
    controller.selectPiece(truck().id);
    const html = commandDeckHtml(controller.getSnapshot(), newDeck());
    expect(html).toContain('class="divide-points"');
    expect(html).toContain('max="4"');
    expect(html).not.toContain('Split off 1 truck point');
    await controller.divideTruck(2);
    const sizes = own().filter(({ role }) => role === 'TRUCK')
      .map((piece) => piece.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === 'status:transport-points')?.value).sort();
    expect(sizes).toEqual([2, 3]);
    controller.dispose();
  });
});
