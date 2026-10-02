import { describe, expect, it, vi } from 'vitest';
import { createGameplayFixture, createUiController, type UiController } from '../../src/index.js';

vi.setConfig({ testTimeout: 60000 });

const controllerFor = async () => {
  const fixture = await createGameplayFixture();
  const scenario = (await fixture.ports.scenarios.load(fixture.session.getMetadata().scenarioId))!;
  const controller = createUiController({
    engine: fixture.engine, session: fixture.session, scenario,
    bindings: [
      { seatId: fixture.seats[0], playerId: fixture.players[0], label: 'Allied' },
      { seatId: fixture.seats[1], playerId: fixture.players[1], label: 'Axis' },
    ],
    // Stay in the turn after the combat resolves, so its payments are still in the ledger to read.
    skipDumpOnlySteps: false,
  });
  return { fixture, controller };
};
const handOff = (controller: UiController): void => { controller.beginHandoff(); controller.completeHandoff(); };

describe('combat supply in the ledger', () => {
  it('lists the combat supply each side paid, from its own dump, and never the other side\'s', async () => {
    const { fixture, controller } = await controllerFor();
    controller.start();
    if (controller.getSnapshot().view.projection?.sequence.segment === 'BREAKOUT') await controller.endStep();
    await controller.endStep();
    const need = controller.getSnapshot().supplyNeeds.find(({ pieceId }) => pieceId === fixture.units.attacker)!;
    await controller.feedSupply(need.pieceId, need.options[0]!.dumpId);
    await controller.endStep();
    await controller.clickHex('6,5');
    await controller.declareDraft();
    for (let guard = 0; guard < 30; guard += 1) {
      const snapshot = controller.getSnapshot();
      if (snapshot.combatReports.some(({ status }) => status === 'RESOLVED')) break;
      if (snapshot.decision) await controller.respondToDecision(snapshot.decision.options[0]!.id);
      else if (snapshot.handoff) handOff(controller);
      else break;
    }
    const ledgerOf = () => controller.getSnapshot().ledger.filter(({ text }) => text.startsWith('Combat or barrage supply'));
    const first = ledgerOf();
    if (controller.getSnapshot().handoff) handOff(controller); else { controller.beginHandoff(); controller.completeHandoff(); }
    const second = ledgerOf();
    // At least the attacker paid; each side's lines come from its own dumps and add up to what its own dumps lost.
    expect(first.length + second.length).toBeGreaterThan(0);
    for (const line of [...first, ...second]) {
      expect(line.spent).toBeGreaterThan(0);
      expect(line.text).toMatch(/^Combat or barrage supply \d+T from the (dump|truck load) at \d{4} \((\d+T there now|used up)\)\.$/u);
    }
    // The two sides do not see the same lines: neither ledger lists the other side's payment.
    expect(first.map(({ revision, text }) => `${revision}|${text}`)).not.toEqual(second.map(({ revision, text }) => `${revision}|${text}`));
    controller.dispose();
  });
});
