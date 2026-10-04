// Fits the scaling-curve results: for each component, the exponent k of ms ∝ hexes^k (default division count, maps from
// 32x24 up) and of ms ∝ pieces^k (same map, growing division count), then predicts the map size where each component
// crosses 100 ms (feels instant), 1 s and 5 s.
// Usage: node scripts/perf/fit-scaling.mjs tmp/scaling/scaling-curve.json [divisions=6]
import { readFile } from 'node:fs/promises';

const [file, divisionsText] = process.argv.slice(2);
const divisions = Number(divisionsText ?? 6);
const { results } = JSON.parse(await readFile(file, 'utf8'));
const bySize = results.filter((r) => !r.error && r.divisions === divisions && r.hexes >= 768).sort((a, b) => a.hexes - b.hexes);
const fit = (points) => {
  const xs = points.map(([x]) => Math.log(x)); const ys = points.map(([, y]) => Math.log(y));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length; const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const k = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return { k, c: Math.exp(my - k * mx) };
};
const keys = [...new Set(bySize.flatMap((r) => Object.keys(r.ms)))];
const largest = bySize.at(-1);
const unitsMap = results.filter((r) => !r.error && r.width === 64 && r.height === 48).sort((a, b) => a.facts.pieces - b.facts.pieces);
// A 4:3 map of `hexes` hexes, as the generator lays it out.
const sizeOf = (hexes) => { const h = Math.sqrt(hexes * 3 / 4); return `${Math.round(h * 4 / 3)}x${Math.round(h)}`; };
const cross = ({ k, c }, ms) => (k > 0.05 ? (ms / c) ** (1 / k) : Infinity);
const rows = [];
for (const key of keys) {
  const points = bySize.map((r) => [r.hexes, r.ms[key]]).filter(([, y]) => y > 0.3);
  if (points.length < 3) continue;
  const f = fit(points);
  const tail = points.slice(-2);
  const kTail = Math.log(tail[1][1] / tail[0][1]) / Math.log(tail[1][0] / tail[0][0]);
  const u = unitsMap.map((r) => [r.facts.pieces, r.ms[key]]).filter(([, y]) => y > 0.3);
  const ku = u.length >= 2 ? fit(u).k : null;
  rows.push({ key, k: f.k, kTail, ku, at64: results.find((r) => r.label === `64x48:${divisions}`)?.ms[key], atLargest: largest.ms[key], x100: cross(f, 100), x1s: cross(f, 1000), x5s: cross(f, 5000) });
}
rows.sort((a, b) => (b.atLargest ?? 0) - (a.atLargest ?? 0));
const fmt = (hexes) => (hexes === Infinity ? 'never' : hexes > 1e6 ? '>1M hexes' : `${Math.round(hexes)} (${sizeOf(hexes)})`);
console.log(`component | k (hexes, fit ${bySize[0].label}..${largest.label}) | k last step | k (units, 64x48) | ms @64x48 | ms @${largest.label} | 100 ms at | 1 s at | 5 s at`);
for (const r of rows) {
  console.log(`${r.key} | ${r.k.toFixed(2)} | ${r.kTail.toFixed(2)} | ${r.ku === null ? '-' : r.ku.toFixed(2)} | ${r.at64 ?? '-'} | ${r.atLargest ?? '-'} | ${fmt(r.x100)} | ${fmt(r.x1s)} | ${fmt(r.x5s)}`);
}
