import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const options = { engine: 'dist', input: 'artifacts/ai-progress-objective-goal-continuity/measurements.json',
  mechanism: 'artifacts/ai-progress-objective-mechanism/results.json',
  summary: 'artifacts/ai-progress-objective-30games/matches/summary.json',
  weights: 'artifacts/ai-progress-objective-30games/weights.json' };
for (let at = 2; at < process.argv.length; at += 2) {
  const name = process.argv[at].slice(2), value = process.argv[at + 1];
  assert.ok(['engine', 'input', 'mechanism', 'summary', 'weights', 'case', 'arm', 'out'].includes(name) && value);
  options[name] = value;
}
assert.ok(options.out && options.case && ['0', '1'].includes(options.arm));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, (_key, entry) => entry instanceof Map ? { type: 'Map', entries: [...entry] }
  : entry instanceof Set ? { type: 'Set', values: [...entry] } : entry);
const m = await import(pathToFileURL(resolve(options.engine, 'index.js')).href);
const input = JSON.parse(readFileSync(options.input)), row = input.rows.find(row => row.firstMatch === Number(options.case));
assert.ok(row);
const armIndex = Number(options.arm), arm = row.arms[armIndex], goal = arm.nextGoal;
assert.equal(goal.status, 'OBSERVED');
const sourceBytes = readFileSync(arm.path), save = JSON.parse(sourceBytes);
assert.equal(sha(sourceBytes), arm.saveSha256);
const traceBytes = readFileSync(arm.tracePath), traces = traceBytes.toString().trim().split('\n').map(JSON.parse);
assert.equal(sha(traceBytes), arm.traceSha256);
const fork = JSON.parse(readFileSync(options.mechanism)).pairs.find(pair => pair.firstMatch === row.firstMatch);
assert.equal(fork.choices[0].target, row.originalTarget);
const record = JSON.parse(readFileSync(options.summary)).records.find(record => record.match === row.firstMatch + 1);
const parsed = m.parseGameStateJson(save.initialSnapshot); assert.ok(parsed.ok);
let state = parsed.value, accepted = 0, selected = null, selectedReport = null, plan = null;
let dispatchEvents = null;
const facts = { scenario: state.scenario, turnLimit: state.configuration.turnLimit };
const weights = JSON.parse(readFileSync(options.weights));
const policies = new Map([[15, m.createHeuristicPolicy(facts)],
  [30, m.createHeuristicPolicy(facts, { weights: m.heuristicWeights(weights.weights), label: weights.label })]]);
const session = await m.createGameplayEngine(m.createMemoryGameplayPorts()).loadSession(JSON.stringify({
  ...save, currentSnapshot: save.initialSnapshot, finalStateHash: save.initialStateHash,
  acceptedActions: [], acceptedActionMetadata: [], checkpoints: [], lifecycle: 'ACTIVE',
  activeSeatId: save.bindings.find(binding => binding.playerId === (state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId)).seatId,
}));
const dispatch = session.dispatch;
session.dispatch = async request => {
  const result = await dispatch(request);
  dispatchEvents = result.events;
  return result;
};
const inspector = new Session(); inspector.connect();
const post = (method, params = {}) => {
  let completed = false, value, error;
  inspector.post(method, params, (problem, result) => { completed = true; error = problem; value = result; });
  assert.ok(completed, `Inspector callback was asynchronous: ${method}`);
  if (error) throw error;
  return value;
};
post('Debugger.enable');
const plannerUrl = pathToFileURL(resolve(options.engine, 'ai/policies/heuristic.js')).href;
const plannerLines = readFileSync(new URL(plannerUrl), 'utf8').split('\n');
const planningLine = plannerLines.findIndex(line => line.includes('for (const { unit, entry } of pairs)'));
const assignmentLine = plannerLines.findIndex(line => line.includes('targets.set(unit.piece.id, { hexId: entry.hexId, purpose: entry.purpose })'));
assert.ok(planningLine >= 0 && assignmentLine >= 0);
const beforeId = post('Debugger.setBreakpointByUrl', { url: plannerUrl, lineNumber: planningLine }).breakpointId;
const assignmentId = post('Debugger.setBreakpointByUrl', { url: plannerUrl, lineNumber: assignmentLine }).breakpointId;
let observingPlan = false, inspectorError = null;
inspector.on('Debugger.paused', ({ params }) => {
  try {
    if (observingPlan) {
      const callFrameId = params.callFrames[0].callFrameId;
      const expression = params.hitBreakpoints.includes(beforeId)
        ? 'JSON.stringify({wanted, pairs:pairs.map(({unit,entry,score})=>({pieceId:unit.piece.id,origin:unit.hexId,movement:unit.profile?.movement,entry,score})),preassigned:[...targets],assigned:[...assigned]})'
        : 'JSON.stringify({pieceId:unit.piece.id,hexId:entry.hexId,purpose:entry.purpose,score:entry.value/(1+hexesBetween(unit.hexId,entry.hexId)/Math.max(2,unit.profile?.movement??4)),countBefore:count,limit:entry.limit})';
      const result = post('Debugger.evaluateOnCallFrame', { callFrameId, expression, returnByValue: true, silent: true });
      assert.ok(!result.exceptionDetails && typeof result.result.value === 'string', 'Planner capture evaluation failed');
      const captured = JSON.parse(result.result.value);
      if (params.hitBreakpoints.includes(beforeId)) { assert.equal(plan.greedy, null); plan.greedy = captured; }
      else { assert.ok(params.hitBreakpoints.includes(assignmentId)); plan.assignments.push(captured); }
    }
  } catch (error) { inspectorError = error; }
  finally { post('Debugger.resume'); }
});
post('Debugger.setBreakpointsActive', { active: false });
const targetStep = `${goal.sequence.gameTurn}:${goal.sequence.playerTurnIndex}:${goal.sequence.phase}:${goal.sequence.segment}`;
const seats = save.bindings.map(binding => ({ ...binding, seed: record.seeds[binding.playerId === 'player:axis' ? 'axis' : 'allied'],
  policy: { id: 'target-probe', version: 1, decide(context) {
    assert.equal(Number(context.view.stateRevision), accepted);
    const capturePlan = context.playerId === 'player:axis' && context.memory.stepKey === targetStep
      && context.view.pendingDecision === null && !context.memory.notes.get('heuristic')?.targets;
    if (capturePlan) {
      assert.equal(plan, null);
      plan = { at: accepted, stateHash: context.view.metadata.stateHash, stepKey: context.memory.stepKey,
        greedy: null, assignments: [], initialSnapshot: m.serializeGameState(state).value };
      observingPlan = true; post('Debugger.setBreakpointsActive', { active: true });
    }
    const weight = context.playerId === 'player:axis' ? (armIndex === 1 && accepted === fork.commonActions ? 15 : 30) : 15;
    const decision = policies.get(weight).decide(context);
    if (capturePlan) {
      post('Debugger.setBreakpointsActive', { active: false }); observingPlan = false;
      if (inspectorError) throw inspectorError;
      assert.ok(plan.greedy);
      plan.memory = structuredClone(context.memory);
    }
    assert.ok(decision);
    assert.deepEqual(decision.action, save.acceptedActions[accepted], `Historical action mismatch at ${accepted}`);
    assert.equal(decision.intent, traces[accepted].intent, `Historical intent mismatch at ${accepted}`);
    if (accepted === goal.at) {
      assert.equal(context.view.metadata.stateHash, goal.preStateHash);
      assert.equal(state.mapState.hexControl.find(entry => entry.hexId === row.originalTarget)?.controllerId ?? null, goal.oldTargetHolder);
      assert.equal(decision.action.kind, 'MOVE_PIECE'); assert.equal(decision.action.pieceId, row.pieceId);
      const notes = context.memory.notes.get('heuristic');
      assert.deepEqual(notes.targets.get(row.pieceId), { hexId: goal.target, purpose: goal.purpose.toUpperCase() });
      assert.ok(plan && plan.memory.stepKey === targetStep);
      const beforeMemory = structuredClone(context.memory), beforeState = m.serializeGameState(state).value;
      const beforeSessionSnapshot = session.save().currentSnapshot;
      assert.equal(beforeSessionSnapshot, beforeState, 'Session snapshot differs from independent replay');
      const candidateResult = session.getActionCandidates(context.seatId, { kind: 'MOVE_PIECE', pieceId: row.pieceId, budget: 400 });
      const range = context.actions.movementRange(row.pieceId);
      const origin = decision.action.path[0], distance = hex => m.hexDistanceBetween(hex, row.originalTarget);
      const relevant = candidateResult.actions.filter(action => action.kind === 'MOVE_PIECE'
        && (action.path.slice(1).includes(row.originalTarget) || distance(action.path.at(-1)) === 1));
      const witnesses = relevant.map(action => {
        const explanation = context.actions.explain(action).explanation;
        const supply = Object.fromEntries(['supply.relocationTraceLost', 'supply.relocationFeedLost', 'supply.relocationOtherTraceLost']
          .map(key => [key, explanation.facts.find(fact => fact.key === key)?.value ?? null]));
        return { action, entersOriginal: action.path.slice(1).includes(row.originalTarget), endsOriginal: action.path.at(-1) === row.originalTarget,
          adjacentOriginal: distance(action.path.at(-1)) === 1, allowed: explanation.allowed, supply,
          preservesFriendlySupply: explanation.allowed && Object.values(supply).every(value => value === 0) };
      });
      assert.deepEqual(context.memory, beforeMemory, 'Supplemental query changed bot memory');
      assert.equal(m.serializeGameState(state).value, beforeState, 'Supplemental query changed rules state');
      assert.equal(session.save().currentSnapshot, beforeSessionSnapshot, 'Supplemental query changed session state or RNG');
      assert.equal(session.getMetadata().stateHash, goal.preStateHash);
      const situation = m.analyze(context.view.projection, context.playerId, facts);
      const effortRows = [notes.effort, ...(notes.secondary ?? [])].filter(Boolean);
      selected = { firstMatch: row.firstMatch, armIndex, sourcePath: arm.path, sourceSha256: arm.saveSha256,
        tracePath: arm.tracePath, traceSha256: arm.traceSha256, pieceId: row.pieceId, originalTarget: row.originalTarget,
        originalPurpose: row.originalPurpose, nextGoal: goal, actualAction: decision.action, actualIntent: decision.intent,
        preStateHash: goal.preStateHash, sequence: state.sequence, origin, oldDistanceBefore: distance(origin),
        oldDistanceAfter: distance(decision.action.path.at(-1)), oldProgress: distance(origin) - distance(decision.action.path.at(-1)),
        planAt: plan.at, planStateHash: plan.stateHash, planStepKey: plan.stepKey,
        unitPlanTarget: notes.targets.get(row.pieceId), unitInEffort: effortRows.some(effort => effort.unitIds.has(row.pieceId)),
        originalTargetAssignees: [...plan.memory.notes.get('heuristic').targets].filter(([, target]) => target.hexId === row.originalTarget),
        selectedGreedyAssignment: plan.assignments.find(entry => entry.pieceId === row.pieceId) ?? null,
        originalTargetVisibleEnemy: situation.enemy.get(row.originalTarget) ?? null,
        query: { budget: 400, truncated: candidateResult.truncated, offered: candidateResult.actions.length,
          offeredApproach: candidateResult.actions.filter(action => distance(action.path.at(-1)) < distance(origin)).length,
          rangeDestinations: range.length, rangeOriginal: range.find(entry => entry.hexId === row.originalTarget) ?? null,
          rangeAdjacent: range.filter(entry => distance(entry.hexId) === 1).length }, witnesses,
        supplementalQueriesPreserveStateRngMemory: true, snapshot: beforeState, memory: beforeMemory };
    }
    return decision;
  } },
}));
const runner = m.createBotSeatRunner({ session, seats, nonce: `target-probe-${row.firstMatch}-${armIndex}`,
  observation: { runId: `target-probe:${row.firstMatch}:${armIndex}`, onDecision(report) {
    if (report.revision === goal.at) selectedReport = report;
  } } });
for (; accepted <= goal.at; accepted++) {
  const pre = state, step = await runner.step();
  assert.equal(step.kind, 'ACTED'); assert.equal(step.trace.status, 'ACCEPTED');
  assert.equal(step.trace.attempts, 1); assert.deepEqual(step.trace.rejections, []);
  const replay = m.ruleEngine.applyAction(pre, step.trace.action); assert.ok(replay.ok);
  assert.deepEqual(replay.events, dispatchEvents, `Independent dispatch events mismatch at ${accepted}`);
  state = replay.state;
  assert.equal((await m.hashGameState(state)).value, session.getMetadata().stateHash);
}
inspector.disconnect();
assert.ok(selected && selectedReport && plan);
const group = selectedReport.movementGroups.find(group => group.pieceId === row.pieceId); assert.ok(group);
assert.deepEqual(group.assignedTarget, selected.unitPlanTarget);
const totals = runner.totals(); assert.equal(totals.rejected, 0); assert.deepEqual(totals.errors, []);
mkdirSync(dirname(options.out), { recursive: true });
const rawPath = `${options.out}.raw.json.gz`;
writeFileSync(rawPath, gzipSync(json({ plan, selected, report: selectedReport })));
const { snapshot, memory, ...compact } = selected;
const originalPairs = plan.greedy.pairs.filter(entry => entry.pieceId === row.pieceId);
const output = { ...compact, planner: { wanted: plan.greedy.wanted, originalUnitPairs: originalPairs,
  preassigned: plan.greedy.preassigned, initialAssignedCounts: plan.greedy.assigned, executedGreedyAssignments: plan.assignments },
  actualMovementGroup: { pieceId: group.pieceId, assignedTarget: group.assignedTarget, stay: group.stay,
    candidateCount: group.candidates.length, improvingCount: group.candidates.filter(candidate => candidate.retainedScore > group.stay.score).length },
  verification: { regeneratedAcceptedActions: accepted, errors: totals.errors, rejected: totals.rejected,
    allHistoricalActionsAndIntentsMatch: true, allPostActionHashesAndEventsMatch: true, originalMovePostHash: (await m.hashGameState(state)).value },
  provenance: { scriptSha256: sha(readFileSync(import.meta.filename)), inputSha256: sha(readFileSync(options.input)),
    plannerSha256: sha(readFileSync(new URL(plannerUrl))), rawPath, rawSha256: sha(readFileSync(rawPath)) } };
writeFileSync(options.out, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ firstMatch: row.firstMatch, armIndex, accepted, planAt: plan.at, selectedAt: goal.at,
  oldTarget: row.originalTarget, nextTarget: goal.target, unitInEffort: selected.unitInEffort,
  directSafeWitnesses: selected.witnesses.filter(w => w.endsOriginal && w.preservesFriendlySupply).length,
  adjacentSafeWitnesses: selected.witnesses.filter(w => w.adjacentOriginal && w.preservesFriendlySupply).length,
  oldProgress: selected.oldProgress, errors: totals.errors.length, rejected: totals.rejected }));
