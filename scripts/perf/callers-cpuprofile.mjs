// Who calls a hot function: total sampled time inside `<name>`, split by the nearest calling function (excluding itself).
// Usage: node scripts/perf/callers-cpuprofile.mjs <file.cpuprofile> <functionName> [depth=1]
import { readFile } from 'node:fs/promises';

const [file, name, depthText] = process.argv.slice(2);
const depth = Number(depthText ?? 1);
const profile = JSON.parse(await readFile(file, 'utf8'));
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
const label = (node) => `${node.callFrame.functionName || '(anonymous)'}:${node.callFrame.lineNumber + 1}`;
const totals = new Map();
let total = 0;
for (let i = 0; i < profile.samples.length; i += 1) {
  const us = profile.timeDeltas[i + 1] ?? 0;
  // Walk up to the outermost frame of `name`, then take the next `depth` distinct callers above it.
  let cursor = profile.samples[i];
  let hit = null;
  for (let at = cursor; at !== undefined; at = parent.get(at)) if (nodes.get(at).callFrame.functionName === name) hit = at;
  if (hit === null) continue;
  total += us;
  const chain = [];
  for (let at = parent.get(hit); at !== undefined && chain.length < depth; at = parent.get(at)) chain.push(label(nodes.get(at)));
  const key = chain.join(' < ');
  totals.set(key, (totals.get(key) ?? 0) + us);
}
console.log(`${name}: ${(total / 1000).toFixed(0)} ms sampled`);
for (const [key, us] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${(us / 1000).toFixed(0).padStart(8)} ms  ${key}`);
