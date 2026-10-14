import {readFileSync,writeFileSync} from 'node:fs';import {gzipSync} from 'node:zlib';import * as m from './candidate-v42/dist/index.js';
import {hexesBetween} from './candidate-v42/dist/ai/knowledge.js';
import {analyze} from './candidate-v42/dist/ai/analysis.js';import {isCombatUnit,stepOf} from './candidate-v42/dist/rules/pieces.js';
const root='tmp/ai-match/vp-next-2026-10-14',cases=[];
for(let match=1281100;match<1281120;match++) {
 const save=JSON.parse(readFileSync(`${root}/meeting-v42-eastern/match-${match}.save.json`));let state=m.parseGameStateJson(save.initialSnapshot).value;
 const candidate=match%2===0?'player:allied':'player:axis';let start=null;
 for(const action of save.acceptedActions) {
  if(state.sequence.phase==='MOVEMENT'&&state.sequence.segment==='MOVEMENT'&&action.actorId===candidate&&!state.pendingDecision&&(!start||start.sequence.gameTurn!==state.sequence.gameTurn))start=state;
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Rejected');
  const before=m.ruleEngine.projectForViewer(state,candidate).objectives,after=m.ruleEngine.projectForViewer(next.state,candidate).objectives;
  const lost=before.filter(p=>p.controllerId===candidate&&after.find(q=>q.hexId===p.hexId)?.controllerId!==candidate);
  for(const point of lost) {
   const defenders=state.pieceState.pieces.filter(p=>p.ownerId===candidate&&p.location.kind==='ON_MAP'&&p.location.hexId===point.hexId&&isCombatUnit(state,p)).map(p=>({id:p.id,strength:Number(stepOf(state,p)?.combatStrength??0),mode:p.mode}));
   const situation=start?analyze(m.ruleEngine.projectForViewer(start,candidate),candidate,{scenario:start.scenario,turnLimit:8}):null;
   const neighbors=situation?.own.filter(u=>situation.isCombatUnit(u)&&u.profile?.strength>0&&u.hexId!==point.hexId&&hexesBetween(u.hexId,point.hexId)<=3).map(u=>({id:u.piece.id,hex:u.hexId,strength:u.profile.strength}));
   cases.push({match,turn:state.sequence.gameTurn,revision:state.revision,actor:candidate,point,defenders,threatAtStart:situation?.threatAt(point.hexId),neighbors,defendersAtStart:situation?.friendlyAt(point.hexId).filter(u=>situation.isCombatUnit(u)).map(u=>({id:u.piece.id,strength:u.profile?.strength,mode:u.piece.mode})),pointAtStart:situation?.objectives.find(p=>p.hexId===point.hexId),action,snapshot:start?m.serializeGameState(start).value:null});
   console.log(match,state.sequence.gameTurn,point.hexId,'defenders',defenders.map(d=>d.strength),'threat',situation?.threatAt(point.hexId));
  }

  state=next.state;
 }
}
writeFileSync(`${root}/defence-v42-eastern.json.gz`,gzipSync(JSON.stringify(cases)));
