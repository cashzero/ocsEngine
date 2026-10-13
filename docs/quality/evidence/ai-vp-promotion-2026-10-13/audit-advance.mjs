import {readFileSync,writeFileSync} from 'node:fs';
import * as m from './candidate-v31/dist/index.js';
import {analyze} from './candidate-v31/dist/ai/analysis.js';
const dir=process.argv[2], matches=process.argv.slice(3).map(Number), summary=JSON.parse(readFileSync(`${dir}/summary.json`)), records=[];
for(const match of matches) {
 const save=JSON.parse(readFileSync(`${dir}/match-${match}.save.json`));let state=m.parseGameStateJson(save.initialSnapshot).value;const cases=[];
 for(const action of save.acceptedActions) {
  if(state.pendingDecision?.kind==='ADVANCE_HEX'&&action.kind==='RESPOND_DECISION'&&action.choiceId==='advance:done') {
   const actor=action.actorId,view=m.ruleEngine.projectForViewer(state,actor),s=analyze(view,actor,{scenario:state.scenario,turnLimit:8}),hex=view.combat?.targetHexId;
   const point=s.objectives.find(o=>o.hexId===hex&&o.controllerId===actor);
   if(point) {
    const held=s.friendlyAt(hex).filter(u=>s.isCombatUnit(u)).reduce((n,u)=>n+(u.profile?.strength??0),0),threat=s.threatAt(hex);
    const alternatives=m.ruleEngine.getActionCandidates(state,{actorId:actor,kind:'RESPOND_DECISION',budget:400}).actions.filter(a=>a.kind==='RESPOND_DECISION'&&a.choiceId.startsWith('advance:')&&!['advance:all','advance:done'].includes(a.choiceId)).flatMap(a=>{
     const unit=s.own.find(u=>u.piece.id===a.choiceId.slice('advance:'.length));
     if(!unit||!s.isCombatUnit(unit)||s.objectives.some(o=>o.hexId===unit.hexId&&o.controllerId===actor))return [];
     const traced=m.ruleEngine.queryTraceCoverage(state,actor,unit.piece.id).value.hexIds.includes(hex);
     const applied=m.ruleEngine.applyAction(state,a);if(!applied.ok)return [];
     const lost=state.pieceState.pieces.filter(p=>p.ownerId===actor&&p.location.kind==='ON_MAP'&&m.pieceHasTrace(state,p)&&!m.pieceHasTrace(applied.state,applied.state.pieceState.pieces.find(q=>q.id===p.id))).map(p=>p.id);
     return [{action:a,strength:unit.profile?.strength??0,traced,lost}];
    });
    if(threat>=8&&held<threat*0.5&&alternatives.some(a=>a.traced&&!a.lost.length))cases.push({revision:state.revision,turn:state.sequence.gameTurn,actor,policy:summary.records.find(r=>r.match===match).sides[actor.split(':').at(-1)].policy,point,held,threat,alternatives,snapshot:JSON.stringify(state)});
   }
  }
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('rejected replay');state=next.state;
 }
 records.push({match,cases});console.log(match,cases.length);
}
writeFileSync(`tmp/ai-match/vp-promotion-2026-10-13/advance-${matches.join('-')}.json`,JSON.stringify(records));
