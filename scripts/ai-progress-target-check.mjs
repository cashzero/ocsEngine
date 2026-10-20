import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = process.argv[2] ?? 'artifacts/ai-progress-target-opportunity';
const engine = process.argv[3] ?? 'dist';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path));
const registration = read(`${root}/registration.json`);
for (const [path, digest] of Object.entries(registration.files)) assert.equal(sha(readFileSync(path)), digest, `Registered file ${path}`);
const tree = createHash('sha256');
for (const file of readdirSync(engine, { recursive: true }).filter(file => file.endsWith('.js')).sort())
  tree.update(file).update('\0').update(sha(readFileSync(`${engine}/${file}`))).update('\0');
assert.equal(tree.digest('hex'), registration.engineTreeSha256, 'Frozen engine digest');
const m = await import(pathToFileURL(resolve(engine, 'index.js')).href);
const input = read('artifacts/ai-progress-objective-goal-continuity/measurements.json');
const revive = (_key, value) => value?.type === 'Map' ? new Map(value.entries) : value?.type === 'Set' ? new Set(value.values) : value;
const truths = [], rows = [];
let totalActions = 0, checkedWitnesses = 0;
for (const entry of registration.cases) {
  const path = `${root}/cases/${entry.firstMatch}-${entry.armIndex}.json`, data = read(path);
  const source = input.rows.find(row => row.firstMatch === entry.firstMatch), arm = source.arms[entry.armIndex];
  assert.equal(data.provenance.scriptSha256, registration.files['scripts/ai-progress-target-probe.mjs']);
  assert.equal(data.provenance.inputSha256, registration.files['artifacts/ai-progress-objective-goal-continuity/measurements.json']);
  assert.equal(data.provenance.plannerSha256, sha(readFileSync(`${engine}/ai/policies/heuristic.js`)));
  assert.equal(data.sourceSha256, arm.saveSha256); assert.equal(data.traceSha256, arm.traceSha256);
  assert.equal(data.verification.regeneratedAcceptedActions, arm.nextGoal.at + 1);
  assert.equal(data.verification.rejected, 0); assert.deepEqual(data.verification.errors, []);
  const bytes = readFileSync(data.provenance.rawPath); assert.equal(sha(bytes), data.provenance.rawSha256);
  const raw = JSON.parse(gunzipSync(bytes).toString(), revive);
  const parsed = m.parseGameStateJson(raw.selected.snapshot); assert.ok(parsed.ok);
  const state = parsed.value;
  assert.equal((await m.hashGameState(state)).value, arm.nextGoal.preStateHash);
  assert.equal((await m.hashGameState(m.parseGameStateJson(raw.plan.initialSnapshot).value)).value, data.planStateHash);
  assert.equal(state.revision, arm.nextGoal.at);
  assert.equal(raw.plan.stepKey, data.planStepKey);
  const notes = raw.plan.memory.notes.get('heuristic');
  assert.deepEqual([...notes.targets].filter(([, target]) => target.hexId === source.originalTarget), data.originalTargetAssignees);
  const targets = new Map(raw.plan.greedy.preassigned), assigned = new Map(raw.plan.greedy.assigned), executed = [];
  const oldPairDecisions = [];
  for (const pair of raw.plan.greedy.pairs) {
    let reason;
    const count = assigned.get(pair.entry.hexId) ?? 0;
    if (targets.has(pair.pieceId)) reason = 'UNIT_ALREADY_ASSIGNED';
    else if (count >= pair.entry.limit) reason = 'TARGET_SLOT_FULL';
    else {
      reason = 'ASSIGNED';
      targets.set(pair.pieceId, { hexId: pair.entry.hexId, purpose: pair.entry.purpose });
      assigned.set(pair.entry.hexId, count + 1);
      executed.push({ pieceId: pair.pieceId, hexId: pair.entry.hexId, purpose: pair.entry.purpose,
        score: pair.score, countBefore: count, limit: pair.entry.limit });
    }
    if (pair.pieceId === source.pieceId && pair.entry.hexId === source.originalTarget)
      oldPairDecisions.push({ purpose: pair.entry.purpose, reason, countBefore: count, limit: pair.entry.limit, score: pair.score,
        alreadyAssignedTo: reason === 'UNIT_ALREADY_ASSIGNED' ? targets.get(pair.pieceId) : null });
  }
  assert.deepEqual(executed, raw.plan.assignments, 'Executed planner assignments');
  assert.deepEqual(executed, data.planner.executedGreedyAssignments);
  assert.deepEqual(targets.get(source.pieceId), notes.targets.get(source.pieceId), 'Captured planner result');
  const save = read(arm.path), action = save.acceptedActions[arm.nextGoal.at];
  assert.deepEqual(raw.selected.actualAction, action);
  const session = await m.createGameplayEngine(m.createMemoryGameplayPorts()).loadSession(JSON.stringify({
    ...save, initialSnapshot: raw.selected.snapshot, currentSnapshot: raw.selected.snapshot,
    initialStateHash: arm.nextGoal.preStateHash, finalStateHash: arm.nextGoal.preStateHash,
    acceptedActions: [], acceptedActionMetadata: [], checkpoints: [], lifecycle: 'ACTIVE',
    activeSeatId: save.bindings.find(binding => binding.playerId === 'player:axis').seatId,
  }));
  const seatId = session.getBindings().find(binding => binding.playerId === 'player:axis').seatId;
  const beforeQueries = session.save().currentSnapshot;
  const access = m.createBotActionAccess(session, seatId), candidateResult = session.getActionCandidates(seatId,
    { kind: 'MOVE_PIECE', pieceId: source.pieceId, budget: 400 });
  const distance = hex => m.hexDistanceBetween(hex, source.originalTarget);
  const relevant = candidateResult.actions.filter(action => action.path.slice(1).includes(source.originalTarget) || distance(action.path.at(-1)) === 1);
  const witnesses = relevant.map(action => {
    const explanation = access.explain(action).explanation;
    const supply = Object.fromEntries(['supply.relocationTraceLost', 'supply.relocationFeedLost', 'supply.relocationOtherTraceLost']
      .map(key => [key, explanation.facts.find(fact => fact.key === key)?.value ?? null]));
    return { action, entersOriginal: action.path.slice(1).includes(source.originalTarget), endsOriginal: action.path.at(-1) === source.originalTarget,
      adjacentOriginal: distance(action.path.at(-1)) === 1, allowed: explanation.allowed, supply,
      preservesFriendlySupply: explanation.allowed && Object.values(supply).every(value => value === 0) };
  });
  assert.equal(data.query.offered, candidateResult.actions.length);
  assert.equal(data.query.truncated, candidateResult.truncated);
  const range = access.movementRange(source.pieceId);
  assert.equal(data.query.rangeDestinations, range.length);
  assert.deepEqual(data.query.rangeOriginal, range.find(route => route.hexId === source.originalTarget) ?? null);
  assert.equal(data.query.rangeAdjacent, range.filter(route => distance(route.hexId) === 1).length);
  assert.equal(session.getMetadata().stateHash, arm.nextGoal.preStateHash);
  assert.equal(session.save().currentSnapshot, beforeQueries, 'Route queries changed actual session state or RNG');
  const truth = { source, arm, action, witnesses };
  truths.push({ data, truth });
  checkedWitnesses += witnesses.length; totalActions += data.verification.regeneratedAcceptedActions;
  const effort = [notes.effort, ...(notes.secondary ?? [])].filter(Boolean).find(effort => effort.unitIds.has(source.pieceId));
  assert.equal(data.unitInEffort, Boolean(effort));
  if (effort) assert.equal(effort.hexId, data.unitPlanTarget.hexId);
  rows.push({ firstMatch: source.firstMatch, armIndex: entry.armIndex, at: arm.nextGoal.at,
    sourcePath: arm.path, originalTarget: source.originalTarget, nextTarget: arm.nextGoal.target, nextPurpose: arm.nextGoal.purpose,
    oldTargetHolder: arm.nextGoal.oldTargetHolder, changedTarget: !arm.nextGoal.sameTargetHex,
    changedWhileEnemy: !arm.nextGoal.sameTargetHex && arm.nextGoal.oldTargetHolder === 'player:allied',
    planAt: data.planAt, preStateHash: data.preStateHash, planStateHash: data.planStateHash,
    assignment: effort ? 'ASSAULT_RESERVATION' : data.selectedGreedyAssignment ? 'EXECUTED_GREEDY_ASSIGNMENT' : 'OTHER_PREASSIGNMENT',
    oldPairDecisions, selectedGreedyAssignment: data.selectedGreedyAssignment,
    originalTargetAssignees: data.originalTargetAssignees.map(([pieceId, target]) => ({ pieceId, purpose: target.purpose })),
    originalVisibleEnemy: data.originalTargetVisibleEnemy ? { hasCombatUnit: data.originalTargetVisibleEnemy.hasCombatUnit,
      strength: data.originalTargetVisibleEnemy.strength, hidden: data.originalTargetVisibleEnemy.hidden } : null,
    oldDistanceBefore: data.oldDistanceBefore, oldDistanceAfter: data.oldDistanceAfter, oldProgress: data.oldProgress,
    directSafeWitnesses: witnesses.filter(witness => witness.endsOriginal && witness.preservesFriendlySupply).length,
    adjacentSafeWitnesses: witnesses.filter(witness => witness.adjacentOriginal && witness.preservesFriendlySupply).length,
    rangeContainsOriginal: data.query.rangeOriginal !== null, rangeAdjacent: data.query.rangeAdjacent, queryTruncated: data.query.truncated,
    candidateCount: data.query.offered, witnessCount: witnesses.length, unsafeWitnessCount: witnesses.filter(witness => !witness.preservesFriendlySupply).length,
    casePath: path, caseSha256: sha(readFileSync(path)), rawPath: data.provenance.rawPath, rawSha256: data.provenance.rawSha256 });
}
const validate = (data, truth) => {
  assert.equal(data.originalTarget, truth.source.originalTarget, 'original target identity');
  assert.deepEqual(data.actualAction, truth.action, 'actual historical selected action');
  assert.equal(data.preStateHash, truth.arm.nextGoal.preStateHash, 'actual decision state');
  assert.equal(data.witnesses.length, truth.witnesses.length, 'witness set size');
  for (const [index, witness] of data.witnesses.entries()) {
    const expected = truth.witnesses[index];
    assert.deepEqual(witness.action, expected.action, 'witness route identity');
    assert.deepEqual(witness.supply, expected.supply, 'actual supply facts');
    assert.equal(witness.allowed, expected.allowed, 'actual route legality');
    assert.equal(witness.preservesFriendlySupply, expected.preservesFriendlySupply, 'actual supply-preserved witness');
    for (const key of ['entersOriginal', 'endsOriginal', 'adjacentOriginal']) assert.equal(witness[key], expected[key], key);
  }
  assert.equal(data.oldDistanceBefore, m.hexDistanceBetween(truth.action.path[0], data.originalTarget));
  assert.equal(data.oldDistanceAfter, m.hexDistanceBetween(truth.action.path.at(-1), data.originalTarget));
  assert.equal(data.oldProgress, data.oldDistanceBefore - data.oldDistanceAfter);
};
for (const { data, truth } of truths) validate(data, truth);
const controls = [];
for (const kind of ['wrongOriginalTarget', 'wrongActualAction', 'falseSafeWitness']) {
  const chosen = kind === 'falseSafeWitness' ? truths.find(({ truth }) => truth.witnesses.some(witness => !witness.preservesFriendlySupply)) : truths[0];
  assert.ok(chosen, 'A genuine unsafe witness is required for the false-positive control');
  const data = structuredClone(chosen.data); let expected;
  if (kind === 'wrongOriginalTarget') { data.originalTarget = '999,999'; expected = /original target identity/; }
  else if (kind === 'wrongActualAction') { data.actualAction.path = [...data.actualAction.path, '999,999']; expected = /actual historical selected action/; }
  else { data.witnesses.find(witness => !witness.preservesFriendlySupply).preservesFriendlySupply = true; expected = /actual supply-preserved witness/; }
  assert.throws(() => validate(data, chosen.truth), expected);
  controls.push({ kind, rejected: true, assertion: expected.source });
}
const enemySwitches = rows.filter(row => row.changedWhileEnemy);
const summarize = selected => ({ histories: selected.length,
  assaultReservations: selected.filter(row => row.assignment === 'ASSAULT_RESERVATION').length,
  greedyAssignments: selected.filter(row => row.assignment === 'EXECUTED_GREEDY_ASSIGNMENT').length,
  directSafeWitness: selected.filter(row => row.directSafeWitnesses > 0).length,
  adjacentSafeWitness: selected.filter(row => row.adjacentSafeWitnesses > 0).length,
  stillApproachingOldTarget: selected.filter(row => row.oldProgress > 0).length,
  stationaryOldDistance: selected.filter(row => row.oldProgress === 0).length,
  retreatingFromOldTarget: selected.filter(row => row.oldProgress < 0).length,
  originalTargetStillAssigned: selected.filter(row => row.originalTargetAssignees.length > 0).length,
  truncated: selected.filter(row => row.queryTruncated).length });
const summary = { observed: rows.length, censored: registration.censored, regeneratedAcceptedActions: totalActions,
  checkedWitnessRoutes: checkedWitnesses, allObserved: summarize(rows), switchedWhileEnemy: summarize(enemySwitches) };
const output = { scope: 'Descriptive next-move mechanism observations at heterogeneous times; no predictive fitting or strategic-error attribution.',
  summary, rows, provenance: { registrationSha256: sha(readFileSync(`${root}/registration.json`)),
    probeSha256: registration.files['scripts/ai-progress-target-probe.mjs'], checkerSha256: sha(readFileSync(import.meta.filename)) } };
writeFileSync(`${root}/results.json`, `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(`${root}/checks.json`, `${JSON.stringify({ cases: truths.length, checkedWitnesses, controls,
  engineTreeSha256: registration.engineTreeSha256, resultsSha256: sha(readFileSync(`${root}/results.json`)),
  checkerSha256: output.provenance.checkerSha256 }, null, 2)}\n`);
console.log(JSON.stringify({ summary, controls }));
