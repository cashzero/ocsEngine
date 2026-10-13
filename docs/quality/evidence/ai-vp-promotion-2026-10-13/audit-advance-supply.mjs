import {readFileSync,writeFileSync} from 'node:fs';
const version=process.argv[2],dir=process.argv[3];
const m=await import(`./candidate-v${version}/dist/index.js`);
const {isCombatUnit}=await import(`./candidate-v${version}/dist/rules/pieces.js`);
const {availableRationTokens}=await import(`./candidate-v${version}/dist/rules/supply/relocation-impact.js`);
const summary=JSON.parse(readFileSync(`${dir}/summary.json`)),records=[];
for(const record of summary.records) {
 const save=JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`));
 const trace=readFileSync(`${dir}/match-${record.match}.trace.jsonl`,'utf8').trim().split('\n').map(s=>JSON.parse(s));
 const reinforcementRevisions=new Set(trace.filter(t=>t.status==='ACCEPTED'&&t.breakdown?.some(b=>b.term==='reinforce-vp')).map(t=>t.revision));
 let state=m.parseGameStateJson(save.initialSnapshot).value;const advances=[];
 for(const action of save.acceptedActions) {
  const applicable=state.pendingDecision?.kind==='ADVANCE_HEX'&&action.kind==='RESPOND_DECISION';
  const ex=applicable?m.ruleEngine.explain(state,action):null,value=k=>ex?.facts.find(f=>f.key===k)?.value;
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Rejected replay');
  if(typeof value('supply.advanceTraceLost')==='number') {
   const own=state.pieceState.pieces.filter(p=>p.ownerId===action.actorId&&p.location.kind==='ON_MAP'&&isCombatUnit(state,p));
   const losses=own.filter(p=>m.pieceHasTrace(state,p)&&!m.pieceHasTrace(next.state,next.state.pieceState.pieces.find(q=>q.id===p.id))).length;
   const food=own.filter(p=>!m.pieceHasTrace(state,p)&&availableRationTokens(next.state,next.state.pieceState.pieces.find(q=>q.id===p.id))<availableRationTokens(state,p)).length;
   const mover=next.state.pieceState.pieces.find(p=>p.id===action.choiceId.slice('advance:'.length));
   const traced=m.pieceHasTrace(next.state,mover);
   if(losses!==value('supply.advanceTraceLost')||food!==value('supply.advanceFeedLost')||traced!==value('supply.advanceMoverHasTrace'))throw Error('Advance preview/reducer mismatch');
   const reinforcement=reinforcementRevisions.has(state.revision);
   if(reinforcement&&(losses||food||!traced))throw Error('Reinforcement supply guard violation');
   advances.push({revision:state.revision,actor:action.actorId,reinforcement,traceLost:losses,feedLost:food,moverTraced:traced,action});
  } else if(reinforcementRevisions.has(state.revision)) throw Error('Missing reinforcement preview');
  state=next.state;
 }
 if(state.sequence.phase!=='COMPLETE')throw Error('Unfinished replay');
 records.push({match:record.match,advances,previewMismatches:0,reinforcementViolations:0});
 console.log(record.match,'reinforcements',advances.filter(a=>a.reinforcement).length);
}
writeFileSync(`${dir}/advance-supply.json`,JSON.stringify(records));
