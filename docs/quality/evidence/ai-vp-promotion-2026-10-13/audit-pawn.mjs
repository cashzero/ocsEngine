import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
import * as m from '../v19-vp-2026-10-13/engine-checkout/dist/index.js';
import {analyze} from '../v19-vp-2026-10-13/engine-checkout/dist/ai/analysis.js';
import {hexesBetween} from '../v19-vp-2026-10-13/engine-checkout/dist/ai/knowledge.js';
const dir=resolve(process.argv[2]),summary=JSON.parse(readFileSync(`${dir}/summary.json`)),records=[];
for(const record of summary.records) {
 const save=JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`));let state=m.parseGameStateJson(save.initialSnapshot).value;const cases=[];const seen=new Set();
 for(const action of save.acceptedActions) {
  if(!state.pendingDecision&&state.sequence.phase==='MOVEMENT'&&state.sequence.segment==='MOVEMENT') {
   const view=m.ruleEngine.projectForViewer(state,action.actorId),s=analyze(view,action.actorId,{scenario:state.scenario,turnLimit:8});
   for(const point of s.objectives.filter(p=>p.controllerId!==action.actorId)) {
    const enemy=s.enemy.get(point.hexId);if(!enemy||enemy.hasCombatUnit||!enemy.pieces.some(p=>p.role==='REPLACEMENT'))continue;
    for(const unit of s.own.filter(u=>u.piece.role==='COMBAT'&&(u.piece.mode==='STRAT'||u.piece.mode==='MOVE')&&hexesBetween(u.hexId,point.hexId)<=3)) {
     const key=`${state.sequence.gameTurn}:${action.actorId}:${unit.piece.id}:${point.hexId}`;if(seen.has(key))continue;
     const change=m.ruleEngine.getActionCandidates(state,{actorId:action.actorId,kind:'CHANGE_MODE',pieceId:unit.piece.id,budget:40}).actions.find(a=>a.mode==='COMBAT');
     if(!change)continue;const ex=m.ruleEngine.explain(state,change);
     if(!ex.allowed||['supply.relocationTraceLost','supply.relocationFeedLost'].some(k=>ex.facts.find(f=>f.key===k)?.value!==0))continue;
     seen.add(key);cases.push({revision:state.revision,actor:action.actorId,point,unitId:unit.piece.id,change,snapshot:JSON.stringify(state)});
    }
   }
  }
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Replay rejected');state=next.state;
 }
 records.push({match:record.match,cases});console.log(record.match,cases.length);
}
writeFileSync(`tmp/ai-match/vp-promotion-2026-10-13/pawn-${summary.options.style}.json`,JSON.stringify(records)+'\n');
