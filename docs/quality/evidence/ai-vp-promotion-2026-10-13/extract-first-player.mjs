import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import * as m from './candidate-v33/dist/index.js';
const behind=process.argv[2]==='behind';const inputs=[];
for(const [style,match] of (behind ? ['temperate','eastern'].flatMap((style,index)=>Array.from({length:8},(_,n)=>[style,1265000+100*index+n])) : [['temperate',1262000],['eastern',1262100]])) {
 const save=JSON.parse(readFileSync(`tmp/ai-match/vp-promotion-2026-10-13/development-v${behind?'34':'33'}-${style}/match-${match}.save.json`));
 let state=m.parseGameStateJson(save.initialSnapshot).value;
 for(const action of save.acceptedActions) {
  if(state.pendingDecision?.kind==='FIRST_PLAYER'&&state.sequence.gameTurn===7) {
   const points=m.ruleEngine.projectForViewer(state,action.actorId).objectives;
   const mine=points.filter(o=>o.controllerId===action.actorId).reduce((n,o)=>n+o.points,0),other=points.filter(o=>o.controllerId&&o.controllerId!==action.actorId).reduce((n,o)=>n+o.points,0);
   if(behind&&mine>=other)break;
   inputs.push({name:`initiative-${match}-${state.revision}`,actor:action.actorId,snapshot:JSON.stringify(state),baselineAction:action});break;
  }
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Rejected replay');state=next.state;
 }
 if(behind&&inputs.length===3)break;
}
if(inputs.length!==(behind?3:2))throw Error('Missing actual initiative decision');
writeFileSync(`tmp/ai-match/vp-promotion-2026-10-13/first-player${behind?'-behind':''}-inputs.json.gz`,gzipSync(JSON.stringify(inputs)));
console.log(inputs.map(f=>[f.name,f.actor,f.baselineAction.choiceId]));
