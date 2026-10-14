import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
const root=resolve('tmp/ai-match/vp-next-2026-10-14'),m=await import(pathToFileURL(`${root}/candidate-v58/dist/index.js`));
const declines=JSON.parse(readFileSync(`${root}/final-advance-declines-plan.json`)),results=[];
for(const key of new Set(declines.map(d=>`${d.group}/${d.match}`))) {
 const [group,id]=key.split('/'),match=Number(id),save=JSON.parse(readFileSync(`${root}/${group}/match-${match}.save.json`));
 let state=m.parseGameStateJson(save.initialSnapshot).value;
 for(const action of save.acceptedActions) {
  if(declines.some(d=>d.match===match&&d.revision===state.revision)) {
   const projection=m.ruleEngine.projectForViewer(state,action.actorId),target=state.activeTransaction.targetHexId;
   const options=m.ruleEngine.getActionCandidates(state,{actorId:action.actorId,kind:'RESPOND_DECISION',budget:400}).actions
    .filter(a=>a.kind==='RESPOND_DECISION'&&a.choiceId.startsWith('advance:')&&!['advance:done','advance:all'].includes(a.choiceId))
    .map(a=>{const piece=state.pieceState.pieces.find(p=>p.id===a.choiceId.slice('advance:'.length));return {action:a,location:piece.location,
     originObjective:projection.objectives.find(o=>o.hexId===piece.location.hexId),facts:m.ruleEngine.explain(state,a).facts};});
   const row={match,revision:state.revision,objective:projection.objectives.find(o=>o.hexId===target),options};results.push(row);console.log(JSON.stringify(row));
   writeFileSync(`${root}/final-advance-${match}-${state.revision}.state.json.gz`,gzipSync(JSON.stringify({snapshot:m.serializeGameState(state).value,actor:action.actorId,...row})));
  }
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Replay rejected');state=next.state;
 }
}
writeFileSync(`${root}/final-advance-options-plan.json`,JSON.stringify(results,null,2));
