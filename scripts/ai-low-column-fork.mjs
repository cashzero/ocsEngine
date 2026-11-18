import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const names = ['save', 'at', 'engine', 'candidate', 'old-axis', 'old-allied', 'out', 'seed', 'weights'];
const { values: options } = parseArgs({ options: Object.fromEntries(names.map(key => [key, { type: 'string' }])) });
for (const key of names.slice(0, 7)) assert.ok(options[key], 'missing --' + key);
const bundle = (directory, file = 'index.js') => import(pathToFileURL(resolve(directory, file)).href);
const read = path => JSON.parse(readFileSync(path));
const [m, ex, oldAxis, oldAllied, { availableRationTokens }, { reTicksOf }] = await Promise.all([
  ...['engine', 'candidate', 'old-axis', 'old-allied'].map(name => bundle(options[name])),
  bundle(options.engine, 'rules/supply/relocation-impact.js'), bundle(options.engine, 'rules/pieces.js'),
]);
const seed = options.seed === undefined ? null : Number(options.seed);
assert.ok(seed === null || Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
const save = read(options.save);
const at = Number(options.at);
const match = Number(/^match-(\d+)\.save\.json$/.exec(basename(options.save))[1]);
const record = read(join(dirname(options.save), 'summary.json')).records.find(r => r.match === match);
const trace = readFileSync(options.save.replace(/\.save\.json$/, '.trace.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(trace.length, save.acceptedActions.length);
assert.equal(record.summary.mapStyle, 'WESTERN_EUROPE');
const key = trace[at].stepKey;
assert.ok(key.endsWith(':COMBAT:COMBAT'));
assert.equal(trace[at].policy, 'heuristic@88');
const axis = 'player:axis', allied = 'player:allied', recorded = save.acceptedActions[at];
assert.equal(recorded.kind, 'DECLARE_COMBAT');
assert.equal(recorded.actorId, axis);
assert.equal(recorded.combatKind, 'REGULAR');
const hexId = recorded.targetHexId;
let start = at;
while (start > 0 && trace[start - 1].stepKey === key) start--;
const digest = object => createHash('sha256').update(JSON.stringify(object, (k, v) =>
  v instanceof Map ? { map: [...v] } : v instanceof Set ? { set: [...v] } : v)).digest('hex');
const parse = snapshot => { const result = m.parseGameStateJson(snapshot); assert.ok(result.ok); return result.value; };
let segment = parse(save.initialSnapshot);
const apply = (state, action) => { const applied = m.ruleEngine.applyAction(state, action); assert.ok(applied.ok, JSON.stringify(applied.violations)); return applied; };
for (let i = 0; i < start; i++) segment = apply(segment, save.acceptedActions[i]).state;
assert.equal(segment.revision, start);
const facts = { scenario: segment.scenario, turnLimit: segment.configuration.turnLimit };
const engine = m.createGameplayEngine(m.createMemoryGameplayPorts());
const load = async state => {
  const snapshot = m.serializeGameState(state).value, hash = (await m.hashGameState(state)).value;
  const actor = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  const session = await engine.loadSession(JSON.stringify({ ...save, initialSnapshot: snapshot, currentSnapshot: snapshot,
    initialStateHash: hash, finalStateHash: hash, acceptedActions: [], acceptedActionMetadata: [], checkpoints: [],
    lifecycle: 'ACTIVE', activeSeatId: save.bindings.find(b => b.playerId === actor).seatId }));
  assert.equal(session.getMetadata().stateHash, hash);
  return session;
};
const historical = { [axis]: oldAxis.createHeuristicPolicy(facts), [allied]: oldAllied.createHeuristicPolicy(facts) };
const base = m.createHeuristicPolicy(facts);
const weights = options.weights && read(options.weights);
const candidate = ex.createHeuristicPolicy(facts, weights ? { weights: ex.heuristicWeights(weights.weights ?? weights) } : {});
const checkChoice = (choice, i) => {
  assert.deepEqual(choice.action, save.acceptedActions[i], 'historical action ' + i);
  for (const k of ['score', 'breakdown', 'intent']) assert.equal(JSON.stringify(choice[k]), JSON.stringify(trace[i][k]), 'historical ' + k + ' ' + i);
};
const side = id => id === axis ? 'axis' : 'allied';
const pieceOf = (state, id) => state.pieceState.pieces.find(piece => piece.id === id);
const targetHeld = state => state.mapState.hexControl.some(e => e.hexId === hexId && e.controllerId === axis);
function supply(state) {
  const result = { targetHeld: targetHeld(state), axisOutOfTrace: 0, alliedOutOfTrace: 0, axisUnfed: 0, alliedUnfed: 0 };
  for (const piece of state.pieceState.pieces) {
    if (piece.location.kind !== 'ON_MAP' || !m.isOnMapCombatUnit(state, piece) || m.pieceHasTrace(state, piece)) continue;
    result[side(piece.ownerId) + 'OutOfTrace']++;
    if (availableRationTokens(state, piece) < m.eatOffMapCost(reTicksOf(state, piece))) result[side(piece.ownerId) + 'Unfed']++;
  }
  return result;
}
function traceLossWitness(states, actions, id) {
  for (let n = states.length - 2; n >= 0; n--) {
    const piece = pieceOf(states[n], id);
    if (piece?.location.kind !== 'ON_MAP') break;
    if (!m.pieceHasTrace(states[n], piece)) continue;
    const next = pieceOf(states[n + 1], id), action = actions[n];
    const continuous = next?.location.kind === 'ON_MAP' && !m.pieceHasTrace(states[n + 1], next);
    let cause = 'unknown';
    if (continuous && action.kind === 'MOVE_PIECE') cause = action.actorId === piece.ownerId ? 'friendlyMove' : 'enemyMove';
    return { cause, revision: states[n].revision, action: action.kind, actor: action.actorId };
  }
  return { cause: 'unknown' };
}
function summarize(initial, actions, finalHash) {
  let state = initial, cleanups = 0, nextFriendlyTurn = null, dueAttrition = 0;
  const loss = { axis: 0, allied: 0 }, attrition = { axis: 0, allied: 0 }, shortages = [];
  const states = [state], recent = [];
  for (const action of actions) {
    const next = apply(state, action);
    if (!nextFriendlyTurn) { states.push(next.state); recent.push(action); }
    for (const event of next.events) {
      if (event.kind === 'ATTRITION_ROLLED') dueAttrition += event.steps;
      if (event.kind === 'STEP_LOST') {
        const owner = (pieceOf(state, event.pieceId) ?? pieceOf(next.state, event.pieceId)).ownerId;
        loss[side(owner)]++;
        if (dueAttrition > 0) { attrition[side(owner)]++; dueAttrition--; }
      }
      if (!nextFriendlyTurn && event.kind === 'SUPPLY_STATUS_CHANGED' && !event.inSupply) {
        shortages.push({ piece: event.pieceId, owner: (pieceOf(state, event.pieceId) ?? pieceOf(next.state, event.pieceId)).ownerId,
          markedAt: state.revision, ...traceLossWitness(states, recent, event.pieceId) });
      }
      if (event.kind === 'CLEANUP_COMPLETED' && event.playerId === axis && ++cleanups === 2) {
        nextFriendlyTurn = supply(next.state); states.length = 0; recent.length = 0;
      }
    }
    state = next.state;
  }
  assert.equal(dueAttrition, 0);
  const vp = Object.fromEntries(m.calculateVictory(state).scores.map(s => [s.playerId, s.points]));
  return m.hashGameState(state).then(hash => {
    assert.equal(hash.value, finalHash, 'independent final replay hash');
    return { nextFriendlyTurn, shortages, terminal: { ...supply(state), axisVp: vp[axis], alliedVp: vp[allied],
      vpMargin: vp[axis] - vp[allied], kill: loss.allied, loss: loss.axis, axisAttritionLoss: attrition.axis,
      alliedAttritionLoss: attrition.allied, actions: actions.length, hash: finalHash } };
  });
}
async function run(first) {
  let session = await load(segment), fork, choice, memoryHash, forkHash, seededHash;
  const proxy = new Proxy({}, { get(_, method) { return session[method].bind(session); } });
  const seats = save.bindings.map(binding => ({ ...binding, seed: record.seeds[side(binding.playerId)], policy: {
    id: 'low-column', version: '1', decide(ctx) {
      const i = Number(ctx.view.stateRevision);
      if (i < at) {
        const expected = historical[ctx.playerId].decide(ctx);
        checkChoice(expected, i); return expected;
      }
      if (i > at) return base.decide(ctx);
      assert.equal(ctx.playerId, axis);
      memoryHash = digest(ctx.memory);
      checkChoice(historical[axis].decide({ ...ctx, memory: structuredClone(ctx.memory) }), i);
      const selected = first.decide(ctx);
      assert.ok(selected);
      choice = Object.fromEntries(['action', 'intent', 'score', 'breakdown'].map(k => [k, selected[k]]));
      return selected;
    },
  } }));
  const runner = m.createBotSeatRunner({ session: proxy, seats, nonce: 'low-column', retries: 0 });
  for (let i = start; i < at; i++) {
    const result = await runner.step(); assert.equal(result.kind, 'ACTED');
    assert.equal(result.trace.revision, i); assert.equal(result.trace.stepKey, key); checkChoice(result.trace, i);
  }
  fork = parse(session.save().currentSnapshot);
  assert.equal(fork.revision, at); assert.equal(fork.sequence.phasingPlayerId, axis); assert.ok(!fork.pendingDecision);
  forkHash = (await m.hashGameState(fork)).value;
  const physical = seed === null ? fork : { ...fork, rng: { ...fork.rng, state: m.createRulesRng(seed).state } };
  session = await load(physical); seededHash = session.getMetadata().stateHash;
  const step = await runner.step(); assert.equal(step.kind, 'ACTED');
  const common = { choice, memoryHash, forkHash, seededHash };
  if (seed === null) return common;
  for (let i = 0; i < 20000; i++) {
    const result = await runner.step();
    if (result.kind === 'FINISHED') break;
    assert.equal(result.kind, 'ACTED', JSON.stringify(result.error ?? result.reason));
  }
  assert.equal(session.getMetadata().lifecycle, 'FINISHED');
  assert.equal(runner.totals().rejected, 0); assert.deepEqual(runner.totals().errors, []);
  const final = session.save();
  return { ...common, ...await summarize(physical, final.acceptedActions, final.finalStateHash) };
}
const baseline = await run(base), alternative = await run(candidate);
for (const k of ['forkHash', 'seededHash', 'memoryHash']) assert.equal(baseline[k], alternative[k]);
const old = baseline.choice.action, next = alternative.choice.action;
const changed = !isDeepStrictEqual(old, next);
const classification = !changed ? 'unchanged' : next.kind === 'ADVANCE_SEQUENCE' ? 'endSegment'
  : next.kind === 'DECLARE_COMBAT' && old.kind === 'DECLARE_COMBAT' ? next.targetHexId === old.targetHexId ? 'changeGroup' : 'changeTarget' : 'other';
const output = { match, at, turn: Number(key.split(':')[0]), hexId, seed, start, changed, classification, baseline, candidate: alternative };
mkdirSync(dirname(resolve(options.out)), { recursive: true });
const tmp = options.out + '.' + process.pid + '.tmp';
writeFileSync(tmp, JSON.stringify(output) + '\n'); renameSync(tmp, options.out);
