#!/usr/bin/env node
// Paired headless sensitivity study, not a product reinforcement policy. Build first.
// node scripts/sea-landing-balance.mjs --out artifacts/sea-balance --seeds 4 --parallel 4
// --cases base,d50-t4 --seeds 1 is a pilot. --sides allied,axis tests both attack directions.
// Freeze map, control, objectives, supply, HQs and independent support, moving only whole divisions to the Box.
// This isolates force timing; it does not validate a future deployment algorithm or UI.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as m from '../dist/index.js';

const cases = [
  { id: 'base', defender: 0, attacker: 0, first: 4 },
  ...[25, 50, 75].flatMap(defender => [3, 4, 5].map(first => ({ id: `d${defender}-t${first}`, defender, attacker: 0, first }))),
  { id: 'a25-d25-t4', defender: 25, attacker: 25, first: 4 },
  { id: 'a25-d50-t4', defender: 50, attacker: 25, first: 4 },
  { id: 'a50-d50-t4', defender: 50, attacker: 50, first: 4 },
  { id: 'cap1-base', defender: 0, attacker: 0, first: 4, port: 4 },
  { id: 'cap4-base', defender: 0, attacker: 0, first: 4, port: 16 },
  { id: 'cap4-d50-t4', defender: 50, attacker: 0, first: 4, port: 16 },
  { id: 'sea1-d50-t4', defender: 50, attacker: 0, first: 4, seaCap: 1 },
];
const sideOf = id => String(id).endsWith('axis') ? 'axis' : 'allied';
const opposite = side => side === 'axis' ? 'allied' : 'axis';
const pieceTokens = p => p.resourceQuantity ?? 0;
const totals = () => ({ arrivedT: 0, landedT: 0, landedUnits: 0, spentT: 0, stepsLost: 0, attritionSteps: 0, attacks: 0, barrages: 0, moves: 0, enteredDivisionUnits: 0 });

async function run(job, options) {
  const began = performance.now();
  const base = options.start + job.seed * 97;
  const seeds = { map: base + 1, oob: base + 2, deployment: base + 3, rules: base + 4 };
  const attacker = job.side;
  const defender = opposite(attacker);
  const variant = cases.find(c => c.id === job.variant);
  const request = { ...m.DEFAULT_NEW_GAME_REQUEST, seeds, turnLimit: options.turns,
    engagement: attacker === 'allied' ? 'ALLIED_ATTACKS' : 'AXIS_ATTACKS',
    map: { ...m.DEFAULT_NEW_GAME_REQUEST.map, sea: 'FLANK' },
    inlandEntry: { [attacker]: false, [defender]: true }, seaCap: { [attacker]: variant.seaCap ?? 5, [defender]: 0 } };
  const prepared = m.prepareNewGame(request);
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
  const p = prepared.value;
  const scenario = structuredClone(p.scenario);
  const scheduled = [];
  for (const [side, percent] of [[attacker, variant.attacker], [defender, variant.defender]]) {
    const divisions = p.generatedOob.sides.find(s => s.side.toLowerCase() === side).formations;
    const count = Math.round(divisions.length * percent / 100);
    let ordinal = 0;
    for (const [index, division] of divisions.entries()) {
      if (Math.floor((index + 1) * count / divisions.length) === Math.floor(index * count / divisions.length)) continue;
      const turn = variant.first + ordinal++;
      scheduled.push({ side, name: division.name, archetype: division.archetype, turn, ids: division.units.map(u => u.id) });
      for (const unit of division.units) {
        const piece = scenario.initialPieceState.pieces.find(p => p.id === unit.id);
        if (!piece || piece.location.kind !== 'ON_MAP') throw new Error(`Division member not initially deployed: ${unit.id}`);
        piece.location = { kind: 'OFF_MAP_BOX', boxId: m.GENERATED_REINFORCEMENT_BOXES[side.toUpperCase()] };
        piece.statuses = [{ statusDefinitionId: 'status:return-turn', value: { kind: 'INTEGER', value: turn } }];
        piece.mode = 'MOVE'; piece.currentFaceId = 'move'; piece.stackOrder = 1000 + scheduled.length * 100 + division.units.indexOf(unit);
      }
    }
  }
  const owner = side => m.GENERATED_PLAYERS[side.toUpperCase()];
  if (variant.port) for (const feature of scenario.initialMapState.features) {
    if (feature.definitionId === 'facility:port' && feature.controllerId === owner(attacker)) feature.level = variant.port;
  }
  const issues = m.validateScenarioDefinition(scenario);
  if (issues.length) throw new Error(JSON.stringify(issues));
  const engine = m.createGameplayEngine(m.createMemoryGameplayPorts());
  const session = await engine.createSession({ scenario, configuration: p.configuration, rulesSeed: seeds.rules,
    bindings: p.bindings, persistence: 'MANUAL', label: `${job.side}/${job.seed}/${variant.id}` });
  const started = session.start();
  if (!started.ok) throw new Error(JSON.stringify(started));
  const startView = session.getView(p.bindings[0].seatId).projection;
  const startObjectives = startView.objectives;
  const seats = p.bindings.map(binding => ({ ...binding,
    policy: m.createHeuristicPolicy({ scenario, turnLimit: options.turns }), seed: seeds.rules + (sideOf(binding.playerId) === 'allied' ? 1 : 2) }));
  const trace = [];
  const result = await m.runBotMatch({ session, seats, maxActions: 60000, onDecision: t => trace.push(t) });
  const playMs = Math.round(performance.now() - began);
  const save = session.save();
  const parsed = m.parseGameStateJson(save.initialSnapshot);
  if (!parsed.ok) throw new Error('Initial snapshot invalid');
  let state = parsed.value;
  const definition = new Map(scenario.pieceCatalog.definitions.map(d => [d.id, d]));
  const isSupply = piece => definition.get(piece.definitionId)?.resource?.resourceDefinitionId === 'resource:supply';
  const opening = Object.fromEntries(p.generatedOob.sides.map(side => {
    const units = [...side.formations.flatMap(f => f.units), ...side.independentUnits];
    const onMap = new Set(scenario.initialPieceState.pieces.filter(p => p.location.kind === 'ON_MAP').map(p => p.id));
    const deployed = { ...side, formations: side.formations.map(f => ({ ...f, units: f.units.filter(u => onMap.has(u.id)) })), independentUnits: side.independentUnits.filter(u => onMap.has(u.id)) };
    const ground = state.pieceState.pieces.filter(p => p.ownerId === owner(side.side.toLowerCase()) && p.location.kind === 'ON_MAP' && definition.get(p.definitionId)?.family === 'GROUND');
    return [side.side.toLowerCase(), { divisions: side.formations.length,
      delayedDivisions: scheduled.filter(s => s.side === side.side.toLowerCase()).length,
      combatValue: m.combatValueOf(deployed, scenario.pieceCatalog.definitions),
      fullCombatValue: m.combatValueOf(side, scenario.pieceCatalog.definitions),
      ground: ground.length, trace: ground.filter(p => m.pieceHasTrace(state, p)).length,
      initialSteps: ground.reduce((n, p) => n + (p.remainingSteps ?? 0), 0) }];
  }));
  const counters = { allied: totals(), axis: totals() };
  const timeline = [];
  let firstAttack = null, firstCapture = null;
  const delayed = new Set(scheduled.flatMap(s => s.ids));
  const entered = new Set();
  const snapshot = () => {
    const view = m.ruleEngine.projectForViewer(state, owner(attacker));
    return { turn: state.sequence.gameTurn, phase: state.sequence.phase,
      sides: Object.fromEntries(['allied', 'axis'].map(side => {
        const pieces = state.pieceState.pieces.filter(p => p.ownerId === owner(side));
        const onMap = pieces.filter(p => p.location.kind === 'ON_MAP');
        return [side, { ...counters[side],
          vp: view.victory.scores.find(s => s.playerId === owner(side))?.points ?? 0,
          mapSupplyT: onMap.filter(isSupply).reduce((n, p) => n + pieceTokens(p), 0),
          boxSupplyT: pieces.filter(p => p.location.kind === 'OFF_MAP_BOX' && isSupply(p)).reduce((n, p) => n + pieceTokens(p), 0),
          waitingDivisionUnits: pieces.filter(p => delayed.has(p.id) && p.location.kind === 'OFF_MAP_BOX').length,
          ports: state.mapState.features.filter(f => f.definitionId === 'facility:port' && f.controllerId === owner(side)).map(f => ({ hexId: f.location.hexId, level: f.level, damage: f.damage })),
        }];
      })) };
  };
  timeline.push(snapshot());
  for (const action of save.acceptedActions) {
    const next = m.ruleEngine.applyAction(state, action);
    if (!next.ok) throw new Error(`Replay rejected ${action.kind}`);
    const side = sideOf(action.actorId);
    if (action.kind === 'DECLARE_COMBAT') { counters[side].attacks++; if (side === attacker) firstAttack ??= state.sequence.gameTurn; }
    if (action.kind === 'DECLARE_BARRAGE') counters[side].barrages++;
    if (action.kind === 'MOVE_PIECE') counters[side].moves++;
    for (const event of next.events) {
      if (event.kind === 'SUPPLY_ARRIVED') counters[sideOf(event.playerId)].arrivedT += event.tokens;
      if (event.kind === 'SEA_MOVED' && event.fromHexId === null) {
        counters[sideOf(event.playerId)].landedT += event.tokens;
        counters[sideOf(event.playerId)].landedUnits += event.unitIds.length;
      }
      if (event.kind === 'SUPPLY_SPENT') {
        const p = state.pieceState.pieces.find(p => p.id === event.resourcePieceId);
        if (p) counters[sideOf(p.ownerId)].spentT += event.quantity;
      }
      if (event.kind === 'STEP_LOST') {
        const p = state.pieceState.pieces.find(p => p.id === event.pieceId);
        if (!p) throw new Error('Missing lost piece');
        const before = p.remainingSteps ?? 1;
        const lost = before - (event.remainingSteps ?? 0);
        counters[sideOf(p.ownerId)].stepsLost += lost;
        if (state.pendingDecision?.kind === 'ATTRITION_LOSS' || next.events.some(e => e.kind === 'ATTRITION_ROLLED')) counters[sideOf(p.ownerId)].attritionSteps += lost;
      }
    }
    for (const p of next.state.pieceState.pieces) if (delayed.has(p.id) && p.location.kind === 'ON_MAP' && !entered.has(p.id)) {
      entered.add(p.id); counters[sideOf(p.ownerId)].enteredDivisionUnits++;
    }
    if (firstCapture === null && next.state.mapState.hexControl.some(c => c.controllerId === owner(attacker)
      && startObjectives.some(o => o.hexId === c.hexId && o.controllerId !== owner(attacker)))) firstCapture = state.sequence.gameTurn;
    const changedTurn = next.state.sequence.gameTurn !== state.sequence.gameTurn;
    if (changedTurn) timeline.push(snapshot());
    state = next.state;
  }
  timeline.push(snapshot());
  const hash = await m.hashGameState(state);
  const replay = hash.ok && hash.value === session.getMetadata().stateHash;
  const final = session.getView(p.bindings[0].seatId).projection;
  const prefix = `${job.side}-${job.seed}-${variant.id}`;
  writeFileSync(join(options.out, `${prefix}.save.json.gz`), gzipSync(session.serializeSave()));
  writeFileSync(join(options.out, `${prefix}.trace.json.gz`), gzipSync(JSON.stringify(trace)));
  const record = { ...job, seeds, variant, request, scheduled, stop: result.stopReason, rejected: result.rejected, errors: result.errors,
    replay, playMs, elapsedMs: Math.round(performance.now() - began), accepted: result.accepted,
    policy: trace[0]?.policy, firstAttack, firstCapture, opening,
    winner: final.victory.winnerId ? sideOf(final.victory.winnerId) : 'draw', victory: final.victory,
    threshold: p.configuration.attackVictory?.attackerPoints,
    start: timeline[0], final: timeline.at(-1), timeline };
  writeFileSync(join(options.out, `${prefix}.json`), JSON.stringify(record, null, 2));
  return record;
}

if (isMainThread) {
  const options = { out: 'artifacts/sea-landing-balance', seeds: 4, start: 206569472, parallel: 4, turns: 8, sides: ['allied'], cases: cases.map(c => c.id) };
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i].slice(2), value = process.argv[++i];
    if (['seeds', 'start', 'parallel', 'turns'].includes(key)) options[key] = Number(value);
    else if (key === 'cases' || key === 'sides') options[key] = value.split(',');
    else if (key === 'out') options.out = value;
    else throw new Error(`Unknown option ${key}`);
  }
  options.out = resolve(options.out); mkdirSync(options.out, { recursive: true });
  if (options.cases.some(id => !cases.some(c => c.id === id))) throw new Error('Unknown case');
  const jobs = options.sides.flatMap(side => Array.from({ length: options.seeds }, (_, seed) => options.cases.map(variant => ({ side, seed, variant })))).flat();
  const registration = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    scriptSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    options, cases: cases.filter(c => options.cases.includes(c.id)), jobs };
  const registrationPath = join(options.out, 'registration.json');
  if (existsSync(registrationPath) && JSON.stringify(JSON.parse(readFileSync(registrationPath, 'utf8'))) !== JSON.stringify(registration)) throw new Error('Use a new output folder for a different registration');
  writeFileSync(registrationPath, JSON.stringify(registration, null, 2));
  let cursor = 0;
  const records = [];
  await Promise.all(Array.from({ length: Math.min(options.parallel, jobs.length) }, () => new Promise((resolveWorker, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: options });
    const feed = () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const path = join(options.out, `${job.side}-${job.seed}-${job.variant}.json`);
        if (existsSync(path)) { records.push(JSON.parse(readFileSync(path, 'utf8'))); continue; }
        worker.postMessage(job); return;
      }
      worker.postMessage(null);
    };
    worker.on('message', r => { records.push(r); console.log(`${r.side}/${r.seed}/${r.variant?.id ?? r.variant}: ${r.stop}, winner=${r.winner}, replay=${r.replay}, play=${r.playMs}ms`); feed(); });
    worker.on('error', reject); worker.on('exit', resolveWorker); feed();
  })));
  records.sort((a, b) => a.side.localeCompare(b.side) || a.seed - b.seed || a.variant.id.localeCompare(b.variant.id));
  writeFileSync(join(options.out, 'summary.json'), JSON.stringify({ registration, records }, null, 2));
  if (records.some(r => r.stop !== 'FINISHED' || !r.replay || r.rejected || r.errors.length)) process.exitCode = 1;
} else parentPort.on('message', async job => {
  if (!job) { parentPort.close(); return; }
  try { parentPort.postMessage(await run(job, workerData)); }
  catch (e) { parentPort.postMessage({ ...job, stop: 'CRASH', errors: [String(e.stack ?? e)] }); }
});
