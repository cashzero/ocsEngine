#!/usr/bin/env node
// Attacker rows of `ai-position-record.mjs --theater` output, by the attacker's policy and Game Turns 1-3 / 4-8: mean
// theater potential at the row, mean realized value at Combat segment entry, their ratio, and mean objective VP gained
// in the player turn (docs/ai/theater-supply-plan.md).
//
//   node scripts/ai-theater-realized.mjs <rows.jsonl>...
import { readFileSync } from 'node:fs';

const rows = process.argv.slice(2).flatMap((file) => readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line)))
  .filter((row) => row.attackerId && row.phasingPlayerId === row.attackerId && row.theater);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
console.log('| Attacker | Game Turns | Rows | Potential | Realized at Combat entry | Share | Objective VP gained |');
console.log('|---|---|---:|---:|---:|---:|---:|');
for (const policy of [...new Set(rows.map((row) => row.policies[row.attackerId]))].sort()) {
  for (const [label, early] of [['1–3', true], ['4–8', false]]) {
    const group = rows.filter((row) => row.policies[row.attackerId] === policy && (row.gameTurn <= 3) === early);
    const realized = group.filter(({ theaterRealized }) => theaterRealized !== null);
    const potential = mean(group.map((row) => row.theater[row.attackerId].potential));
    const value = mean(realized.map(({ theaterRealized }) => theaterRealized));
    console.log(`| ${policy} | ${label} | ${group.length} | ${potential.toFixed(2)} | ${value.toFixed(2)} | ${(value / potential).toFixed(2)} | ${mean(group.map((row) => row.turn[row.attackerId].objectiveVpGained)).toFixed(2)} |`);
  }
}

// Paired by seat-swapped matches (a match and the next): a policy's objective VP gained as attacker minus the other's.
const policies = [...new Set(rows.map((row) => row.policies[row.attackerId]))].sort();
if (policies.length === 2) {
  const first = Math.min(...rows.map(({ match }) => match));
  const tQuantile = (df) => { const z = 1.959964; return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2); };
  console.log(`\nPaired by seat-swapped matches, ${policies[1]} attacking minus ${policies[0]} attacking, objective VP gained per game:`);
  console.log('| Game Turns | Pairs | Mean | 95% interval |');
  console.log('|---|---:|---:|---|');
  for (const [label, test] of [['1–3', (turn) => turn <= 3], ['4–8', (turn) => turn > 3], ['1–8', () => true]]) {
    const byPair = new Map();
    for (const row of rows.filter(({ gameTurn }) => test(gameTurn))) {
      const key = Math.floor((row.match - first) / 2);
      const entry = byPair.get(key) ?? Object.fromEntries(policies.map((policy) => [policy, 0]));
      entry[row.policies[row.attackerId]] += row.turn[row.attackerId].objectiveVpGained;
      byPair.set(key, entry);
    }
    const values = [...byPair.values()].map((entry) => entry[policies[1]] - entry[policies[0]]);
    const average = mean(values);
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
    const half = tQuantile(values.length - 1) * sd / Math.sqrt(values.length);
    console.log(`| ${label} | ${values.length} | ${average.toFixed(2)} | [${(average - half).toFixed(2)}, ${(average + half).toFixed(2)}] |`);
  }
}
