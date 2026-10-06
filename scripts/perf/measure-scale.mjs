// Map-size performance probe: plays Game Turn 1 of a generated game through the real UI controller (the object the
// browser drives), once per map size, and times every controller operation together with the session and rule-engine
// calls made inside it. Rendering is not included (see the browser run for that); this isolates engine/controller cost.
// Usage: npm run build && node scripts/perf/measure-scale.mjs [outDir] [WxH ...]   (default sizes: 32x24 64x48)
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import {
  DEFAULT_NEW_GAME_REQUEST, createGameplayEngine, createMemoryGameplayPorts, createNewGameOrchestrator,
  hashGameState, parseGameStateJson, ruleEngine, serializeGameState,
} from '../../dist/index.js';
import { createUiController } from '../../dist/ui/controller.js';

const out = process.argv[2] ?? 'tmp/perf';
const sizes = (process.argv.length > 3 ? process.argv.slice(3) : ['32x24', '64x48']).map((text) => text.split('x').map(Number));
await mkdir(out, { recursive: true });

/** Inclusive time per label, collected into whichever operation is open. */
let current = null;
const timed = (label, fn) => function (...args) {
  const started = performance.now();
  try { return fn.apply(this, args); } finally {
    if (current) {
      const entry = current.calls[label] ??= { count: 0, ms: 0, max: 0 };
      const ms = performance.now() - started;
      entry.count += 1; entry.ms += ms; entry.max = Math.max(entry.max, ms);
    }
  }
};
const timedAsync = (label, fn) => async function (...args) {
  const started = performance.now();
  try { return await fn.apply(this, args); } finally {
    if (current) {
      const entry = current.calls[label] ??= { count: 0, ms: 0, max: 0 };
      const ms = performance.now() - started;
      entry.count += 1; entry.ms += ms; entry.max = Math.max(entry.max, ms);
    }
  }
};

const instrumentedRules = () => {
  const rules = {};
  for (const [name, fn] of Object.entries(ruleEngine)) {
    if (typeof fn !== 'function') { rules[name] = fn; continue; }
    rules[name] = name === 'getActionCandidates'
      ? (state, request) => timed(`rules.getActionCandidates[${request.kind}]`, fn)(state, request)
      : timed(`rules.${name}`, fn);
  }
  return rules;
};

const SESSION_SYNC = ['getView', 'getActionFamilies', 'getMovementRange', 'getTraceCoverage', 'getSupplySources', 'getTransportOptions',
  'getFuelPreview', 'validateDraft', 'getPendingDecision', 'getHistory', 'serializeSave', 'createCheckpoint', 'removeCheckpoint',
  'beginHandoff', 'completeHandoff', 'listCheckpoints'];
const instrumentSession = (session) => {
  for (const name of SESSION_SYNC) if (typeof session[name] === 'function') session[name] = timed(`session.${name}`, session[name]);
  const candidates = session.getActionCandidates;
  session.getActionCandidates = (seatId, request) => timed(`session.getActionCandidates[${request.kind}]`, candidates)(seatId, request);
  for (const name of ['dispatch', 'respondToPendingDecision', 'undoTo']) session[name] = timedAsync(`session.${name}`, session[name]);
};

const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
const bench = (fn, runs = 5) => { const times = []; for (let i = 0; i < runs; i += 1) { const t = performance.now(); fn(); times.push(performance.now() - t); } return { median: median(times), min: Math.min(...times), max: Math.max(...times) }; };
const benchAsync = async (fn, runs = 5) => { const times = []; for (let i = 0; i < runs; i += 1) { const t = performance.now(); await fn(); times.push(performance.now() - t); } return { median: median(times), min: Math.min(...times), max: Math.max(...times) }; };

const report = { generatedAt: new Date().toISOString(), node: process.version, sizes: [] };

for (const [width, height] of sizes) {
  const label = `${width}x${height}`;
  console.log(`\n=== ${label} ===`);
  const ports = { ...createMemoryGameplayPorts(), rules: instrumentedRules() };
  const engine = createGameplayEngine(ports);
  const request = { ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width, height } };
  const operations = [];
  const op = async (name, fn) => {
    const previous = current;
    current = { name, calls: {}, ms: 0 };
    const started = performance.now();
    try { await fn(); } finally {
      current.ms = performance.now() - started;
      operations.push(current);
      current = previous;
    }
    return operations.at(-1);
  };

  let created;
  await op('new game: create (generate map/OOB, deploy, compose, start session)', async () => {
    created = await createNewGameOrchestrator(engine).create(request);
  });
  if (!created.ok) throw new Error(`New Game failed: ${JSON.stringify(created.error).slice(0, 400)}`);
  const { session, scenario, bindings } = created.value;
  instrumentSession(session);
  const state0 = parseGameStateJson(JSON.parse(session.serializeSave()).currentSnapshot).value;
  const facts = {
    hexes: scenario.mapDefinition.hexes.length,
    hexsides: scenario.mapDefinition.hexsides?.length ?? null,
    features: scenario.mapDefinition.features?.length ?? null,
    pieces: state0.pieceState.pieces.length,
    onMap: state0.pieceState.pieces.filter((p) => p.location.kind === 'ON_MAP').length,
    saveBytes: session.serializeSave().length,
    stateBytes: serializeGameState(state0).value.length,
  };
  console.log('facts', facts);

  let controller;
  await op('ui: create controller (+ first snapshot)', () => {
    controller = createUiController({ engine, session, scenario, bindings, skipDumpOnlySteps: true });
    controller.subscribe(() => {});
  });

  // Isolated micro-benchmarks on the opening state (no instrumentation overhead attributed to operations).
  const actor = bindings[0].playerId;
  const micro = {
    'rules.queryTraceCoverage(any unit)': bench(() => ruleEngine.queryTraceCoverage(state0, actor, null)),
    'rules.querySupplySources': bench(() => ruleEngine.querySupplySources(state0, actor)),
    'rules.getActionFamilies': bench(() => ruleEngine.getActionFamilies(state0, actor)),
    'rules.projectForViewer': bench(() => ruleEngine.projectForViewer(state0, actor)),
    'hashGameState': await benchAsync(() => hashGameState(state0)),
    'serializeGameState': bench(() => serializeGameState(state0)),
    'session.serializeSave (start)': bench(() => session.serializeSave()),
  };
  const firstOwn = state0.pieceState.pieces.find((p) => p.ownerId === actor && p.location.kind === 'ON_MAP');
  if (firstOwn) micro['rules.queryTraceCoverage(one unit)'] = bench(() => ruleEngine.queryTraceCoverage(state0, actor, firstOwn.id));
  for (const [name, value] of Object.entries(micro)) console.log(`micro ${name}: median ${value.median.toFixed(1)} ms`);

  const traceOn = process.env.PERF_TRACE !== '0';
  if (traceOn) await op('ui: toggle Trace Supply on', () => controller.toggleTraceCoverage());
  else console.log('Trace Supply overlay left off (PERF_TRACE=0)');

  const phaseOf = (snap) => { const s = snap.view.projection?.sequence; return s ? `T${s.gameTurn} ${s.playerTurnIndex} ${s.phase}/${s.segment} ${s.actingPlayerId}` : 'locked'; };
  const sampledPhases = new Set();
  const moveBudget = Number(process.env.PERF_MOVES ?? 0);
  const triedMovers = new Map();
  const movedIds = new Set();
  let stuck = 0;
  let lastRevision = -1;
  for (let step = 0; step < 600; step += 1) {
    const snap = controller.getSnapshot();
    const sequence = snap.view.projection?.sequence;
    if (sequence && sequence.gameTurn >= 2) { console.log('reached Game Turn 2 at step', step); break; }
    if (session.getRevision() === lastRevision && !snap.view.privacyLocked && !snap.handoff) stuck += 1; else stuck = 0;
    lastRevision = session.getRevision();
    if (stuck > 5 + moveBudget * 3) { console.log('stuck at', phaseOf(snap), snap.notice); break; }
    const phase = phaseOf(snap);
    if (snap.view.privacyLocked) { await op(`handoff: complete (${phase})`, () => controller.completeHandoff()); continue; }
    if (snap.handoff) { await op(`handoff: begin (${phase})`, () => controller.beginHandoff()); continue; }
    // Once per phase: select an on-map unit with the Trace overlay on (its own trace reach is computed).
    if (!sampledPhases.has(phase) && snap.view.projection) {
      sampledPhases.add(phase);
      const unit = snap.view.projection.stacks.flatMap(({ pieces }) => pieces)
        .find((piece) => piece.ownerId === snap.view.playerId && piece.location.kind === 'ON_MAP' && piece.role !== 'RESOURCE');
      if (unit) {
        await op(`select on-map unit, trace ${traceOn ? 'on' : 'off'} (${phase})`, () => controller.selectPiece(unit.id));
        await op(`deselect (${phase})`, () => controller.clearSelection());
      }
    }
    if (snap.decision) {
      const choice = snap.decision.options[0];
      await op(`decision ${snap.decision.kind} (${phase})`, () => controller.respondToDecision(choice.id));
      continue;
    }
    if (snap.arrivals.length > 0) {
      const arrival = snap.arrivals[0];
      await op(`reinforcement: select arrival (${phase})`, () => controller.selectPiece(arrival.pieceId));
      const hexId = controller.getSnapshot().placementHexes[0];
      await op(`reinforcement: place (${phase})`, () => controller.clickHex(hexId));
      continue;
    }
    // PERF_MOVES=N: in each Movement Phase move up to N units (select, preview the farthest reachable Hex, confirm),
    // as a player would, so the Undo stack fills and per-action costs that grow with it show up.
    const sequenceNow = snap.view.projection?.sequence;
    if (moveBudget > 0 && sequenceNow?.phase === 'MOVEMENT' && sequenceNow.segment === 'MOVEMENT') {
      const tried = triedMovers.get(phase) ?? new Set();
      triedMovers.set(phase, tried);
      const mover = tried.size < moveBudget * 3 && snap.view.projection.stacks.flatMap(({ pieces }) => pieces)
        .find((piece) => piece.ownerId === snap.view.playerId && piece.location.kind === 'ON_MAP' && !tried.has(piece.id));
      if (mover && [...tried].filter((id) => movedIds.has(id)).length < moveBudget) {
        tried.add(mover.id);
        await op(`move: select unit (${phase})`, () => controller.selectPiece(mover.id));
        const range = [...controller.getSnapshot().moveRange.entries()].sort((a, b) => b[1].costTicks - a[1].costTicks);
        if (range.length > 0) {
          const [destination] = range[0];
          await op(`move: preview (${phase})`, () => controller.clickHex(destination));
          const before = session.getRevision();
          await op(`move: confirm (${phase})`, () => controller.clickHex(destination));
          if (session.getRevision() !== before) movedIds.add(mover.id);
        }
        controller.clearSelection();
        continue;
      }
    }
    if (!snap.endStep.enabled) { console.log('end step blocked at', phase, snap.endStep.blockers); break; }
    await op(`end step (${phase})`, () => controller.endStep());
  }

  // Aggregate operations by kind (phase-independent), and keep the raw list.
  const kindOf = (name) => name.replace(/ \(.*\)$/u, '');
  const byKind = new Map();
  for (const entry of operations) {
    const kind = kindOf(entry.name);
    const agg = byKind.get(kind) ?? { kind, count: 0, ms: 0, max: 0, calls: {} };
    agg.count += 1; agg.ms += entry.ms; agg.max = Math.max(agg.max, entry.ms);
    for (const [call, value] of Object.entries(entry.calls)) {
      const c = agg.calls[call] ??= { count: 0, ms: 0, max: 0 };
      c.count += value.count; c.ms += value.ms; c.max = Math.max(c.max, value.max);
    }
    byKind.set(kind, agg);
  }
  console.log(`\n${label}: operations by kind (total ms / count / avg / max)`);
  for (const agg of [...byKind.values()].sort((a, b) => b.ms - a.ms)) {
    console.log(`${agg.kind.padEnd(48)} ${agg.ms.toFixed(0).padStart(8)} ${String(agg.count).padStart(4)} ${(agg.ms / agg.count).toFixed(0).padStart(7)} ${agg.max.toFixed(0).padStart(7)}`);
    for (const [call, value] of Object.entries(agg.calls).sort((a, b) => b[1].ms - a[1].ms).slice(0, 8)) {
      if (value.ms < 1) continue;
      console.log(`    ${call.padEnd(52)} ${value.ms.toFixed(0).padStart(8)} ms  x${value.count}  max ${value.max.toFixed(0)}`);
    }
  }
  report.sizes.push({ size: label, facts, micro, byKind: [...byKind.values()], operations });
  await session.close?.();
}
await writeFile(`${out}/measure-scale.json`, JSON.stringify(report, null, 1));
console.log(`\nwritten ${out}/measure-scale.json`);
