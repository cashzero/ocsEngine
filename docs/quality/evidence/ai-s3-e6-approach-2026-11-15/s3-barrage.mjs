// Attacker barrages in recorded attack games: per attacker player turn, barrages declared and, at the start of each of its
// Barrage Segments, defended objectives it does not hold with own combat units beside them that a legal barrage could hit,
// and whether any barrage was declared on them in the segment.  node s3-barrage.mjs <root> <dir> <policy substring> [--shard i/n]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : '0/1';
const [shard, shards] = shardArg.split('/').map(Number);
const [root, dir, policyPart] = args.filter((a, i) => a !== '--shard' && args[i - 1] !== '--shard');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
const files = readdirSync(dir).filter((f) => /^match-\d+\.save\.json$/u.test(f)).sort().filter((_, i) => i % shards === shard);
for (const f of files) {
  const match = Number(f.match(/\d+/u)[0]);
  const save = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const me = state.configuration.attackVictory.attackerId;
  const rec = records.find((r) => r.match === match);
  if (!rec.sides[String(me).endsWith('axis') ? 'axis' : 'allied'].policy.includes(policyPart)) continue;
  const out = { match, barrages: 0, segments: 0, targets: 0, targetsHit: 0, regularAttacks: 0, attacksOnTargets: 0 };
  let seg = null;
  for (const action of save.acceptedActions) {
    const s = state.sequence;
    const mine = s.phasingPlayerId === me;
    if (mine && s.segment === 'BARRAGE' && !seg) {
      const projection = m.ruleEngine.projectForViewer(state, me);
      const ownHexes = new Set(state.pieceState.pieces.filter((p) => p.ownerId === me && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p)).map((p) => String(p.location.hexId)));
      const enemyCombat = new Set(state.pieceState.pieces.filter((p) => p.ownerId !== me && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p)).map((p) => String(p.location.hexId)));
      const targets = projection.objectives.filter((o) => o.controllerId !== me && enemyCombat.has(String(o.hexId)) && m.adjacentHexIds(o.hexId).some((h) => ownHexes.has(String(h)))).map((o) => String(o.hexId));
      const cands = m.ruleEngine.getActionCandidates(state, { actorId: me, kind: 'DECLARE_BARRAGE', pieceId: null, budget: 60 }).actions
        .filter((a) => (a.target ?? 'COMBAT_UNITS') === 'COMBAT_UNITS' && targets.includes(String(a.targetHexId)) && m.ruleEngine.explain(state, a).allowed);
      seg = { targets: new Set(cands.map((a) => String(a.targetHexId))), hit: new Set(), phase: s.phase };
      out.segments += 1; out.targets += seg.targets.size;
    }
    if (mine && action.kind === 'DECLARE_BARRAGE') { out.barrages += 1; if (seg?.targets.has(String(action.targetHexId))) seg.hit.add(String(action.targetHexId)); }
    if (mine && action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR') { out.regularAttacks += 1; }
    const next = m.ruleEngine.applyAction(state, action).state;
    if (seg && !(next.sequence.segment === 'BARRAGE' && next.sequence.phasingPlayerId === me && next.sequence.phase === seg.phase)) { out.targetsHit += seg.hit.size; seg = null; }
    state = next;
  }
  console.log(JSON.stringify(out));
}
