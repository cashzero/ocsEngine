// A long-lived acceptance session: one real browser page on the built application, driven step by step. Each step is a
// small script dropped into <evidence>/steps/NNN.mjs; it runs with the page and the helpers in scope, and its result is
// written to NNN.out. The step files stay in the evidence folder, so the run is reproducible and auditable: every step is a
// click, a key press or a typed value on a visible control, or a read of the page (rows are recorded with `record`).
// Usage: node scripts/product-acceptance/session.mjs <evidenceDir> [WIDTHxHEIGHT]
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as harness from '../air-acceptance/harness.mjs';
import * as lib from './lib.mjs';

const evidenceDir = process.argv[2];
const [width, height] = (process.argv[3] ?? '1920x1080').split('x').map(Number);
const stepsDir = join(evidenceDir, 'steps');
await mkdir(stepsDir, { recursive: true });
const h = await harness.open({ evidenceDir, viewport: { width, height } });
const scope = { h, page: h.page, ...harness, ...lib, join, evidenceDir, writeFile, state: {} };
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const done = new Set();
console.log(`session ready ${width}x${height}`);
for (;;) {
  const files = (await readdir(stepsDir)).filter((name) => name.endsWith('.mjs') && !done.has(name)).sort();
  for (const name of files) {
    done.add(name);
    const code = await readFile(join(stepsDir, name), 'utf8');
    const out = join(stepsDir, name.replace(/\.mjs$/, '.out'));
    if (code.trim() === 'quit') {
      await h.finish(`doc 03 acceptance session (${width}×${height})`);
      await writeFile(out, `finished; rows ${h.rows.length}; errors ${h.errors.length}`);
      await h.close();
      process.exit(0);
    }
    const started = Date.now();
    let result;
    try {
      const fn = new AsyncFunction(...Object.keys(scope), code);
      result = await fn(...Object.values(scope));
    } catch (error) {
      result = `ERROR ${error.stack ?? error.message}`;
    }
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 1);
    await writeFile(out, `${text ?? ''}\n-- ${Date.now() - started} ms; page errors so far ${h.errors.length}${h.errors.length ? `: ${h.errors.slice(-3).join(' | ')}` : ''}\n`);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (!existsSync(stepsDir)) break;
}
