// Determinism check for generator speed-ups: the same request must give a byte-identical New Game package
// (map, OOB, deployment, scenario) from two builds. Prints one line per request and exits 1 on any difference.
// Usage: node scripts/perf/compare-generation.mjs <distA> <distB> [WxH ...]   (both builds need the same size cap)
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const [distA, distB, ...sizeArgs] = process.argv.slice(2);
const load = async (dist) => import(`${pathToFileURL(resolve(dist)).href}/index.js`);
const [a, b] = [await load(distA), await load(distB)];
const sizes = (sizeArgs.length > 0 ? sizeArgs : ['16x12', '24x18', '32x24', '40x30', '48x36', '64x48', '24x40']).map((text) => text.split('x').map(Number));
const seeds = Number(process.env.PERF_SEEDS ?? 3);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const packageOf = (lib, request) => {
  const started = performance.now();
  const prepared = lib.prepareNewGame(request);
  const ms = performance.now() - started;
  if (!prepared.ok) return { hash: `FAILED ${prepared.error.map(({ code }) => code).join(',')}`, ms };
  const { generatedMap, generatedOob, deployment, scenario } = prepared.value;
  return { hash: digest({ generatedMap, generatedOob, deployment, scenario }), ms };
};
let differences = 0;
let total = 0;
for (const [width, height] of sizes) {
  for (const style of a.MAP_GENERATION_STYLES) {
    for (let index = 0; index < seeds; index += 1) {
      const seed = 0x51ed0000 + width * 1009 + height * 97 + index * 7919;
      const request = { ...a.DEFAULT_NEW_GAME_REQUEST, map: { width, height, style }, seeds: { map: seed, oob: seed + 1, deployment: seed + 2, rules: seed + 3 } };
      const left = packageOf(a, request);
      const right = packageOf(b, request);
      total += 1;
      const same = left.hash === right.hash;
      if (!same) differences += 1;
      console.log(`${same ? 'same' : 'DIFF'} ${width}x${height} ${style} seed ${seed}: ${left.hash} ${right.hash}  ${Math.round(left.ms)} -> ${Math.round(right.ms)} ms`);
    }
  }
}
console.log(`${total - differences}/${total} identical`);
process.exit(differences > 0 ? 1 : 0);
