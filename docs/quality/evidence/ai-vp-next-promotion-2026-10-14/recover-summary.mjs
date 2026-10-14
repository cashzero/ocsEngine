import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as m from './candidate-v42/dist/index.js';
const [group,label,startText]=process.argv.slice(2),start=Number(startText),dir=resolve(`tmp/ai-match/vp-next-2026-10-14/${group}-v42-${label}`);
const baseline=resolve('tmp/ai-match/vp-promotion-2026-10-13/candidate-v35/dist');
const style=label==='temperate'?'TEMPERATE_INLAND':'EASTERN_EUROPE',records=[];
const originalLog=readFileSync(`${dir}.log`,'utf8');
const sideOf=id=>String(id).endsWith('axis')?'axis':'allied';
for(let match=start;match<start+20;match++) {
 const began=performance.now(),save=JSON.parse(readFileSync(`${dir}/match-${match}.save.json`)),trace=readFileSync(`${dir}/match-${match}.trace.jsonl`,'utf8').trim().split('\n').map(JSON.parse);
 const accepted=trace.filter(t=>t.status==='ACCEPTED'),rejected=trace.filter(t=>t.status==='REJECTED');
 if(rejected.length||accepted.length!==save.acceptedActions.length)throw Error('Missing/invalid decision trace');
 let state=m.parseGameStateJson(save.initialSnapshot).value;
 const initial={allied:m.ruleEngine.projectForViewer(state,'player:allied'),axis:m.ruleEngine.projectForViewer(state,'player:axis')};
 const stepsLost={allied:0,axis:0},cargoSpent={allied:0,axis:0},actions={allied:{},axis:{}},counts={};
 for(let index=0;index<save.acceptedActions.length;index++) {
  const action=save.acceptedActions[index];if(action.actionId!==accepted[index].action.actionId||state.revision!==accepted[index].revision)throw Error('Trace/save sequence mismatch');
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Replay rejected');
  const side=sideOf(action.actorId);actions[side][action.kind]=(actions[side][action.kind]??0)+1;counts[action.kind]=(counts[action.kind]??0)+1;
  for(const event of next.events) {
   if(event.kind==='STEP_LOST') {const p=state.pieceState.pieces.find(p=>p.id===event.pieceId)??next.state.pieceState.pieces.find(p=>p.id===event.pieceId);if(p)stepsLost[sideOf(p.ownerId)]++;}
   const id=event.kind==='SUPPLY_SPENT'?event.resourcePieceId:event.kind==='RESOURCE_CONSUMED'?event.reservation.resourcePieceId:null;
   const quantity=event.kind==='SUPPLY_SPENT'?event.quantity:event.kind==='RESOURCE_CONSUMED'?event.reservation.quantity:0;
   const p=state.pieceState.pieces.find(p=>p.id===id);if(p?.location.kind==='CONTAINER')cargoSpent[sideOf(p.ownerId)]+=quantity;
  }
  state=next.state;
 }
 const hash=await m.hashGameState(state);if(!hash.ok||hash.value!==save.finalStateHash||state.sequence.phase!=='COMPLETE'||state.pendingDecision||state.sequence.gameTurn!==8)throw Error('Final replay mismatch');
 const swapped=match%2===1,policies={allied:swapped?'heuristic@'+baseline:'heuristic',axis:swapped?'heuristic':'heuristic@'+baseline};
 const sides=Object.fromEntries(['allied','axis'].map(side=>{
  const owner='player:'+side,p=m.ruleEngine.projectForViewer(state,owner),units=p.stacks.filter(s=>s.location.kind==='ON_MAP').flatMap(s=>s.pieces.filter(u=>u.ownerId===owner&&u.role==='COMBAT'));
  return [side,{policy:policies[side],vp:state.victory.scores.find(s=>s.playerId===owner).points,
   captured:p.objectives.filter(o=>o.controllerId===owner&&initial[side].objectives.find(i=>i.hexId===o.hexId)?.controllerId!==owner).map(o=>o.hexId),
   combatUnits:units.length,outOfSupply:units.filter(p=>p.statuses.includes('status:out-of-supply')).length,cargoSpent:cargoSpent[side],stepsLost:stepsLost[side],stepsKilled:stepsLost[side==='allied'?'axis':'allied'],actions:actions[side]}];
 }));
 const base=0x0a1b0000+(swapped?match-1:match)*97,play=originalLog.match(new RegExp(`match ${match}: FINISHED actions=\\d+ play=(\\d+)ms`));
 records.push({match,seeds:{map:base+1,oob:base+2,deployment:base+3,rules:base+4,allied:base+5,axis:base+6},stopReason:'FINISHED',errors:[],sides,
  winner:state.victory.winnerId?sideOf(state.victory.winnerId):'draw',accepted:accepted.length,rejected:0,actionCounts:counts,finalStateHash:hash.value,
  reached:{gameTurn:8,phase:'COMPLETE'},victory:state.victory,replay:{ok:true,ms:Math.round(performance.now()-began)},
  timings:{createMs:null,playMs:play?Number(play[1]):null,decideMs:Math.round(trace.reduce((n,t)=>n+(t.decideMs??0),0)),dispatchMs:Math.round(trace.reduce((n,t)=>n+(t.dispatchMs??0),0))},
  summary:{mapSize:'32×24',mapStyle:style,engagement:group==='meeting'?'MEETING':'AXIS_ATTACKS',turnLimit:8},
  provenance:'Recovered from untouched completed save and decision trace after user reduced the original parent queue to 80; all actions independently replayed and hash verified.'});
 console.log(match,'recovered and replay verified');
}
writeFileSync(`${dir}/summary.json`,JSON.stringify({options:{matches:20,start,turns:8,style,engagement:group==='meeting'?'MEETING':'AXIS_ATTACKS',swap:true,policies:{allied:'heuristic',axis:'heuristic@'+baseline}},records},null,2)+'\n');
