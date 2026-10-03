// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  buildGeneratedRuleScenario,
  createGameplayDuelScenario,
  createGameplayFixture,
  createUiController,
  generatedPieceId,
} from '../../src/index.js';
import { commandDeckHtml } from './render-view.js';

/** The duel with or without the Allied dump that pays the tracked regiment's fuel (12.5). */
const controllerFor = async (alliedDump: boolean) => {
  const duel = createGameplayDuelScenario();
  const built = buildGeneratedRuleScenario({
    [generatedPieceId('allied:f1-combat-1')]: ['5,5', 'COMBAT', 'combat'],
    ...(alliedDump ? { [generatedPieceId('allied:independent-supply-1')]: ['4,5', null] as const } : {}),
    [generatedPieceId('axis:f1-combat-1')]: ['6,5', 'COMBAT', 'combat'],
    [generatedPieceId('axis:f1-combat-2')]: ['6,5', 'COMBAT', 'combat'],
    [generatedPieceId('axis:independent-supply-1')]: ['7,5', null],
  });
  const fixture = await createGameplayFixture({ ...built, configuration: duel.configuration });
  const scenario = (await fixture.ports.scenarios.load(fixture.session.getMetadata().scenarioId))!;
  const controller = createUiController({
    engine: fixture.engine, session: fixture.session, scenario,
    bindings: [
      { seatId: fixture.seats[0], playerId: fixture.players[0], label: 'Allied' },
      { seatId: fixture.seats[1], playerId: fixture.players[1], label: 'Axis' },
    ],
  });
  controller.start();
  // The attacker may open out of trace supply in the Breakout Segment (12.8e): decline it.
  if (controller.getSnapshot().view.projection?.sequence.segment === 'BREAKOUT') await controller.endStep();
  expect(controller.getSnapshot().view.projection?.sequence).toMatchObject({ phase: 'MOVEMENT', segment: 'MOVEMENT' });
  controller.selectPiece(fixture.units.attacker);
  return controller;
};

describe('unit card says why a unit cannot move', () => {
  it('names the missing supply when a tracked unit needs fuel and no dump can pay it (12.5a)', async () => {
    const controller = await controllerFor(false);
    const snapshot = controller.getSnapshot();
    expect(snapshot.reachable.size).toBe(0);
    expect(snapshot.unitActions.some(({ group }) => group === 'FUEL')).toBe(false);
    expect(snapshot.moveBlockers.map(({ code }) => code)).toContain('FUEL_REQUIRED');
    const html = commandDeckHtml(snapshot, { search: '', working: false });
    expect(html).toContain('no supply dump in range has the SP to pay for it');
    expect(html).not.toContain('Cannot move in this step');
    controller.dispose();
  });

  it('keeps offering the fuel payment when a dump can pay, and clears the blockers once fueled', async () => {
    const controller = await controllerFor(true);
    let snapshot = controller.getSnapshot();
    expect(snapshot.moveBlockers.map(({ code }) => code)).toContain('FUEL_REQUIRED');
    expect(commandDeckHtml(snapshot, { search: '', working: false })).toContain('Needs fuel before it can move (12.5)');
    await controller.runAction(snapshot.unitActions.find(({ group }) => group === 'FUEL')!.key);
    snapshot = controller.getSnapshot();
    expect(snapshot.moveBlockers).toEqual([]);
    expect(snapshot.reachable.size).toBeGreaterThan(0);
    controller.dispose();
  });
});
