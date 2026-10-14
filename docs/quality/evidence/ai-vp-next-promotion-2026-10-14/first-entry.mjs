import {readFileSync,writeFileSync} from 'node:fs';import {gzipSync} from 'node:zlib';import * as m from '../../../dist/index.js';
const save=JSON.parse(readFileSync('tmp/ai-match/vp-promotion-2026-10-13/validation-v31-attack-eastern/match-1258101.save.json'));
let state=m.parseGameStateJson(save.initialSnapshot).value;
for(const action of save.acceptedActions) {
 if(state.pendingDecision?.kind==='ADVANCE_HEX'&&state.activeTransaction?.targetHexId==='9,16'&&state.sequence.gameTurn===3) {
  const actor=action.actorId;
  console.log(state.revision,state.mapState.hexControl.find(c=>c.hexId==='9,16'),state.pendingDecision.options.map(o=>o.id));
  if(!state.mapState.hexControl.some(c=>c.hexId==='9,16'&&c.controllerId===actor)) {
   writeFileSync('tests/ai/fixtures/vp-first-entry-1258101.state.json.gz',gzipSync(JSON.stringify({snapshot:m.serializeGameState(state).value,actor,baselineAction:action})));
   break;
  }
 }
 const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('replayrejected');state=next.state;
}
