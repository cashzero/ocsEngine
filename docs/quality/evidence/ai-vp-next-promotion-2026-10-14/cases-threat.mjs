import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
const version=process.argv[2]??'21';
const m=await import(`./candidate-v${version}/dist/index.js`);
import {createHeuristicPolicy as baseline} from '../vp-promotion-2026-10-13/candidate-v35/dist/ai/policies/heuristic.js';
const inputs=['advance-1271046','advance-1271025','vp-placement-1235002','vp-threat-1281104'].map(name=>{
 const f=JSON.parse(gunzipSync(readFileSync(`tests/ai/fixtures/${name}.state.json.gz`)));
 return {name,actor:f.action?.actorId??f.actor,snapshot:f.snapshot};
});
const records=[];
for(const input of inputs)for(const [policyVersion,create] of [['35',baseline],[version,m.createHeuristicPolicy]]) {
 let state=m.parseGameStateJson(input.snapshot).value;
 const policy=create({scenario:state.scenario,turnLimit:8});const opposing=baseline({scenario:state.scenario,turnLimit:8});const memories=new Map();const actions=[];
 let traceBreaks=0,feedBreaks=0,rationBreaks=0;let firstPlacement=null,firstSupplyAfterFirstPlacement=null;const traceGains=[];
 for(let i=0;i<3000&&state.sequence.phase!=='COMPLETE';i++) {
  const owner=state.pendingDecision?.ownerId??state.sequence.actingPlayerId;
  const key=`${owner}:${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`;
  if(!memories.has(key))memories.set(key,{stepKey:key,actions:0,notes:new Map()});
  const context={seatId:'seat:case',playerId:owner,memory:memories.get(key),rng:m.createBotRng(7,'case',0),
   view:{projection:m.ruleEngine.projectForViewer(state,owner),pendingDecision:state.pendingDecision},
   actions:{families:()=>m.ruleEngine.getActionFamilies(state,owner).filter(f=>f.enabled).map(f=>f.kind),
    candidates:(kind,pieceId=null,budget=400)=>m.ruleEngine.getActionCandidates(state,{actorId:owner,kind,pieceId,budget}).actions,
    movementRange:id=>m.ruleEngine.queryMovementRange(state,owner,id).value,
    explain:action=>({current:true,explanation:m.ruleEngine.explain(state,action)}),
    traceCoverage:(id=null)=>m.ruleEngine.queryTraceCoverage(state,owner,id).value,
    feedCoverage:(id=null)=>m.ruleEngine.queryFeedCoverage(state,owner,id).value}};
  const controlling=process.argv[3]?.endsWith('-opponent-v35')&&owner!==input.actor ? opposing : policy;
  const chosen=controlling.decide(context);if(!chosen)throw Error('stalled');
  const ex=m.ruleEngine.explain(state,chosen.action);if(!ex.allowed)throw Error('illegal');
  const value=k=>ex.facts.find(f=>f.key===k)?.value;
  if(['MOVE_PIECE','CHANGE_MODE'].includes(chosen.action.kind)) {
   traceBreaks+=Number(value('supply.relocationTraceLost')??0);feedBreaks+=Number(value('supply.relocationFeedLost')??0);
  }
  if(['PAY_FUEL','BUILD_HEDGEHOG'].includes(chosen.action.kind)&&value('supply.rationCommitmentsPreserved')===false)rationBreaks++;
  const next=m.ruleEngine.applyAction(state,chosen.action);if(!next.ok)throw Error('rejected');
  if(chosen.action.kind==='MOVE_PIECE') {
   const p=next.state.pieceState.pieces.find(p=>p.id===chosen.action.pieceId);
   const predicted=value('supply.relocationMoverHasTrace');
   if(typeof predicted==='boolean'&&predicted!==m.pieceHasTrace(next.state,p))throw Error('Mover trace preview mismatch');
   if(predicted===true&&!m.ruleEngine.queryTraceCoverage(state,owner,p.id).value.hexIds.includes(chosen.action.path.at(-1))) {
    traceGains.push({revision:state.revision,action:chosen.action,correctedScore:!chosen.breakdown.some(t=>t.term==='out-of-supply')});
   }
  }
  if(!firstPlacement&&chosen.action.kind==='PLACE_REINFORCEMENT') {
   const p=next.state.pieceState.pieces.find(p=>p.id===chosen.action.pieceId);
   firstPlacement={pieceId:p.id,ownerId:p.ownerId,hexId:chosen.action.hexId,hasTrace:m.pieceHasTrace(next.state,p)};
  }
  if(firstPlacement&&!firstSupplyAfterFirstPlacement&&next.events.some(e=>e.kind==='SEQUENCE_ADVANCED'&&e.from.phase==='SUPPLY'&&e.from.phasingPlayerId===firstPlacement.ownerId)) {
   const p=next.state.pieceState.pieces.find(p=>p.id===firstPlacement.pieceId);
   firstSupplyAfterFirstPlacement={revision:next.state.revision,location:p.location,remainingSteps:p.remainingSteps,resourceQuantity:p.resourceQuantity,statuses:p.statuses};
  }
  actions.push({revision:state.revision,action:chosen.action,intent:chosen.intent,breakdown:chosen.breakdown,
   ...(state.pendingDecision?.kind==='FIRST_PLAYER'?{vpBefore:context.view.projection.objectives.reduce((scores,o)=>{if(o.controllerId)scores[o.controllerId]=(scores[o.controllerId]??0)+o.points;return scores},{})}:{}),
   supplySpent:next.events.filter(e=>e.kind==='SUPPLY_SPENT'||e.kind==='FUEL_PAID')});state=next.state;
 }
 if(state.sequence.phase!=='COMPLETE'||state.pendingDecision)throw Error('unfinished');
 const result={name:input.name,actor:input.actor,version:policyVersion,opponentVersion:process.argv[3]?.endsWith('-opponent-v35')?'35':policyVersion,completed:true,victory:state.victory,traceBreaks,feedBreaks,rationBreaks,firstPlacement,firstSupplyAfterFirstPlacement,traceGains,actions};
 records.push(result);console.log(input.name,policyVersion,state.victory.scores,'first',actions[0].action.targetHexId??actions[0].action.kind);
}
writeFileSync(`tmp/ai-match/vp-next-2026-10-14/cases-v${version}${process.argv[3]?'-'+process.argv[3]:''}.json.gz`,gzipSync(JSON.stringify({inputs,records})));
