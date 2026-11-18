import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, heuristicWeights, parseGameStateJson, ruleEngine,
  type BotDecision, type BotDecisionContext, type GameState, type HexId } from '../../src/index.js';

// 2800303 of heuristic@88's independent batch (Eastern Europe, docs/quality/evidence/ai-s5-v88-independent-2026-11-17/README.md).
// extender-site-2800303: Game Turn 3, the start of the attacker's Movement segment. Its five objectives out of hand lie 8 to 11
// hexes beyond its trace, and no HQ the current sources feed could throw to them (docs/quality/evidence/ai-s13-trace-front-2026-11-18/README.md).
// extender-gathered-2800303: Game Turn 4, the start of the attacker's Movement segment, after extenderPlan sent three empty trucks
// (3, 1 and 1 Transport Points) to -1,17 in Game Turn 3.
const fixture = (name: string): GameState => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', `${name}.state.json.gz`))).toString()) as { snapshot: string };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid extender fixture');
  return parsed.value;
};
const SITE = '-1,17' as HexId;
const contextOf = (state: GameState): BotDecisionContext => {
  const actorId = state.sequence.actingPlayerId;
  return { seatId: 'seat:extender' as BotDecisionContext['seatId'], playerId: actorId, memory: { stepKey: 'extender', actions: 0, notes: new Map() },
    rng: createBotRng(7, 'extender', 0),
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision, stateRevision: state.revision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      movementRange: id => ruleEngine.queryMovementRange(state, actorId, id).value!,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (id = null) => ruleEngine.queryTraceCoverage(state, actorId, id).value!,
      feedCoverage: (id = null) => ruleEngine.queryFeedCoverage(state, actorId, id).value!,
      drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
      attackStrength: (attackerIds, targetHexId) => ruleEngine.queryAttackStrength(state, actorId, attackerIds, targetHexId).value!,
      projectedReach: (pieceId, fromHexId, mode) => ruleEngine.queryProjectedReach(state, actorId, pieceId, fromHexId, mode).value!,
      hqThrow: (hqId, fromHexId) => ruleEngine.queryHqThrow(state, actorId, hqId, fromHexId).value!,
      railArrivalReach: (fromHexId) => (ruleEngine.queryRailArrivalReach(state, actorId, fromHexId).value ?? []).map(({ hexId }) => hexId),
      extenderSite: (hexId) => ruleEngine.queryExtenderSite(state, actorId, hexId).value ?? { linked: false, drawHexIds: [] },
      traceCut: (pieceId, hexId, mode) => ruleEngine.queryTraceCut(state, actorId, pieceId, hexId, mode).value?.cutIds ?? [],
    } };
};
const decide = (state: GameState, extenderPlan: number): BotDecision => {
  const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit },
    { weights: heuristicWeights({ extenderPlan }) });
  const chosen = policy.decide(contextOf(state));
  if (!chosen) throw new Error('No decision');
  return chosen;
};
const apply = (state: GameState, { action }: BotDecision): GameState => {
  const result = ruleEngine.applyAction(state, action);
  expect(result.state.revision).toBeGreaterThan(state.revision);
  return result.state;
};
const EXTENDER_KINDS = ['COMBINE_TRANSPORT', 'DIVIDE_TRANSPORT', 'FORM_EXTENDER'];

describe('Extender sites (12.7a)', () => {
  it('reports whether an Extender would link in a hex and where it would draw', () => {
    const state = fixture('extender-site-2800303');
    const attackerId = state.configuration.attackVictory!.attackerId;
    const site = ruleEngine.queryExtenderSite(state, attackerId, SITE).value!;
    expect(site.linked).toBe(true);
    expect(site.drawHexIds.map(String)).toContain(String(SITE));
    // The defended objective -3,12 is in the enemy's hands: no source there (12.6a).
    expect(ruleEngine.queryExtenderSite(state, attackerId, '-3,12' as HexId).value).toEqual({ linked: false, drawHexIds: [] });
  });
});

describe('extenderPlan (bot-extender)', () => {
  it('sends a truck to the Extender site when on, and plans no Extender when off', () => {
    const state = fixture('extender-site-2800303');
    const on = decide(state, 2);
    expect(on.action.kind).toBe('MOVE_PIECE');
    expect(on.action.kind === 'MOVE_PIECE' && String(on.action.path.at(-1))).toBe(String(SITE));
    expect(on.breakdown.some(({ term }) => term === 'extender')).toBe(true);
    const off = decide(state, 0);
    expect(off.breakdown.some(({ term }) => term === 'extender')).toBe(false);
  });

  it('combines the gathered trucks into five Transport Points and forms the Extender, which becomes a Supply Source', () => {
    let state = fixture('extender-gathered-2800303');
    const attackerId = state.configuration.attackVictory!.attackerId;
    const before = ruleEngine.queryTraceCoverage(state, attackerId, null).value!.hexIds.length;
    expect(EXTENDER_KINDS).not.toContain(decide(state, 0).action.kind);
    const combine = decide(state, 2);
    expect(combine.action.kind).toBe('COMBINE_TRANSPORT');
    state = apply(state, combine);
    const form = decide(state, 2);
    expect(form.action.kind).toBe('FORM_EXTENDER');
    state = apply(state, form);
    expect(ruleEngine.querySupplySources(state, attackerId).value!.some(({ hexId, kind }) => String(hexId) === String(SITE) && kind === 'EXTENDER')).toBe(true);
    expect(ruleEngine.queryTraceCoverage(state, attackerId, null).value!.hexIds.length).toBeGreaterThan(before);
    // One Extender a side: none is planned once it stands.
    expect(EXTENDER_KINDS).not.toContain(decide(state, 2).action.kind);
  });
});
