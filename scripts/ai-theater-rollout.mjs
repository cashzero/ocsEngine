#!/usr/bin/env node
// Does the theater policy carry out its own supply plan in one Movement segment (docs/ai/theater-supply-plan.md)? Build first.
//
//   node scripts/ai-theater-rollout.mjs <ai-match dir> --weights <theater-weights.json> --out <file.jsonl> [--shard i/n] [--turns 5 | --starts 1,3]
//     [--match id] [--trucks-only] [--through n] [--standard] [--dist <dir>] [--save-dir <dir> --policy-label <label>]
//   node scripts/ai-theater-rollout.mjs --summarize <file.jsonl> [...]
//   node scripts/ai-theater-rollout.mjs --compare <dir of candidate rows> <dir of baseline rows>
//
// For each game of the directory, at the attacker's first Movement decision of Game Turns 1..--turns (recorded
// states, whichever policy attacked), the save is cut there and loaded as a session, and the bot seat runner plays the
// attacker's Movement segment as in a match: the theater policy (heuristic with --weights) for the attacker, the
// standard heuristic for the other seat, until the segment ends. Rows give the allocation's HQ and truck placements
// from the THEATER debug line, then, when the segment ends: where each placed HQ stands, whether each truck's stager
// stands at its drop and how many Tokens the truck unloaded there, with the truck's and the stager's actions and the
// stager's movement debug line, and whether the stager is then in trace or has SP to eat. With --trucks-only, only segments whose plan places a truck are played and written.
// No game is played past the segment; the recorded game is not changed.
//
// With --through n the rollout goes on from there, both seats playing, until the attacker's n-th player turn from the
// start has ended, and the row gains `outcome`: the points of the objectives the attacker holds at the start and the
// end, the steps each side lost and the attacker's regular attacks; each group of the plan gains the attacker turn of
// the rollout in which its objective was first attacked and whether the attacker holds it at the end. --standard lets the standard heuristic play the
// attacker instead, and --dist loads another build, so that --compare can pair two policies from the same recorded
// states: the mean difference per map (the two seat-swapped games of a map are one cluster) with a 95% t interval.
// With --save-dir (one start turn) each rollout's save and a summary.json naming the attacker's policy --policy-label
// are written there, so that the supply gate scripts (ai-logistics-study.mjs, ai-fuel-study.mjs) can read the rollouts.
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  const groups = rows.flatMap(({ groups: g }) => g ?? []);
  const per = (list) => (list.length / rows.length).toFixed(2);
  console.log(`${new Set(rows.map(({ match }) => match)).size} games, ${rows.length} attacker Movement segments, ${rows.filter(({ ended }) => ended).length} played to their end`);
  console.log(`- Allocation groups per segment: defended this step ${per(groups.filter(({ defended, turn }) => defended && turn === 1))}, defended next step ${per(groups.filter(({ defended, turn }) => defended && turn === 2))}, empty ${per(groups.filter(({ defended }) => !defended))}; expected VP ${(groups.reduce((sum, { chance, points }) => sum + chance * points, 0) / rows.length).toFixed(2)}`);
  const followed = groups.filter(({ defended, heldAtEnd }) => defended && heldAtEnd !== undefined);
  if (followed.length > 0) {
    for (const [label, step] of [['this step', 1], ['next step', 2]]) {
      const list = followed.filter(({ turn }) => turn === step);
      console.log(`- Defended groups planned for ${label} (${list.length}): attacked in the first attacker turn ${share(list, ({ attackedIn }) => attackedIn === 1)}, in the second ${share(list, ({ attackedIn }) => attackedIn === 2)}; held when the second ends ${share(list, ({ heldAtEnd }) => heldAtEnd)}`);
    }
  }
  console.log(`- HQ placements ${hqs.length}: at their hex ${share(hqs, ({ endDistance }) => endDistance === 0)}, mean hexes short ${mean(hqs.map(({ endDistance }) => endDistance ?? 0))}`);
  const stagers = [...new Map(rows.flatMap(({ match, gameTurn, trucks: t }) => t.map((truck) => [`${match}|${gameTurn}|${truck.stagerId}`, truck]))).values()];
  console.log(`- Stagers ${stagers.length}: in trace when Movement ends ${share(stagers, ({ stagerTraced }) => stagerTraced)}; out of trace with SP to eat ${share(stagers, ({ stagerTraced, stagerFedTokens }) => stagerTraced === false && stagerFedTokens > 0)}; out of trace with none ${share(stagers, ({ stagerTraced, stagerFedTokens }) => stagerTraced === false && !(stagerFedTokens > 0))}`);
  console.log(`- Truck placements ${trucks.length}: stager at the drop ${share(trucks, ({ stagerAtDrop }) => stagerAtDrop)}; unloaded at the drop ${share(trucks, ({ unloadedAtDrop }) => unloadedAtDrop > 0)}; anywhere ${share(trucks, ({ unloaded }) => unloaded > 0)}; the planned Tokens at the drop ${share(trucks, ({ unloadedAtDrop, tokens }) => unloadedAtDrop >= tokens)}; Tokens planned ${mean(trucks.map(({ tokens }) => tokens))}, unloaded at the drop ${mean(trucks.map(({ unloadedAtDrop }) => unloadedAtDrop))}`);
};

const compare = (candidateDir, baselineDir) => {
  const load = (dir) => new Map(readdirSync(dir).filter((file) => file.endsWith('.jsonl')).flatMap((file) => readFileSync(join(dir, file), 'utf8').trim().split('\n').filter(Boolean)
    .map((line) => JSON.parse(line))).filter(({ outcome }) => outcome).map((row) => [`${row.match}|${row.gameTurn}`, row]));
  const [candidate, baseline] = [load(candidateDir), load(baselineDir)];
  const keys = [...candidate.keys()].filter((key) => baseline.has(key));
  const T95 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
  const measures = {
    'Objective points gained': ({ outcome: o }) => o.objectivePointsEnd - o.objectivePointsStart,
    'Defender steps lost': ({ outcome: o }) => o.defenderStepsLost,
    'Attacker steps lost': ({ outcome: o }) => o.attackerStepsLost,
    'Attacker regular attacks': ({ outcome: o }) => o.attacks,
  };
  console.log(`${keys.length} paired rollouts (${candidate.size} candidate, ${baseline.size} baseline)`);
  for (const starts of [null, ...new Set(keys.map((key) => key.split('|')[1]))]) {
    const list = keys.filter((key) => starts === null || key.split('|')[1] === starts);
    console.log(`\n${starts === null ? 'All starts' : `Start at Game Turn ${starts}`}: ${list.length} rollouts`);
    for (const [label, measure] of Object.entries(measures)) {
      // One value per map: the two seat-swapped games of a map share it, and so do its start turns.
      const clusters = new Map();
      for (const key of list) {
        const cluster = Math.floor(Number(key.split('|')[0]) / 2);
        clusters.set(cluster, [...(clusters.get(cluster) ?? []), measure(candidate.get(key)) - measure(baseline.get(key))]);
      }
      const values = [...clusters.values()].map((diffs) => diffs.reduce((sum, value) => sum + value, 0) / diffs.length);
      const n = values.length;
      const mean = values.reduce((sum, value) => sum + value, 0) / n;
      const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1));
      const half = (T95[Math.min(n - 1, 30)] ?? 1.96) * sd / Math.sqrt(n);
      const level = (rows) => (list.reduce((sum, key) => sum + measure(rows.get(key)), 0) / list.length).toFixed(2);
      console.log(`- ${label}: candidate ${level(candidate)}, baseline ${level(baseline)}, difference per map ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} [${(mean - half).toFixed(2)}, ${(mean + half).toFixed(2)}] (${n} maps; ${values.filter((value) => value > 0).length} up, ${values.filter((value) => value < 0).length} down)`);
    }
  }
};

if (args.includes('--compare')) {
  compare(args[args.indexOf('--compare') + 1], args[args.indexOf('--compare') + 2]);
  process.exit(0);
}

if (args.includes('--summarize')) {
  summarize(args.filter((arg) => arg !== '--summarize'));
  process.exit(0);
}

const out = option('--out');
const weightsFile = option('--weights');
if (!out || !weightsFile) throw new Error('--weights <theater-weights.json> --out <file.jsonl>');
const [shard, shards] = (option('--shard') ?? '0/1').split('/').map(Number);
const lastTurn = Number(option('--turns') ?? 5);
const starts = option('--starts')?.split(',').map(Number) ?? null;
const through = Number(option('--through') ?? 0);
const standard = args.includes('--standard');
const saveDir = option('--save-dir');
const policyLabel = option('--policy-label') ?? (standard ? 'heuristic' : 'theater');
const saved = [];
if (saveDir) mkdirSync(saveDir, { recursive: true });
const trucksOnly = args.includes('--trucks-only');
const dir = args.find((arg, index) => !arg.startsWith('--') && !['--out', '--weights', '--shard', '--turns', '--match', '--starts', '--through', '--dist', '--save-dir', '--policy-label'].includes(args[index - 1]));
const m = await import(pathToFileURL(join(option('--dist') ? resolve(option('--dist')) : join(root, 'dist'), 'index.js')).href);
const weights = JSON.parse(readFileSync(resolve(weightsFile), 'utf8'));
const theaterWeights = m.heuristicWeights(weights.weights ?? weights);
writeFileSync(out, '');

const stepKeyOf = ({ gameTurn, playerTurnIndex, phase, segment }) => `${gameTurn}:${playerTurnIndex}:${phase}:${segment}`;
const parsePlan = (line) => ({
  groups: [...line.matchAll(/ (-?\d+,-?\d+):(\d+)u p([\d.]+) t(\d)/g)].map(([, objective, units, chance, turn]) => ({ objective, units: Number(units), chance: Number(chance), turn: Number(turn) })),
  hqs: [...line.matchAll(/ HQ (\S+)>(-?\d+,-?\d+)>(-?\d+,-?\d+)@(-?\d+,-?\d+)\/t(\d)/g)].map(([, hqId, moveTo, , objective]) => ({ hqId, moveTo, objective })),
  trucks: [...line.matchAll(/ TRUCK (\S+)>(-?\d+,-?\d+)@(-?\d+,-?\d+)#(\d+)T\/(\S+)/g)].map(([, truckId, drop, objective, tokens, stagerId]) => ({ truckId, drop, objective, tokens: Number(tokens), stagerId })),
});

const counts = { segments: 0, ended: 0, loadFailed: 0 };
const only = option('--match');
const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records.filter((_, index) => index % shards === shard)
  .filter(({ match }) => only === null || String(match) === only);
for (const record of records) {
  const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const attackerId = state.configuration.attackVictory?.attackerId;
  const facts = { scenario: state.scenario, turnLimit: 8 };
  const done = new Set();
  for (const [index, action] of save.acceptedActions.entries()) {
    const { sequence } = state;
    if ((starts ? starts.includes(sequence.gameTurn) : sequence.gameTurn <= lastTurn) && !done.has(sequence.gameTurn) && sequence.phasingPlayerId === attackerId && sequence.actingPlayerId === attackerId
      && !state.pendingDecision && sequence.phase === 'MOVEMENT' && sequence.segment === 'MOVEMENT') {
      done.add(sequence.gameTurn);
      const lines = [];
      const seats = save.bindings.map(({ seatId, playerId }) => ({
        seatId, playerId, seed: record.seeds[String(playerId).endsWith('axis') ? 'axis' : 'allied'],
        policy: playerId === attackerId ? m.createHeuristicPolicy(facts, standard ? {} : { weights: theaterWeights, debug: (line) => lines.push(line) })
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
      // Whether the stager, where it stands when the segment ends, is in its trace or can eat from SP on the map (12.6c).
      const supplyOf = (pieceId) => {
        const at = hexOf(pieceId);
        if (at === null) return { traced: null, fedTokens: null };
        return {
          traced: (session.getTraceCoverage(attackerSeat, pieceId).value?.hexIds ?? []).map(String).includes(at),
          fedTokens: (session.getFeedCoverage(attackerSeat, pieceId).value ?? []).filter(({ hexIds }) => hexIds.map(String).includes(at)).reduce((sum, { tokens }) => sum + tokens, 0),
        };
      };
      const objectives = new Map(m.ruleEngine.projectForViewer(state, attackerId).objectives.map(({ hexId, points }) => [String(hexId), points]));
      const enemy = m.analyze(m.ruleEngine.projectForViewer(state, attackerId), attackerId, facts).enemy;
      const defended = (hexId) => enemy.get(hexId)?.hasCombatUnit ?? false;
      const row = {
        match: record.match, gameTurn: sequence.gameTurn, ended, stop,
        groups: (plan?.groups ?? []).map((group) => ({ ...group, points: objectives.get(group.objective) ?? 0, defended: defended(group.objective) })),
        hqs: (plan?.hqs ?? []).map((placement) => ({ ...placement, endDistance: hexOf(placement.hqId) === null ? null : m.hexDistanceBetween(hexOf(placement.hqId), placement.moveTo) })),
        trucks: (plan?.trucks ?? []).map((placement) => ({
          ...placement, stagerAtDrop: hexOf(placement.stagerId) === placement.drop, stagerAt: hexOf(placement.stagerId), truckAt: hexOf(placement.truckId),
          stagerTraced: supplyOf(placement.stagerId).traced, stagerFedTokens: supplyOf(placement.stagerId).fedTokens,
          unloaded: unloads.filter(({ id }) => id === placement.truckId).reduce((sum, { tokens }) => sum + tokens, 0),
          unloadedAtDrop: unloads.filter(({ id, at }) => id === placement.truckId && at === placement.drop).reduce((sum, { tokens }) => sum + tokens, 0),
          truckActions: watched.filter(({ id }) => id === placement.truckId),
          stagerActions: watched.filter(({ id }) => id === placement.stagerId),
          truckDebug: lines.filter((line) => line.includes(` TRUCK ${placement.truckId} at `) || line.includes(`PICKUP none for ${placement.truckId}`)).map((line) => line.slice(line.indexOf(' at '), line.indexOf(' at ') + 300)),
          stagerDebug: lines.filter((line) => line.includes(` ${placement.stagerId} at `) || line.includes(`STAGER ${placement.stagerId} `)).map((line) => line.slice(0, 600)),
        })),
      };
      if (through > 0 && ended) {
        // Play on until the attacker's `through`-th player turn from the start has ended (or the game has).
        const turnKey = () => { const { gameTurn, playerTurnIndex, phasingPlayerId } = session.getView(attackerSeat).projection.sequence; return `${gameTurn}:${playerTurnIndex}:${phasingPlayerId}`; };
        const held = () => session.getView(attackerSeat).projection.objectives.filter(({ controllerId }) => controllerId === attackerId).reduce((sum, { points }) => sum + points, 0);
        const objectivePointsStart = m.ruleEngine.projectForViewer(state, attackerId).objectives.filter(({ controllerId }) => controllerId === attackerId).reduce((sum, { points }) => sum + points, 0);
        let last = turnKey(); let finished = 0; let halted = null;
        for (let steps = 0; steps < 60000 && finished < through; steps += 1) {
          const step = await runner.step();
          if (step.kind !== 'ACTED') { halted = step.kind; break; }
          const now = turnKey();
          if (now !== last) { if (last.endsWith(`:${attackerId}`)) finished += 1; last = now; }
        }
        // Steps lost and attacks, from the actions played since the cut.
        let replayed = state; const lost = { attacker: 0, defender: 0 }; let attacks = 0;
        const attackedIn = new Map();
        for (const played of session.save().acceptedActions.slice(index)) {
          const next = m.ruleEngine.applyAction(replayed, played);
          if (!next.ok) break;
          if (played.kind === 'DECLARE_COMBAT' && played.combatKind === 'REGULAR' && played.actorId === attackerId) {
            attacks += 1;
            // The attacker player turn of the rollout (1 or 2) in which each objective was first attacked.
            if (!attackedIn.has(String(played.targetHexId))) attackedIn.set(String(played.targetHexId), replayed.sequence.gameTurn - sequence.gameTurn + 1);
          }
          for (const event of next.events) {
            if (event.kind !== 'STEP_LOST') continue;
            const piece = replayed.pieceState.pieces.find(({ id }) => id === event.pieceId) ?? next.state.pieceState.pieces.find(({ id }) => id === event.pieceId);
            if (piece) lost[piece.ownerId === attackerId ? 'attacker' : 'defender'] += 1;
          }
          replayed = next.state;
        }
        const control = new Map(session.getView(attackerSeat).projection.objectives.map(({ hexId, controllerId }) => [String(hexId), controllerId]));
        for (const group of row.groups) { group.attackedIn = attackedIn.get(group.objective) ?? null; group.heldAtEnd = control.get(group.objective) === attackerId; }
        if (saveDir) {
          writeFileSync(join(saveDir, `match-${record.match}.save.json`), session.serializeSave());
          const attackerSide = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
          saved.push({ match: record.match, sides: { axis: { policy: attackerSide === 'axis' ? policyLabel : 'heuristic' }, allied: { policy: attackerSide === 'allied' ? policyLabel : 'heuristic' } } });
        }
        row.outcome = { playerTurns: finished, halted, objectivePointsStart, objectivePointsEnd: held(), attackerStepsLost: lost.attacker, defenderStepsLost: lost.defender, attacks };
      }
      appendFileSync(out, `${JSON.stringify(row)}\n`);
    }
    state = m.ruleEngine.applyAction(state, action).state;
  }
}
if (saveDir) writeFileSync(join(saveDir, `summary-${shard}.json`), JSON.stringify({ records: saved }));
console.log(JSON.stringify(counts));
