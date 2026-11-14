// Force concentration of the attacker in saved games or rollouts (WBS S3.3): per attacker player turn of Game Turns 1-6,
// regular attacks declared and those at column index 6 or more of their line's Combat Table, attacks on defended
// objectives, and at the start of its Combat Segment the strength of own combat units beside defended objectives it does
// not hold (and how many such objectives have own units beside them).  node s3-concentration.mjs <root> <arm=dir>... [--shard i/n]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : '0/1';
const [shard, shards] = shardArg.split('/').map(Number);
const [root, ...specs] = args.filter((a, i) => a !== '--shard' && args[i - 1] !== '--shard');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const { analyze } = await import(pathToFileURL(join(root, 'dist', 'ai', 'analysis.js')).href);
const jobs = specs.flatMap((spec) => { const [arm, dir] = spec.split('='); return readdirSync(dir).filter((f) => /^match-\d+\.save\.json$/u.test(f)).sort().map((f) => ({ arm, dir, f })); })
  .filter(({ f }) => Number(f.match(/\d+/u)[0]) % 2 === 0).filter((_, i) => i % shards === shard);
const indexOf = (line, text) => m.COMBAT_TABLE_COLUMNS[line]?.findIndex((c) => `${c.attacker}:${c.defender}` === text) ?? -1;
for (const { arm, dir, f } of jobs) {
  const match = Number(f.match(/\d+/u)[0]);
  const save = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const me = state.configuration.attackVictory.attackerId;
  const facts = { scenario: state.scenario, turnLimit: 8 };
  const turns = new Map();
  const turnOf = (gt) => { if (!turns.has(gt)) turns.set(gt, { gameTurn: gt, attacks: 0, attacks6: 0, objectiveAttacks: 0, besideStrength: 0, besideObjectives: 0, measured: false }); return turns.get(gt); };
  for (const action of save.acceptedActions) {
    const s = state.sequence;
    if (s.gameTurn <= 6 && s.phasingPlayerId === me && s.phase === 'COMBAT' && s.segment === 'COMBAT' && !turnOf(s.gameTurn).measured) {
      const t = turnOf(s.gameTurn); t.measured = true;
      const situation = analyze(m.ruleEngine.projectForViewer(state, me), me, facts);
      const defended = situation.objectives.filter((o) => o.controllerId !== me && situation.enemy.get(o.hexId)?.hasCombatUnit).map((o) => String(o.hexId));
      const counted = new Set();
      for (const target of defended) {
        let any = false;
        for (const unit of situation.own) {
          if (!situation.isCombatUnit(unit) || unit.piece.role === 'HQ' || m.hexDistanceBetween(String(unit.hexId), target) !== 1) continue;
          any = true;
          if (!counted.has(unit.piece.id)) { counted.add(unit.piece.id); t.besideStrength += unit.profile?.strength ?? 0; }
        }
        if (any) t.besideObjectives += 1;
      }
    }
    if (s.gameTurn <= 6 && s.phasingPlayerId === me && action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR') {
      const t = turnOf(s.gameTurn);
      const e = m.ruleEngine.explain(state, action);
      const fact = (k) => e.facts.find((x) => x.key === k)?.value ?? null;
      t.attacks += 1;
      if (indexOf(fact('combat.line'), String(fact('combat.column'))) >= 6) t.attacks6 += 1;
      if (m.ruleEngine.projectForViewer(state, me).objectives.some((o) => String(o.hexId) === String(action.targetHexId) && o.controllerId !== me)) t.objectiveAttacks += 1;
    }
    state = m.ruleEngine.applyAction(state, action).state;
  }
  for (const t of turns.values()) { delete t.measured; console.log(JSON.stringify({ arm, match, ...t })); }
}
