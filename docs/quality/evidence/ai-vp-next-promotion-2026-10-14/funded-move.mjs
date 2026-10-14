import {readFileSync,writeFileSync} from 'node:fs';import {gzipSync} from 'node:zlib';import * as m from './candidate-v49/dist/index.js';import {isCombatUnit,isHq,needsFuel} from './candidate-v49/dist/rules/pieces.js';
const root='tmp/ai-match/vp-next-2026-10-14';
const save=JSON.parse(readFileSync(`${root}/meeting-v47-temperate/match-1283000.save.json`));let state=m.parseGameStateJson(save.initialSnapshot).value,found=null;
for(let index=0;index<Math.min(80,save.acceptedActions.length)&&!found;index++) {
 const actor=state.sequence.actingPlayerId;
 if(!state.pendingDecision&&state.sequence.phase==='MOVEMENT'&&state.sequence.segment==='MOVEMENT') {
  for(const p of state.pieceState.pieces.filter(p=>p.ownerId===actor&&p.location.kind==='ON_MAP'&&isCombatUnit(state,p)&&!isHq(state,p)&&!needsFuel(state,p))) {
   const covered=new Set(m.ruleEngine.queryTraceCoverage(state,actor,p.id).value.hexIds);
   const moves=m.ruleEngine.getActionCandidates(state,{actorId:actor,kind:'MOVE_PIECE',pieceId:p.id,budget:400}).actions.filter(a=>!covered.has(a.path.at(-1)));
   for(const a of moves.slice(0,12)) {
    const ex=m.ruleEngine.explain(state,a),v=k=>ex.facts.find(f=>f.key===k)?.value;
    if(ex.allowed&&v('supply.relocationTraceLost')===1&&v('supply.relocationOtherTraceLost')===0&&v('supply.relocationFeedLost')===0&&v('supply.relocationMoverHasTrace')===false&&v('supply.relocationRationsPreserved')===true) {
     const next=m.ruleEngine.applyAction(state,a);if(!next.ok||next.events.some(e=>e.kind==='DICE_ROLLED'))continue;
     found={snapshot:m.serializeGameState(state).value,action:a,match:1283000,revision:state.revision};console.log('funded move',state.revision,p.id,a.path.at(-1));break;
    }
   }
   if(found)break;
  }
 }
 const next=m.ruleEngine.applyAction(state,save.acceptedActions[index]);if(!next.ok)throw Error('Replay rejected');state=next.state;
}
if(!found)throw Error('No recorded legal funded departure found');
writeFileSync('tests/ai/fixtures/vp-funded-move-1283000.state.json.gz',gzipSync(JSON.stringify(found)));
