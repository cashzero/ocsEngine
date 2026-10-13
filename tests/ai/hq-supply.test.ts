import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createBotRng, createHeuristicPolicy, parseGameStateJson, pieceHasTrace, ruleEngine,
  type BotDecisionContext, type BotPhaseMemory, type GameAction, type GameState,
} from '../../src/index.js';
import { isCombatUnit, isHq } from '../../src/rules/pieces.js';
import { afterRequiredRecovery, rationPlan } from '../../src/rules/supply/ration-budget.js';
import { unitsNeedingRecovery } from '../../src/rules/supply/supply.js';

const load = (name: string) => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', `${name}.state.json.gz`))).toString()) as { snapshot: string; action: GameAction };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid recorded position');
  return { state: parsed.value, action: stored.action };
};

const traceLosses = (before: GameState, after: GameState, actorId: GameAction['actorId']) =>
  before.pieceState.pieces.filter(piece => piece.ownerId === actorId && piece.location.kind === 'ON_MAP'
    && isCombatUnit(before, piece) && pieceHasTrace(before, piece)
    && !pieceHasTrace(after, after.pieceState.pieces.find(next => next.id === piece.id)!)).map(piece => piece.id);

const context = (state: GameState, memory: BotPhaseMemory): BotDecisionContext => {
  const actorId = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  return {
    seatId: 'seat:regression' as BotDecisionContext['seatId'],
    playerId: actorId, memory, rng: createBotRng(7, 'supply-regression', 0),
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(family => family.enabled).map(family => family.kind),
      movementRange: pieceId => ruleEngine.queryMovementRange(state, actorId, pieceId).value!,
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (pieceId = null) => ruleEngine.queryTraceCoverage(state, actorId, pieceId).value!,
      feedCoverage: (pieceId = null) => ruleEngine.queryFeedCoverage(state, actorId, pieceId).value!,
    },
  };
};

describe('shared ration commitments in recorded games', () => {
  it.each(['ration-fuel-1210100', 'ration-hedgehog-1210002'])('detects unaffordable optional spending in %s without mutation', name => {
    const { state, action } = load(name);
    const original = JSON.stringify(state);
    const facts = ruleEngine.explain(state, action).facts;
    expect(facts.find(f => f.key === 'supply.rationCommitmentsPreserved')?.value).toBe(false);
    expect(facts.find(f => f.key === 'supply.rationSearchExhausted')?.value).toBe(false);
    expect(JSON.stringify(state)).toBe(original);
    expect(facts.filter(f => f.key.startsWith('supply.ration')).every(f => f.visibility === 'OWNER_ONLY' && f.ownerId === action.actorId)).toBe(true);
    // The historical expense remains legal; budgeting is policy, not a new game restriction.
    expect(ruleEngine.applyAction(state, action).ok).toBe(true);
  });

  it('pays the recorded group plan through real CHECK_SUPPLY actions with exact stock deduction', () => {
    let { state, action: original } = load('ration-group-1210102');
    const plan = rationPlan(state, original.actorId);
    expect(plan.exhausted).toBe(false);
    expect(plan.demands.length).toBeGreaterThan(8);
    for (const group of plan.groups) {
      const before = state.pieceState.pieces.find(p => p.id === group.sourcePieceId)!.resourceQuantity!;
      const action: GameAction = { ...original, expectedRevision: state.revision, kind: 'CHECK_SUPPLY', sourcePieceId: group.sourcePieceId, pieceIds: group.pieceIds };
      const next = ruleEngine.applyAction(state, action);
      if (!next.ok) throw new Error(JSON.stringify(next));
      expect(next.state.pieceState.pieces.find(p => p.id === group.sourcePieceId)!.resourceQuantity).toBe(before - group.tokens);
      state = next.state;
    }
    for (const d of plan.demands) expect(state.usage.find(u => u.pieceId === d.id)?.supplyPaid).toBe(true);
  });

  it('reserves mandatory internal recovery using the same payments as actual execution', () => {
    let { state, action } = load('ration-recovery-1210006');
    const actorId = action.actorId;
    const predicted = afterRequiredRecovery(state, actorId);
    expect(unitsNeedingRecovery(state, actorId).length).toBeGreaterThan(0);
    expect(ruleEngine.getActionCandidates(state, { kind: 'CHECK_SUPPLY', actorId, pieceId: null, budget: 200 }).actions).toEqual([]);
    for (let i = 0; unitsNeedingRecovery(state, actorId).length; i++) {
      expect(i).toBeLessThan(50);
      const recovery = ruleEngine.getActionCandidates(state, { kind: 'RECOVER_INTERNALS', actorId, pieceId: null, budget: 1 }).actions[0]!;
      const next = ruleEngine.applyAction(state, recovery);
      if (!next.ok) throw new Error('Required recovery rejected');
      state = next.state;
    }
    expect(state.pieceState.pieces.map(p => [p.id, p.resourceQuantity, p.location])).toEqual(predicted.pieceState.pieces.map(p => [p.id, p.resourceQuantity, p.location]));
    expect(rationPlan(state, actorId).groups).toEqual(rationPlan(load('ration-recovery-1210006').state, actorId).groups);
  });

  it.each(['ration-fuel-1210100', 'ration-hedgehog-1210002', 'ration-group-1210102', 'ration-recovery-1210006'])('executes %s through the next friendly Supply and pending attrition', name => {
    let { state, action: original } = load(name);
    const actorId = original.actorId;
    const committed = new Set(rationPlan(state, actorId).demands.map(d => d.id));
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const memories = new Map<string, BotPhaseMemory>();
    let supplied = false, decisions = 0, grouped = 0, lostCommitted = 0;
    for (; decisions < 300; decisions++) {
      if (supplied && !state.pendingDecision) break;
      const owner = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
      const key = `${owner}:${state.sequence.gameTurn}:${state.sequence.phase}:${state.sequence.segment}`;
      if (!memories.has(key)) memories.set(key, { stepKey: key, actions: 0, notes: new Map() });
      const chosen = policy.decide(context(state, memories.get(key)!));
      if (!chosen) throw new Error('Policy stalled');
      if (['PAY_FUEL', 'BUILD_HEDGEHOG'].includes(chosen.action.kind)) {
        expect(ruleEngine.explain(state, chosen.action).facts.find(f => f.key === 'supply.rationCommitmentsPreserved')?.value).toBe(true);
      }
      if (chosen.action.kind === 'CHECK_SUPPLY' && chosen.action.pieceIds.length > 1) grouped++;
      const next = ruleEngine.applyAction(state, chosen.action);
      if (!next.ok) throw new Error(`Rejected ${chosen.action.kind}`);
      if (state.pendingDecision?.kind === 'ATTRITION_LOSS' || next.events.some(e => e.kind === 'ATTRITION_ROLLED')) {
        lostCommitted += next.events.filter(e => e.kind === 'STEP_LOST' && committed.has(e.pieceId)).length;
      }
      if (next.events.some(e => e.kind === 'SEQUENCE_ADVANCED' && e.from.phase === 'SUPPLY' && e.from.phasingPlayerId === actorId)) supplied = true;
      state = next.state;
    }
    expect(supplied).toBe(true);
    expect(state.pendingDecision).toBeNull();
    expect(decisions).toBeLessThan(300);
    expect(lostCommitted).toBe(0);
    if (name === 'ration-group-1210102') expect(grouped).toBeGreaterThan(0);
  }, 60_000);
});

describe('HQ supply continuity in recorded bot games', () => {
  it.each([
    ['hq-mode-supply', 1], ['hq-move-supply', 7],
  ] as const)('forecasts the actual units stranded by %s without changing the state or RNG', (name, expected) => {
    const { state, action } = load(name);
    const snapshot = JSON.stringify(state);
    const facts = ruleEngine.explain(state, action).facts;
    expect(JSON.stringify(state)).toBe(snapshot);
    const next = ruleEngine.applyAction(state, action);
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error('Recorded action rejected');
    const lost = traceLosses(state, next.state, action.actorId);
    expect(lost).toHaveLength(expected);
    expect(facts.find(f => f.key === 'supply.hqRelocationTraceLost')?.value).toBe(lost.length);
    expect(facts.find(f => f.key === 'supply.hqRelocationTraceLostIds')?.value).toBe(lost.join(','));
    expect(facts.filter(f => f.key.startsWith('supply.hq')).every(f => f.visibility === 'OWNER_ONLY' && f.ownerId === action.actorId)).toBe(true);
  });

  it.each(['hq-mode-supply', 'hq-move-supply'])('plays the movement segment from %s without its HQ stranding friendly units', (name) => {
    let { state } = load(name);
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const memory: BotPhaseMemory = { stepKey: 'recorded-movement', actions: 0, notes: new Map() };
    let moved = 0;
    let ended = false;
    for (let i = 0; i < 120; i++) {
      const chosen = policy.decide(context(state, memory));
      expect(chosen).not.toBeNull();
      const action = chosen!.action;
      if (action.kind === 'ADVANCE_SEQUENCE') { ended = true; break; }
      const next = ruleEngine.applyAction(state, action);
      if (!next.ok) throw new Error(`Rejected ${action.kind}`);
      if ((action.kind === 'MOVE_PIECE' || action.kind === 'CHANGE_MODE') && isHq(state, state.pieceState.pieces.find(p => p.id === action.pieceId)!)) {
        expect(traceLosses(state, next.state, action.actorId)).toEqual([]);
        // Rejected dispatches must not fall back to unchecked HQ moves.
        expect(chosen!.alternatives).toEqual([]);
      }
      if (action.kind === 'MOVE_PIECE') moved++;
      state = next.state;
    }
    expect(ended).toBe(true);
    expect(moved).toBeGreaterThan(0);
  }, 30_000);

  it('allows safe HQ destinations while rejecting the recorded relocation', () => {
    const { state, action } = load('hq-move-supply');
    if (action.kind !== 'MOVE_PIECE') throw new Error('Expected recorded HQ move');
    const candidates = ruleEngine.getActionCandidates(state, { actorId: action.actorId, kind: 'MOVE_PIECE', pieceId: action.pieceId, budget: 400 }).actions;
    const safe = candidates.find(candidate => ruleEngine.explain(state, candidate).facts
      .some(fact => fact.key === 'supply.hqRelocationTraceLost' && fact.value === 0));
    expect(safe).toBeDefined();
    const next = ruleEngine.applyAction(state, safe!);
    if (!next.ok) throw new Error('Safe HQ move rejected');
    expect(traceLosses(state, next.state, action.actorId)).toEqual([]);
  });
});

describe('supply routes protected by combat units in recorded bot games', () => {
  it.each(['unit-relocation-1210107', 'unit-relocation-1210105'])('detects other units cut off by %s, including all legal destinations', (name) => {
    const { state, action } = load(name);
    if (action.kind !== 'MOVE_PIECE') throw new Error('Expected move');
    const before = JSON.stringify(state);
    const facts = ruleEngine.explain(state, action).facts;
    expect(facts.find(f => f.key === 'supply.relocationOtherTraceLost')?.value).toBe(2);
    const next = ruleEngine.applyAction(state, action);
    if (!next.ok) throw new Error('Recorded move rejected');
    const expected = traceLosses(state, next.state, action.actorId).filter(id => id !== action.pieceId);
    expect(facts.find(f => f.key === 'supply.relocationOtherTraceLostIds')?.value).toBe(expected.join(','));
    expect(JSON.stringify(state)).toBe(before);
    const candidates = ruleEngine.getActionCandidates(state, { actorId: action.actorId, kind: 'MOVE_PIECE', pieceId: action.pieceId, budget: 400 }).actions;
    for (const move of candidates) {
      const after = ruleEngine.applyAction(state, move);
      if (!after.ok) throw new Error('Candidate rejected');
      const lost = traceLosses(state, after.state, action.actorId).filter(id => id !== action.pieceId);
      expect(ruleEngine.explain(state, move).facts.find(f => f.key === 'supply.relocationOtherTraceLost')?.value).toBe(lost.length);
    }
  }, 30_000);

  it.each(['unit-relocation-1210107', 'unit-relocation-1210105'])('completes movement and Supply from %s without its moves cutting off other units', (name) => {
    let { state, action: badMove } = load(name);
    const actorId = badMove.actorId;
    const originalTurn = state.sequence.gameTurn;
    const originallySupplied = state.pieceState.pieces.filter(p => p.ownerId === actorId && p.location.kind === 'ON_MAP'
      && isCombatUnit(state, p) && pieceHasTrace(state, p)).map(p => p.id);
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    let memory: BotPhaseMemory = { stepKey: '', actions: 0, notes: new Map() };
    let moved = 0;
    let supplied = false;
    let attritionLosses = 0;
    for (let i = 0; i < 200; i++) {
      const key = `${state.sequence.gameTurn}:${state.sequence.phase}:${state.sequence.segment}`;
      if (memory.stepKey !== key) memory = { stepKey: key, actions: 0, notes: new Map() };
      if (state.sequence.phase === 'SUPPLY' || state.sequence.phase === 'REACTION') supplied = true;
      if (supplied && state.sequence.phase === 'REACTION' && !state.pendingDecision) break;
      const chosen = policy.decide(context(state, memory));
      if (!chosen) throw new Error('Policy stalled');
      const action = chosen.action;
      const next = ruleEngine.applyAction(state, action);
      if (!next.ok) throw new Error(`Rejected ${action.kind}`);
      if (action.kind === 'MOVE_PIECE' || action.kind === 'CHANGE_MODE') {
        const piece = state.pieceState.pieces.find(p => p.id === action.pieceId)!;
        if (isCombatUnit(state, piece)) {
          expect(traceLosses(state, next.state, actorId), JSON.stringify({ action, sequence: state.sequence, facts: ruleEngine.explain(state, action).facts })).toEqual([]);
          expect(chosen.alternatives).toEqual([]);
          if (action.kind === 'MOVE_PIECE') moved++;
        }
      }
      if (state.pendingDecision?.kind === 'ATTRITION_LOSS' || next.events.some(e => e.kind === 'ATTRITION_ROLLED')) {
        const losses = next.events.filter(e => e.kind === 'STEP_LOST' && originallySupplied.includes(e.pieceId));
        attritionLosses += losses.length;
      }
      state = next.state;
    }
    expect(supplied).toBe(true);
    expect(state.sequence.gameTurn).toBe(originalTurn);
    expect(state.sequence.phase).not.toBe('SUPPLY');
    expect(moved).toBeGreaterThan(0);
    expect(attritionLosses).toBe(0);
  }, 30_000);
});

describe('SP consumers and retreats in recorded bot games', () => {
  it('forecasts the consumers abandoned by the truck, without changing control or RNG', async () => {
    const { availableRationTokens } = await import('../../src/rules/supply/relocation-impact.js');
    const { state, action } = load('truck-feed-1210102');
    if (action.kind !== 'MOVE_PIECE') throw new Error('Expected truck move');
    const snapshot = JSON.stringify(state);
    const facts = ruleEngine.explain(state, action).facts;
    expect(String(facts.find(f => f.key === 'supply.relocationFeedLostIds')?.value)).toContain(':axis:f4-combat-1:unit');
    const candidates = ruleEngine.getActionCandidates(state, { actorId: action.actorId, kind: 'MOVE_PIECE', pieceId: action.pieceId, budget: 400 }).actions;
    let safe = 0;
    for (const move of candidates) {
      const next = ruleEngine.applyAction(state, move);
      if (!next.ok) throw new Error('Candidate rejected');
      expect(next.state.mapState.hexControl).toEqual(state.mapState.hexControl);
      const lost = state.pieceState.pieces.filter(p => p.ownerId === action.actorId && p.location.kind === 'ON_MAP'
        && isCombatUnit(state, p) && !pieceHasTrace(state, p)
        && availableRationTokens(next.state, next.state.pieceState.pieces.find(n => n.id === p.id)!) < availableRationTokens(state, p));
      expect(ruleEngine.explain(state, move).facts.find(f => f.key === 'supply.relocationFeedLostIds')?.value).toBe(lost.map(p => p.id).join(','));
      if (!lost.length) safe++;
    }
    expect(safe).toBeGreaterThan(0);
    expect(JSON.stringify(state)).toBe(snapshot);
  }, 30_000);

  it.each(['retreat-supply-1210106', 'retreat-supply-1210200'])('uses a supplied legal retreat from %s and finishes combat resolution', name => {
    let { state, action: old } = load(name);
    const snapshot = JSON.stringify(state);
    const actorId = old.actorId;
    const options = ruleEngine.getActionCandidates(state, { actorId, kind: 'RESPOND_DECISION', pieceId: null, budget: 400 }).actions;
    for (const option of options) {
      if (option.kind !== 'RESPOND_DECISION' || !/^(hex:|with:)/u.test(option.choiceId)) continue;
      const preview = ruleEngine.explain(state, option).facts;
      const actual = ruleEngine.applyAction(state, option);
      if (!actual.ok) throw new Error('Candidate retreat rejected');
      expect(preview.find(f => f.key === 'supply.retreatTraceLost')?.value).toBe(traceLosses(state, actual.state, actorId).length);
    }
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const memory: BotPhaseMemory = { stepKey: 'retreat', actions: 0, notes: new Map() };
    const chosen = policy.decide(context(state, memory))!;
    expect(chosen.action).not.toEqual(old);
    expect(chosen.alternatives).toEqual([]);
    const facts = ruleEngine.explain(state, chosen.action).facts;
    expect(facts.find(f => f.key === 'supply.retreatTraceLost')?.value).toBe(0);
    expect(JSON.stringify(state)).toBe(snapshot);
    const next = ruleEngine.applyAction(state, chosen.action);
    if (!next.ok) throw new Error('Retreat rejected');
    expect(traceLosses(state, next.state, actorId)).toEqual([]);
    state = next.state;
    for (let i = 0; state.activeTransaction && i < 80; i++) {
      const choice = policy.decide(context(state, memory));
      if (!choice) throw new Error('Combat resolution stalled');
      const applied = ruleEngine.applyAction(state, choice.action);
      if (!applied.ok) throw new Error('Combat response rejected');
      state = applied.state;
    }
    expect(state.activeTransaction).toBeNull();
  }, 30_000);

  it('still resolves a forced retreat when no destination has supply', () => {
    const stored = load('retreat-supply-1210106');
    const state = { ...stored.state, scenario: { ...stored.state.scenario, sources: [] },
      pieceState: { ...stored.state.pieceState, pieces: stored.state.pieceState.pieces.map(p =>
        p.resourceQuantity === null ? p : { ...p, resourceQuantity: 0 }) } };
    expect(ruleEngine.queryTraceCoverage(state, stored.action.actorId, null).value!.hexIds).toEqual([]);
    expect(ruleEngine.queryFeedCoverage(state, stored.action.actorId, null).value).toEqual([]);
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const chosen = policy.decide(context(state, { stepKey: 'retreat', actions: 0, notes: new Map() }));
    expect(chosen).not.toBeNull();
    expect(chosen!.action.kind).toBe('RESPOND_DECISION');
    expect(ruleEngine.applyAction(state, chosen!.action).ok).toBe(true);
  });

  it.each(['truck-feed-1210102', 'retreat-supply-1210106', 'retreat-supply-1210200'])('plays from %s through the next own Supply and all its pending losses', name => {
    let { state, action: original } = load(name);
    const actorId = original.actorId;
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const memories = new Map<string, BotPhaseMemory>();
    let supplied = false;
    let decisions = 0;
    let targetAttrition = 0;
    for (; decisions < 700; decisions++) {
      if (supplied && !state.pendingDecision) break;
      const owner = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
      const key = `${owner}:${state.sequence.gameTurn}:${state.sequence.phase}:${state.sequence.segment}`;
      if (!memories.has(key)) memories.set(key, { stepKey: key, actions: 0, notes: new Map() });
      const chosen = policy.decide(context(state, memories.get(key)!));
      if (!chosen) throw new Error('Policy stalled');
      const next = ruleEngine.applyAction(state, chosen.action);
      if (!next.ok) throw new Error(`Rejected ${chosen.action.kind}`);
      if (state.pendingDecision?.kind === 'ATTRITION_LOSS' || next.events.some(e => e.kind === 'ATTRITION_ROLLED')) {
        targetAttrition += next.events.filter(e => e.kind === 'STEP_LOST' && String(e.pieceId).endsWith(':axis:f4-combat-1:unit')).length;
      }
      if (next.events.some(e => e.kind === 'SEQUENCE_ADVANCED' && e.from.phase === 'SUPPLY' && e.from.phasingPlayerId === actorId)) supplied = true;
      state = next.state;
    }
    expect(supplied).toBe(true);
    expect(state.pendingDecision).toBeNull();
    expect(decisions).toBeLessThan(700);
    if (name === 'truck-feed-1210102') expect(targetAttrition).toBe(0);
  }, 60_000);
});
