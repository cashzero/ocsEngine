#!/usr/bin/env node
// Convert named study saves into the existing ai-supply-study input format, recounting loss events.
// node scripts/sea-landing-balance-audit-input.mjs <study dir> <audit dir> allied-0-base allied-0-d50-t4
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import * as m from '../dist/index.js';
const [source, out, ...prefixes] = process.argv.slice(2);
if (!source || !out || !prefixes.length) throw new Error('Expected study directory, output directory and run prefixes');
mkdirSync(out, { recursive: true });
const records = [];
for (const [match, prefix] of prefixes.entries()) {
  const r = JSON.parse(readFileSync(join(source, `${prefix}.json`), 'utf8'));
  const saveText = gunzipSync(readFileSync(join(source, `${prefix}.save.json.gz`))).toString();
  const save = JSON.parse(saveText);
  const trace = JSON.parse(gunzipSync(readFileSync(join(source, `${prefix}.trace.json.gz`))).toString());
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const lost = { allied: 0, axis: 0 };
  for (const action of save.acceptedActions) {
    const next = m.ruleEngine.applyAction(state, action);
    if (!next.ok) throw new Error(`Replay rejected ${prefix}`);
    for (const event of next.events) if (event.kind === 'STEP_LOST') {
      const p = state.pieceState.pieces.find(p => p.id === event.pieceId) ?? next.state.pieceState.pieces.find(p => p.id === event.pieceId);
      lost[String(p.ownerId).endsWith('axis') ? 'axis' : 'allied']++;
    }
    state = next.state;
  }
  const hash = await m.hashGameState(state);
  if (!hash.ok || hash.value !== save.finalStateHash) throw new Error(`Hash mismatch ${prefix}`);
  writeFileSync(join(out, `match-${match}.save.json`), saveText);
  writeFileSync(join(out, `match-${match}.trace.jsonl`), trace.map(t => JSON.stringify(t)).join('\n') + '\n');
  records.push({ match, source: prefix, stopReason: r.stop, replay: { ok: r.replay }, winner: r.winner,
    finalStateHash: save.finalStateHash, sides: Object.fromEntries(['allied', 'axis'].map(side => [side, { ...r.final.sides[side], stepsLost: lost[side] }])) });
}
writeFileSync(join(out, 'summary.json'), JSON.stringify({ records }, null, 2));
console.log(`Prepared ${records.length} supply audits in ${out}`);
