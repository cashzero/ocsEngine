import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import * as m from '../../../dist/index.js';
const f=JSON.parse(gunzipSync(readFileSync('tests/ai/fixtures/advance-1271025.state.json.gz')));const s=m.parseGameStateJson(f.snapshot).value;
const id=f.action.attackerSupply[0].dumpIds[0],p=s.pieceState.pieces.find(p=>p.id===id);console.log(id,p.location,p.resourceQuantity);
for(const hex of ['2,18','2,17','1,19']) {
 const state={...s,pieceState:{...s.pieceState,pieces:s.pieceState.pieces.map(p=>p.id===id?{...p,resourceQuantity:40,location:{kind:'ON_MAP',hexId:hex}}:p)}};
 const ex=m.ruleEngine.explain(state,f.action);console.log(hex,ex.allowed,ex.facts.filter(f=>f.key.startsWith('supply.overrun')));
}
