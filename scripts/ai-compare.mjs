#!/usr/bin/env node
// Head-to-head summary of ai-match runs: wins, Victory Points and kill/death ratio per policy.
//
//   node scripts/ai-compare.mjs tmp/ai-match/v11-vs-v10-meeting tmp/ai-match/v11-vs-v10-attack
//
// Reads summary.json from each directory. Per policy: games, wins-losses-draws with a two-sided sign test (draws
// dropped), mean final VP and VP margin (own minus the other side's) with its standard error, steps the other side
// lost (kills) and steps lost (deaths), and K/D = total kills / total deaths. Matches that did not finish are skipped.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dirs = process.argv.slice(2);
if (dirs.length === 0) throw new Error('usage: ai-compare.mjs <ai-match dir>...');

const signTest = (wins, losses) => {
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.min(wins, losses);
  let tail = 0;
  let c = 1;
  for (let i = 0; i <= n; i += 1) {
    if (i <= k) tail += c;
    c = (c * (n - i)) / (i + 1);
  }
  return Math.min(1, (2 * tail) / 2 ** n);
};

const stats = new Map();
const byDir = [];
for (const dir of dirs) {
  const { records } = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  const local = new Map();
  for (const record of records) {
    if (record.stopReason !== 'FINISHED' || !record.sides) continue;
    const entries = Object.entries(record.sides);
    for (const [side, info] of entries) {
      const other = entries.find(([name]) => name !== side)[1];
      for (const table of [stats, local]) {
        const e = table.get(info.policy) ?? { games: 0, wins: 0, losses: 0, draws: 0, vp: 0, margins: [], kills: 0, deaths: 0, asSide: {} };
        e.games += 1;
        if (record.winner === side) e.wins += 1; else if (record.winner === 'draw') e.draws += 1; else e.losses += 1;
        e.vp += info.vp;
        e.margins.push(info.vp - other.vp);
        e.kills += info.stepsKilled ?? 0;
        e.deaths += info.stepsLost ?? 0;
        // Paired seats (ai-match --swap): the two games on one seed set, one from each seat.
        const pair = (e.pairs ??= new Map()).get(record.seeds.map) ?? [];
        pair.push(info.vp - other.vp);
        e.pairs.set(record.seeds.map, pair);
        const s = e.asSide[side] ??= { games: 0, wins: 0 };
        s.games += 1; if (record.winner === side) s.wins += 1;
        table.set(info.policy, e);
      }
    }
  }
  byDir.push([dir, local]);
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
const se = (values) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((t, v) => t + (v - m) ** 2, 0) / (values.length - 1) / values.length);
};
const pairedOf = (e) => {
  const pairs = [...(e.pairs ?? new Map()).values()].filter((pair) => pair.length === 2).map(([a, b]) => (a + b) / 2);
  return pairs.length < 2 ? '-' : `${mean(pairs).toFixed(2)} ± ${se(pairs).toFixed(2)} (${pairs.length})`;
};
const table = (entries) => [
  '| policy | games | W-L-D | p (sign) | mean VP | VP margin ± se | paired margin ± se | kills/game | deaths/game | K/D | win% as allied / axis |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...[...entries].map(([policy, e]) => `| ${policy} | ${e.games} | ${e.wins}-${e.losses}-${e.draws} | ${signTest(e.wins, e.losses).toFixed(3)} | `
    + `${(e.vp / e.games).toFixed(2)} | ${mean(e.margins).toFixed(2)} ± ${se(e.margins).toFixed(2)} | ${pairedOf(e)} | ${(e.kills / e.games).toFixed(1)} | `
    + `${(e.deaths / e.games).toFixed(1)} | ${(e.kills / Math.max(1, e.deaths)).toFixed(2)} | `
    + `${['allied', 'axis'].map((side) => e.asSide[side] ? `${Math.round(100 * e.asSide[side].wins / e.asSide[side].games)}%` : '-').join(' / ')} |`),
].join('\n');

if (byDir.length > 1) for (const [dir, local] of byDir) console.log(`## ${dir}\n\n${table(local)}\n`);
console.log(`## all\n\n${table(stats)}`);
