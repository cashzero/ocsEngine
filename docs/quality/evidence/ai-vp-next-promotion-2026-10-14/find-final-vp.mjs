import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
const root=resolve('tmp/ai-match/vp-next-2026-10-14');
const m=await import(pathToFileURL(`${root}/candidate-v58/dist/index.js`));
const found=[];
for(const group of ['meeting','attack'])for(const style of ['temperate','eastern']) {
 const dir=`${root}/${group}-v58-${style}`,records=JSON.parse(readFileSync(`${dir}/summary.json`)).records;
 for(const record of records) {
  const owner='player:'+Object.entries(record.sides).find(([,p])=>p.policy==='heuristic')[0];
  const save=JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`));
  let state=m.parseGameStateJson(save.initialSnapshot).value;
  for(const action of save.acceptedActions) {
   if(state.sequence.gameTurn===8&&state.sequence.playerTurnIndex===1&&state.sequence.actingPlayerId===owner
    &&['MOVEMENT','EXPLOITATION'].includes(state.sequence.phase)&&state.sequence.segment==='MOVEMENT'&&action.kind==='ADVANCE_SEQUENCE'&&!state.pendingDecision) {
    const objectives=m.ruleEngine.projectForViewer(state,owner).objectives;
    for(const piece of state.pieceState.pieces.filter(p=>p.ownerId===owner&&p.role==='COMBAT'&&p.location.kind==='ON_MAP')) {
     for(const move of m.ruleEngine.getActionCandidates(state,{actorId:owner,kind:'MOVE_PIECE',pieceId:piece.id,budget:400}).actions) {
      if(move.kind!=='MOVE_PIECE')continue;
      const captures=objectives.filter(o=>o.controllerId!==owner&&move.path.slice(1).includes(o.hexId));
      if(!captures.length)continue;
      const ex=m.ruleEngine.explain(state,move),value=k=>ex.facts.find(f=>f.key===k)?.value;
      if(!ex.allowed||value('supply.relocationTraceLost')!==0||value('supply.relocationFeedLost')!==0)continue;
      const example={match:record.match,group,style,revision:state.revision,actor:owner,phase:state.sequence.phase,captures,move,snapshot:m.serializeGameState(state).value};
      found.push({...example,snapshot:undefined});
      if(found.length===1)writeFileSync(`${root}/final-vp-opportunity.state.json.gz`,gzipSync(JSON.stringify(example)));
      break;
     }
    }
   }
   const next=m.ruleEngine.applyAction(state,action);if(!next.ok)throw Error('Replay rejected');state=next.state;
  }
  console.log(record.match,'examined');
 }
}
writeFileSync(`${root}/final-vp-opportunities-plan.json`,JSON.stringify(found,null,2));console.log('Found',found.length,'legal supplied unclaimed captures at final phase end');
