import {readFileSync,writeFileSync} from 'node:fs';import {gzipSync} from 'node:zlib';
import * as m from './candidate-v24/dist/index.js';
import {createHeuristicPolicy as baseline} from '../v19-vp-2026-10-13/engine-checkout/dist/ai/policies/heuristic.js';
const dir='tmp/ai-match/vp-promotion-2026-10-13/development-v24-temperate',match=1235002;
const save=JSON.parse(readFileSync(`${dir}/match-${match}.save.json`));
const trace=new Map(readFileSync(`${dir}/match-${match}.trace.jsonl`,'utf8').trim().split('\n').map(JSON.parse).map(t=>[t.revision,t]));
let state=m.parseGameStateJson(save.initialSnapshot).value;const policy=baseline({scenario:state.scenario,turnLimit:8});
for(const action of save.acceptedActions) {
 if(action.kind==='PLACE_REINFORCEMENT'&&trace.get(state.revision).policy==='heuristic@24') {
  const owner=action.actorId;const context={seatId:'seat:extract',playerId:owner,memory:{stepKey:'placement',actions:0,notes:new Map()},rng:m.createBotRng(7,'extract',0),view:{projection:m.ruleEngine.projectForViewer(state,owner),pendingDecision:state.pendingDecision},
   actions:{families:()=>m.ruleEngine.getActionFamilies(state,owner).filter(f=>f.enabled).map(f=>f.kind),candidates:(kind,pieceId=null,budget=400)=>m.ruleEngine.getActionCandidates(state,{actorId:owner,kind,pieceId,budget}).actions,
    movementRange:id=>m.ruleEngine.queryMovementRange(state,owner,id).value,explain:a=>({current:true,explanation:m.ruleEngine.explain(state,a)}),traceCoverage:(id=null)=>m.ruleEngine.queryTraceCoverage(state,owner,id).value,feedCoverage:(id=null)=>m.ruleEngine.queryFeedCoverage(state,owner,id).value}};
  const old=policy.decide(context).action;
  if(old.kind==='PLACE_REINFORCEMENT'&&(old.hexId!==action.hexId||old.pieceId!==action.pieceId)) {
   const fixture={match,revision:state.revision,snapshot:JSON.stringify(state),action,baselineAction:old};
   writeFileSync(`tests/ai/fixtures/vp-placement-${match}.state.json.gz`,gzipSync(JSON.stringify(fixture)));
   console.log(JSON.stringify({match,revision:state.revision,old,action}));break;
  }
 }
 const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Replay rejected');state=next.state;
}
