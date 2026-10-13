import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import * as m from '../../../dist/index.js';
import {isCombatUnit} from '../../../dist/rules/pieces.js';
const dir=resolve(process.argv[2]);const summary=JSON.parse(readFileSync(`${dir}/summary.json`));const records=[];
for(const r of summary.records) {
 const save=JSON.parse(readFileSync(`${dir}/match-${r.match}.save.json`));let state=m.parseGameStateJson(save.initialSnapshot).value;let checked=0;const missed=[];
 for(const action of save.acceptedActions) {
  if(action.kind==='PLACE_REINFORCEMENT') {
   const piece=state.pieceState.pieces.find(p=>p.id===action.pieceId);
   if(isCombatUnit(state,piece)) {
    checked++;const trace=new Set(m.ruleEngine.queryTraceCoverage(state,action.actorId,action.pieceId).value.hexIds);
    if(!trace.has(action.hexId)) {
     const options=m.ruleEngine.getActionCandidates(state,{actorId:action.actorId,kind:'PLACE_REINFORCEMENT',pieceId:action.pieceId,budget:1000}).actions;
     const alternative=options.find(a=>trace.has(a.hexId));
     if(alternative)missed.push({revision:state.revision,turn:state.sequence.gameTurn,actor:action.actorId,action,alternative,snapshot:JSON.stringify(state)});
    }
   }
  }
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Replay rejected');state=next.state;
 }
 records.push({match:r.match,checked,missed});console.log(r.match,checked,missed.length);
}
writeFileSync(`tmp/ai-match/vp-promotion-2026-10-13/placement-${summary.options.style}.json`,JSON.stringify(records)+'\n');
