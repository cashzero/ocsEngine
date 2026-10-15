#!/usr/bin/env node
// Summarize a registered sensitivity study without inferring population win rates from its small paired sample.
// node scripts/sea-landing-balance-summary.mjs artifacts/sea-balance/matrix
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
const dir = process.argv[2];
if (!dir) throw new Error('Expected study directory');
const registration = JSON.parse(readFileSync(join(dir, 'registration.json'), 'utf8'));
const records = readdirSync(dir).filter(name => /^(allied|axis)-\d+-.*\.json$/.test(name)).map(name => JSON.parse(readFileSync(join(dir, name), 'utf8')));
// The initial state caches zero victory scores until the first action. Count actual held objectives instead.
for (const r of records) {
  const prefix = `${r.side}-${r.seed}-${r.variant.id}`;
  const save = JSON.parse(gunzipSync(readFileSync(join(dir, `${prefix}.save.json.gz`))).toString());
  const initial = JSON.parse(save.initialSnapshot);
  const control = new Map(initial.mapState.hexControl.map(c => [c.hexId, c.controllerId]));
  r.openingVp = Object.fromEntries(['allied', 'axis'].map(side => [side,
    initial.configuration.objectives.reduce((n, o) => n + (control.get(o.hexId) === `player:${side}` ? o.points : 0), 0)]));
}
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const finiteMean = values => mean(values.filter(x => x !== null));
const groups = [];
const rows = [];
for (const side of registration.options.sides) {
  const defender = side === 'allied' ? 'axis' : 'allied';
  for (const variant of registration.cases) {
    const selected = records.filter(r => r.side === side && r.variant.id === variant.id);
    for (const r of selected) {
      const base = records.find(b => b.side === side && b.seed === r.seed && b.variant.id === 'base');
      if (base && JSON.stringify(base.seeds) !== JSON.stringify(r.seeds)) throw new Error('Unpaired seeds');
      if (base && (base.threshold !== r.threshold || base.openingVp[side] !== r.openingVp[side])) throw new Error('Objectives changed within pair');
      rows.push({ side, seed: r.seed, variant: variant.id, stop: r.stop, replay: r.replay, rejected: r.rejected, errors: r.errors.length,
        winner: r.winner, startingVp: r.openingVp[side], finalVp: r.final.sides[side].vp, threshold: r.threshold,
        firstAttack: r.firstAttack, firstCapture: r.firstCapture,
        attacker: r.final.sides[side], defender: r.final.sides[defender], opening: r.opening,
        delayedAfterEnd: r.scheduled.filter(s => s.turn > r.request.turnLimit).length,
        scheduled: r.scheduled.map(({ side, name, archetype, turn }) => ({ side, name, archetype, turn })), playMs: r.playMs });
    }
    if (!selected.length) continue;
    const deltas = selected.map(r => {
      const base = records.find(b => b.side === side && b.seed === r.seed && b.variant.id === 'base');
      return base ? r.final.sides[side].vp - base.final.sides[side].vp : null;
    });
    groups.push({ side, variant: variant.id, games: selected.length,
      wins: selected.filter(r => r.winner === side).length,
      captures: selected.filter(r => r.firstCapture !== null).length,
      finalVp: mean(selected.map(r => r.final.sides[side].vp)), vpDeltaVsBase: finiteMean(deltas),
      firstAttack: finiteMean(selected.map(r => r.firstAttack)), noAttack: selected.filter(r => r.firstAttack === null).length,
      attackerLoss: mean(selected.map(r => r.final.sides[side].stepsLost)),
      defenderLoss: mean(selected.map(r => r.final.sides[defender].stepsLost)),
      attackerAttrition: mean(selected.map(r => r.final.sides[side].attritionSteps)),
      landedT: mean(selected.map(r => r.final.sides[side].landedT)), boxT: mean(selected.map(r => r.final.sides[side].boxSupplyT)),
      openingAttackValue: mean(selected.map(r => r.opening[side].combatValue)),
      openingDefenseValue: mean(selected.map(r => r.opening[defender].combatValue)),
      scheduledAfterEnd: selected.reduce((n, r) => n + r.scheduled.filter(s => s.turn > r.request.turnLimit).length, 0),
      allLegalReplay: selected.every(r => r.stop === 'FINISHED' && r.replay && !r.rejected && r.errors.length === 0) });
  }
}
const output = { registration, completed: records.length, expected: registration.jobs.length, groups, rows };
writeFileSync(join(dir, 'analysis.json'), JSON.stringify(output, null, 2));
const n = value => value === null ? '—' : Number(value.toFixed(2));
const lines = ['| Attacker | Setting | Games | Attacker wins | Games with capture | VP Δ vs baseline | First attack turn* | Attacker / defender steps lost | Attacker attrition | SP landed (T) | Box SP (T) |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...groups.map(g => `| ${g.side} | ${g.variant} | ${g.games} | ${g.wins} | ${g.captures} | ${n(g.vpDeltaVsBase)} | ${n(g.firstAttack)} | ${n(g.attackerLoss)} / ${n(g.defenderLoss)} | ${n(g.attackerAttrition)} | ${n(g.landedT)} | ${n(g.boxT)} |`),
  '', '*Mean only over games with an attack; no-attack counts are in analysis.json. All other amounts are per game. Paired development seeds, not an estimate of population win rate.',
  '', `Completed ${records.length}/${registration.jobs.length}; legal complete replay in ${groups.filter(g => g.allLegalReplay).length}/${groups.length} populated groups.`];
writeFileSync(join(dir, 'analysis.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
