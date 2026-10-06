#!/usr/bin/env node
// Self-play training for the heuristic bot (docs/roadmap/11-ai-bot-wbs.md §6). Build first: `npm run build`.
//
//   node scripts/ai-train.mjs --run main --hours 8            # train for 8 hours (resumes the run if it exists)
//   node scripts/ai-train.mjs --run main --generations 20
//   node scripts/ai-train.mjs --run main --evaluate 20         # champion vs heuristic@1 defaults, 20 pairs on unused seeds
//
// Each generation mutates a few weights of the champion and plays the candidate against it on seeds never used
// before, both seat orders per seed. A candidate is promoted only when it wins significantly (one-sided sign test,
// draws excluded) and then passes the non-regression gate against random-legal on fresh seeds: no errors, every
// final save replays, and at least the B5 win rate. Everything is logged in tmp/ai-train/<run>/.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const parseArgs = (argv) => {
  const options = {
    run: 'main', hours: null, generations: null, evaluate: null, parallel: 4, turns: 8,
    batchPairs: 6, minPairs: 12, maxPairs: 30, significance: 0.05, gatePairs: 10, gateWinRate: 0.9,
    styles: ['TEMPERATE_INLAND', 'EASTERN_EUROPE'], mutationSize: 0.5, seed: 1,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    switch (flag) {
      case '--run': options.run = value(); break;
      case '--hours': options.hours = Number(value()); break;
      case '--generations': options.generations = Number(value()); break;
      case '--evaluate': options.evaluate = Number(value()); break;
      case '--parallel': options.parallel = Number(value()); break;
      case '--turns': options.turns = Number(value()); break;
      case '--batch-pairs': options.batchPairs = Number(value()); break;
      case '--min-pairs': options.minPairs = Number(value()); break;
      case '--max-pairs': options.maxPairs = Number(value()); break;
      case '--gate-pairs': options.gatePairs = Number(value()); break;
      case '--styles': options.styles = value().split(','); break;
      case '--seed': options.seed = Number(value()); break;
      case '--mutation-size': options.mutationSize = Number(value()); break;
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  return options;
};

// ─── Matches through scripts/ai-match.mjs ──────────────────────────────────────────────────────

const runMatches = (options, { allied, axis, start, matches, style, replay, out }) => {
  const args = [join(root, 'scripts', 'ai-match.mjs'), '--matches', String(matches), '--start', String(start), '--turns', String(options.turns),
    '--parallel', String(options.parallel), '--allied', allied, '--axis', axis, '--swap', '--out', out];
  if (style) args.push('--style', style);
  if (!replay) args.push('--no-replay');
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (!existsSync(join(out, 'summary.json'))) throw new Error(`ai-match produced no summary: ${result.stderr || result.stdout}`);
  return JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')).records;
};

/** Wins, losses and draws of `policy` in paired records, plus any record that did not finish cleanly. */
const tally = (records, policy) => {
  const result = { wins: 0, losses: 0, draws: 0, faults: [] };
  for (const record of records) {
    if (record.stopReason !== 'FINISHED' || record.errors.length > 0 || record.replay?.ok === false) {
      result.faults.push({ match: record.match, stopReason: record.stopReason, errors: record.errors.map(({ code }) => code) });
      continue;
    }
    const side = Object.entries(record.sides).find(([, info]) => info.policy === policy)?.[0];
    if (record.winner === 'draw') result.draws += 1;
    else if (record.winner === side) result.wins += 1;
    else result.losses += 1;
  }
  return result;
};

// ─── Training loop ──────────────────────────────────────────────────────────────────────────────

const options = parseArgs(process.argv.slice(2));
const runDir = join(root, 'tmp', 'ai-train', options.run);
mkdirSync(runDir, { recursive: true });
const statePath = join(runDir, 'state.json');
const logPath = join(runDir, 'log.jsonl');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const log = (entry) => {
  appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  console.log(`[${entry.event}] ${entry.summary ?? ''}`);
};
const policyFile = (name, label, weights) => {
  const path = join(runDir, `${name}.json`);
  writeFileSync(path, `${JSON.stringify({ label, weights }, null, 2)}\n`);
  return `heuristic:${relative(root, path).replaceAll('\\', '/')}`;
};

// Seed ranges: training 200000+, gates 600000+, evaluations 900000+ (never shared, never reused).
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {
  generation: 0, nextTrainSeed: 200_000, nextGateSeed: 600_000, nextEvaluationSeed: 900_000, randomState: options.seed,
  champion: { label: 'g0', weights: { ...m.DEFAULT_HEURISTIC_WEIGHTS } }, promotions: [],
};
const save = () => writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

if (options.evaluate !== null) {
  // T4: the champion against the heuristic@1 defaults on seeds no training or gate ever used.
  const champion = policyFile('champion', state.champion.label, state.champion.weights);
  const baseline = policyFile('baseline', 'v1', { ...m.DEFAULT_HEURISTIC_WEIGHTS });
  const results = [];
  for (const style of options.styles) {
    const records = runMatches(options, { allied: champion, axis: baseline, start: state.nextEvaluationSeed, matches: options.evaluate * 2, style, replay: true,
      out: join(runDir, `evaluate-${state.nextEvaluationSeed}`) });
    state.nextEvaluationSeed += options.evaluate * 2;
    results.push({ style, ...tally(records, champion) });
  }
  save();
  const wins = results.reduce((total, r) => total + r.wins, 0);
  const losses = results.reduce((total, r) => total + r.losses, 0);
  const draws = results.reduce((total, r) => total + r.draws, 0);
  log({ event: 'evaluate', champion: state.champion.label, results, pValue: m.signTestPValue(wins, losses),
    summary: `${state.champion.label} vs heuristic@1: ${wins}-${losses}-${draws} (p = ${m.signTestPValue(wins, losses).toFixed(4)}) ${results.map((r) => `${r.style} ${r.wins}-${r.losses}-${r.draws}`).join(', ')}` });
  process.exit(0);
}

const random = m.trainingRandom(state.randomState);
const deadline = options.hours === null ? Number.POSITIVE_INFINITY : Date.now() + options.hours * 3_600_000;
const lastGeneration = options.generations === null ? Number.POSITIVE_INFINITY : state.generation + options.generations;
log({ event: 'start', summary: `run ${options.run}: generation ${state.generation}, champion ${state.champion.label}` });

while (Date.now() < deadline && state.generation < lastGeneration) {
  state.generation += 1;
  const label = `g${state.generation}`;
  const { weights, changed } = m.mutateWeights(state.champion.weights, random, options.mutationSize);
  const candidate = policyFile('candidate', label, weights);
  const champion = policyFile('champion', state.champion.label, state.champion.weights);
  const totals = { wins: 0, losses: 0, draws: 0, faults: [] };
  const seeds = [];
  let verdict = 'INCONCLUSIVE';
  for (let batch = 0; ; batch += 1) {
    const style = options.styles[batch % options.styles.length];
    const start = state.nextTrainSeed;
    state.nextTrainSeed += options.batchPairs * 2;
    seeds.push({ style, start, matches: options.batchPairs * 2 });
    const result = tally(runMatches(options, { allied: candidate, axis: champion, start, matches: options.batchPairs * 2, style, replay: false,
      out: join(runDir, 'last-batch') }), candidate);
    totals.wins += result.wins; totals.losses += result.losses; totals.draws += result.draws; totals.faults.push(...result.faults);
    const pairs = (totals.wins + totals.losses + totals.draws + totals.faults.length) / 2;
    const score = (totals.wins + totals.draws / 2) / Math.max(1, totals.wins + totals.losses + totals.draws);
    if (totals.faults.length > 0) { verdict = 'FAULT'; break; }
    if (pairs >= options.minPairs && m.signTestPValue(totals.wins, totals.losses) < options.significance) { verdict = 'BETTER'; break; }
    // Futility: past the minimum, a candidate that has not won more than it lost is not worth more games.
    if (pairs >= options.minPairs && (score < 0.45 || totals.wins <= totals.losses)) { verdict = 'NO_GAIN'; break; }
    if (pairs >= options.maxPairs) break;
  }
  const pValue = m.signTestPValue(totals.wins, totals.losses);
  let gate = null;
  if (verdict === 'BETTER') {
    // Non-regression: the candidate still plays clean, replayable games and beats random-legal as B5 requires.
    const start = state.nextGateSeed;
    state.nextGateSeed += options.gatePairs * 2;
    const result = tally(runMatches(options, { allied: candidate, axis: 'random-legal', start, matches: options.gatePairs * 2, replay: true,
      out: join(runDir, 'last-gate') }), candidate);
    const games = result.wins + result.losses + result.draws;
    gate = { start, ...result, winRate: games ? result.wins / games : 0 };
    verdict = result.faults.length === 0 && gate.winRate >= options.gateWinRate ? 'PROMOTED' : 'GATE_FAILED';
  }
  log({
    event: 'generation', generation: state.generation, label, champion: state.champion.label, changed, verdict, pValue, totals, seeds, gate,
    summary: `${label} vs ${state.champion.label}: ${totals.wins}-${totals.losses}-${totals.draws} p=${pValue.toFixed(4)} ${verdict}`
      + `${gate ? ` gate ${gate.wins}/${gate.wins + gate.losses + gate.draws}` : ''} changed ${Object.entries(changed).map(([key, { from, to }]) => `${key} ${from}→${to}`).join(', ')}`,
  });
  if (verdict === 'PROMOTED') {
    state.promotions.push({ generation: state.generation, label, from: state.champion.label, changed, totals, pValue, gate });
    state.champion = { label, weights };
    policyFile(`champion-${label}`, label, weights);
  }
  state.randomState = Math.floor(random() * 4_294_967_296);
  save();
}
log({ event: 'stop', summary: `generation ${state.generation}, champion ${state.champion.label}, ${state.promotions.length} promotion(s)` });
