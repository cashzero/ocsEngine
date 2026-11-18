#!/usr/bin/env node
// Many scripts/ai-continue.mjs runs in parallel, resumable (docs/ai/evaluation.md). Build first.
//
//   node scripts/ai-continue-batch.mjs --branches <branches.jsonl> [--branches …] --variant <name>=<policy> [--variant …] \
//     --opponent <policy> --out-dir <dir> [--dice 2] [--horizons 1] [--jobs 10] [--engine dist]
//
// A branch list is JSON lines with save, at and the subject side (`side` from ai-find-branches.mjs, or `subject`). Each
// branch × variant is one ai-continue.mjs run with all the dice, written to <out-dir>/<branch>.<variant>.jsonl, where
// <branch> is the match, the side, the action index and a hash of the save's path. A run writes to a temporary file and
// renames it when it exits cleanly with every row (a game that ends before a horizon has no row for it), so an interrupted batch is rerun with the same command: finished files
// are kept, unfinished ones played again. A finished file made with another policy, opponent, dice or horizons for the same
// variant name is an error, not reused. Variants can therefore be added in a later run next to the baseline's files;
// scripts/ai-continue-compare.py reads them together. At the end it lists the runs that failed and the continuations
// that did not finish the game.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const many = (name) => args.flatMap((arg, index) => (arg === name ? [args[index + 1]] : []));
const branchFiles = many('--branches');
const variants = many('--variant').map((value) => {
  const at = value.indexOf('=');
  return { name: value.slice(0, at), policy: value.slice(at + 1) };
});
const opponent = option('--opponent');
const outDir = resolve(option('--out-dir', ''));
const dice = Number(option('--dice', '2'));
const horizons = option('--horizons', '1');
const jobs = Number(option('--jobs', '10'));
const engine = option('--engine', 'dist');
if (branchFiles.length === 0 || variants.length === 0 || !opponent || !option('--out-dir')) throw new Error('see usage');
if (variants.some(({ name }) => !/^[\w-]+$/u.test(name))) throw new Error('variant names are letters, digits, _ and -');

const branches = branchFiles.flatMap((file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
  const row = JSON.parse(line);
  const save = resolve(root, row.save);
  const subject = row.subject ?? row.side;
  if (!existsSync(save) || !['allied', 'axis'].includes(subject) || !Number.isInteger(row.at)) throw new Error(`bad branch ${line}`);
  const match = /match-(\d+)\.save\.json$/u.exec(save)[1];
  const key = `${match}-${subject}-${row.at}-${createHash('sha1').update(save).digest('hex').slice(0, 8)}`;
  return { save, subject, at: row.at, key };
}));
if (new Set(branches.map(({ key }) => key)).size !== branches.length) throw new Error('a branch is listed twice');
mkdirSync(outDir, { recursive: true });

const rowsPerRun = dice * (horizons.split(',').length + 1);
// Complete: every dice has its end-of-game row, and the horizon rows except those the game ended before reaching.
const complete = (rows) => rows.filter(({ horizon }) => horizon === 'end').length === dice
  && rows.length <= rowsPerRun && rows.length >= dice;
const readRows = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const tasks = [];
let kept = 0;
for (const branch of branches) {
  for (const variant of variants) {
    const out = join(outDir, `${branch.key}.${variant.name}.jsonl`);
    // The meta file is written after the rows: rows without it are an interrupted rename and are played again.
    if (existsSync(out) && existsSync(`${out}.meta.json`)) {
      const rows = readRows(out);
      const meta = JSON.parse(readFileSync(`${out}.meta.json`, 'utf8'));
      const wanted = { policy: variant.policy, opponent, dice, horizons };
      if (JSON.stringify(meta) !== JSON.stringify(wanted) || !complete(rows)) {
        throw new Error(`${out} was made with ${JSON.stringify(meta)} (${rows.length} rows), not ${JSON.stringify(wanted)}`);
      }
      kept += 1;
      continue;
    }
    tasks.push({ branch, variant, out });
  }
}
console.log(`${branches.length} branches × ${variants.length} variants: ${kept} done before, ${tasks.length} to run, ${jobs} at a time`);

const writeMeta = (out, meta) => {
  const file = `${out}.meta.json`;
  const partial = `${file}.part`;
  writeFileSync(partial, JSON.stringify(meta));
  renameSync(partial, file);
};
const started = Date.now();
const failures = [];
let finished = 0;
const run = ({ branch, variant, out }) => new Promise((done) => {
  const temporary = `${out}.part`;
  const child = spawn(process.execPath, [
    join(root, 'scripts/ai-continue.mjs'), '--save', branch.save, '--at', String(branch.at), '--subject', branch.subject,
    '--variant', `${variant.name}=${variant.policy}`, '--opponent', opponent, '--dice', String(dice), '--horizons', horizons,
    '--engine', engine, '--out', temporary,
  ], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => {
    finished += 1;
    const rows = code === 0 && existsSync(temporary) ? readRows(temporary) : [];
    if (code === 0 && complete(rows)) {
      renameSync(temporary, out);
      writeMeta(out, { policy: variant.policy, opponent, dice, horizons });
    } else {
      rmSync(temporary, { force: true });
      failures.push(`${branch.key}.${variant.name}: exit ${code}, ${rows.length} rows; ${stderr.trim().split('\n').slice(-3).join(' | ')}`);
    }
    const minutes = (Date.now() - started) / 60000;
    const left = tasks.length - finished;
    console.log(`${finished}/${tasks.length} ${branch.key}.${variant.name} ${code === 0 ? 'ok' : 'FAILED'} `
      + `${minutes.toFixed(1)} min, about ${(minutes / finished * left).toFixed(0)} min left`);
    done();
  });
});
const queue = [...tasks];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length > 0) await run(queue.shift());
}));

const unfinished = [];
for (const branch of branches) {
  for (const variant of variants) {
    const out = join(outDir, `${branch.key}.${variant.name}.jsonl`);
    if (!existsSync(out)) continue;
    for (const row of readRows(out)) if (row.horizon === 'end' && row.reason !== 'FINISHED') unfinished.push(`${branch.key}.${variant.name} dice ${row.dice}: ${row.reason}`);
  }
}
console.log(`failed runs ${failures.length}${failures.map((line) => `\n  ${line}`).join('')}`);
console.log(`continuations that did not finish the game ${unfinished.length}${unfinished.map((line) => `\n  ${line}`).join('')}`);
process.exitCode = failures.length + unfinished.length > 0 ? 1 : 0;
