import {readFileSync,writeFileSync} from 'node:fs';import {gzipSync,gunzipSync} from 'node:zlib';import * as m from './candidate-v42/dist/index.js';import {analyze} from './candidate-v42/dist/ai/analysis.js';import {hexesBetween,knowledgeOf} from './candidate-v42/dist/ai/knowledge.js';
const rows=JSON.parse(gunzipSync(readFileSync('tmp/ai-match/vp-next-2026-10-14/defence-v42-eastern.json.gz')));
for(const row of rows.filter(r=>r.match===1281104&&r.turn===7)) {
 const state=m.parseGameStateJson(row.snapshot).value,projection=m.ruleEngine.projectForViewer(state,row.actor),s=analyze(projection,row.actor,{scenario:state.scenario,turnLimit:8}),knowledge=knowledgeOf({scenario:state.scenario,turnLimit:8});
 console.log(row.point,row.action);
 console.log(JSON.stringify([...s.enemy.values()].map(stack=>({hex:stack.hexId,distance:hexesBetween(row.point.hexId,stack.hexId),strength:stack.strength,units:stack.pieces.map(p=>({id:p.id,role:p.role,movement:knowledge.profile(p)?.movement,strength:knowledge.profile(p)?.strength}))})).filter(x=>x.distance<=10),null,2));
 writeFileSync('tests/ai/fixtures/vp-threat-1281104.state.json.gz',gzipSync(JSON.stringify({snapshot:row.snapshot,actor:row.actor,point:row.point,lossAction:row.action,match:row.match,turn:row.turn})));
}
