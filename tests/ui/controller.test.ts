import { describe, expect, it } from 'vitest';
import {
  createGameplayFixture,
  createUiController,
  type UiController,
} from '../../src/index.js';

const controllerFor = async () => {
  const fixture = await createGameplayFixture();
  const scenario = (await fixture.ports.scenarios.load(fixture.session.getMetadata().scenarioId))!;
  const controller = createUiController({
    engine: fixture.engine, session: fixture.session, scenario,
    bindings: [
      { seatId: fixture.seats[0], playerId: fixture.players[0], label: 'Allied' },
      { seatId: fixture.seats[1], playerId: fixture.players[1], label: 'Axis' },
    ],
  });
  return { fixture, controller };
};

/** Hand the screen to whichever seat must act next, as a player would. */
const handOffIfRequired = (controller: UiController): void => {
  const snapshot = controller.getSnapshot();
  if (snapshot.requiredSeatId && snapshot.requiredSeatId !== snapshot.view.metadata.activeSeatId) {
    controller.beginHandoff();
    expect(controller.getSnapshot().view.projection).toBeNull();
    controller.completeHandoff();
  }
};

/** The duel's attacker is out of trace supply, so play opens in the Breakout Segment (12.8e): decline it. */
const passBreakout = async (controller: UiController): Promise<void> => {
  if (controller.getSnapshot().view.projection?.sequence.segment === 'BREAKOUT') {
    expect(controller.getSnapshot().stepActions.some(({ group }) => group === 'BREAKOUT')).toBe(true);
    await controller.endStep();
  }
};

describe('UI controller: unit-first play through Gameplay only', () => {
  it('selects a unit, fuels it, shows its range and attack targets, and previews before confirming a move', async () => {
    const { fixture, controller } = await controllerFor();
    controller.start();
    await passBreakout(controller);
    const start = controller.getSnapshot();
    expect(start.view.projection?.sequence).toMatchObject({ phase: 'MOVEMENT', segment: 'MOVEMENT' });
    controller.selectPiece(fixture.units.attacker);
    // 12.5: the tracked regiment cannot spend MP until fuel is paid; the deck offers the methods.
    const unfueled = controller.getSnapshot();
    expect(unfueled.reachable.size).toBe(0);
    const fuel = unfueled.unitActions.find(({ group, action }) => group === 'FUEL' && action.kind === 'PAY_FUEL' && action.method === 'SINGLE_UNIT')!;
    expect(fuel.label).toMatch(/1T/u);
    await controller.runAction(fuel.key);
    const fueledRevision = controller.getSnapshot().view.stateRevision;
    expect(fueledRevision).toBe(start.view.stateRevision + 1);
    const selected = controller.getSnapshot();
    expect(selected.reachable.size).toBeGreaterThan(0);
    expect(selected.attackTargets).toContain('6,5');
    const destination = [...selected.reachable.keys()].find((hexId) => hexId !== '6,5')!;
    await controller.clickHex(destination);
    const preview = controller.getSnapshot();
    expect(preview.movePreview).toMatchObject({ destinationHexId: destination });
    expect(preview.movePreview?.explanation.allowed).toBe(true);
    expect(preview.view.stateRevision).toBe(fueledRevision);
    await controller.clickHex(destination);
    const moved = controller.getSnapshot();
    expect(moved.view.stateRevision).toBe(fueledRevision + 1);
    expect(moved.selectedPiece?.location).toMatchObject({ kind: 'ON_MAP', hexId: destination });
    controller.dispose();
  });

  it('plans an attack from the map with participants, odds and supply before declaring it', async () => {
    const { fixture, controller } = await controllerFor();
    controller.start();
    await passBreakout(controller);
    await controller.endStep();
    // The attacker is beyond trace supply here (12.6), so it eats off the map from its dump first.
    expect(controller.getSnapshot().view.projection?.sequence.phase).toBe('SUPPLY');
    const need = controller.getSnapshot().supplyNeeds.find(({ pieceId }) => pieceId === fixture.units.attacker)!;
    await controller.feedSupply(need.pieceId, need.options[0]!.dumpId);
    await controller.endStep();
    const combat = controller.getSnapshot();
    expect(combat.view.projection?.sequence).toMatchObject({ phase: 'COMBAT', segment: 'COMBAT' });
    expect(combat.attackTargets).toContain('6,5');
    await controller.clickHex('6,5');
    const draft = controller.getSnapshot().draft!;
    expect(draft).toMatchObject({ kind: 'REGULAR', targetHexId: '6,5', selectedIds: [fixture.units.attacker] });
    const facts = Object.fromEntries(draft.explanation!.facts.map(({ key, value }) => [key, value]));
    expect(facts).toMatchObject({ 'combat.line': 'OPEN', 'combat.attackerSupplyTokens': 1 });
    expect(typeof facts['combat.odds']).toBe('string');
    await controller.declareDraft();
    // The defender can pay or withhold supply, so the Axis seat must decide before any die is rolled.
    const waiting = controller.getSnapshot();
    expect(waiting.requiredSeatId).toBe(fixture.seats[1]);
    expect(waiting.view.projection?.combat).toMatchObject({ targetHexId: '6,5', result: null });
    handOffIfRequired(controller);
    const defender = controller.getSnapshot();
    expect(defender.decision?.kind).toBe('SUPPLY_SOURCE');
    expect(defender.decision?.options.map(({ id }) => id)).toContain('withhold');
    expect(defender.decision?.options.every(({ label }) => !label.includes('generated-oob'))).toBe(true);
    // The dump option can also be picked on the map.
    expect(defender.decisionHexes).toContain('7,5');
    await controller.clickHex('7,5');
    // Two defenders: the defender names the Action Rating unit (9.2 step 3).
    const lead = controller.getSnapshot().decision!;
    expect(lead.kind).toBe('DEFENDER_LEAD');
    await controller.respondToDecision(lead.options[0]!.id);
    expect(controller.getSnapshot().history.some(({ events }) => events.some(({ kind }) => kind === 'DICE_ROLLED'))).toBe(true);
    controller.dispose();
  });

  it('supports checkpoint recovery, save/load, and privacy-safe handoff', async () => {
    const { controller } = await controllerFor();
    controller.start();
    controller.createCheckpoint();
    const save = controller.serializeSave();
    const revision = controller.getSnapshot().view.stateRevision;
    controller.beginHandoff();
    expect(controller.getSnapshot().view).toMatchObject({ privacyLocked: true, projection: null });
    controller.completeHandoff();
    expect(controller.getSnapshot().view.privacyLocked).toBe(false);
    await controller.loadSave(save);
    expect(controller.getSnapshot()).toMatchObject({
      view: { stateRevision: revision, metadata: { lifecycle: 'ACTIVE' } },
    });
    // The manual checkpoint survives the round trip; the automatic step checkpoint is replaced, not duplicated.
    const checkpoints = controller.getSnapshot().checkpoints;
    expect(checkpoints.filter(({ label }) => label === `Revision ${revision}`)).toHaveLength(1);
    expect(checkpoints.filter(({ label }) => label.startsWith('Auto: '))).toHaveLength(1);
    controller.dispose();
  });

  it('plays the duel to the end through controller operations only', async () => {
    const { controller } = await controllerFor();
    controller.start();
    let decisions = 0;
    let attacks = 0;
    for (let index = 0; index < 200; index += 1) {
      handOffIfRequired(controller);
      const snapshot = controller.getSnapshot();
      if (snapshot.view.metadata.lifecycle === 'FINISHED') break;
      if (snapshot.decision) {
        decisions += 1;
        await controller.respondToDecision(snapshot.decision.options[0]!.id);
        continue;
      }
      if (snapshot.draft?.explanation?.allowed) { attacks += 1; await controller.declareDraft(); continue; }
      if (snapshot.draft) { controller.cancelDraft(); await controller.endStep(); continue; }
      const target = snapshot.attackTargets[0] ?? snapshot.barrageTargets[0];
      if (target && snapshot.view.projection?.sequence.segment !== 'MOVEMENT') { await controller.clickHex(target); continue; }
      await controller.endStep();
    }
    const final = controller.getSnapshot();
    expect(final.view.metadata.lifecycle).toBe('FINISHED');
    expect(attacks).toBeGreaterThan(0);
    expect(decisions).toBeGreaterThan(0);
    controller.dispose();
  }, 60_000);
});
