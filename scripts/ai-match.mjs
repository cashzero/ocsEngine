#!/usr/bin/env node
// Headless bot-against-bot matches on generated games (M9). Build first: `npm run build`.
//
//   node scripts/ai-match.mjs --matches 20 --parallel 4 --turns 8 --out tmp/ai-match/smoke
//   node scripts/ai-match.mjs --matches 1 --start 7 --trace        # replay one match with a decision trace
//   node scripts/ai-match.mjs --air STANDARD --air-transport STANDARD --size 64x48 --scale LARGE
//
// Every match varies the map, OOB, deployment and rules seeds from the match index; --fix-map / --fix-oob hold one
// dimension fixed. Exit code 1 when any match stops for a reason other than FINISHED or fails the replay check.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const parseArgs = (argv) => {
  const options = {
    matches: 10, start: 0, parallel: Math.max(1, Math.min(4, availableParallelism() - 1)), turns: 8,
    width: null, height: null, scale: null, style: null, divisions: null, armored: null, air: null, airTransport: null,
    fixMap: null, fixOob: null, policies: { allied: 'random-legal', axis: 'random-legal' },
    maxActions: 60_000, replay: true, trace: false, out: null, swap: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => argv[++index];
    switch (flag) {
      case '--matches': options.matches = Number(value()); break;
      case '--start': options.start = Number(value()); break;
      case '--parallel': options.parallel = Math.max(1, Number(value())); break;
      case '--turns': options.turns = Number(value()); break;
      case '--size': { const [w, h] = value().split('x').map(Number); options.width = w; options.height = h; break; }
      case '--divisions': options.divisions = Number(value()); break;
      case '--armored': options.armored = Number(value()); break;
      case '--air': options.air = value(); break;
      case '--air-transport': options.airTransport = value(); break;
      case '--scale': options.scale = value(); break;
      case '--style': options.style = value(); break;
      case '--fix-map': options.fixMap = Number(value()); break;
      case '--fix-oob': options.fixOob = Number(value()); break;
      case '--allied': options.policies.allied = value(); break;
      case '--axis': options.policies.axis = value(); break;
      case '--max-actions': options.maxActions = Number(value()); break;
      case '--swap': options.swap = true; break;
      case '--no-replay': options.replay = false; break;
      case '--trace': options.trace = true; break;
      case '--out': options.out = value(); break;
      case '--help': console.log('see the header of scripts/ai-match.mjs'); process.exit(0);
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  options.out ??= join('tmp', 'ai-match', new Date().toISOString().replace(/[:.]/g, '-'));
  return options;
};

const seedsFor = (options, matchIndex) => {
  const base = 0x0a1b0000 + matchIndex * 97;
  return {
    map: options.fixMap ?? base + 1,
    oob: options.fixOob ?? base + 2,
    deployment: base + 3,
    rules: base + 4,
    allied: base + 5,
    axis: base + 6,
  };
};

const runMatch = async (baseOptions, matchIndex) => {
  // --swap: odd matches exchange the policies' sides, with the seeds of the even match before them (paired seats).
  const swapped = baseOptions.swap && matchIndex % 2 === 1;
  const options = swapped ? { ...baseOptions, policies: { allied: baseOptions.policies.axis, axis: baseOptions.policies.allied } } : baseOptions;
  const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
  const seeds = seedsFor(options, swapped ? matchIndex - 1 : matchIndex);
  const defaults = m.DEFAULT_NEW_GAME_REQUEST;
  const request = {
    ...defaults,
    map: { ...defaults.map, ...(options.width ? { width: options.width, height: options.height } : {}), ...(options.style ? { style: options.style } : {}) },
    oob: {
      ...defaults.oob,
      ...(options.divisions !== null ? { divisionsPerSide: options.divisions } : {}),
      ...(options.armored !== null ? { armoredDivisionsPerSide: options.armored } : {}),
      ...(options.air !== null ? { air: options.air } : {}),
      ...(options.airTransport !== null ? { airTransport: options.airTransport } : {}),
      ...(options.scale !== null ? { scale: options.scale } : {}),
    },
    seeds: { map: seeds.map, oob: seeds.oob, deployment: seeds.deployment, rules: seeds.rules },
    turnLimit: options.turns,
  };
  const record = { match: matchIndex, seeds, stopReason: null, errors: [], timings: {} };
  const t0 = performance.now();
  const prepared = m.prepareNewGame(request);
  if (!prepared.ok) return { ...record, stopReason: 'PREPARE_FAILED', errors: prepared.error.map(({ code, message }) => ({ code, message })) };
  const engine = m.createGameplayEngine(m.createMemoryGameplayPorts());
  const session = await engine.createSession({
    scenario: prepared.value.scenario, configuration: prepared.value.configuration, rulesSeed: seeds.rules,
    bindings: prepared.value.bindings, label: `ai-match ${matchIndex}`, persistence: 'MANUAL',
  });
  session.start();
  const t1 = performance.now();
  const facts = { scenario: prepared.value.scenario, turnLimit: options.turns };
  const policyFor = (id) => {
    if (id === 'random-legal') return m.createRandomLegalPolicy();
    if (id === 'heuristic') return m.createHeuristicPolicy(facts);
    throw new Error(`Unknown policy ${id}`);
  };
  const sideOf = (playerId) => String(playerId).endsWith('axis') ? 'axis' : 'allied';
  const seats = prepared.value.bindings.map((binding) => {
    const side = sideOf(binding.playerId);
    return { seatId: binding.seatId, playerId: binding.playerId, policy: policyFor(options.policies[side]), seed: seeds[side] };
  });
  const startObjectives = session.getView(seats[0].seatId).projection.objectives;
  const tracePath = options.trace ? join(options.out, `match-${matchIndex}.trace.jsonl`) : null;
  const result = await m.runBotMatch({
    session, seats, maxActions: options.maxActions,
    ...(tracePath ? { onDecision: (trace) => appendFileSync(tracePath, `${JSON.stringify(trace)}\n`) } : {}),
  });
  const t2 = performance.now();
  const view = session.getView(seats[0].seatId);
  const projection = view.projection;
  let replay = null;
  const diagnostics = session.getDiagnostics();
  if (options.replay && diagnostics.lifecycle !== 'FAULTED') {
    const serialized = session.serializeSave();
    const t3 = performance.now();
    try {
      const loaded = await engine.loadSession(serialized);
      replay = { ok: loaded.getMetadata().stateHash === session.getMetadata().stateHash, ms: Math.round(performance.now() - t3) };
    } catch (error) {
      replay = { ok: false, ms: Math.round(performance.now() - t3), error: error instanceof Error ? error.message : String(error) };
    }
    writeFileSync(join(options.out, `match-${matchIndex}.save.json`), serialized);
  }
  // Logistics: replay the game and count SP each side spent straight out of a truck's cargo (12.3: cargo is
  // drawn like a dump), which with unloads shows SP hauled to where the army used it.
  const cargoSpent = { allied: 0, axis: 0 };
  {
    const save = session.save();
    let state = m.parseGameStateJson(save.initialSnapshot);
    state = state.ok ? state.value : null;
    for (const action of state ? save.acceptedActions : []) {
      const next = m.ruleEngine.applyAction(state, action);
      if (!next.ok) break;
      for (const event of next.events) {
        const pieceId = event.kind === 'SUPPLY_SPENT' ? event.resourcePieceId : event.kind === 'RESOURCE_CONSUMED' ? event.reservation.resourcePieceId : null;
        const quantity = event.kind === 'SUPPLY_SPENT' ? event.quantity : event.kind === 'RESOURCE_CONSUMED' ? event.reservation.quantity : 0;
        const piece = pieceId === null ? null : state.pieceState.pieces.find(({ id }) => id === pieceId);
        if (piece?.location.kind === 'CONTAINER') cargoSpent[sideOf(piece.ownerId)] += quantity;
      }
      state = next.state;
    }
  }
  // Per side: policy, Victory Points, objectives taken from the other side or nobody, actions, units in supply at the end.
  const sides = Object.fromEntries(seats.map((seat) => {
    const side = sideOf(seat.playerId);
    const own = session.getView(seat.seatId).projection;
    const combat = own.stacks.filter(({ location }) => location.kind === 'ON_MAP')
      .flatMap(({ pieces }) => pieces.filter((piece) => piece.ownerId === seat.playerId && piece.role === 'COMBAT'));
    const captured = own.objectives.filter((objective) => objective.controllerId === seat.playerId
      && startObjectives.find(({ hexId }) => hexId === objective.hexId)?.controllerId !== seat.playerId).map(({ hexId }) => hexId);
    return [side, {
      policy: options.policies[side],
      vp: own.victory.scores.find(({ playerId }) => playerId === seat.playerId)?.points ?? 0,
      captured,
      combatUnits: combat.length,
      outOfSupply: combat.filter(({ statuses }) => statuses.includes('status:out-of-supply')).length,
      cargoSpent: cargoSpent[side],
      actions: result.actionCountsBySeat[seat.seatId] ?? {},
    }];
  }));
  return {
    ...record,
    sides,
    winner: projection?.victory.winnerId ? sideOf(projection.victory.winnerId) : 'draw',
    stopReason: result.stopReason,
    errors: result.errors,
    accepted: result.accepted,
    rejected: result.rejected,
    actionCounts: result.actionCounts,
    finalStateHash: String(session.getMetadata().stateHash),
    fatalCode: diagnostics.fatalCode,
    reached: projection ? { gameTurn: projection.sequence.gameTurn, phase: projection.sequence.phase } : null,
    victory: projection?.victory ?? null,
    replay,
    summary: prepared.value.summary,
    timings: {
      createMs: Math.round(t1 - t0), playMs: Math.round(t2 - t1),
      decideMs: Math.round(result.decideMs), dispatchMs: Math.round(result.dispatchMs),
      perActionMs: result.accepted > 0 ? Number(((t2 - t1) / result.accepted).toFixed(2)) : null,
    },
  };
};

const markdown = (options, records, elapsedMs) => {
  const failed = records.filter((r) => r.stopReason !== 'FINISHED' || r.replay?.ok === false);
  // Results by policy across both seats.
  const byPolicy = {};
  for (const r of records) {
    for (const [side, info] of Object.entries(r.sides ?? {})) {
      const entry = byPolicy[info.policy] ??= { games: 0, wins: 0, draws: 0, captured: 0, attacks: 0, barrages: 0, fuel: 0, unloads: 0, rebuilds: 0, oos: 0, units: 0 };
      entry.games += 1;
      if (r.winner === side) entry.wins += 1; else if (r.winner === 'draw') entry.draws += 1;
      if (info.captured.length > 0) entry.captured += 1;
      entry.attacks += info.actions.DECLARE_COMBAT ?? 0;
      entry.barrages += info.actions.DECLARE_BARRAGE ?? 0;
      entry.fuel += info.actions.PAY_FUEL ?? 0;
      entry.unloads += info.actions.UNLOAD_SUPPLY ?? 0;
      entry.rebuilds += info.actions.REBUILD_UNITS ?? 0;
      entry.oos += info.outOfSupply; entry.units += info.combatUnits;
    }
  }
  const lines = [
    `# ai-match ${options.policies.allied} (Allied) vs ${options.policies.axis} (Axis)`,
    '',
    `${records.length} matches, ${options.turns} turns, ${options.parallel} workers, wall ${(elapsedMs / 1000).toFixed(1)} s, `
      + `${failed.length} failed.`,
    '',
    '| policy | games | wins | draws | games with a capture | attacks/game | barrages/game | fuel/game | unloads/game | rebuilds/game | combat units in supply at end |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...Object.entries(byPolicy).map(([policy, e]) => `| ${policy} | ${e.games} | ${e.wins} (${Math.round(100 * e.wins / e.games)}%) | ${e.draws} | ${e.captured} | `
      + `${(e.attacks / e.games).toFixed(1)} | ${(e.barrages / e.games).toFixed(1)} | ${(e.fuel / e.games).toFixed(1)} | ${(e.unloads / e.games).toFixed(1)} | `
      + `${(e.rebuilds / e.games).toFixed(1)} | ${e.units ? Math.round(100 * (1 - e.oos / e.units)) : '-'}% |`),
    '',
    '| match | stop | turn reached | actions | play s | ms/action | replay | VP (winner) | errors |',
    '|---|---|---|---|---|---|---|---|---|',
    ...records.map((r) => `| ${r.match} | ${r.stopReason} | ${r.reached ? `${r.reached.gameTurn} ${r.reached.phase}` : '-'} | ${r.accepted ?? '-'} | `
      + `${r.timings.playMs !== undefined ? (r.timings.playMs / 1000).toFixed(1) : '-'} | ${r.timings.perActionMs ?? '-'} | `
      + `${r.replay === null || r.replay === undefined ? '-' : r.replay.ok ? `ok ${r.replay.ms} ms` : 'MISMATCH'} | `
      + `${r.sides ? `${Object.entries(r.sides).map(([side, info]) => `${side} ${info.policy} ${info.vp}`).join(' / ')} (${r.winner})` : '-'} | `
      + `${r.errors.map(({ code, actionKind, violations }) => `${code}${actionKind ? ` ${actionKind}` : ''}${violations?.length ? ` [${violations.join(',')}]` : ''}`).join('; ')} |`),
  ];
  return `${lines.join('\n')}\n`;
};

if (isMainThread) {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(options.out, { recursive: true });
  const indexes = Array.from({ length: options.matches }, (_, i) => options.start + i);
  const records = [];
  const started = performance.now();
  const workers = Math.min(options.parallel, indexes.length);
  let next = 0;
  const runWorker = () => new Promise((resolveWorker, rejectWorker) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { options } });
    const feed = () => {
      if (next >= indexes.length) { worker.postMessage(null); return; }
      worker.postMessage(indexes[next++]);
    };
    worker.on('message', (record) => {
      records.push(record);
      const t = record.timings;
      console.log(`match ${record.match}: ${record.stopReason} actions=${record.accepted ?? '-'} play=${t.playMs ?? '-'}ms `
        + `(${t.perActionMs ?? '-'} ms/action) replay=${record.replay ? (record.replay.ok ? 'ok' : 'MISMATCH') : '-'}`
        + `${record.errors.length ? ` errors=${record.errors.map(({ code }) => code).join(',')}` : ''}`);
      feed();
    });
    worker.on('error', rejectWorker);
    worker.on('exit', resolveWorker);
    feed();
  });
  await Promise.all(Array.from({ length: workers }, runWorker));
  records.sort((left, right) => left.match - right.match);
  const elapsedMs = performance.now() - started;
  writeFileSync(join(options.out, 'summary.json'), `${JSON.stringify({ options, elapsedMs, records }, null, 2)}\n`);
  writeFileSync(join(options.out, 'summary.md'), markdown(options, records, elapsedMs));
  const failed = records.filter((r) => r.stopReason !== 'FINISHED' || r.replay?.ok === false);
  console.log(`\n${records.length} matches in ${(elapsedMs / 1000).toFixed(1)} s; ${failed.length} failed. Report: ${join(options.out, 'summary.md')}`);
  process.exit(failed.length > 0 ? 1 : 0);
} else {
  const { options } = workerData;
  parentPort.on('message', async (matchIndex) => {
    if (matchIndex === null) { parentPort.close(); return; }
    try {
      parentPort.postMessage(await runMatch(options, matchIndex));
    } catch (error) {
      parentPort.postMessage({
        match: matchIndex, seeds: seedsFor(options, matchIndex), stopReason: 'CRASH', timings: {},
        errors: [{ code: 'CRASH', message: error instanceof Error ? error.stack : String(error) }],
      });
    }
  });
}
