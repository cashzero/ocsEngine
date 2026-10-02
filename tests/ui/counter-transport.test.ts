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
  for (const arrival of controller.getSnapshot().arrivals) {
    controller.selectPiece(arrival.pieceId);
    await controller.clickHex(arrival.entryHexIds[0]!);
  }
  await controller.endStep();
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

    const [truck] = trucks();
    expect(printedPoints(bodyOf(truck!))).toBe('5');
    controller.selectPiece(truck!.id);
    const split = snapshot().unitActions.find(({ label }) => label === 'Split off 2 truck points');
    expect(split, 'a five-point truck can split off two points').toBeDefined();
    await controller.runAction(split!.key);

    const sizes = trucks().map((piece) => printedPoints(bodyOf(piece))).sort();
    expect(sizes).toEqual(['2', '3']);
    controller.dispose();
  });

});
