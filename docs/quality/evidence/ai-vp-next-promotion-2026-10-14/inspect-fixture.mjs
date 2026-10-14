import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import * as m from '../../../dist/index.js';import {isCombatUnit,reTicksOf} from '../../../dist/rules/pieces.js';
const f=JSON.parse(gunzipSync(readFileSync('tests/ai/fixtures/advance-1271046.state.json.gz')));const s=m.parseGameStateJson(f.snapshot).value;
console.log('sequence',s.sequence);
console.log(s.pieceState.pieces.filter(p=>p.ownerId===f.action.actorId&&(p.role==='DUMP'||p.resourceQuantity>0)).map(p=>({id:p.id,location:p.location,quantity:p.resourceQuantity,role:p.role})));
for(const a of m.ruleEngine.getActionCandidates(s,{actorId:f.action.actorId,kind:'RESPOND_DECISION',budget:400}).actions)console.log(a.choiceId,m.ruleEngine.explain(s,a).facts.filter(f=>f.key.startsWith('supply.advance')));
