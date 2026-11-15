#!/usr/bin/env node
// Branch points for scripts/ai-continue.mjs: segments where a seat made a kind of decision under study, from ai-match traces.
//
//   node scripts/ai-find-branches.mjs <match directory> [...] --kind defender-assault [--policy <substring>] [--from-turn 2] [--per-game 1]
//     [--replay [--engine dist]]
//
// Kinds (each names the seat, the segment and the decision it looks for in that seat's trace intents):
//   defender-assault   the defender of an attack engagement sends units on assault tasks ("(assault …)"), Movement Segment
//   attacker-assault   the attacker does
//   declined-advance   either side declines every advance after a combat ("advance: no supplied advance …"), Combat Segments
//   first-movement     either side's own Movement Segment of the Movement Phase, whatever it decides (any engagement);
//                      its answers to pending decisions in the other side's segment do not count
// --policy keeps games where that seat's policy (summary.json) contains the substring. One JSON line per branch point:
// the save, the segment, the seat's side and the index of the segment's first action (the --at of ai-continue.mjs).
// --replay reads the saves instead of the traces, for games played without traces: each accepted action is the seat's row
// of the step it was taken in (the step key of the state before it, an answer to a pending decision being a DECISION row).
// Intents are not in a save, so only kinds that match any intent (first-movement) can be found this way. A save this
// engine does not replay to its recorded final state is an error. Build first.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const kind = option('--kind');
const policyFilter = option('--policy');
const fromTurn = Number(option('--from-turn', '2'));
const perGame = Number(option('--per-game', '1'));
const replay = args.includes('--replay');
const flags = new Set(['--kind', '--policy', '--from-turn', '--per-game', '--engine'].flatMap((name) => (args.includes(name) ? [args.indexOf(name), args.indexOf(name) + 1] : [])));
if (replay) flags.add(args.indexOf('--replay'));
const dirs = args.filter((_, index) => !flags.has(index));
const KINDS = {
  'defender-assault': { role: 'defender', segment: /MOVEMENT:MOVEMENT$/, intent: /\(assault / },
  'attacker-assault': { role: 'attacker', segment: /MOVEMENT:MOVEMENT$/, intent: /\(assault / },
  'declined-advance': { role: 'any', segment: /COMBAT$/, intent: /^advance: no supplied advance/ },
  'first-movement': { role: 'any', segment: /MOVEMENT:MOVEMENT$/, intent: /(?:)/, ownActions: true },
};
const spec = KINDS[kind];
if (!spec) throw new Error(`--kind ${Object.keys(KINDS).join('|')}`);
if (replay && spec.intent.source !== '(?:)') throw new Error(`--replay finds only kinds that need no intent (first-movement), not ${kind}`);

// The rows a trace would hold for this game, rebuilt from its save: one per accepted action.
let engine = null;
const replayRows = async (savePath) => {
  if (engine === null) {
    const { loadEngine } = await import('./ai-position-metrics.mjs');
    const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
    engine = (await loadEngine(resolve(root, option('--engine', 'dist')))).m;
  }
  const save = JSON.parse(readFileSync(savePath, 'utf8'));
  let state = engine.parseGameStateJson(save.initialSnapshot).value;
  const rows = [];
  save.acceptedActions.forEach((action, revision) => {
    const { gameTurn, playerTurnIndex, phase, segment } = state.sequence;
    rows.push({
      seatId: save.acceptedActionMetadata[revision].seatId, stepKey: `${gameTurn}:${playerTurnIndex}:${phase}:${segment}`,
      revision, kind: state.pendingDecision ? 'DECISION' : 'ACTION', intent: '',
    });
    const applied = engine.ruleEngine.applyAction(state, action);
    if (!applied.ok) throw new Error(`${savePath}: action ${revision} is rejected by this engine`);
    state = applied.state;
  });
  // The branch points are only those of the recorded game if this engine replays it to the same end.
  if ((await engine.hashGameState(state)).value !== save.finalStateHash) throw new Error(`${savePath}: this engine replays it to another final state`);
  return rows;
};
const traceRows = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));

for (const dir of dirs) {
  const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
  for (const record of records) {
    const trace = join(dir, `match-${record.match}.trace.jsonl`);
    const savePath = join(dir, `match-${record.match}.save.json`);
    if (!existsSync(replay ? savePath : trace) || (spec.role !== 'any' && record.summary.engagement !== 'AXIS_ATTACKS')) continue;
    let rows = null;
    for (const side of spec.role === 'any' ? ['allied', 'axis'] : [spec.role === 'attacker' ? 'axis' : 'allied']) {
    if (policyFilter && !record.sides[side].policy.includes(policyFilter)) continue;
    rows ??= replay ? await replayRows(savePath) : traceRows(trace);
    const segments = new Map();
    for (const row of rows) {
      // Decisions inside a segment are RESPOND_DECISION rows; the branch is the segment's first row of this seat.
      if (row.seatId !== `seat:${side}` || !spec.segment.test(String(row.stepKey))) continue;
      if (Number(String(row.stepKey).split(':')[0]) < fromTurn) continue;
      const segment = segments.get(row.stepKey) ?? { at: row.revision, hits: 0 };
      if (spec.intent.test(row.intent ?? '') && !(spec.ownActions && row.kind === 'DECISION')) segment.hits += 1;
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
}
