import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as m from './engine-checkout/dist/index.js';
import {createHeuristicPolicy as oldPolicy} from './baseline-v18/ai/policies/heuristic.js';
import {isCombatUnit,isOutOfSupply} from './engine-checkout/dist/rules/pieces.js';
import {rationPlan} from './engine-checkout/dist/rules/supply/ration-budget.js';
const report=[];
for (const name of ['vp-rebuild-1217101-119','vp-rebuild-1217101-270','vp-rebuild-1217101-273']) {
 const fixture=JSON.parse(gunzipSync(readFileSync(`tests/ai/fixtures/${name}.state.json.gz`)));
 for (const [version,create] of [['18',oldPolicy],['19',m.createHeuristicPolicy]]) {
  let state=m.parseGameStateJson(fixture.snapshot).value;
  const actorId=fixture.action.actorId, plan=rationPlan(state,actorId);
  const committed=new Set(plan.demands.map(d=>d.id));
  const policy=create({scenario:state.scenario,turnLimit:8}),memories=new Map();
  let firstOwnSupply=null,losses=0; const actions=[],payments=[];
  for(let i=0;i<2000;i++) {
   if(state.sequence.phase==='COMPLETE')break;
   const owner=state.pendingDecision?.ownerId??state.sequence.actingPlayerId;
   const key=`${owner}:${state.sequence.gameTurn}:${state.sequence.phase}:${state.sequence.segment}`;
   if(!memories.has(key))memories.set(key,{stepKey:key,actions:0,notes:new Map()});
   const c={seatId:'seat:regression',playerId:owner,memory:memories.get(key),rng:m.createBotRng(7,'supply-regression',0),view:{projection:m.ruleEngine.projectForViewer(state,owner),pendingDecision:state.pendingDecision},
    actions:{families:()=>m.ruleEngine.getActionFamilies(state,owner).filter(f=>f.enabled).map(f=>f.kind),movementRange:pieceId=>m.ruleEngine.queryMovementRange(state,owner,pieceId).value,
    candidates:(kind,pieceId=null,budget=400)=>m.ruleEngine.getActionCandidates(state,{actorId:owner,kind,pieceId,budget}).actions,
    explain:action=>({current:true,explanation:m.ruleEngine.explain(state,action)}),traceCoverage:(pieceId=null)=>m.ruleEngine.queryTraceCoverage(state,owner,pieceId).value,
    feedCoverage:(pieceId=null)=>m.ruleEngine.queryFeedCoverage(state,owner,pieceId).value}};
   const chosen=policy.decide(c);if(!chosen)throw Error('stalled');
   const next=m.ruleEngine.applyAction(state,chosen.action);if(!next.ok)throw Error('rejected');
   if(state.pendingDecision?.kind==='ATTRITION_LOSS'||next.events.some(e=>e.kind==='ATTRITION_ROLLED'))losses+=next.events.filter(e=>e.kind==='STEP_LOST').length;
   actions.push({revision:state.revision,action:chosen.action,intent:chosen.intent});
   payments.push(...next.events.filter(e=>e.kind==='SUPPLY_SPENT'||e.kind==='FUEL_PAID').map(e=>({kind:chosen.action.kind,source:e.resourcePieceId,tokens:e.kind==='FUEL_PAID'?e.tokens:e.quantity})));
   if(firstOwnSupply===null&&next.events.some(e=>e.kind==='SEQUENCE_ADVANCED'&&e.from.phase==='SUPPLY'&&e.from.phasingPlayerId===actorId)) {
    const initial=actions[0].action;
    firstOwnSupply={revision:next.state.revision,gameTurn:state.sequence.gameTurn,
      rebuiltUnits:initial.kind==='REBUILD_UNITS'?initial.units.map(u=>{
       const p=next.state.pieceState.pieces.find(p=>p.id===u.pieceId);
       return {pieceId:u.pieceId,location:p.location,outOfSupply:isOutOfSupply(p)};
      }):[]};
   }
   state=next.state;
  }
  if(state.sequence.phase!=='COMPLETE'||state.pendingDecision)throw Error('unfinished');
  const unfed=state.pieceState.pieces.filter(p=>p.ownerId===actorId&&p.location.kind==='ON_MAP'&&isCombatUnit(state,p)&&isOutOfSupply(p)).map(p=>p.id);
  if(!firstOwnSupply)throw Error('Supply boundary not exercised');
  report.push({name,version,completed:true,firstOwnSupply,victory:state.victory,objectives:m.ruleEngine.projectForViewer(state,actorId).objectives,initialCommitted:[...committed],finalUnfed:unfed,committedUnfed:unfed.filter(id=>committed.has(id)),attritionSteps:losses,payments,actions});
  console.log(name,version,'VP',state.victory.scores,'unfed',unfed.length,'loss',losses,'payments',payments.reduce((n,p)=>n+p.tokens,0));
 }
}
writeFileSync('tmp/ai-match/v19-vp-2026-10-13/cases.json',JSON.stringify(report,null,2)+'\n');
