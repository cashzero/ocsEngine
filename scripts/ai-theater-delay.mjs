#!/usr/bin/env node
// The discount of a theater group that attacks next turn instead of this one (plan P11.8, docs/ai/theater-supply-plan.md).
// Build first.
//
//   node scripts/ai-theater-delay.mjs <dir-with-saves-and-summary.json>... [--resamples 2000]
//
// At the attacker's first Movement segment decision of each Game Turn, every objective it does not hold with enemy combat
// units in it, under the strength the attacker sees (analyze: the bot's own estimate), is followed to the same point of
// the next Game Turn. Pairs where the attacker holds the objective by then are left out. The discount is the share of
// the rest whose enemy strength did not rise; the 95% interval resamples map seeds. Trajectories seen before (same
// initial hash, final hash and actions) are skipped; every game must reach its saved final state hash.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const resamples = args.includes('--resamples') ? Number(args[args.indexOf('--resamples') + 1]) : 2000;
const dirs = args.filter((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--resamples');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const sha = (text) => createHash('sha256').update(text).digest('hex');

const pairs = [];
const seen = new Set();
let games = 0; let duplicates = 0;
for (const dir of dirs) {
  for (const record of JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records) {
    const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
    const trajectory = sha(JSON.stringify([save.initialStateHash, save.finalStateHash, sha(JSON.stringify(save.acceptedActions))]));
    if (seen.has(trajectory)) { duplicates += 1; continue; }
    seen.add(trajectory);
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId;
    if (!attackerId) continue;
    const facts = { scenario: state.scenario, turnLimit: 8 };
    const objectives = state.configuration.objectives.map(({ hexId }) => String(hexId));
    const control = (current, hexId) => current.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
    const looks = new Map();
    const look = (current) => {
      const { enemy } = m.analyze(m.ruleEngine.projectForViewer(current, attackerId), attackerId, facts);
      return new Map(objectives.filter((hexId) => control(current, hexId) !== attackerId)
        .map((hexId) => [hexId, enemy.get(hexId)?.hasCombatUnit ? enemy.get(hexId).strength : 0]));
    };
    for (const action of save.acceptedActions) {
      const { sequence } = state;
      if (sequence.phasingPlayerId === attackerId && sequence.actingPlayerId === attackerId && !state.pendingDecision
        && sequence.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT' && !looks.has(sequence.gameTurn)) looks.set(sequence.gameTurn, look(state));
      state = m.ruleEngine.applyAction(state, action).state;
    }
    if ((await m.hashGameState(state)).value !== record.finalStateHash) throw new Error(`${dir}/${record.match}: replay does not reach the saved final state`);
    games += 1;
    for (const [turn, now] of looks) {
      const next = looks.get(turn + 1);
      if (!next) continue;
      for (const [hexId, strength] of now) {
        if (strength <= 0 || !next.has(hexId)) continue;
        pairs.push({ mapSeed: record.seeds.map, gameTurn: turn, strength, nextStrength: next.get(hexId) });
      }
    }
  }
}

const notWorse = (list) => list.filter(({ strength, nextStrength }) => nextStrength <= strength + 1e-9).length / list.length;
const delta = notWorse(pairs);
const bySeed = [...Map.groupBy(pairs, ({ mapSeed }) => mapSeed).values()];
let seed = 1;
const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
const draws = Array.from({ length: resamples }, () => notWorse(bySeed.flatMap(() => bySeed[Math.floor(random() * bySeed.length)]))).sort((a, b) => a - b);
console.log(JSON.stringify({
  games, duplicatesSkipped: duplicates, mapSeeds: bySeed.length, pairs: pairs.length,
  delta, interval: [draws[Math.floor(resamples * 0.025)], draws[Math.ceil(resamples * 0.975) - 1]],
  byGameTurn: Object.fromEntries([...Map.groupBy(pairs, ({ gameTurn }) => gameTurn)].map(([turn, list]) => [turn, { pairs: list.length, delta: notWorse(list) }])),
  emptiedNextTurn: pairs.filter(({ nextStrength }) => nextStrength === 0).length / pairs.length,
}, null, 1));
