import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import * as m from './engine-checkout/dist/index.js';
import {isCombatUnit,isOutOfSupply,isTransportPoint,reTicksOf,usageOf,hexOf} from './engine-checkout/dist/rules/pieces.js';
import {loadedTokens} from './engine-checkout/dist/rules/supply/transport.js';
import {dumpsReaching,pieceHasTrace,eatOffMapCost} from './engine-checkout/dist/rules/supply/supply.js';
import {rationPlan,assignRations,afterRequiredRecovery} from './engine-checkout/dist/rules/supply/ration-budget.js';
const dir=process.argv[2],cap=Number(process.argv[3]??12);
if(!dir)throw Error('usage: rescue-study.mjs <match dir> [case limit]');
const summary=JSON.parse(readFileSync(`${dir}/summary.json`)),cases=[];
const garrison=p=>p&&String(p.definitionId).endsWith(':garrison');
const piece=(state,id)=>state.pieceState.pieces.find(p=>p.id===id);
const candidates=(s,actor,kind,pieceId=null,budget=3000)=>m.ruleEngine.getActionCandidates(s,{actorId:actor,kind,pieceId,budget}).actions;
const apply=(s,a)=>{const r=m.ruleEngine.applyAction(s,a);return r.ok&&!r.state.pendingDecision?r.state:null;};
const context=(state,memory)=>{
 const actor=state.pendingDecision?.ownerId??state.sequence.actingPlayerId;
 return {seatId:'seat:rescue-study',playerId:actor,memory,rng:m.createBotRng(7,'rescue-study',0),view:{projection:m.ruleEngine.projectForViewer(state,actor),pendingDecision:state.pendingDecision},actions:{
 families:()=>m.ruleEngine.getActionFamilies(state,actor).filter(f=>f.enabled).map(f=>f.kind),
 candidates:(kind,pieceId=null,budget=400)=>candidates(state,actor,kind,pieceId,budget),movementRange:id=>m.ruleEngine.queryMovementRange(state,actor,id).value,
 explain:action=>({current:true,explanation:m.ruleEngine.explain(state,action)}),traceCoverage:(id=null)=>m.ruleEngine.queryTraceCoverage(state,actor,id).value,feedCoverage:(id=null)=>m.ruleEngine.queryFeedCoverage(state,actor,id).value}};
};
const feasible=(original,state,actor,targetId)=>{
 const wanted=new Set([...rationPlan(original,actor).demands.map(d=>d.id),targetId]);
 const next=afterRequiredRecovery(state,actor),sources=new Map(),demands=[];
 for(const id of wanted){
  const p=piece(next,id);if(!p||p.location.kind!=='ON_MAP')return false;
  if(pieceHasTrace(next,p))continue;
  if(p.mode==='STRAT')return false;
  const dumps=dumpsReaching(next,actor,hexOf(p),p);
  for(const d of dumps)sources.set(d.pieceId,d.availableQuantity);
  demands.push({id,ticks:reTicksOf(next,p),sources:dumps.map(d=>d.pieceId)});
 }
 return assignRations(demands,[...sources].map(([id,tokens])=>({id,tokens}))).groups!==null;
};
const continueToSupply=(start,targetId)=>{
 let state=start;const actor=piece(state,targetId).ownerId,policy=m.createHeuristicPolicy({scenario:state.scenario,turnLimit:state.configuration.turnLimit}),memory=new Map(),actions=[];
 let supplied=false,targetLoss=0,otherAttrition=0;
 for(let i=0;i<700;i++){
  if(supplied&&!state.pendingDecision)break;
  const owner=state.pendingDecision?.ownerId??state.sequence.actingPlayerId;
  const key=`${owner}:${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`;
  if(!memory.has(key))memory.set(key,{stepKey:key,actions:0,notes:new Map()});
  const chosen=policy.decide(context(state,memory.get(key)));if(!chosen)return {ok:false,error:'stalled'};
  const result=m.ruleEngine.applyAction(state,chosen.action);if(!result.ok)return {ok:false,error:`rejected ${chosen.action.kind}`};
  if(state.pendingDecision?.kind==='ATTRITION_LOSS'||result.events.some(e=>e.kind==='ATTRITION_ROLLED')){
   targetLoss+=result.events.filter(e=>e.kind==='STEP_LOST'&&e.pieceId===targetId).length;
   otherAttrition+=result.events.filter(e=>e.kind==='STEP_LOST'&&e.pieceId!==targetId).length;
  }
  actions.push({action:chosen.action,intent:chosen.intent});
  if(result.events.some(e=>e.kind==='SEQUENCE_ADVANCED'&&e.from.phase==='SUPPLY'&&e.from.phasingPlayerId===actor))supplied=true;
  state=result.state;
 }
 const p=piece(state,targetId);
 return {ok:supplied&&!state.pendingDecision,savedTarget:p.location.kind==='ON_MAP'&&!isOutOfSupply(p)&&targetLoss===0,targetLoss,otherAttrition,finalRevision:state.revision,actions};
};
const findRescue=(start,targetId)=>{
 const actor=piece(start,targetId).ownerId,targetHex=hexOf(piece(start,targetId));
 const trucks=start.pieceState.pieces.filter(p=>p.ownerId===actor&&p.location.kind==='ON_MAP'&&isTransportPoint(start,p));
 const drops=start.pieceState.pieces.filter(p=>p.ownerId===actor&&p.location.kind==='ON_MAP'&&(p.resourceQuantity??0)>0
  &&start.scenario.pieceCatalog.definitions.find(d=>d.id===p.definitionId)?.resource?.resourceDefinitionId==='resource:supply');
 let branches=0,feasibleDeliveries=0,continuations=0;
 const deliver=(state,id,actions)=>{
  if(loadedTokens(state,piece(state,id))===0)return null;
  const paths=hexOf(piece(state,id))===targetHex?[null]:candidates(state,actor,'MOVE_PIECE',id).filter(a=>a.path.at(-1)===targetHex);
  for(const move of paths){
   if(move){const f=m.ruleEngine.explain(state,move).facts;if(['supply.relocationTraceLost','supply.relocationFeedLost'].some(k=>f.find(x=>x.key===k)?.value!==0))continue;}
   const arrived=move?apply(state,move):state;if(!arrived)continue;
   for(const unload of candidates(arrived,actor,'UNLOAD_SUPPLY',id)){
    const end=apply(arrived,unload);if(!end||!feasible(start,end,actor,targetId))continue;
    feasibleDeliveries++;continuations++;
    const resumed=continueToSupply(end,targetId);
    if(resumed.ok&&resumed.savedTarget)return {actions:[...actions,...(move?[move]:[]),unload],resumed};
   }
  }
  return null;
 };
 for(const truck of trucks){
  let direct=deliver(start,truck.id,[]);if(direct)return {witness:direct,branches,feasibleDeliveries,continuations};
  for(const dump of drops){
   const approaches=hexOf(truck)===hexOf(dump)?[null]:candidates(start,actor,'MOVE_PIECE',truck.id).filter(a=>a.path.at(-1)===hexOf(dump));
   for(const approach of approaches){
    if(approach){const f=m.ruleEngine.explain(start,approach).facts;if(['supply.relocationTraceLost','supply.relocationFeedLost'].some(k=>f.find(x=>x.key===k)?.value!==0))continue;}
    const at=approach?apply(start,approach):start;if(!at)continue;
    const load=candidates(at,actor,'LOAD_SUPPLY',truck.id).find(a=>a.dumpId===dump.id);if(!load)continue;
    for(const tokens of [...new Set([1,2,4,8,load.tokens].filter(n=>n<=load.tokens))]){
     branches++;const purchase={...load,tokens},loaded=apply(at,purchase);if(!loaded)continue;
     const witness=deliver(loaded,truck.id,[...(approach?[approach]:[]),purchase]);
     if(witness)return {witness,branches,feasibleDeliveries,continuations};
    }
   }
  }
 }
 return {witness:null,branches,feasibleDeliveries,continuations,limitation:'No witness in single-truck, one-pickup, direct-to-garrison routes with selected load sizes, current positions and existing movement supply guard. Not proof that all legal rescues are impossible.'};
};
for(const r of summary.records){
 const save=JSON.parse(readFileSync(`${dir}/match-${r.match}.save.json`));let state=m.parseGameStateJson(save.initialSnapshot).value;const starts=new Map(),seen=new Set(),candidatesLost=[];
 for(const action of save.acceptedActions){
  const seq=state.sequence,key=`${seq.gameTurn}:${seq.playerTurnIndex}:${seq.phasingPlayerId}`;
  if(seq.phase==='MOVEMENT'&&seq.segment==='MOVEMENT'&&!seen.has(key)){seen.add(key);starts.set(seq.phasingPlayerId,state);}
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Replay rejected');
  if(state.pendingDecision?.kind==='ATTRITION_LOSS'||next.events.some(e=>e.kind==='ATTRITION_ROLLED')){
   for(const e of next.events.filter(e=>e.kind==='STEP_LOST')){
    const p=piece(state,e.pieceId);if(!garrison(p))continue;
    candidatesLost.push({match:r.match,turn:seq.gameTurn,lossRevision:state.revision,targetId:p.id,hex:hexOf(p),start:starts.get(p.ownerId)});
   }
  }
  state=next.state;
 }
 const hash=await m.hashGameState(state);if(!hash.ok||hash.value!==r.finalStateHash)throw Error('Final hash mismatch');
 for(const loss of candidatesLost){
  if(cases.length>=cap)break;
  const {start,...data}=loss;if(!start){cases.push({...data,status:'no-movement-snapshot'});continue;}
  const rescue=findRescue(start,loss.targetId);
  const originalContinuation=continueToSupply(start,loss.targetId);
  const status=rescue.witness?'legal-rescue-witness':'unresolved';
  cases.push({...data,status,startRevision:start.revision,startSnapshot:JSON.stringify(start),originalContinuation,...rescue});
  console.log(r.match,loss.turn,loss.hex,status,'branches',rescue.branches,'continuations',rescue.continuations);
 }
}
writeFileSync(`${dir}/rescue-study.json.gz`,gzipSync(JSON.stringify({scope:'Diagnostic single-truck rescue at friendly Movement start; future RNG not used by the policy. Counterfactual policy memory restarts at the phase boundary.',caseLimit:cap,cases}),{level:9}));
