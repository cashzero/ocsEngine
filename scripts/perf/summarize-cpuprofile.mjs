// Summarizes a V8 .cpuprofile (node --cpu-prof, or Chrome's Profiler domain): self time and inclusive time per function.
// Usage: node scripts/perf/summarize-cpuprofile.mjs <file.cpuprofile> [top=40]
import { readFile } from 'node:fs/promises';

const [file, topText] = process.argv.slice(2);
const top = Number(topText ?? 40);
const profile = JSON.parse(await readFile(file, 'utf8'));
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);

// Sample durations: timeDeltas[i] is the gap before sample i.
const selfUs = new Map();
for (let i = 0; i < profile.samples.length; i += 1) {
  const delta = profile.timeDeltas[i + 1] ?? 0;
  selfUs.set(profile.samples[i], (selfUs.get(profile.samples[i]) ?? 0) + delta);
}
const keyOf = (node) => {
  const { functionName, url, lineNumber } = node.callFrame;
  const short = url ? url.replace(/^.*\/(dist|src|node_modules)\//u, '$1/') : '';
  return `${functionName || '(anonymous)'} ${short}:${lineNumber + 1}`;
};
const self = new Map();
const inclusive = new Map();
let total = 0;
for (const [id, us] of selfUs) {
  total += us;
  const node = nodes.get(id);
  const key = keyOf(node);
  self.set(key, (self.get(key) ?? 0) + us);
  // Inclusive: count each distinct function once per stack.
  const seen = new Set();
  for (let cursor = id; cursor !== undefined; cursor = parent.get(cursor)) {
    const k = keyOf(nodes.get(cursor));
    if (seen.has(k)) continue;
    seen.add(k);
    inclusive.set(k, (inclusive.get(k) ?? 0) + us);
  }
}
const print = (title, map) => {
  console.log(`\n${title} (total sampled ${(total / 1000).toFixed(0)} ms)`);
  for (const [key, us] of [...map].sort((a, b) => b[1] - a[1]).slice(0, top)) {
    console.log(`${(us / 1000).toFixed(0).padStart(8)} ms ${(100 * us / total).toFixed(1).padStart(5)}%  ${key}`);
  }
};
print('SELF time', self);
print('INCLUSIVE time', inclusive);
