import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
import * as m from '../v19-vp-2026-10-13/engine-checkout/dist/index.js';
import {hexesBetween} from '../v19-vp-2026-10-13/engine-checkout/dist/ai/knowledge.js';
const dir=resolve(process.argv[2]);const summary=JSON.parse(readFileSync(`${dir}/summary.json`));const records=[];
for(const record of summary.records) {
 const save=JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`));
 const trace=new Map(readFileSync(`${dir}/match-${record.match}.trace.jsonl`,'utf8').trim().split('\n').map(JSON.parse).map(t=>[t.revision,t]));
 let state=m.parseGameStateJson(save.initialSnapshot).value,phaseStart=state,lastKey='';const missed=[];let checked=0;
 for(const action of save.acceptedActions) {
  const key=JSON.stringify(state.sequence);if(key!==lastKey){phaseStart=state;lastKey=key;}
  if(action.kind==='MOVE_PIECE') {
   const row=trace.get(state.revision);const target=/\((capture|assault) ([^)]+)\)$/.exec(row?.intent??'')?.[2];
   const view=m.ruleEngine.projectForViewer(state,action.actorId),piece=view.stacks.flatMap(s=>s.pieces).find(p=>p.id===action.pieceId);
   if(target&&piece?.role==='COMBAT'&&view.objectives.some(o=>o.hexId===target&&o.controllerId!==action.actorId)) {
    checked++;const coverage=new Set(m.ruleEngine.queryTraceCoverage(state,action.actorId,action.pieceId).value.hexIds);
    const oldDistance=hexesBetween(action.path.at(-1),target);
    const moves=m.ruleEngine.getActionCandidates(state,{actorId:action.actorId,kind:'MOVE_PIECE',pieceId:action.pieceId,budget:400}).actions
     .filter(a=>!coverage.has(a.path.at(-1))&&hexesBetween(a.path.at(-1),target)<oldDistance).sort((a,b)=>hexesBetween(a.path.at(-1),target)-hexesBetween(b.path.at(-1),target));
    const alternative=moves.find(a=>{const ex=m.ruleEngine.explain(state,a);const v=k=>ex.facts.find(f=>f.key===k)?.value;
     return ex.allowed&&v('supply.relocationMoverHasTrace')===true&&v('supply.relocationTraceLost')===0&&v('supply.relocationFeedLost')===0;});
    if(alternative)missed.push({revision:state.revision,turn:state.sequence.gameTurn,actor:action.actorId,target,action,alternative,snapshot:JSON.stringify(phaseStart),decisionSnapshot:JSON.stringify(state)});
   }
  }
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Replay rejected');state=next.state;
 }
 records.push({match:record.match,checked,missed});console.log(record.match,checked,missed.length);
}
writeFileSync(`tmp/ai-match/vp-promotion-2026-10-13/trace-gain-${summary.options.style}.json`,JSON.stringify(records)+'\n');
