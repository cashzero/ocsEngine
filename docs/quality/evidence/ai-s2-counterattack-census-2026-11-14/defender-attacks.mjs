// The defender's regular attacks in attack games, and Combat Segments where it had a column 9+ attack and made none.
//   node defender-attacks.mjs <root> <dir> [--shard i/n]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : '0/1';
const [shard, shards] = shardArg.split('/').map(Number);
const [root, dir] = args.filter((a, i) => a !== '--shard' && args[i - 1] !== '--shard');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
const files = readdirSync(dir).filter((f) => /^match-\d+\.save\.json$/u.test(f)).sort().filter((_, i) => i % shards === shard);
for (const f of files) {
  const save = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const match = Number(f.match(/\d+/u)[0]);
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const attackerId = state.configuration.attackVictory.attackerId;
  const rec = records.find((r) => r.match === match);
  const attackerPolicy = rec.sides[String(attackerId).endsWith('axis') ? 'axis' : 'allied'].policy;
  const out = { match, attackerPolicy, attacks: [], segments: 0, idleGood: 0, goodAvailable: 0 };
  let seg = null;
  const columnOf = (st, a) => { const e = m.ruleEngine.explain(st, a); const c = e.facts.find((x) => x.key === 'combat.column')?.value; return e.allowed ? c : null; };
  const index = (c) => { const n = parseFloat(String(c)); return String(c).includes(':') ? c : n; };
  for (const action of save.acceptedActions) {
    const s = state.sequence;
    const defending = s.phasingPlayerId !== attackerId && s.gameTurn >= 2;
    const inCombat = defending && s.segment === 'COMBAT' && s.phase === 'COMBAT';
    if (inCombat && !seg) {
      const cands = m.ruleEngine.getActionCandidates(state, { actorId: s.phasingPlayerId, kind: 'DECLARE_COMBAT', pieceId: null, budget: 200 }).actions;
      const ratio = (e) => { const [a, b] = String(e.facts.find((x) => x.key === 'combat.column')?.value ?? '').split(':').map(Number); return b > 0 ? a / b : 0; };
      const ratios = cands.map((a) => m.ruleEngine.explain(state, a)).filter((e) => e.allowed).map(ratio);
      seg = { good: ratios.some((r) => r >= 3), attacked: false };
      out.segments += 1; if (seg.good) out.goodAvailable += 1;
    }
    if (inCombat && action.kind === 'DECLARE_COMBAT') {
      const e = m.ruleEngine.explain(state, action);
      out.attacks.push({ gameTurn: s.gameTurn, column: e.facts.find((x) => x.key === 'combat.column')?.value ?? null, line: e.facts.find((x) => x.key === 'combat.line')?.value ?? null });
      seg.attacked = true;
    }
    const next = m.ruleEngine.applyAction(state, action).state;
    if (seg && !(next.sequence.segment === 'COMBAT' && next.sequence.phase === 'COMBAT' && next.sequence.phasingPlayerId === s.phasingPlayerId)) {
      if (seg.good && !seg.attacked) out.idleGood += 1;
      seg = null;
    }
    state = next;
  }
  console.log(JSON.stringify(out));
}
