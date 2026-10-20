import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as m from '../../dist/index.js';

const root = 'artifacts/ai-progress-objective-goal-continuity';
const registration = JSON.parse(readFileSync(`${root}/registration.json`));
for (const [path, digest] of Object.entries(registration.files))
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), digest, `Registered input changed: ${path}`);
const persistence = JSON.parse(readFileSync('artifacts/ai-progress-objective-persistence/measurements.json'));
const snapshots = readFileSync('artifacts/ai-progress-objective-persistence/boundary-snapshots.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const mechanism = JSON.parse(readFileSync('artifacts/ai-progress-objective-mechanism/results.json'));
const local = JSON.parse(readFileSync('artifacts/ai-progress-objective-original-continuation/results.json'));
const rows = [], handoffSnapshots = [];
let replayedActions = 0;
for (const pair of persistence.rows) {
  const originalPurpose = mechanism.pairs.find(row => row.firstMatch === pair.firstMatch).choices[0].purpose;
  const arms = [];
  for (const observation of pair.observations) {
    const sourceBytes = readFileSync(observation.path), save = JSON.parse(sourceBytes);
    assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), observation.sha256);
    const tracePath = observation.path.replace('.save.json', '.trace.jsonl');
    const traceBytes = readFileSync(tracePath);
    const traces = traceBytes.toString().trim().split('\n').map(JSON.parse);
    assert.equal(traces.length, save.acceptedActions.length);
    const resume = snapshots.find(row => row.firstMatch === pair.firstMatch && row.path === observation.path);
    assert.ok(resume);
    let state = m.parseGameStateJson(resume.snapshot).value;
    assert.equal((await m.hashGameState(state)).value, observation.boundary.stateHash);
    const objective = state.configuration.objectives.find(objective => objective.hexId === pair.target);
    assert.ok(objective);
    assert.equal(state.mapState.hexControl.find(entry => entry.hexId === pair.target)?.controllerId, 'player:allied');
    const changes = [];
    let primary = null, nextGoal = null, holder = 'player:allied', count = 0;
    for (let at = observation.boundary.at; at < save.acceptedActions.length; at++) {
      const action = save.acceptedActions[at], before = state;
      if (observation.nextMove.status === 'OBSERVED' && at === observation.nextMove.at) {
        const trace = traces[at];
        assert.ok(trace.status === 'ACCEPTED' && trace.attempts === 1 && trace.rejections.length === 0);
        assert.deepEqual(trace.action, observation.nextMove.action);
        assert.deepEqual(trace.action, action);
        assert.equal(action.kind, 'MOVE_PIECE'); assert.equal(action.pieceId, pair.pieceId);
        const parsed = /^combat to [-\d]+,[-\d]+ \((capture|assault|garrison|front|hunt) ([-\d]+,[-\d]+)\)$/.exec(trace.intent);
        assert.ok(parsed, `Unsupported next-move intent ${trace.intent}`);
        nextGoal = { status: 'OBSERVED', at, sequence: state.sequence, preStateHash: (await m.hashGameState(state)).value,
          action, intent: trace.intent, purpose: parsed[1], target: parsed[2], sameTargetHex: parsed[2] === pair.target, samePurpose: parsed[1] === originalPurpose,
          nextTargetIsObjective: state.configuration.objectives.some(objective => objective.hexId === parsed[2]),
          oldTargetHolder: holder, oldTargetHeldByAxis: holder === 'player:axis' };
      }
      const applied = m.ruleEngine.applyAction(state, action);
      assert.ok(applied.ok, `Illegal recorded action ${observation.path}:${at}`);
      count++; state = applied.state;
      const newHolder = state.mapState.hexControl.find(entry => entry.hexId === pair.target)?.controllerId ?? null;
      if (newHolder !== holder) changes.push({ at, preSequence: before.sequence, postSequence: state.sequence,
        from: holder, to: newHolder, actionKind: action.kind,
        axisAcquiredByObservedUnitMove: newHolder === 'player:axis' && action.kind === 'MOVE_PIECE' && action.pieceId === pair.pieceId && action.path.includes(pair.target),
        triggeringPieceId: action.kind === 'MOVE_PIECE' ? action.pieceId : null });
      holder = newHolder;
      if (nextGoal?.at === at) assert.equal((await m.hashGameState(state)).value, observation.nextMove.postStateHash);
      if (!primary) {
        const event = applied.events.find(event => event.kind === 'SEQUENCE_ADVANCED' && event.from.phase === 'CLEAN_UP'
          && event.from.gameTurn === observation.fork.gameTurn && event.from.playerTurnIndex === observation.fork.playerTurnIndex
          && event.from.phasingPlayerId === observation.fork.phasingPlayerId);
        if (event) {
          assert.equal(action.kind, 'ADVANCE_SEQUENCE');
          let reconstructed = before, measured = null;
          const regeneratedEvents = [], internalChanges = [];
          let internalHolder = before.mapState.hexControl.find(entry => entry.hexId === pair.target)?.controllerId ?? null;
          let boundaryChanges = null;
          const transitions = applied.events.filter(candidate => candidate.kind === 'SEQUENCE_ADVANCED');
          for (const transition of transitions) {
            assert.deepEqual(reconstructed.sequence, transition.from);
            assert.deepEqual(m.nextSequence(reconstructed), transition.to);
            const lifecycle = m.applySequenceLifecycle(reconstructed, transition.to);
            reconstructed = lifecycle.state;
            regeneratedEvents.push(...lifecycle.events);
            const nextHolder = reconstructed.mapState.hexControl.find(entry => entry.hexId === pair.target)?.controllerId ?? null;
            if (nextHolder !== internalHolder) internalChanges.push({ at, eventIndex: transition.sequence,
              preSequence: transition.from, postSequence: transition.to, from: internalHolder, to: nextHolder,
              actionKind: 'ADVANCE_SEQUENCE', axisAcquiredByObservedUnitMove: false, triggeringPieceId: null });
            internalHolder = nextHolder;
            if (transition.sequence === event.sequence) {
              measured = reconstructed;
              boundaryChanges = [...changes.filter(change => change.at < at), ...internalChanges];
            }
          }
          assert.deepEqual(regeneratedEvents.map((entry, sequence) => ({ ...entry, sequence })), applied.events);
          assert.deepEqual({ ...reconstructed, revision: state.revision }, state);
          assert.ok(measured && boundaryChanges);
          assert.deepEqual(measured.sequence, event.to);
          assert.equal(measured.pendingDecision, null);
          const measuredHolder = measured.mapState.hexControl.find(entry => entry.hexId === pair.target)?.controllerId ?? null;
          const scores = Object.fromEntries(m.calculateVictory(measured).scores.map(score => [score.playerId, score.points]));
          const contribution = objective.points * (measuredHolder === 'player:axis' ? 1 : measuredHolder === 'player:allied' ? -1 : 0);
          primary = { at, revision: measured.revision, stateHash: (await m.hashGameState(measured)).value,
            internalBoundary: true, eventIndex: event.sequence, containerPreStateHash: (await m.hashGameState(before)).value,
            containerPostStateHash: (await m.hashGameState(state)).value, containerPostRevision: state.revision,
            reconstruction: { lifecycleTransitions: transitions.length, allEventsMatch: true, normalizedFinalStateMatches: true },
            sequence: measured.sequence, departureEvent: event, action, scores, axisMargin: scores['player:axis'] - scores['player:allied'],
            targetHolder: measuredHolder, targetPoints: objective.points, targetMarginContribution: contribution,
            firstObservedAxisAcquisition: boundaryChanges.find(change => change.to === 'player:axis') ?? null,
            observedControlChangesThroughHandoff: boundaryChanges };
          handoffSnapshots.push({ firstMatch: pair.firstMatch, path: observation.path, stateHash: primary.stateHash,
            internalBoundary: true, eventIndex: event.sequence, snapshot: m.serializeGameState(measured).value });
        }
      }
      if (primary && (nextGoal || observation.nextMove.status === 'CENSORED')) break;
    }
    assert.ok(primary, `Missing own-turn handoff ${observation.path}`);
    assert.ok(nextGoal || observation.nextMove.status === 'CENSORED');
    replayedActions += count;
    arms.push({ path: observation.path, saveSha256: observation.sha256, tracePath,
      traceSha256: createHash('sha256').update(traceBytes).digest('hex'), resumeAt: observation.boundary.at,
      resumeHash: observation.boundary.stateHash, actionsReplayed: count, primary, changes,
      nextGoal: nextGoal ?? { status: 'CENSORED', reason: 'No subsequent same-unit MOVE_PIECE in source history; no claim about unobserved planning' } });
  }
  const outcome = local.rows.find(row => row.firstMatch === pair.firstMatch);
  rows.push({ firstMatch: pair.firstMatch, mapSeed: pair.mapSeed, originalTarget: pair.target, originalPurpose, pieceId: pair.pieceId,
    allVpEffect: arms[0].primary.axisMargin - arms[1].primary.axisMargin,
    targetVpEffect: arms[0].primary.targetMarginContribution - arms[1].primary.targetMarginContribution,
    terminalLocalEffect: outcome.localMarginEffect, arms });
  console.log(JSON.stringify({ firstMatch: pair.firstMatch, allVpEffect: rows.at(-1).allVpEffect, targetVpEffect: rows.at(-1).targetVpEffect }));
}
assert.equal(rows.length, 15);
const nextGoals = rows.flatMap(row => row.arms.map(arm => arm.nextGoal));
const observedGoals = nextGoals.filter(goal => goal.status === 'OBSERVED');
const summary = { pairs: rows.length, histories: rows.length * 2, primaryBoundaries: handoffSnapshots.length, replayedActions,
  observedNextGoals: observedGoals.length, censoredNextGoals: nextGoals.length - observedGoals.length,
  changedTarget: observedGoals.filter(goal => !goal.sameTargetHex).length,
  changedWhileOldTargetStillEnemy: observedGoals.filter(goal => !goal.sameTargetHex && goal.oldTargetHolder === 'player:allied').length,
  changedAfterOldTargetHeldByAxis: observedGoals.filter(goal => !goal.sameTargetHex && goal.oldTargetHeldByAxis).length,
  changedWithOldTargetNeutral: observedGoals.filter(goal => !goal.sameTargetHex && goal.oldTargetHolder === null).length,
  sameTargetChangedPurpose: observedGoals.filter(goal => goal.sameTargetHex && !goal.samePurpose).length,
  nextHunt: observedGoals.filter(goal => goal.purpose === 'hunt').length,
  heldAtHandoff: rows.flatMap(row => row.arms).filter(arm => arm.primary.targetHolder === 'player:axis').length };
const output = { sourceCommit: registration.sourceCommit, equivalentReachableSourceCommit: registration.equivalentReachableSourceCommit,
  analysisCheckoutCommit: registration.analysisCheckoutCommit,
  scriptSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'), summary, rows };
writeFileSync(`${root}/handoff-snapshots.jsonl`, `${handoffSnapshots.map(row => JSON.stringify(row)).join('\n')}\n`);
writeFileSync(`${root}/measurements.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(summary));
