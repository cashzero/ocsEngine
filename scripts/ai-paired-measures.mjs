#!/usr/bin/env node
// Paired outcome of a candidate policy in an ai-match --swap run: each pair is a match and the next one, the same seeds
// with the policies' sides exchanged.
//
//   node scripts/ai-paired-measures.mjs <ai-match dir> --candidate <policy id>
//
// Per pair, the mean over its two games of: VP (candidate's final VP minus the other side's), Kill - Loss (steps the
// candidate's opponent lost minus steps the candidate lost) and Supply (combat units the opponent ends out of supply
// minus the candidate's). Reports the mean over pairs with a 95% t interval, and the pairs above, at and below zero.
// Pairs with a game that did not finish are left out and counted.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const candidate = args.includes('--candidate') ? args[args.indexOf('--candidate') + 1] : null;
const dir = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--candidate');
if (!dir || !candidate) throw new Error('usage: ai-paired-measures.mjs <ai-match dir> --candidate <policy id>');

const records = new Map(JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records.map((record) => [record.match, record]));
const measures = {
  VP: (own, other) => own.vp - other.vp,
  'Kill - Loss': (own) => own.stepsKilled - own.stepsLost,
  Supply: (own, other) => other.outOfSupply - own.outOfSupply,
};
const pairs = []; let incomplete = 0;
for (const [match, first] of records) {
  if ((match - Math.min(...records.keys())) % 2 !== 0) continue;
  const games = [first, records.get(match + 1)];
  if (games.some((record) => record?.stopReason !== 'FINISHED')) { incomplete += 1; continue; }
  const sides = games.map(({ sides }) => {
    const own = Object.values(sides).find(({ policy }) => policy === candidate);
    const other = Object.values(sides).find((side) => side !== own);
    if (!own || !other || other.policy === candidate) throw new Error(`match ${match}: candidate ${candidate} must play exactly one side`);
    return { own, other };
  });
  pairs.push(Object.fromEntries(Object.entries(measures).map(([name, measure]) => [name, sides.reduce((sum, { own, other }) => sum + measure(own, other), 0) / 2])));
}

// Student t quantile by the Cornish-Fisher expansion around the normal quantile (accurate to about 1e-3 for df >= 10).
const tQuantile = (df) => {
  const z = 1.959964;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3);
};
const n = pairs.length;
console.log(`${n} pairs (${incomplete} left out: a game did not finish), candidate ${candidate}`);
console.log('| Measure, candidate minus other, per pair | Mean | 95% interval | Pairs positive / zero / negative | SD |');
console.log('|---|---:|---|---|---:|');
for (const name of Object.keys(measures)) {
  const values = pairs.map((pair) => pair[name]);
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1));
  const half = tQuantile(n - 1) * sd / Math.sqrt(n);
  const sign = (test) => values.filter(test).length;
  const fmt = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
  console.log(`| ${name} | ${fmt(mean)} | [${fmt(mean - half)}, ${fmt(mean + half)}] | ${sign((value) => value > 0)} / ${sign((value) => value === 0)} / ${sign((value) => value < 0)} | ${sd.toFixed(2)} |`);
}
