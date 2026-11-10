#!/usr/bin/env node
// Does the theater policy carry out its own supply plan in one Movement segment (docs/ai/theater-supply-plan.md)? Build first.
//
//   node scripts/ai-theater-rollout.mjs <ai-match dir> --weights <theater-weights.json> --out <file.jsonl> [--shard i/n] [--turns 5] [--trucks-only]
//   node scripts/ai-theater-rollout.mjs --summarize <file.jsonl> [...]
//
// For each game of the directory, at the attacker's first Movement decision of Game Turns 1..--turns (recorded
// states, whichever policy attacked), the save is cut there and loaded as a session, and the bot seat runner plays the
// attacker's Movement segment as in a match: the theater policy (heuristic with --weights) for the attacker, the
// standard heuristic for the other seat, until the segment ends. Rows give the allocation's HQ and truck placements
// from the THEATER debug line, then, when the segment ends: where each placed HQ stands, whether each truck's stager
// stands at its drop and how many Tokens the truck unloaded there, with the truck's and the stager's actions and the
// stager's movement debug line. With --trucks-only, only segments whose plan places a truck are played and written.
// No game is played past the segment; the recorded game is not changed.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const summarize = (files) => {
  const rows = files.flatMap((file) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)));
  const share = (list, test) => (list.length === 0 ? '—' : `${(list.filter(test).length / list.length).toFixed(2)} (${list.filter(test).length}/${list.length})`);
  const mean = (values) => (values.length === 0 ? '—' : (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  const hqs = rows.flatMap(({ hqs: h }) => h);
  const trucks = rows.flatMap(({ trucks: t }) => t);
  console.log(`${new Set(rows.map(({ match }) => match)).size} games, ${rows.length} attacker Movement segments, ${rows.filter(({ ended }) => ended).length} played to their end`);
  console.log(`- HQ placements ${hqs.length}: at their hex ${share(hqs, ({ endDistance }) => endDistance === 0)}, mean hexes short ${mean(hqs.map(({ endDistance }) => endDistance ?? 0))}`);
  console.log(`- Truck placements ${trucks.length}: stager at the drop ${share(trucks, ({ stagerAtDrop }) => stagerAtDrop)}; unloaded at the drop ${share(trucks, ({ unloadedAtDrop }) => unloadedAtDrop > 0)}; anywhere ${share(trucks, ({ unloaded }) => unloaded > 0)}; the planned Tokens at the drop ${share(trucks, ({ unloadedAtDrop, tokens }) => unloadedAtDrop >= tokens)}; Tokens planned ${mean(trucks.map(({ tokens }) => tokens))}, unloaded at the drop ${mean(trucks.map(({ unloadedAtDrop }) => unloadedAtDrop))}`);
};

if (args.includes('--summarize')) {
  summarize(args.filter((arg) => arg !== '--summarize'));
  process.exit(0);
}

const out = option('--out');
const weightsFile = option('--weights');
if (!out || !weightsFile) throw new Error('--weights <theater-weights.json> --out <file.jsonl>');
const [shard, shards] = (option('--shard') ?? '0/1').split('/').map(Number);
const lastTurn = Number(option('--turns') ?? 5);
const trucksOnly = args.includes('--trucks-only');
const dir = args.find((arg, index) => !arg.startsWith('--') && !['--out', '--weights', '--shard', '--turns'].includes(args[index - 1]));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const weights = JSON.parse(readFileSync(resolve(weightsFile), 'utf8'));
const theaterWeights = m.heuristicWeights(weights.weights ?? weights);
writeFileSync(out, '');

const stepKeyOf = ({ gameTurn, playerTurnIndex, phase, segment }) => `${gameTurn}:${playerTurnIndex}:${phase}:${segment}`;
const parsePlan = (line) => ({
  hqs: [...line.matchAll(/ HQ (\S+)>(-?\d+,-?\d+)>(-?\d+,-?\d+)@(-?\d+,-?\d+)\/t(\d)/g)].map(([, hqId, moveTo, , objective]) => ({ hqId, moveTo, objective })),
  trucks: [...line.matchAll(/ TRUCK (\S+)>(-?\d+,-?\d+)@(-?\d+,-?\d+)#(\d+)T\/(\S+)/g)].map(([, truckId, drop, objective, tokens, stagerId]) => ({ truckId, drop, objective, tokens: Number(tokens), stagerId })),
});

const counts = { segments: 0, ended: 0, loadFailed: 0 };
const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records.filter((_, index) => index % shards === shard);
for (const record of records) {
  const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const attackerId = state.configuration.attackVictory?.attackerId;
  const facts = { scenario: state.scenario, turnLimit: 8 };
  const done = new Set();
  for (const [index, action] of save.acceptedActions.entries()) {
    const { sequence } = state;
    if (sequence.gameTurn <= lastTurn && !done.has(sequence.gameTurn) && sequence.phasingPlayerId === attackerId && sequence.actingPlayerId === attackerId
      && !state.pendingDecision && sequence.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT') {
      done.add(sequence.gameTurn);
      const lines = [];
      const seats = save.bindings.map(({ seatId, playerId }) => ({
        seatId, playerId, seed: record.seeds[String(playerId).endsWith('axis') ? 'axis' : 'allied'],
        policy: playerId === attackerId ? m.createHeuristicPolicy(facts, { weights: theaterWeights, debug: (line) => lines.push(line) })
          : m.createHeuristicPolicy(facts, {}),
      }));
      const attackerSeat = seats.find(({ playerId }) => playerId === attackerId).seatId;
      let session;
      try {
        session = await m.createGameplayEngine(m.createMemoryGameplayPorts()).loadSession(JSON.stringify({
          ...save, acceptedActions: save.acceptedActions.slice(0, index), acceptedActionMetadata: save.acceptedActionMetadata.slice(0, index),
          currentSnapshot: m.serializeGameState(state).value, finalStateHash: (await m.hashGameState(state)).value, lifecycle: 'ACTIVE', checkpoints: [],
        }));
      } catch (error) {
        counts.loadFailed += 1;
        if (counts.loadFailed === 1) console.error(`load failed: ${error instanceof Error ? error.message : error}`);
        state = m.ruleEngine.applyAction(state, action).state;
        continue;
      }
      const hexOf = (pieceId) => {
        const stack = session.getView(attackerSeat).projection.stacks.find(({ pieces }) => pieces.some(({ id }) => String(id) === String(pieceId)));
        return stack?.location.kind === 'ON_MAP' ? String(stack.location.hexId) : null;
      };
      const startKey = stepKeyOf(sequence);
      let plan = null;
      const watched = [];
      const runner = m.createBotSeatRunner({
        nonce: 'rollout',
        session, seats,
        onDecision: (trace) => {
          if (trace.seatId !== attackerSeat) return;
          plan ??= lines.some((line) => line.includes(' THEATER')) ? parsePlan(lines.find((line) => line.includes(' THEATER'))) : null;
          if (!plan) return;
          const ids = [trace.action.truckId, trace.action.pieceId, ...(trace.action.companionIds ?? [])].filter(Boolean).map(String);
          const mine = [...plan.trucks.map(({ truckId }) => truckId), ...plan.trucks.map(({ stagerId }) => stagerId)].filter((id) => ids.includes(id));
          for (const id of mine) {
            watched.push({ id, kind: trace.action.kind, at: hexOf(id), to: trace.action.path?.at(-1) ?? null, tokens: trace.action.tokens ?? null, intent: trace.intent, status: trace.status });
          }
        },
      });
      let ended = false; let stop = null;
      for (let steps = 0; steps < 3000; steps += 1) {
        const view = session.getView(attackerSeat);
        if (stepKeyOf(view.projection.sequence) !== startKey && !view.pendingDecision) { ended = true; break; }
        if (trucksOnly && plan && plan.trucks.length === 0) break;
        const step = await runner.step();
        if (step.kind !== 'ACTED') { stop = step.kind === 'STUCK' ? `STUCK ${step.error?.code} ${step.error?.message ?? ''} ${JSON.stringify(step.error?.violations ?? [])}`.slice(0, 400) : step.kind; break; }
      }
      if (trucksOnly && (plan?.trucks.length ?? 0) === 0) { state = m.ruleEngine.applyAction(state, action).state; continue; }
      counts.segments += 1;
      if (ended) counts.ended += 1;
      const unloads = watched.filter(({ kind, status }) => kind === 'UNLOAD_SUPPLY' && status === 'ACCEPTED');
      appendFileSync(out, `${JSON.stringify({
        match: record.match, gameTurn: sequence.gameTurn, ended, stop,
        hqs: (plan?.hqs ?? []).map((placement) => ({ ...placement, endDistance: hexOf(placement.hqId) === null ? null : m.hexDistanceBetween(hexOf(placement.hqId), placement.moveTo) })),
        trucks: (plan?.trucks ?? []).map((placement) => ({
          ...placement, stagerAtDrop: hexOf(placement.stagerId) === placement.drop, stagerAt: hexOf(placement.stagerId), truckAt: hexOf(placement.truckId),
          unloaded: unloads.filter(({ id }) => id === placement.truckId).reduce((sum, { tokens }) => sum + tokens, 0),
          unloadedAtDrop: unloads.filter(({ id, at }) => id === placement.truckId && at === placement.drop).reduce((sum, { tokens }) => sum + tokens, 0),
          truckActions: watched.filter(({ id }) => id === placement.truckId),
          stagerActions: watched.filter(({ id }) => id === placement.stagerId),
          truckDebug: lines.filter((line) => line.includes(` TRUCK ${placement.truckId} at `) || line.includes(`PICKUP none for ${placement.truckId}`)).map((line) => line.slice(line.indexOf(' at '), line.indexOf(' at ') + 300)),
          stagerDebug: lines.filter((line) => line.includes(` ${placement.stagerId} at `)).map((line) => line.slice(0, 600)),
        })),
      })}\n`);
    }
    state = m.ruleEngine.applyAction(state, action).state;
  }
}
console.log(JSON.stringify(counts));
