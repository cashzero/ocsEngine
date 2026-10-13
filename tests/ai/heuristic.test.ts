import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createHeuristicPolicy,
  createMemoryGameplayPorts,
  forecastBarrage,
  forecastCombat,
  prepareNewGame,
  respondToDecision,
  runBotMatch,
  type BotDecisionContext,
  type GameAction,
  type RuleFact,
  type Situation,
} from '../../src/index.js';

const facts = (entries: Record<string, string | number>): RuleFact[] =>
  Object.entries(entries).map(([key, value]) => ({ key, value, visibility: 'PUBLIC', ownerId: null }));

describe('combat and barrage forecasts from the printed tables', () => {
  it('expects more defender losses and fewer attacker losses at better odds', () => {
    const at = (column: string, drm = 0) => forecastCombat(facts({ 'combat.line': 'OPEN', 'combat.column': column, 'combat.odds': column, 'combat.drm': drm }))!;
    const even = at('1:1');
    const strong = at('5:1');
    expect(strong.defenderLosses + strong.defenderOptions).toBeGreaterThan(even.defenderLosses + even.defenderOptions);
    expect(strong.attackerLosses).toBeLessThan(even.attackerLosses);
    expect(at('3:1', 2).defenderHit).toBeGreaterThanOrEqual(at('3:1', 0).defenderHit);
    expect(even.defenderHit).toBeGreaterThan(0);
    expect(even.defenderHit).toBeLessThanOrEqual(1);
    // Odds beyond the printed columns use the best column.
    expect(at('60:1').columnIndex).toBe(12);
  });

  it('expects more disruption from higher barrage columns', () => {
    const at = (column: number) => forecastBarrage(facts({ 'barrage.finalColumn': column, 'barrage.supplyTokens': 2 }))!;
    expect(at(8).disrupt).toBeGreaterThan(at(3).disrupt);
    expect(at(10).expectedSteps).toBeGreaterThan(at(2).expectedSteps);
  });
});

describe('pending decisions answered in the deciding side\'s favour', () => {
  const contextFor = (kind: string, options: readonly { id: string; label: string; hexId: string | null }[]) => {
    const actions = options.map((option, index) => ({
      actionId: `a${index}`, actorId: 'player:axis', expectedRevision: 1, kind: 'RESPOND_DECISION', decisionId: 'd', choiceId: option.id,
    })) as unknown as GameAction[];
    const context = {
      playerId: 'player:axis',
      view: { pendingDecision: { id: 'd', kind, options, prompt: '', transactionId: null, stateRevision: 1 }, projection: { combat: null } },
      actions: { candidates: () => actions, explain: () => ({ current: true, explanation: {
        allowed: true, facts: facts({ 'supply.retreatForcedLosses': 0, 'supply.retreatUnfed': 0, 'supply.retreatTraceLost': 0 }),
      } }) },
    } as unknown as BotDecisionContext;
    const situation = {
      own: [], objectives: [], playerId: 'player:axis',
      threatAt: (hexId: string) => (hexId === '1,1' ? 9 : 1), friendlyAt: () => [],
    } as unknown as Situation;
    return { context, situation };
  };

  it('picks the defensive terrain with the lowest odds and the lead defender with the lowest DRM', () => {
    const terrain = contextFor('DEFENDER_TERRAIN', [
      { id: 'terrain:open', label: 'open: open line, 12 vs 3, 4:1', hexId: null },
      { id: 'terrain:city', label: 'city: extremely close line, 12 vs 6, 2:1', hexId: null },
    ]);
    expect(respondToDecision(terrain.context, terrain.situation)?.action).toMatchObject({ choiceId: 'terrain:city' });
    const lead = contextFor('DEFENDER_LEAD', [
      { id: 'lead:a', label: 'A (AR 2): combat DRM +2', hexId: null },
      { id: 'lead:b', label: 'B (AR 4): combat DRM 0', hexId: null },
      { id: 'lead:c', label: 'C (AR 5): combat DRM −1', hexId: null },
    ]);
    expect(respondToDecision(lead.context, lead.situation)?.action).toMatchObject({ choiceId: 'lead:c' });
  });

  it('breaks equal retreat supply risk by threat and pays combat supply instead of defending unsupplied', () => {
    const retreat = contextFor('RETREAT_HEX', [
      { id: 'hex:1,1', label: 'to 1,1', hexId: '1,1' },
      { id: 'hex:2,2', label: 'to 2,2', hexId: '2,2' },
    ]);
    expect(respondToDecision(retreat.context, retreat.situation)?.action).toMatchObject({ choiceId: 'hex:2,2' });
    const supply = contextFor('SUPPLY_SOURCE', [
      { id: 'withhold', label: 'No combat supply: defend at half strength', hexId: null },
      { id: 'pay:dump-a:1', label: 'Pay 1T from the dump at 3,3 (2T available)', hexId: '3,3' },
      { id: 'pay:dump-b:2', label: 'Pay 2T from the dump at 4,4 (9T available)', hexId: '4,4' },
    ]);
    expect(respondToDecision(supply.context, supply.situation)?.action).toMatchObject({ choiceId: 'pay:dump-b:2' });
  });
});

describe('heuristic policy', () => {
  it('plays a generated game to the end through legal actions only, on either side', async () => {
    const prepared = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, turnLimit: 2 });
    if (!prepared.ok) throw new Error('game did not generate');
    const engine = createGameplayEngine(createMemoryGameplayPorts());
    const session = await engine.createSession({
      scenario: prepared.value.scenario, configuration: prepared.value.configuration,
      rulesSeed: DEFAULT_NEW_GAME_REQUEST.seeds.rules, bindings: prepared.value.bindings, label: 'heuristic test', persistence: 'MANUAL',
    });
    session.start();
    const policy = createHeuristicPolicy({ scenario: prepared.value.scenario, turnLimit: 2 });
    const result = await runBotMatch({
      session, maxActions: 3_000,
      seats: prepared.value.bindings.map(({ seatId, playerId }, index) => ({ seatId, playerId, policy, seed: 7 + index })),
    });
    expect(result.stopReason).toBe('FINISHED');
    expect(result.errors).toEqual([]);
    expect(Object.values(result.actionCountsBySeat).every((counts) => (counts.MOVE_PIECE ?? 0) > 0)).toBe(true);
    const loaded = await engine.loadSession(session.serializeSave());
    expect(loaded.getMetadata().stateHash).toBe(session.getMetadata().stateHash);
  }, 120_000);
});
