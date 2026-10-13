import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
import * as m from '../v19-vp-2026-10-13/engine-checkout/dist/index.js';
import {analyze} from '../v19-vp-2026-10-13/engine-checkout/dist/ai/analysis.js';
const dir=resolve(process.argv[2]),selected=process.argv.slice(3).map(Number);
const summary=JSON.parse(readFileSync(`${dir}/summary.json`));const records=[];
for(const record of summary.records.filter(r=>!selected.length||selected.includes(r.match))) {
 const save=JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`));let state=m.parseGameStateJson(save.initialSnapshot).value;const cases=[];
 for(const action of save.acceptedActions) {
  if(action.kind==='MOVE_PIECE'&&(state.sequence.gameTurn<8||state.sequence.playerTurnIndex===0)) {
   const view=m.ruleEngine.projectForViewer(state,action.actorId),s=analyze(view,action.actorId,{scenario:state.scenario,turnLimit:8});
   const unit=s.own.find(u=>u.piece.id===action.pieceId),point=s.objectives.find(o=>o.hexId===action.path[0]&&o.controllerId===action.actorId);
   if(unit?.piece.role==='COMBAT'&&point) {
    const others=s.friendlyAt(point.hexId).filter(u=>u.piece.id!==unit.piece.id&&s.isCombatUnit(u));
    const remaining=others.reduce((n,u)=>n+(u.profile?.strength??0),0),required=Math.max(1,s.threatAt(point.hexId)*0.5),strength=unit.profile?.strength??0;
    const addedRisk=Math.max(0,required-remaining)-Math.max(0,required-remaining-strength);
    if(others.length&&addedRisk>0)cases.push({revision:state.revision,turn:state.sequence.gameTurn,actor:action.actorId,point,strength,remaining,required,action,snapshot:JSON.stringify(state)});
   }
  }
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Replay rejected');state=next.state;
 }
 records.push({match:record.match,cases});console.log(record.match,cases.length);
}
writeFileSync(`tmp/ai-match/vp-promotion-2026-10-13/defence-${summary.options.style}-${selected.join('-')||'all'}.json`,JSON.stringify(records)+'\n');
