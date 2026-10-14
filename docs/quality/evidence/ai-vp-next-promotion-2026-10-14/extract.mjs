import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import * as m from '../../../dist/index.js';
const old='tmp/ai-match/vp-promotion-2026-10-13/replication-v35-meeting-temperate';
for(const [match,revision] of [[1271046,112],[1271025,367]]) {
 const save=JSON.parse(readFileSync(`${old}/match-${match}.save.json`));
 let state=m.parseGameStateJson(save.initialSnapshot).value;
 for(const action of save.acceptedActions) {
  if(state.revision===revision) {
   const ex=m.ruleEngine.explain(state,action);
   const p=m.createHeuristicPolicy({scenario:state.scenario,turnLimit:8});
   console.log(match,state.revision,state.pendingDecision?.kind,action,ex.facts.filter(f=>f.key.startsWith('supply.advance')||f.key.startsWith('supply.overrun')));
   writeFileSync(`tests/ai/fixtures/advance-${match}.state.json.gz`,gzipSync(JSON.stringify({snapshot:m.serializeGameState(state),action})));
   break;
  }
  const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('replay rejected');state=next.state;
 }
}
