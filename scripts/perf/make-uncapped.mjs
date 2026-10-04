// Measurement-only copy of a build with the New Game map-size cap raised to 256x192 (the product keeps 64x48),
// so growth past today's limit can be measured. Never shipped: it lives under tmp/.
// Usage: node scripts/perf/make-uncapped.mjs <fromDist> <toDir>   (toDir/dist is replaced)
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [from, to] = process.argv.slice(2);
const dist = join(to, 'dist');
await rm(dist, { recursive: true, force: true });
await cp(from, dist, { recursive: true });
const patch = async (file, replacements) => {
  let text = await readFile(join(dist, file), 'utf8');
  for (const [before, after] of replacements) {
    if (!text.includes(before)) throw new Error(`${file}: "${before}" not found`);
    text = text.replace(before, after);
  }
  await writeFile(join(dist, file), text);
};
await patch('generation/map/generator.js', [['options.width > 64', 'options.width > 256'], ['options.height > 48', 'options.height > 192']]);
await patch('game-flow/validation.js', [['maxWidth: 64, minHeight: 12, maxHeight: 48', 'maxWidth: 256, minHeight: 12, maxHeight: 192']]);
console.log(`uncapped build in ${dist}`);
