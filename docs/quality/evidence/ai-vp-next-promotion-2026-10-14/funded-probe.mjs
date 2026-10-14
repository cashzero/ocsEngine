import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import * as m from '../../../dist/index.js';
const f=JSON.parse(gunzipSync(readFileSync('tests/ai/fixtures/advance-1271046.state.json.gz')));const s=m.parseGameStateJson(f.snapshot).value;
const dump=s.pieceState.pieces.find(p=>p.ownerId===f.action.actorId && String(p.id).includes('independent-supply-2'));console.log('dump',dump?.id);
for(const tokens of [1,2,8,20]) {
 const state={...s,pieceState:{...s.pieceState,pieces:s.pieceState.pieces.map(p=>p.id===dump.id?{...p,resourceQuantity:tokens,location:{kind:'ON_MAP',hexId:'7,16'}}:p)}};
 console.log(tokens,m.ruleEngine.explain(state,f.action).facts.filter(f=>f.key.startsWith('supply.advance')));
}
