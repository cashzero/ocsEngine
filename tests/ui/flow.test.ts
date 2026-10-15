import { describe, expect, it } from 'vitest';
import {
  CONTACT_NEW_GAME_REQUEST,
  DEFAULT_NEW_GAME_REQUEST,
  NEW_GAME_MAP_LIMITS,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createNewGameOrchestrator,
  prepareNewGame,
  printedHexLabel,
  unitLabel,
  combatOutlook,
  createGameplayFixture,
  createUiController,
  distinctLabels,
  explainCombatResult,
  nominalNextStep,
  playerTurnTrack,
  type HistoryRecord,
  type TurnSequenceState,
  type UiController,
} from '../../src/index.js';
import { playUntil } from './play-turn.js';

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

const handOff = (controller: UiController): void => {
  controller.beginHandoff();
  controller.completeHandoff();
};

/** Advance the duel to its Combat Phase attack on 6,5 and declare it. */
const declareAttack = async (controller: UiController, attacker: string): Promise<void> => {
  controller.start();
  if (controller.getSnapshot().view.projection?.sequence.segment === 'BREAKOUT') await controller.endStep();
  await controller.endStep();
  const need = controller.getSnapshot().supplyNeeds.find(({ pieceId }) => pieceId === attacker)!;
  await controller.feedSupply(need.pieceId, need.options[0]!.dumpId);
  await controller.endStep();
  await controller.clickHex('6,5');
  await controller.declareDraft();
};

describe('UI flow narrative (2026-10-01 review)', () => {
  it('explains Combat Table results and odds in plain language', () => {
    expect(explainCombatResult('AL1o1/Do1')).toBe('Attacker loses 1 step and takes 1 option (each a step loss or a hex of retreat); defender takes 1 option (each a step loss or a hex of retreat).');
    expect(explainCombatResult('Ae3/DL2o2DG')).toMatch(/defenders become Disorganized; attackers with Action Rating 3\+ may enter Exploit mode/u);
    const outlook = combatOutlook('OPEN', '1:5', 0)!;
    expect(outlook.attackerHurt).toBeGreaterThan(0.5);
    expect(combatOutlook('OPEN', '9:9', 0)).toBeNull();
  });

  it('names the step that follows and marks phases passed without legal actions', () => {
    expect(nominalNextStep({ phase: 'MOVEMENT', segment: 'MOVEMENT' })).toBe('Movement · Barrage Segment');
    expect(nominalNextStep({ phase: 'SUPPLY', segment: 'NONE' })).toBe('Reaction Phase');
    const sequence = (phase: TurnSequenceState['phase'], segment: TurnSequenceState['segment'] = 'NONE'): TurnSequenceState => ({
      gameTurn: 1, playerTurnIndex: 0, phase, segment, firstPlayerId: 'p1' as never, phasingPlayerId: 'p1' as never, actingPlayerId: 'p1' as never,
    });
    const advance = (from: TurnSequenceState, ...to: TurnSequenceState[]): HistoryRecord => ({
      action: { kind: 'ADVANCE_SEQUENCE', actorId: 'p1' }, revisionAfter: 1, seatId: 's1', summary: '',
      events: to.map((target, index) => ({ kind: 'SEQUENCE_ADVANCED', sequence: index, from: index === 0 ? from : to[index - 1]!, to: target })),
    }) as unknown as HistoryRecord;
    const records = [
      advance(sequence('REINFORCEMENT'), sequence('MOVEMENT', 'MOVEMENT')),
      advance(sequence('MOVEMENT', 'MOVEMENT'), sequence('MOVEMENT', 'BARRAGE'), sequence('SUPPLY')),
      advance(sequence('SUPPLY'), sequence('REACTION', 'MOVEMENT'), sequence('COMBAT', 'BARRAGE'), sequence('COMBAT', 'COMBAT')),
    ];
    const track = playerTurnTrack(records, sequence('COMBAT', 'COMBAT'), 'p2' as never);
    expect(Object.fromEntries(track.map(({ phase, status }) => [phase, status]))).toMatchObject({
      REINFORCEMENT: 'done', MOVEMENT: 'done', SUPPLY: 'done', REACTION: 'skipped', COMBAT: 'current', EXPLOITATION: 'upcoming',
    });
    expect(track.find(({ phase }) => phase === 'REACTION')?.actorId).toBe('p2');
  });

  it('numbers identical choice labels so each can be told apart', () => {
    expect(distinctLabels([{ label: 'Pay 1T at 0107' }, { label: 'Pay 1T at 0107' }, { label: 'Withhold' }]).map(({ label }) => label))
      .toEqual(['Pay 1T at 0107 (#1)', 'Pay 1T at 0107 (#2)', 'Withhold']);
  });

  it('tells the next player why they get the screen and reports the combat result to both sides', async () => {
    const { fixture, controller } = await controllerFor();
    await declareAttack(controller, fixture.units.attacker);
    const waiting = controller.getSnapshot();
    expect(waiting.handoff).toMatchObject({ toSeatId: fixture.seats[1], toLabel: 'Axis' });
    expect(waiting.handoff?.reason).toMatch(/Defend against the attack at \d{4}/u);
    controller.beginHandoff();
    // The privacy screen names the incoming player and the reason, with no map data.
    expect(controller.getSnapshot()).toMatchObject({ view: { privacyLocked: true, projection: null }, handoff: { toLabel: 'Axis' } });
    controller.completeHandoff();
    const defender = controller.getSnapshot();
    expect(defender.combatSheet).toMatchObject({ role: 'DEFENDER', steps: [{ label: 'Combat supply', status: 'current' }, { label: 'AR unit' }, { label: 'Terrain' }, { label: 'Roll' }, { label: 'Results' }] });
    // Answer every pending decision, handing over whenever the other side must choose, until the combat ends.
    for (let guard = 0; guard < 30; guard += 1) {
      const snapshot = controller.getSnapshot();
      if (snapshot.combatReports.some(({ status }) => status === 'RESOLVED')) break;
      if (snapshot.decision) {
        if (snapshot.decision.kind === 'DEFENDER_LEAD') expect(snapshot.decision.options[0]!.label).toMatch(/combat DRM [+−0-9]/u);
        await controller.respondToDecision(snapshot.decision.options[0]!.id);
      } else if (snapshot.handoff) handOff(controller);
      else break;
    }
    const resolved = controller.getSnapshot();
    const report = resolved.combatReports.find(({ status }) => status === 'RESOLVED')!;
    expect(report).toMatchObject({ kind: 'COMBAT', targetHexId: '6,5' });
    expect(report.result).toBeTruthy();
    expect(report.explanation).toMatch(/Attacker|No effect/u);
    expect(report.roll).toBeGreaterThanOrEqual(2);
    expect(report.facts?.odds).toBeTruthy();
    // The seat whose answer resolved the combat sees the result card until it dismisses it.
    expect(resolved.resultCard?.transactionId).toBe(report.transactionId);
    controller.dismissResult();
    expect(controller.getSnapshot().resultCard).toBeNull();
    // The other seat gets the same combat in "while you were away" when the screen comes back.
    const resolvedBy = resolved.view.seatId;
    handOff(controller);
    const back = controller.getSnapshot();
    expect(back.view.seatId).not.toBe(resolvedBy);
    expect(back.awayReport?.combats.map(({ transactionId }) => transactionId)).toContain(report.transactionId);
    expect(back.awayReport?.entries.length).toBeGreaterThan(0);
    controller.dismissAwayReport();
    expect(controller.getSnapshot().awayReport).toBeNull();
    // The log reads as sentences, not engine event codes.
    expect(controller.getSnapshot().feed.every(({ title }) => !/[A-Z]+_[A-Z]+/u.test(title))).toBe(true);
    controller.dispose();
  });

  it('shows move costs, lets a step be undone before any dice, and keeps one automatic checkpoint', async () => {
    const { fixture, controller } = await controllerFor();
    controller.start();
    if (controller.getSnapshot().view.projection?.sequence.segment === 'BREAKOUT') await controller.endStep();
    controller.selectPiece(fixture.units.attacker);
    const fuel = controller.getSnapshot().unitActions.find(({ group }) => group === 'FUEL')!;
    await controller.runAction(fuel.key);
    const selected = controller.getSnapshot();
    expect(selected.remainingTicks).toBeGreaterThan(0);
    const [destination, entry] = [...selected.moveRange.entries()].find(([hexId]) => hexId !== '6,5')!;
    expect(entry.costTicks).toBeGreaterThan(0);
    expect(entry.remainingAfterTicks).toBe(selected.remainingTicks! - entry.costTicks);
    const before = selected.selectedPiece!.location;
    await controller.clickHex(destination);
    await controller.clickHex(destination);
    expect(controller.getSnapshot().movedThisPhase.has(fixture.units.attacker)).toBe(true);
    expect(controller.getSnapshot().undoStep).not.toBeNull();
    await controller.undoStep();
    const undone = controller.getSnapshot();
    expect(undone.view.metadata.lifecycle).toBe('ACTIVE');
    expect(undone.view.projection?.stacks.flatMap(({ pieces }) => pieces).find(({ id }) => id === fixture.units.attacker)?.location).toEqual(before);
    await controller.endStep();
    expect(controller.getSnapshot().checkpoints.filter(({ label }) => label.startsWith('Auto: '))).toHaveLength(1);
    controller.dispose();
  });

  it('never reuses a checkpoint ID after one is removed and the save is reloaded', async () => {
    const { fixture } = await controllerFor();
    fixture.session.start();
    const first = fixture.session.createCheckpoint('first');
    const second = fixture.session.createCheckpoint('second');
    expect(fixture.session.removeCheckpoint(first.id)).toBe(true);
    const loaded = await fixture.engine.loadSession(fixture.session.serializeSave());
    const third = loaded.createCheckpoint('third');
    expect(third.id).not.toBe(second.id);
    expect(new Set(loaded.listCheckpoints().map(({ id }) => id)).size).toBe(loaded.listCheckpoints().length);
  });

  /** 8x8 contact game (seeds 92001-92004): on Game Turn 3 Axis moves into contact, so Allied's Reaction offers only dump blowing. */
  const reactionGame = async (skipDumpOnlySteps: boolean) => {
    // 8x8 is below the New Game minimum, so build it the way rule tests do rather than through the player orchestrator.
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const prepared = prepareNewGame({ ...CONTACT_NEW_GAME_REQUEST, startMonth: 10, turnLimit: 4 });
    if (!prepared.ok) throw new Error('game');
    const game = prepared.value;
    const session = await engine.createSession({
      scenario: game.scenario, configuration: game.configuration, rulesSeed: CONTACT_NEW_GAME_REQUEST.seeds.rules, bindings: game.bindings, label: 'contact',
    });
    session.start();
    const controller = createUiController({ engine, session, scenario: game.scenario, bindings: game.bindings, skipDumpOnlySteps });
    // Allied's dump is the supply that arrives at its first entry Hex. Nothing arrives on Game Turn 1 (13.6), and Axis wins the
    // Game Turn 2 turn order and moves before Allied's supply arrives, so the contact is made on Game Turn 3.
    await playUntil(controller, 3, 'MOVEMENT', game.bindings[1]!.playerId);
    const bremer = controller.getSnapshot().view.projection!.stacks.flatMap(({ pieces }) => pieces).find((piece) => unitLabel(game.scenario, piece).startsWith('KG Bremer'))!;
    controller.selectPiece(bremer.id);
    await controller.runAction(controller.getSnapshot().unitActions.find(({ label }) => label.includes('whole formation'))!.key);
    const destination = [...controller.getSnapshot().moveRange.keys()].find((hexId) => printedHexLabel(hexId) === '0205')!;
    await controller.clickHex(destination); await controller.clickHex(destination);
    // The Supply step is skipped now that no trace-route choice is offered, so one step fewer than before.
    await controller.endStep();
    return { controller, game };
  };

  it("passes the other player's dump-only Reaction without a hand-over, and says so", async () => {
    const { controller, game } = await reactionGame(true);
    const snapshot = controller.getSnapshot();
    expect(snapshot.view.projection?.sequence).toMatchObject({ phase: 'COMBAT', actingPlayerId: game.bindings[1]!.playerId });
    expect(snapshot.handoff).toBeNull();
    expect(snapshot.feed.some(({ title }) => title.includes('passed: only dump blowing was possible'))).toBe(true);
    controller.dispose();
  }, 30_000);

  it('still hands over the dump-only Reaction when the players turn the setting off', async () => {
    const { controller, game } = await reactionGame(false);
    const snapshot = controller.getSnapshot();
    expect(snapshot.view.projection?.sequence).toMatchObject({ phase: 'REACTION', actingPlayerId: game.bindings[0]!.playerId });
    expect(snapshot.handoff?.reason).toMatch(/Reaction Phase/u);
    controller.dispose();
  }, 30_000);

  it('offers a larger default operation and refuses player maps below the minimum', async () => {
    expect(DEFAULT_NEW_GAME_REQUEST).toMatchObject({ map: { width: 32, height: 24 }, turnLimit: 11 });
    const orchestrator = createNewGameOrchestrator(createGameplayEngine(createMemoryGameplayPorts()));
    const small = orchestrator.prepare({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: NEW_GAME_MAP_LIMITS.minWidth - 1, height: NEW_GAME_MAP_LIMITS.minHeight - 1 } });
    expect(small.ok).toBe(false);
    if (!small.ok) expect(small.error.map(({ code }) => code)).toEqual(['MAP_WIDTH_OUT_OF_RANGE', 'MAP_HEIGHT_OUT_OF_RANGE']);
    const minimum = orchestrator.prepare({ ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width: NEW_GAME_MAP_LIMITS.minWidth, height: NEW_GAME_MAP_LIMITS.minHeight } });
    expect(minimum.ok).toBe(true);
  });
});
