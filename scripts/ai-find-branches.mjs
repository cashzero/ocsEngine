#!/usr/bin/env node
// Branch points for scripts/ai-continue.mjs: segments where a seat made a kind of decision under study, from ai-match traces.
//
//   node scripts/ai-find-branches.mjs <match directory> [...] --kind defender-assault [--policy <substring>] [--from-turn 2] [--per-game 1]
//
// Kinds (each names the seat and the decision it looks for in that seat's MOVE_PIECE intents):
//   defender-assault  the defender of an attack engagement sends units on assault tasks ("(assault …)")
//   attacker-assault  the attacker does
// --policy keeps games where that seat's policy (summary.json) contains the substring. One JSON line per branch point:
// the save, the segment, the seat's side and the index of the segment's first action (the --at of ai-continue.mjs).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const kind = option('--kind');
const policyFilter = option('--policy');
const fromTurn = Number(option('--from-turn', '2'));
const perGame = Number(option('--per-game', '1'));
const flags = new Set(['--kind', '--policy', '--from-turn', '--per-game'].flatMap((name) => (args.includes(name) ? [args.indexOf(name), args.indexOf(name) + 1] : [])));
const dirs = args.filter((_, index) => !flags.has(index));
const KINDS = { 'defender-assault': { role: 'defender', intent: /\(assault / }, 'attacker-assault': { role: 'attacker', intent: /\(assault / } };
const spec = KINDS[kind];
if (!spec) throw new Error(`--kind ${Object.keys(KINDS).join('|')}`);

for (const dir of dirs) {
  const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
  for (const record of records) {
    const trace = join(dir, `match-${record.match}.trace.jsonl`);
    if (!existsSync(trace) || record.summary.engagement !== 'AXIS_ATTACKS') continue;
    const side = spec.role === 'attacker' ? 'axis' : 'allied';
    if (policyFilter && !record.sides[side].policy.includes(policyFilter)) continue;
    const segments = new Map();
    for (const line of readFileSync(trace, 'utf8').split('\n')) {
      if (!line) continue;
      const row = JSON.parse(line);
      if (row.kind !== 'ACTION' || row.seatId !== `seat:${side}` || !String(row.stepKey).endsWith('MOVEMENT:MOVEMENT')) continue;
      if (Number(String(row.stepKey).split(':')[0]) < fromTurn) continue;
      const segment = segments.get(row.stepKey) ?? { at: row.revision, hits: 0 };
      if (spec.intent.test(row.intent ?? '')) segment.hits += 1;
      segments.set(row.stepKey, segment);
    }
    let taken = 0;
    for (const [stepKey, { at, hits }] of segments) {
      if (hits === 0 || taken >= perGame) continue;
      taken += 1;
      console.log(JSON.stringify({ save: resolve(dir, `match-${record.match}.save.json`), match: record.match, stepKey, side, at, decisions: hits }));
    }
  }
}
