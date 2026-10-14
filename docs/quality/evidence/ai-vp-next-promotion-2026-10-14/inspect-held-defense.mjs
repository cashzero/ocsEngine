import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve('tmp/ai-match/vp-next-2026-10-14');const m=await import(pathToFileURL(`${root}/candidate-v58/dist/index.js`));
for(const [group,match] of [['meeting-v58-temperate',1291002],['meeting-v58-temperate',1291003],['attack-v58-temperate',1292002],['attack-v58-temperate',1292003]]) {
 const summary=JSON.parse(readFileSync(`${root}/${group}/summary.json`));const record=summary.records.find(r=>r.match===match);
 const owner='player:'+Object.entries(record.sides).find(([,p])=>p.policy==='heuristic')[0];
 const save=JSON.parse(readFileSync(`${root}/${group}/match-${match}.save.json`));let state=m.parseGameStateJson(save.initialSnapshot).value;const seen=new Set();
 for(const action of save.acceptedActions) {
  const key=`${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}`;
  if(state.sequence.actingPlayerId===owner&&state.sequence.phase==='MOVEMENT'&&state.sequence.segment==='MOVEMENT'&&!state.pendingDecision&&!seen.has(key)) {
   seen.add(key);const p=m.ruleEngine.projectForViewer(state,owner),s=m.analyze(p,owner,{scenario:state.scenario,turnLimit:8});
   const combat=s.own.filter(u=>s.isCombatUnit(u));const mobile=combat.filter(u=>(u.profile?.movement??0)>0);
   const held=s.objectives.filter(o=>o.controllerId===owner).map(o=>({hex:o.hexId,points:o.points,threat:s.threatAt(o.hexId),
    defenders:s.friendlyAt(o.hexId).filter(u=>s.isCombatUnit(u)).map(u=>({id:u.piece.id,strength:u.profile?.strength??0,movement:u.profile?.movement??0}))}));
   console.log(JSON.stringify({match,turn:state.sequence.gameTurn,revision:state.revision,combat:combat.length,mobile:mobile.length,held}));
  }
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Illegal replay');state=next.state;
 }
}
