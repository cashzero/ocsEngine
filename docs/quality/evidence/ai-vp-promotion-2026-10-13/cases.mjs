import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
const version=process.argv[2]??'21';
const m=await import(`./candidate-v${version}/dist/index.js`);
import {createHeuristicPolicy as baseline} from '../v19-vp-2026-10-13/engine-checkout/dist/ai/policies/heuristic.js';
const inputs=['119','270','273'].map(rev=>{
 const f=JSON.parse(gunzipSync(readFileSync(`tests/ai/fixtures/vp-rebuild-1217101-${rev}.state.json.gz`)));
 return {name:`rebuild-${rev}`,actor:f.action.actorId,snapshot:f.snapshot};
});
const study=JSON.parse(readFileSync(`tmp/ai-match/vp-promotion-2026-10-13/${version==='21'?'combat-TEMPERATE_INLAND':'placement-EASTERN_EUROPE'}.json`));
const selected=study.filter(r=>r.match%2===0).flatMap(r=>r.missed.map(s=>({...s,match:r.match}))).slice(0,version==='21'?4:3);
for(const f of selected)inputs.push({name:`${version==='21'?'combat':'placement'}-${f.match}-${f.revision}`,actor:f.actor,snapshot:f.snapshot});
if(process.argv[3]?.startsWith('new-placement')) {
 const f=JSON.parse(gunzipSync(readFileSync('tests/ai/fixtures/vp-placement-1235002.state.json.gz')));
 inputs.splice(0,inputs.length,{name:'placement-1235002-348',actor:f.action.actorId,snapshot:f.snapshot});
}
if(process.argv[3]?.startsWith('trace-gain')) {
 const f=JSON.parse(gunzipSync(readFileSync('tests/ai/fixtures/vp-trace-gain-1221000.state.json.gz')));
 inputs.splice(0,inputs.length,{name:'trace-gain-1221000',actor:f.actor,snapshot:f.snapshot});
}
if(process.argv[3]==='defence') {
 const f=JSON.parse(readFileSync('tmp/ai-match/vp-promotion-2026-10-13/defence-EASTERN_EUROPE-1241106.json'))[0].cases[0];
 inputs.splice(0,inputs.length,{name:'defence-1241106',actor:f.actor,snapshot:f.snapshot});
}
if(process.argv[3]?.startsWith('garrison')) {
 const rs=JSON.parse(readFileSync('tmp/ai-match/vp-promotion-2026-10-13/garrison-1251000-1251001.json'));
 inputs.splice(0,inputs.length,...rs.map(r=>r.cases[0]).map(f=>({name:`garrison-${f.revision}`,actor:f.actor,snapshot:f.snapshot})));
}
if(process.argv[3]?.startsWith('vp-reinforce')) {
 const f=JSON.parse(gunzipSync(readFileSync('tests/ai/fixtures/vp-advance-1258101.state.json.gz')));
 inputs.splice(0,inputs.length,{name:'vp-reinforce-1258101-264',actor:f.actor,snapshot:f.snapshot});
}
if(process.argv[3]?.startsWith('first-player')) inputs.splice(0,inputs.length,...JSON.parse(gunzipSync(readFileSync(`tmp/ai-match/vp-promotion-2026-10-13/first-player${process.argv[3].includes('behind')?'-behind':''}-inputs.json.gz`))));
const records=[];
for(const input of inputs)for(const [policyVersion,create] of [['19',baseline],[version,m.createHeuristicPolicy]]) {
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
  const controlling=process.argv[3]?.endsWith('-opponent-v19')&&owner!==input.actor ? opposing : policy;
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
 const result={name:input.name,actor:input.actor,version:policyVersion,opponentVersion:process.argv[3]?.endsWith('-opponent-v19')?'19':policyVersion,completed:true,victory:state.victory,traceBreaks,feedBreaks,rationBreaks,firstPlacement,firstSupplyAfterFirstPlacement,traceGains,actions};
 records.push(result);console.log(input.name,policyVersion,state.victory.scores,'first',actions[0].action.targetHexId??actions[0].action.kind);
}
writeFileSync(`tmp/ai-match/vp-promotion-2026-10-13/cases-v${version}${process.argv[3]?'-'+process.argv[3]:''}.json.gz`,gzipSync(JSON.stringify({inputs,records})));
