import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
// Adapted from docs/quality/evidence/ai-vp-next-promotion-2026-10-14: node audit-advances.mjs <candidate dist> <match dir> <strategy version>
const [buildArg,dir,version]=process.argv.slice(2), build=resolve(buildArg);
const m=await import(pathToFileURL(`${build}/index.js`));
const {isCombatUnit,isHq}=await import(pathToFileURL(`${build}/rules/pieces.js`));
const {availableRationTokens}=await import(pathToFileURL(`${build}/rules/supply/relocation-impact.js`));
const {advanceRationsPreserved}=await import(pathToFileURL(`${build}/rules/supply/ration-budget.js`));
const summary=JSON.parse(readFileSync(`${dir}/summary.json`)),records=[];
const attribution=JSON.parse(readFileSync(`${dir}/supply-attribution.json`));
for(const record of summary.records) {
 const save=JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`));
 const trace=readFileSync(`${dir}/match-${record.match}.trace.jsonl`,'utf8').trim().split('\n').map(JSON.parse);
 const candidateOwner='player:'+Object.entries(record.sides).find(([,side])=>side.policy==='heuristic')[0];
 const strategyVersion=version;
 const candidateRows=trace.filter(t=>t.status==='ACCEPTED'&&t.action.actorId===candidateOwner);
 if(!candidateRows.length||candidateRows.some(t=>t.policy!==`heuristic@${strategyVersion}`))throw Error('Candidate trace identity mismatch');
 const candidateRevisions=new Set(candidateRows.map(t=>t.revision));
 let state=m.parseGameStateJson(save.initialSnapshot).value; const advances=[],overruns=[],causes=[],previewViolations=[];let declared=null;
 const losses=attribution.find(r=>r.match===record.match).attrition;
 const triggers=losses.flatMap((loss,index)=>['trigger','rationTrigger'].flatMap(kind=>loss[kind]?[{loss,index,kind,trigger:loss[kind]}]:[]));
 for(const action of save.acceptedActions) {
  const relevant=state.pendingDecision?.kind==='ADVANCE_HEX'&&action.kind==='RESPOND_DECISION'&&action.choiceId.startsWith('advance:')&&!['advance:all','advance:done'].includes(action.choiceId);
  const overrun=action.kind==='DECLARE_COMBAT'&&action.combatKind==='OVERRUN';
  const ex=relevant||overrun?m.ruleEngine.explain(state,action):null,value=k=>ex?.facts.find(f=>f.key===k)?.value;
  if(overrun)declared={state,action,candidate:candidateRevisions.has(state.revision),funded:value('supply.overrunAdvanceFunded'),noRationRemains:state.sequence.gameTurn===8&&state.sequence.phase==='EXPLOITATION'};
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Rejected replay');
  for(const row of triggers.filter(t=>t.trigger.revision===state.revision)) {
   const victim=state.pieceState.pieces.find(p=>p.id===row.loss.pieceId),afterVictim=next.state.pieceState.pieces.find(p=>p.id===row.loss.pieceId);
   const changes=state.pieceState.pieces.flatMap(p=>{ const q=next.state.pieceState.pieces.find(q=>q.id===p.id);
    return !q||JSON.stringify(p.location)!==JSON.stringify(q.location)||p.mode!==q.mode||p.remainingSteps!==q.remainingSteps
     ?[{id:p.id,owner:p.ownerId,hq:isHq(state,p),before:{location:p.location,mode:p.mode,steps:p.remainingSteps},after:q?{location:q.location,mode:q.mode,steps:q.remainingSteps}:null}]:[]; });
   const moved=changes.filter(c=>JSON.stringify(c.before.location)!==JSON.stringify(c.after?.location));
   const ownMoved=moved.filter(c=>c.owner===row.loss.owner),enemyMoved=moved.filter(c=>c.owner!==row.loss.owner);
   const initiatedByEnemy=row.trigger.initiator!==row.loss.owner;
   let mechanism='unresolved';
   if(initiatedByEnemy) mechanism=state.activeTransaction?'enemy-initiated-combat':'enemy-action';
   else if(next.events.some(e=>e.kind==='REINFORCEMENT_PLACED'&&e.pieceId===row.loss.pieceId)) mechanism='reinforcement-entry';
   else if(next.events.some(e=>e.kind==='UNIT_REBUILT'&&e.pieceId===row.loss.pieceId)) mechanism='rebuild-entry';
   else if(ownMoved.some(c=>c.id===row.loss.pieceId)) mechanism=next.events.some(e=>e.kind==='PIECE_RETREATED')?'friendly-attack-retreat':next.events.some(e=>e.kind==='PIECE_ADVANCED')?'friendly-combat-advance':'friendly-ground-relocation';
   else if(ownMoved.some(c=>c.hq)) mechanism='friendly-HQ-relocation-or-loss';
   else if(enemyMoved.length&&state.activeTransaction) mechanism='enemy-combat-reaction-to-friendly-attack';
   else if(next.events.some(e=>['RESOURCE_CONSUMED','SUPPLY_SPENT','FUEL_PAID','SUPPLY_LOADED','SUPPLY_UNLOADED'].includes(e.kind))) mechanism='friendly-resource-use-or-transfer';
   const traceBefore=victim?m.pieceHasTrace(state,victim):null,traceAfter=afterVictim?m.pieceHasTrace(next.state,afterVictim):null;
   const foodBefore=victim?availableRationTokens(state,victim):null,foodAfter=afterVictim?availableRationTokens(next.state,afterVictim):null;
   causes.push({lossIndex:row.index,kind:row.kind,revision:state.revision,pieceId:row.loss.pieceId,owner:row.loss.owner,
    coarseCategory:row.kind==='trigger'?row.loss.category:row.loss.rationCategory,mechanism,initiator:row.trigger.initiator,
    actualActor:action.actorId,action,traceBefore,traceAfter,foodBefore,foodAfter,victimBefore:victim?.location,victimAfter:afterVictim?.location,
    changes,events:next.events});
  }
  if(relevant) {
   const own=state.pieceState.pieces.filter(p=>p.ownerId===action.actorId&&p.location.kind==='ON_MAP'&&isCombatUnit(state,p));
   const mover=next.state.pieceState.pieces.find(p=>p.id===action.choiceId.slice('advance:'.length));
   const lost=own.filter(p=>m.pieceHasTrace(state,p)&&!m.pieceHasTrace(next.state,next.state.pieceState.pieces.find(q=>q.id===p.id))).length;
   const feed=own.filter(p=>!m.pieceHasTrace(state,p)&&availableRationTokens(next.state,next.state.pieceState.pieces.find(q=>q.id===p.id))<availableRationTokens(state,p)).length;
   const funded=advanceRationsPreserved(state,next.state,action.actorId,[mover.id]);
   if(lost>value('supply.advanceTraceLost')||feed>value('supply.advanceFeedLost')||value('supply.advanceMoverHasTrace')===true&&!m.pieceHasTrace(next.state,mover)||value('supply.advanceFunded')===true&&!funded){writeFileSync(`${dir}/advance-preview-failure.json`,JSON.stringify({match:record.match,revision:state.revision,state,action,facts:ex.facts,actual:{lost,feed,funded,moverTraced:m.pieceHasTrace(next.state,mover)},after:next.state,events:next.events}));if(process.argv.includes('--record-violations'))previewViolations.push({candidate:candidateRevisions.has(state.revision),reason:'Advance conservative bound violated',revision:state.revision,action,predicted:ex.facts,actual:{lost,feed,funded}});else throw Error('Advance conservative bound violated '+JSON.stringify({match:record.match,revision:state.revision,action,predicted:{trace:value('supply.advanceTraceLost'),feed:value('supply.advanceFeedLost'),funded:value('supply.advanceFunded')},actual:{lost,feed,funded}}));}
   if(candidateRevisions.has(state.revision)&&state.sequence.gameTurn<8&&!funded)throw Error('Candidate advanced unfunded before final turn');
   advances.push({revision:state.revision,candidate:candidateRevisions.has(state.revision),traceLost:lost,feedLost:feed,moverTraced:m.pieceHasTrace(next.state,mover),funded,predictedFunded:value('supply.advanceFunded'),action});
  }
  if(declared&&next.events.some(e=>e.kind==='PIECE_ADVANCED')) {
   const ids=next.events.filter(e=>e.kind==='PIECE_ADVANCED').map(e=>e.pieceId);
   if(ids.some(id=>declared.action.attackerIds.includes(id))) {
    const funded=advanceRationsPreserved(declared.state,next.state,declared.action.actorId,ids);
    const enemyRetreated=next.events.some(e=>e.kind==='PIECE_RETREATED'&&declared.state.pieceState.pieces.find(p=>p.id===e.pieceId)?.ownerId!==declared.action.actorId);
    overruns.push({revision:declared.state.revision,candidate:declared.candidate,predictedFunded:declared.funded,actualFunded:funded,enemyRetreated,action:declared.action});
    if(declared.candidate&&!declared.noRationRemains&&declared.funded!==true)throw Error('Candidate unguarded Overrun');
   }
   declared=null;
  }
  if(declared&&!next.state.activeTransaction)declared=null;
  state=next.state;
 }
 if(state.sequence.phase!=='COMPLETE'||state.pendingDecision||(await m.hashGameState(state)).value!==record.finalStateHash)throw Error('Final replay mismatch');
 records.push({match:record.match,candidateOwner,candidateActions:candidateRevisions.size,advances,overruns,causes,previewViolations});console.log(record.match,'advances',advances.length,'overruns',overruns.length);
}
writeFileSync(`${dir}/advance-supply.json`,JSON.stringify(records));
