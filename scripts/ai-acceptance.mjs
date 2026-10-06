#!/usr/bin/env node
// B5 acceptance metrics (docs/roadmap/11-ai-bot-wbs.md §B5) from ai-match output directories.
//
//   node scripts/ai-acceptance.mjs <heuristic-vs-random dir (run with --swap --trace)> [<heuristic-vs-heuristic dir>]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [versusRandom, versusSelf] = process.argv.slice(2);
if (!versusRandom) throw new Error('usage: ai-acceptance.mjs <vs-random dir> [<vs-self dir>]');
const load = (dir) => JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
const pct = (part, whole) => (whole === 0 ? '-' : `${Math.round((100 * part) / whole)}%`);
const rows = [];
const row = (id, item, value, pass) => rows.push({ id, item, value, pass });

const random = load(versusRandom);
const records = random.records;
const heuristicSide = (record) => Object.entries(record.sides ?? {}).find(([, info]) => info.policy === 'heuristic');

// B5-1 completion (both batches).
const completed = (list) => list.filter((r) => r.stopReason === 'FINISHED' && r.errors.length === 0 && r.replay?.ok === true).length;
const self = versusSelf ? load(versusSelf).records : [];
row('B5-1', 'vs random-legal: FINISHED, no errors, replay hash matches', `${completed(records)}/${records.length}`, completed(records) === records.length);
if (versusSelf) row('B5-1', 'heuristic vs heuristic: FINISHED, no errors, replay hash matches', `${completed(self)}/${self.length}`, completed(self) === self.length);

// B5-2 wins.
const wins = records.filter((r) => r.winner === heuristicSide(r)?.[0]).length;
row('B5-2', 'wins against random-legal (≥ 90%)', `${wins}/${records.length} = ${pct(wins, records.length)}`, wins / records.length >= 0.9);
for (const side of ['allied', 'axis']) {
  const seated = records.filter((r) => heuristicSide(r)?.[0] === side);
  const sideWins = seated.filter((r) => r.winner === side).length;
  row('B5-2', `wins as ${side} (≥ 80%)`, `${sideWins}/${seated.length} = ${pct(sideWins, seated.length)}`, sideWins / seated.length >= 0.8);
}

// B5-3 captures.
const captured = records.filter((r) => (heuristicSide(r)?.[1].captured.length ?? 0) > 0).length;
row('B5-3', 'games ending with an objective taken from the other side or nobody (≥ 80%)', `${captured}/${records.length} = ${pct(captured, records.length)}`, captured / records.length >= 0.8);

// B5-4 fighting: attacks in games with contact, odds of declared attacks, barrage use.
const traces = existsSync(versusRandom) ? readdirSync(versusRandom).filter((name) => name.endsWith('.trace.jsonl')) : [];
const odds = [];
const responders = {};
let contactGames = 0; let attackGames = 0;
for (const record of records) {
  const side = heuristicSide(record);
  const anyCombat = Object.values(record.sides).some((info) => (info.actions.DECLARE_COMBAT ?? 0) > 0);
  if (anyCombat) { contactGames += 1; if ((side[1].actions.DECLARE_COMBAT ?? 0) > 0) attackGames += 1; }
}
for (const name of traces) {
  for (const line of readFileSync(join(versusRandom, name), 'utf8').split('\n')) {
    if (!line) continue;
    const trace = JSON.parse(line);
    if (!trace.policy.startsWith('heuristic')) continue;
    const attack = /^regular at (\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/u.exec(trace.intent);
    if (attack && trace.status === 'ACCEPTED') odds.push(Number(attack[1]) / Math.max(1e-9, Number(attack[2])));
    if (trace.kind === 'DECISION') {
      const responder = trace.intent.split(':')[0];
      const decisionKind = trace.decisionKind ?? 'decision';
      responders[responder] = (responders[responder] ?? 0) + 1;
      void decisionKind;
    }
  }
}
row('B5-4', 'games with contact where the heuristic attacked (≥ 90%)', `${attackGames}/${contactGames} = ${pct(attackGames, contactGames)}`, attackGames / Math.max(1, contactGames) >= 0.9);
const sorted = [...odds].sort((left, right) => left - right);
const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
row('B5-4', 'median odds of declared regular attacks (≥ 3:1)', traces.length === 0 ? 'no traces' : `${median.toFixed(1)}:1 over ${odds.length} attacks; below 2:1: ${pct(odds.filter((value) => value < 2).length, odds.length)}`, median >= 3);
const barrageGames = records.filter((r) => (heuristicSide(r)[1].actions.DECLARE_BARRAGE ?? 0) > 0).length;
row('B5-4', 'games with at least one barrage (≥ 50%)', `${barrageGames}/${records.length} = ${pct(barrageGames, records.length)}`, barrageGames / records.length >= 0.5);

// B5-5 resources.
const used = (kind) => records.filter((r) => (heuristicSide(r)[1].actions[kind] ?? 0) > 0).length;
row('B5-5', 'games where fuel was paid', `${used('PAY_FUEL')}/${records.length}`, used('PAY_FUEL') === records.length);
const delivered = records.filter((r) => (heuristicSide(r)[1].actions.UNLOAD_SUPPLY ?? 0) > 0 || (heuristicSide(r)[1].cargoSpent ?? 0) > 0).length;
row('B5-5', 'games where trucks brought SP to the army (unloaded beside it, or spent from their cargo)', `${delivered}/${records.length} `
  + `(unloads in ${used('UNLOAD_SUPPLY')}, cargo spent in ${records.filter((r) => (heuristicSide(r)[1].cargoSpent ?? 0) > 0).length})`, delivered === records.length);
row('B5-5', 'games with a rebuild', `${used('REBUILD_UNITS')}/${records.length}`, null);
const units = records.reduce((total, r) => total + heuristicSide(r)[1].combatUnits, 0);
const oos = records.reduce((total, r) => total + heuristicSide(r)[1].outOfSupply, 0);
row('B5-5', 'combat units in supply at the end (≥ 80%)', pct(units - oos, units), (units - oos) / Math.max(1, units) >= 0.8);

// B5-6 responders.
const fallback = responders['first-option'] ?? 0;
row('B5-6', 'pending decisions answered by a named responder, not the first-option fallback', traces.length === 0 ? 'no traces'
  : `${Object.entries(responders).map(([name, count]) => `${name} ${count}`).join(', ')}`, traces.length > 0 && fallback === 0);

console.log('| row | item | measured | pass |\n|---|---|---|---|');
for (const { id, item, value, pass } of rows) console.log(`| ${id} | ${item} | ${value} | ${pass === null ? 'info' : pass ? 'PASS' : 'FAIL'} |`);
