#!/usr/bin/env node
// Summarize turn-limit-study.mjs results: per-cell medians and a regression of how long the contest lasts on map size
// and divisions. Usage: node scripts/turn-limit-regression.mjs [results dir, default tmp/ai-match]
// Directories are named study2-(attack|meet)-<width>x<height>-d<divisions>, as written by the matrix in
// docs/game-flow/turn-limit.md; matches and per-game series come from summary.json and turn-limit-study.json.
import fs from 'node:fs';
const root = process.argv[2] ?? 'tmp/ai-match';
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN; };
const groups = { attack: [], meet: [] };
let fails = 0, total = 0;
const read = (dir, kind, w, h, dv) => {
  const s = JSON.parse(fs.readFileSync(`${root}/${dir}/summary.json`, 'utf8'));
  total += s.records.length;
  fails += s.records.filter((r) => r.stopReason !== 'FINISHED').length;
  const r = JSON.parse(fs.readFileSync(`${root}/${dir}/turn-limit-study.json`, 'utf8'));
  for (const x of r) groups[kind].push({ w, h, dv, t75: x.turn75Movement, vp: x.totalVpMovement, ho: x.handovers ?? 0, hoLast: x.lastHandoverTurn ?? 0, ho75: x.turn75Handover ?? 0, ended: x.endedOn, reason: x.reason });
};
for (const d of fs.readdirSync(root)) {
  let m = d.match(/^study2-(attack|meet)-(\d+)x(\d+)-d(\d+)$/);
  if (m) read(d, m[1], +m[2], +m[3], +m[4]);
}
console.log('matches', total, 'failed', fails);
const T = (m) => m[0].map((_, j) => m.map((r) => r[j]));
const mul = (a, b) => a.map((r) => T(b).map((c) => r.reduce((s, v, i) => s + v * c[i], 0)));
const inv3 = (m) => {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const D = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [[e * i - f * h, c * h - b * i, b * f - c * e], [f * g - d * i, a * i - c * g, c * d - a * f], [d * h - e * g, b * g - a * h, a * e - b * d]].map((r) => r.map((v) => v / D));
};
const fit = (rows, key, name) => {
  const X = rows.map((r) => [1, (r.w + r.h) / 7, r.dv * 1.5]);
  const y = rows.map((r) => r[key]);
  const A = inv3(mul(T(X), X));
  const b = mul(A, mul(T(X), y.map((v) => [v]))).map((r) => r[0]);
  const pred = X.map((r) => r.reduce((s, v, i) => s + v * b[i], 0));
  const ss = y.reduce((s, v, i) => s + (v - pred[i]) ** 2, 0);
  const my = y.reduce((a, c) => a + c) / y.length;
  const r2 = 1 - ss / y.reduce((s, v) => s + (v - my) ** 2, 0);
  const s2 = ss / (y.length - 3);
  const se = A.map((r, i) => Math.sqrt(s2 * r[i]));
  console.log(' ', name.padEnd(26), 'coef', b.map((v) => v.toFixed(2)).join(' '), '| se', se.map((v) => v.toFixed(2)).join(' '), '| t', b.map((v, i) => (v / se[i]).toFixed(1)).join(' '), '| R2', r2.toFixed(3));
};
for (const kind of ['attack', 'meet']) {
  const rows = groups[kind];
  console.log('\n==', kind, 'n', rows.length);
  for (const w of [24, 32, 48]) {
    console.log(' ', `${w}x${{ 24: 16, 32: 24, 48: 36 }[w]}`, [3, 6, 10].map((dv) => {
      const g = rows.filter((r) => r.w === w && r.dv === dv);
      return `d${dv}: t75 ${med(g.map((r) => r.t75))}, ho75 ${med(g.map((r) => r.ho75))}, ho ${med(g.map((r) => r.ho))}, early ${g.filter((r) => r.reason === 'OBJECTIVES').length}/${g.length}`;
    }).join(' | '));
  }
  fit(rows, 't75', 't75 ~ (w+h)/7, 1.5div');
  fit(rows, 'ho75', 'handover75');
  fit(rows, 'hoLast', 'lastHandover');
  fit(rows, 'ho', 'handovers');
  fit(rows, 'vp', 'totalVP');
  const q = (k) => { const s = rows.map((r) => r[k]).sort((a, b) => a - b); return [s[Math.floor(s.length * 0.25)], s[s.length >> 1], s[Math.floor(s.length * 0.75)]]; };
  console.log('  ended median', q('ended')[1], 'early', rows.filter((r) => r.reason === 'OBJECTIVES').length, '/', rows.length);
  console.log('  quartiles t75', q('t75'), 'ho75', q('ho75'), 'lastHandover', q('hoLast'));
}
