// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';
import type { DeckState } from '../../src/ui/command-deck.js';
import { commandDeckHtml, unitRosterHtml } from './render-view.js';
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
  // A side has several trucks; follow one of them, and the parts later divided off it.
  const startingTrucks = new Set(own().filter(({ role }) => role === 'TRUCK').map(({ id }) => id));
  const truckId = [...startingTrucks][0]!;
  const truck = () => own().find(({ id }) => id === truckId)!;
  const truckParts = () => own().filter(({ id, role, location }) => role === 'TRUCK' && location.kind === 'ON_MAP'
    && (id === truckId || !startingTrucks.has(id)));
  const dumpAway = () => own().find((piece) => piece.role === 'DUMP' && hexOf(piece) !== hexOf(truck()) && (piece.resourceQuantity ?? 0) > 0)!;
  return { controller, own, hexOf, truck, truckParts, dumpAway };
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
    const { controller, truck, truckParts, dumpAway, hexOf, own } = await startMovement();
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

  it('never names a supply dump with a number, and does not count dumps or what a truck carries as units (A3)', async () => {
    const { controller, truck, truckParts, dumpAway, hexOf, own } = await startMovement();
    const countOf = () => commandDeckHtml(controller.getSnapshot(), newDeck()).match(/All units \((\d+)\)/u)?.[1];
    const dump = dumpAway();
    // A dump's selection card reads "Supply dump", never "Supply Dump 255" or the like.
    controller.selectPiece(dump.id);
    expect(commandDeckHtml(controller.getSnapshot(), newDeck())).toContain('Supply dump');
    expect(commandDeckHtml(controller.getSnapshot(), newDeck())).not.toMatch(/Supply [Dd]ump \d|Nachschublager|Army Supply/u);

    const before = countOf();
    controller.selectPiece(truck().id);
    await controller.clickHex(hexOf(dump)!);
    await controller.confirmMove();
    const { loads } = controller.getSnapshot().transportOptions!;
    // Loading the whole dump puts that counter on the truck as cargo. Neither the dump nor its cargo was ever a unit, so the count holds.
    await controller.transferSupply('LOAD', loads[0]!.pieceId, loads[0]!.maxTokens);
    const cargo = own().find(({ id }) => id === dump.id)!;
    expect(cargo.role).toBe('CARGO');
    expect(unitRosterHtml(controller.getSnapshot(), newDeck())).not.toContain(`data-roster-pick="${dump.id}"`);
    expect(countOf()).toBe(before);
    controller.dispose();
  });

  it('leaves supply dumps out of All units and lists trucks in their own group, apart from the formations', async () => {
    const { controller, own } = await startMovement();
    const snapshot = controller.getSnapshot();
    const html = unitRosterHtml(snapshot, newDeck());
    const dumps = own().filter(({ role }) => role === 'DUMP');
    const trucks = own().filter(({ role, location }) => (role === 'TRUCK' || role === 'EXTENDER') && location.kind !== 'ELIMINATED');
    expect(dumps.length, 'the default game has dumps').toBeGreaterThan(0);
    expect(trucks.length, 'the default game has trucks').toBeGreaterThan(0);
    for (const dump of dumps) expect(html).not.toContain(`data-roster-pick="${dump.id}"`);
    expect(html).not.toContain('Supply dump');
    const countable = own().filter(({ role, location }) => role !== 'DUMP' && role !== 'CARGO' && location.kind !== 'ELIMINATED').length;
    expect(html).toContain(`My units · ${countable}`);
    expect(commandDeckHtml(snapshot, newDeck())).toContain(`All units (${countable})`);

    // The Trucks group comes after every formation group, holds every truck, and nothing else.
    const host = document.createElement('div');
    host.innerHTML = html;
    const groups = [...host.querySelectorAll<HTMLElement>('details.roster-group:not(.roster-eliminated)')];
    const transport = groups.at(-1)!;
    expect(transport.classList.contains('roster-transport')).toBe(true);
    expect(transport.querySelector('summary')!.textContent).toContain('Trucks');
    const picked = (group: HTMLElement) => [...group.querySelectorAll<HTMLElement>('[data-roster-pick]')].map((button) => button.dataset.rosterPick);
    expect(picked(transport).sort()).toEqual(trucks.map(({ id }) => String(id)).sort());
    for (const group of groups.slice(0, -1)) for (const truck of trucks) expect(picked(group)).not.toContain(String(truck.id));
    controller.dispose();
  });

  it('does not list a merged or used-up dump as an eliminated unit, but still lists an eliminated combat unit', async () => {
    // Found in the whole-turn run: a reinforcement dump merged into the dump already in the Hex left "Supply dump, eliminated" in the roster.
    const { controller, own } = await startMovement();
    const snapshot = controller.getSnapshot();
    const gone = (target: string) => {
      const stacks = snapshot.view.projection!.stacks.map((stack) => ({
        ...stack,
        pieces: stack.pieces.map((piece) => (piece.id === target ? { ...piece, location: { kind: 'ELIMINATED' } } : piece)),
      }));
      return { ...snapshot, view: { ...snapshot.view, projection: { ...snapshot.view.projection!, stacks } } } as typeof snapshot;
    };
    const dump = own().find(({ role }) => role === 'DUMP')!;
    const unit = own().find(({ role }) => role === 'COMBAT')!;
    expect(unitRosterHtml(gone(String(dump.id)), newDeck())).not.toContain('roster-eliminated');
    expect(unitRosterHtml(gone(String(unit.id)), newDeck())).toContain('roster-eliminated');
    controller.dispose();
  });

  it('draws a truck\'s load on its counter: empty, part-loaded, full (A3)', async () => {
    const { controller, truck, truckParts, dumpAway, hexOf, own } = await startMovement();
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

  it('combines the parts of a truck that already moved and loaded, keeping the load and spending no MP (13.2c)', async () => {
    const { controller, truck, truckParts, dumpAway, hexOf, own } = await startMovement();
    controller.selectPiece(truck().id);
    await controller.clickHex(hexOf(dumpAway())!);
    await controller.confirmMove();
    const loads = controller.getSnapshot().transportOptions!.loads[0]!;
    await controller.transferSupply('LOAD', loads.pieceId, 3);
    const remaining = controller.getSnapshot().transportOptions!.remainingTicks;
    await controller.divideTruck(4);
    // The truck moved before it was divided; both parts are in one Hex, so Combine is offered and works.
    const combine = controller.getSnapshot().unitActions.find(({ action }) => action.kind === 'COMBINE_TRANSPORT');
    expect(combine, 'Combine is offered after dividing a truck that moved').toBeDefined();
    await controller.runAction(combine!.key);
    const options = controller.getSnapshot().transportOptions!;
    expect(options).toMatchObject({ points: 5, loadedTokens: 3, capacityTokens: 20, remainingTicks: remaining });
    expect(truckParts()).toHaveLength(1);
    controller.dispose();
  });

  it('splits a chosen number of points off the counter without MP cost', async () => {
    const { controller, truck, truckParts, own } = await startMovement();
    controller.selectPiece(truck().id);
    const html = commandDeckHtml(controller.getSnapshot(), newDeck());
    expect(html).toContain('class="divide-points"');
    expect(html).toContain('max="4"');
    expect(html).not.toContain('Split off 1 truck point');
    await controller.divideTruck(2);
    const sizes = truckParts()
      .map((piece) => piece.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === 'status:transport-points')?.value).sort();
    expect(sizes).toEqual([2, 3]);
    controller.dispose();
  });
});
