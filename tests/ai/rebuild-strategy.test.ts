import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, parseGameStateJson, ruleEngine,
  type BotDecisionContext, type GameAction, type GameState } from '../../src/index.js';
import { replacementsAt } from '../../src/rules/replacement/replacement.js';

const load = (name: string) => {
  const record = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', `${name}.state.json.gz`))).toString()) as { snapshot: string; action: Extract<GameAction, { kind: 'REBUILD_UNITS' }>; uselessIds: string[] };
  const parsed = parseGameStateJson(record.snapshot);
  if (!parsed.ok) throw new Error('Invalid recorded state');
  return { ...record, state: parsed.value };
};
const context = (state: GameState): BotDecisionContext => {
  const actorId = state.sequence.actingPlayerId;
  return { seatId: 'seat:rebuild' as BotDecisionContext['seatId'], playerId: actorId,
    rng: createBotRng(7, 'rebuild', 0), memory: { stepKey: 'rebuild', actions: 0, notes: new Map() },
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      movementRange: id => ruleEngine.queryMovementRange(state, actorId, id).value!,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (id = null) => ruleEngine.queryTraceCoverage(state, actorId, id).value!,
      feedCoverage: (id = null) => ruleEngine.queryFeedCoverage(state, actorId, id).value!,
      drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
    } };
};

describe('replacement spending for VP strategy', () => {
  it('preserves Pax when only a stranded fixed garrison can be rebuilt at the HQ', () => {
    const { state, action, uselessIds } = load('vp-rebuild-1217101-119');
    const before = replacementsAt(state, action.actorId, action.hexId, 'PAX');
    const chosen = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }).decide(context(state))!;
    if (chosen.action.kind === 'REBUILD_UNITS') expect(chosen.action.units.every(u => !uselessIds.includes(u.pieceId))).toBe(true);
    const result = ruleEngine.applyAction(state, chosen.action);
    if (!result.ok) throw new Error('Policy action rejected');
    expect(replacementsAt(result.state, action.actorId, action.hexId, 'PAX')).toBeGreaterThanOrEqual(before);
    for (const id of uselessIds) expect(result.state.pieceState.pieces.find(p => p.id === id)?.location.kind).toBe('ELIMINATED');
  });

  it.each(['vp-rebuild-1217101-270', 'vp-rebuild-1217101-273'])('spends the same Pax on a usable unit in %s', name => {
    const { state, action, uselessIds } = load(name);
    const before = replacementsAt(state, action.actorId, action.hexId, 'PAX');
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const chosen = policy.decide(context(state))!;
    expect(chosen.action.kind).toBe('REBUILD_UNITS');
    if (chosen.action.kind !== 'REBUILD_UNITS') throw new Error('No useful rebuild selected');
    expect(chosen.action.units.every(u => !uselessIds.includes(u.pieceId))).toBe(true);
    const result = ruleEngine.applyAction(state, chosen.action);
    if (!result.ok) throw new Error('Rebuild rejected');
    expect(replacementsAt(result.state, action.actorId, action.hexId, 'PAX')).toBe(before - 1);
    for (const u of chosen.action.units) expect(result.state.pieceState.pieces.find(p => p.id === u.pieceId)?.location).toEqual({ kind: 'ON_MAP', hexId: chosen.action.hexId });
  });

  it('forecasts the real strength change without mutation or dice consumption', () => {
    const { state, action } = load('vp-rebuild-1217101-273');
    const snapshot = JSON.stringify(state);
    const explanation = ruleEngine.explain(state, action);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(explanation.facts.filter(f => f.key.startsWith('replacement.')).every(f => f.visibility === 'OWNER_ONLY' && f.ownerId === action.actorId)).toBe(true);
    const result = ruleEngine.applyAction(state, action);
    if (!result.ok) throw new Error('Historical rebuild rejected');
    expect(result.state.rng).toEqual(state.rng);
    expect(explanation.facts.find(f => f.key === 'replacement.addedCombatStrength')?.value).toBe(1);
  });
});
