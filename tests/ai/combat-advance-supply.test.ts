import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { HexId } from '../../src/core/index.js';
import { createBotRng, createHeuristicPolicy, parseGameStateJson, pieceHasTrace, ruleEngine,
 type BotDecisionContext, type BotPhaseMemory, type GameAction, type GameState } from '../../src/index.js';
import { availableRationTokens } from '../../src/rules/supply/relocation-impact.js';
import { reTicksOf, usageOf, withUsage } from '../../src/rules/pieces.js';
import { eatOffMapCost } from '../../src/rules/supply/supply.js';
import { advanceRationsPreserved } from '../../src/rules/supply/ration-budget.js';
const fixture = (match: number) => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname,'fixtures',`advance-${match}.state.json.gz`))).toString()) as {snapshot: string; action: GameAction};
  const parsed = parseGameStateJson(stored.snapshot); if (!parsed.ok) throw Error('Invalid recorded position');
  return {...stored,state:parsed.value};
};
const context = (state: GameState, memory: BotPhaseMemory): BotDecisionContext => {
  const actorId = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  return { seatId: 'seat:vp-advance' as BotDecisionContext['seatId'], playerId: actorId, memory, rng: createBotRng(7, 'vp-advance', 0),
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      movementRange: id => ruleEngine.queryMovementRange(state, actorId, id).value!,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (id = null) => ruleEngine.queryTraceCoverage(state, actorId, id).value!,
      feedCoverage: (id = null) => ruleEngine.queryFeedCoverage(state, actorId, id).value!,
      drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
      attackStrength: (ids, hexId) => ruleEngine.queryAttackStrength(state, actorId, ids, hexId).value,
    } };
};

describe('supply after combat advances in recorded games', () => {
  it('forecasts next Supply after combat reservations are released, matching the actual final advance', () => {
    const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'advance-reservations-1287102.state.json.gz'))).toString()) as { snapshot: string; action: GameAction };
    const parsed = parseGameStateJson(stored.snapshot);
    if (!parsed.ok || stored.action.kind !== 'RESPOND_DECISION') throw Error('Invalid reservation-release fixture');
    const before = parsed.value, snapshot = JSON.stringify(before);
    const explanation = ruleEngine.explain(before, stored.action);
    const result = ruleEngine.applyAction(before, stored.action);
    if (!result.ok) throw Error('Recorded final advance rejected');
    expect(result.state.activeTransaction).toBeNull();
    const id = stored.action.choiceId.slice('advance:'.length) as typeof before.pieceState.pieces[number]['id'];
    expect(explanation.facts.find(f => f.key === 'supply.advanceFunded')?.value).toBe(advanceRationsPreserved(before, result.state, stored.action.actorId, [id]));
    expect(JSON.stringify(before)).toBe(snapshot);
  });
  it.each([[8, false], [20, true]] as const)('with %iT distinguishes shared ration commitments from individual access', (tokens, funded) => {
    const stored = fixture(1271046), action = stored.action;
    if (action.kind !== 'RESPOND_DECISION') throw Error('No recorded advance');
    const dump = stored.state.pieceState.pieces.find(p => String(p.id).includes('allied:independent-supply-2'))!;
    const state: GameState = { ...stored.state, pieceState: { ...stored.state.pieceState,
      pieces: stored.state.pieceState.pieces.map(p => p.id === dump.id ? { ...p, resourceQuantity: tokens,
        location: { kind: 'ON_MAP', hexId: '7,16' as HexId } } : p) } };
    const explanation = ruleEngine.explain(state, action);
    expect(explanation.allowed).toBe(true);
    expect(explanation.facts.find(f => f.key === 'supply.advanceFunded')?.value).toBe(funded);
    const next = ruleEngine.applyAction(state, action);
    if (!next.ok) throw Error('Funded-operation probe rejected');
    const unit = next.state.pieceState.pieces.find(p => p.id === action.choiceId.slice('advance:'.length))!;
    expect(pieceHasTrace(next.state, unit)).toBe(false);
    expect(availableRationTokens(next.state, unit)).toBe(eatOffMapCost(reTicksOf(next.state, unit)));
    const chosen = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }).decide(context(state,
      { stepKey: 'funded-advance', actions: 0, notes: new Map() }))!;
    expect(chosen.action).toMatchObject({ kind: 'RESPOND_DECISION', choiceId: funded ? action.choiceId : 'advance:done' });
    expect(ruleEngine.applyAction(state, chosen.action).ok).toBe(true);
  });
  it('declines the recorded unfunded first advance and keeps the unit traced', () => {
    const {state,action} = fixture(1271046);
    const snapshot = JSON.stringify(state), explanation=ruleEngine.explain(state,action);
    expect(explanation.allowed).toBe(true);
    expect(explanation.facts.find(f=>f.key==='supply.advanceFunded')?.value).toBe(false);
    expect(JSON.stringify(state)).toBe(snapshot);
    const old=ruleEngine.applyAction(state,action); if (!old.ok || action.kind!=='RESPOND_DECISION') throw Error('Historical action rejected');
    const id=action.choiceId.slice('advance:'.length);
    expect(pieceHasTrace(old.state,old.state.pieceState.pieces.find(p=>p.id===id)!)).toBe(false);
    const chosen=createHeuristicPolicy({scenario:state.scenario,turnLimit:8}).decide(context(state,{stepKey:'first-advance',actions:0,notes:new Map()}))!;
    expect(chosen.action).not.toMatchObject({choiceId:action.choiceId});
    const next=ruleEngine.applyAction(state,chosen.action); if (!next.ok) throw Error('Chosen action rejected');
    expect(pieceHasTrace(next.state,next.state.pieceState.pieces.find(p=>p.id===id)!)).toBe(true);
  });
  it('refuses the historical overrun whose forced successful advance cannot be fed after attack payment', () => {
    const {state,action}=fixture(1271025), snapshot=JSON.stringify(state);
    const explanation=ruleEngine.explain(state,action);
    expect(explanation.allowed).toBe(true);
    expect(explanation.facts.find(f=>f.key==='supply.overrunAdvanceFunded')?.value).toBe(false);
    expect(JSON.stringify(state)).toBe(snapshot);
    const chosen=createHeuristicPolicy({scenario:state.scenario,turnLimit:8}).decide(context(state,{stepKey:'overrun',actions:0,notes:new Map()}))!;
    expect(chosen.action).not.toMatchObject({kind:'DECLARE_COMBAT',combatKind:'OVERRUN',targetHexId:'1,18'});
    expect(ruleEngine.applyAction(state,chosen.action).ok).toBe(true);
  });
  it('retains the HQ-destruction Overrun when nearby shared stock funds the successful advance', () => {
    const stored = fixture(1271025), action = stored.action;
    if (action.kind !== 'DECLARE_COMBAT' || action.attackerSupply[0]?.method !== 'DUMPS') throw Error('No recorded Overrun payment');
    const dumpId = action.attackerSupply[0].dumpIds[0];
    const state: GameState = { ...stored.state, pieceState: { ...stored.state.pieceState,
      pieces: stored.state.pieceState.pieces.map(p => p.id === dumpId ? { ...p, resourceQuantity: 40,
        location: { kind: 'ON_MAP', hexId: '2,18' as HexId } } : p) } };
    const explanation = ruleEngine.explain(state, action);
    expect(explanation.allowed).toBe(true);
    expect(explanation.facts.find(f => f.key === 'supply.overrunAdvanceFunded')?.value).toBe(true);
    const chosen = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }).decide(context(state,
      { stepKey: 'funded-overrun', actions: 0, notes: new Map() }))!;
    expect(chosen.action).toMatchObject({ kind: 'DECLARE_COMBAT', combatKind: 'OVERRUN', targetHexId: '1,18' });
    expect(ruleEngine.applyAction(state, chosen.action).ok).toBe(true);
  });
  it.each([7, 8])('in turn %i Exploitation only reserves rations when a future Supply remains', turn => {
    const stored = fixture(1271025), action = stored.action;
    if (action.kind !== 'DECLARE_COMBAT') throw Error('No recorded Overrun');
    const unit = stored.state.pieceState.pieces.find(p => p.id === action.leadAttackerId)!;
    const state: GameState = { ...stored.state, sequence: { ...stored.state.sequence, gameTurn: turn, phase: 'EXPLOITATION' },
      usage: withUsage(stored.state, { ...usageOf(stored.state, unit), reserveReleased: true }) };
    const explanation = ruleEngine.explain(state, action);
    expect(explanation.allowed).toBe(true);
    expect(explanation.facts.find(f => f.key === 'supply.overrunAdvanceFunded')?.value).toBe(false);
    const chosen = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }).decide(context(state,
      { stepKey: 'exploitation-overrun', actions: 0, notes: new Map() }))!;
    if (turn === 8) expect(chosen.action).toMatchObject({ kind: 'DECLARE_COMBAT', combatKind: 'OVERRUN', targetHexId: '1,18' });
    else expect(chosen.action).not.toMatchObject({ kind: 'DECLARE_COMBAT', combatKind: 'OVERRUN', targetHexId: '1,18' });
    expect(ruleEngine.applyAction(state, chosen.action).ok).toBe(true);
  });
});
