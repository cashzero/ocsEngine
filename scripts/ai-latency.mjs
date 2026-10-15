#!/usr/bin/env node
// Decision latency of a bot match, from the trace `scripts/ai-match.mjs --trace` writes (doc 03 BOT-09).
//   node scripts/ai-match.mjs --matches 1 --start 3 --parallel 1 --allied heuristic --axis heuristic --trace --out artifacts/latency
//   node scripts/ai-latency.mjs artifacts/latency/match-3.trace.jsonl
// Reports compute time per action (decide + dispatch) as percentiles, and the compute time of each whole Player Turn.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (file === undefined) { console.error('usage: node scripts/ai-latency.mjs <trace.jsonl>'); process.exit(2); }
const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99), max: sorted.at(-1) };
};
const round = (value) => Math.round(value * 10) / 10;
const show = (name, s) => console.log(`${name}: n=${s.n} p50=${round(s.p50)} ms p95=${round(s.p95)} ms p99=${round(s.p99)} ms max=${round(s.max)} ms`);

show('decide', stats(rows.map((row) => row.decideMs)));
show('decide + dispatch', stats(rows.map((row) => row.decideMs + row.dispatchMs)));

// A Player Turn is the game turn and player-turn index in the step key ("turn:index:phase:segment").
const turns = new Map();
for (const row of rows) {
  const [gameTurn, index] = row.stepKey.split(':');
  const key = `${row.seatId} turn ${gameTurn}.${index}`;
  const entry = turns.get(key) ?? { actions: 0, ms: 0 };
  entry.actions += 1;
  entry.ms += row.decideMs + row.dispatchMs;
  turns.set(key, entry);
}
const totals = [...turns.values()].map(({ ms }) => ms / 1000);
const sorted = [...totals].sort((a, b) => a - b);
console.log(`Player Turns: n=${sorted.length} median=${round(percentile(sorted, 0.5))} s max=${round(sorted.at(-1))} s; actions per turn max=${Math.max(...[...turns.values()].map(({ actions }) => actions))}`);
for (const [key, { actions, ms }] of [...turns].sort((a, b) => b[1].ms - a[1].ms).slice(0, 3)) console.log(`  slowest: ${key}: ${actions} actions, ${round(ms / 1000)} s`);
