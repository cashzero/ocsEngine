import { describe, expect, it } from 'vitest';
import { ALLIED, atStep, buildGeneratedRuleState, generatedPieceId, ruleEngine, serializeGameState, type GameState } from '../../src/index.js';
import { logisticsOverview, planLogistics } from '../../src/gameplay/logistics.js';

const truck = generatedPieceId('allied:independent-transport-1');
const dump = generatedPieceId('allied:independent-supply-1');
const unit = generatedPieceId('allied:f2-combat-1');
const tank = generatedPieceId('allied:f1-combat-1');
const setup = (): GameState => {
  const start = atStep(buildGeneratedRuleState({[truck]:['0,6',null],[dump]:['0,6',null],[unit]:['2,6','COMBAT','combat'],[tank]:['0,6','MOVE','move']},{},{fueled:false}),'MOVEMENT','MOVEMENT',ALLIED);
  return {...start,pieceState:{...start.pieceState,pieces:start.pieceState.pieces.map(p=>p.id===dump?{...p,resourceQuantity:40}:p)}};
};
describe('logistics previews use the production reducer without mutation',()=>{
  it('delivers requested stock with exactly the simulated moves, MP and final dump',()=>{
    const state=setup(), original=serializeGameState(state);
    const plan=planLogistics(state,ALLIED,{sourceId:dump,destination:'2,6' as never,tokens:4},ruleEngine);
    expect(serializeGameState(state)).toEqual(original);
    expect(plan.delivered,plan.reasons.join(' ')).toBe(4);
    expect(plan.steps.some(s=>s.action.kind==='LOAD_SUPPLY')).toBe(true);
    expect(plan.steps.some(s=>s.action.kind==='MOVE_PIECE'&&s.costTicks>0)).toBe(true);
    let current=state;
    for(const step of plan.steps){const result=ruleEngine.applyAction(current,step.action);expect(result.ok).toBe(true);current=result.state;}
    expect(current.pieceState.pieces.filter(p=>p.location.kind==='ON_MAP'&&p.location.hexId==='2,6'&&p.resourceQuantity!==null).reduce((n,p)=>n+(p.resourceQuantity??0),0)).toBe(plan.destinationStock);
    expect(current.rng).toEqual(state.rng);
  });
  it('reuses a truck for multiple trips when MP and source stock allow it',()=>{
    const state=setup();
    const plan=planLogistics(state,ALLIED,{sourceId:dump,destination:'2,6' as never,tokens:40},ruleEngine);
    expect(plan.delivered,plan.reasons.join(' ')).toBe(40);
    expect(plan.steps.filter(step=>step.action.kind==='LOAD_SUPPLY').length).toBeGreaterThan(1);
    expect(plan.steps.filter(step=>step.action.kind==='END_MOVE')).toHaveLength(1);
  });
  it('reports legal unload alternatives and refuses invalid destinations without state changes',()=>{
    const state=setup();
    const plan=planLogistics(state,ALLIED,{sourceId:dump,destination:'8,0' as never,tokens:8},ruleEngine);
    expect(plan.delivered).toBe(0);expect(plan.steps).toEqual([]);expect(plan.reasons.join(' ')).toContain('13.2f');expect(plan.alternatives).toContain('2,6');
  });
  it('reports shortfalls when all trucks are excluded and when the task is too far',()=>{
    const state=setup();
    const excluded=planLogistics(state,ALLIED,{sourceId:dump,destination:'2,6' as never,tokens:80,excludedTruckIds:[truck]},ruleEngine);
    expect(excluded.delivered).toBe(0);expect(excluded.reasons.join(' ')).toContain('short 80T');
    const distant={...state,pieceState:{...state.pieceState,pieces:state.pieceState.pieces.map(p=>p.id===unit?{...p,location:{kind:'ON_MAP' as const,hexId:'30,20' as never}}:p)}};
    const plan=planLogistics(distant,ALLIED,{sourceId:dump,destination:'30,20' as never,tokens:4},ruleEngine);
    expect(plan.delivered).toBe(0);expect(plan.reasons.join(' ')).toMatch(/MP|route/);
  });
  it('recommends an exact payable fuel sequence while keeping the preview unchanged',()=>{
    const state=setup(), original=serializeGameState(state);
    const info=logisticsOverview(state,ALLIED,[tank],ruleEngine);
    expect(info.fuel.tokens).toBe(1);expect(info.fuel.missing).toEqual([]);expect(info.fuel.steps).toHaveLength(1);
    const result=ruleEngine.applyAction(state,info.fuel.steps[0]!);expect(result.ok).toBe(true);
    expect(logisticsOverview(result.state,ALLIED,[tank],ruleEngine).fuel.steps).toHaveLength(0);
    expect(serializeGameState(state)).toEqual(original);
  });
});
