import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  createUiController,
} from '../../src/index.js';
import { counterSvgBody, counterView } from '../../src/ui/counter.js';

const startMovement = async () => {
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const created = await createNewGameOrchestrator(engine).create(DEFAULT_NEW_GAME_REQUEST);
  if (!created.ok) throw new Error('Default game must be created.');
  const { session, scenario, bindings } = created.value;
  const controller = createUiController({ engine, session, scenario, bindings });
  // Nothing arrives on Game Turn 1 (13.6): play opens in the Movement Phase.
  return controller;
};

/** The big number at the lower left of a Transport Point counter is its size in points (13.2). */
const printedPoints = (svg: string): string | undefined => /x="24" y="85" text-anchor="middle">([^<]*)</u.exec(svg)?.[1];

describe('Transport Point counters show their current size (13.2c)', () => {
  it('prints the points left after a divide, on the counter of each part', async () => {
    const controller = await startMovement();
    const snapshot = () => controller.getSnapshot();
    const trucks = () => snapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces).filter((piece) => piece.ownerId === snapshot().view.playerId
      && snapshot().scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)?.counter?.kind === 'TRANSPORT');
    const bodyOf = (piece: ReturnType<typeof trucks>[number]) => {
      const definition = snapshot().scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)!;
      return counterSvgBody(counterView(definition, piece));
    };

    // A side has several trucks; follow one of them and the part divided off it.
    const [truck] = trucks();
    const others = new Set(trucks().filter(({ id }) => id !== truck!.id).map(({ id }) => id));
    expect(printedPoints(bodyOf(truck!))).toBe('2');
    controller.selectPiece(truck!.id);
    const split = snapshot().unitActions.find(({ label }) => label === 'Split off 1 truck point');
    expect(split, 'a two-point truck can split off one point').toBeDefined();
    await controller.runAction(split!.key);

    const sizes = trucks().filter(({ id }) => !others.has(id)).map((piece) => printedPoints(bodyOf(piece))).sort();
    expect(sizes).toEqual(['1', '1']);
    controller.dispose();
  });

});
