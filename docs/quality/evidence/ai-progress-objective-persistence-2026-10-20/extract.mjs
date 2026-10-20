import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as m from '../../dist/index.js';

const root = 'artifacts/ai-progress-objective-persistence';
const mechanism = JSON.parse(readFileSync('artifacts/ai-progress-objective-mechanism/results.json'));
const local = JSON.parse(readFileSync('artifacts/ai-progress-objective-original-continuation/results.json'));
const rows = [];
let replayedActions = 0;
for (const pair of mechanism.pairs) {
  const first = pair.firstMatch;
  const paths = [`artifacts/ai-progress-objective-30games/matches/match-${first + 1}.save.json`,
    `artifacts/ai-progress-objective-original-continuation/pair-${first}/branch-15.save.json`];
  const observations = [];
  for (const path of paths) {
    const bytes = readFileSync(path), save = JSON.parse(bytes);
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    assert.equal((await m.hashGameState(state)).value, save.initialStateHash);
    let fork = null, boundary = null, nextMove = null;
    let actionsReplayed = 0;
    for (const [at, action] of save.acceptedActions.entries()) {
      if (at === pair.commonActions) {
        assert.equal((await m.hashGameState(state)).value, pair.preStateHash);
        assert.equal(state.sequence.phase, 'MOVEMENT'); assert.equal(state.sequence.segment, 'MOVEMENT');
        assert.equal(state.sequence.phasingPlayerId, 'player:axis');
        fork = { ...state.sequence };
      }
      const applied = m.ruleEngine.applyAction(state, action);
      assert.ok(applied.ok, `Illegal recorded action ${path}:${at}`);
      actionsReplayed++;
      if (fork && !boundary) {
        const event = applied.events.find(event => event.kind === 'SEQUENCE_ADVANCED'
          && event.from.gameTurn === fork.gameTurn && event.from.playerTurnIndex === fork.playerTurnIndex
          && event.from.phasingPlayerId === fork.phasingPlayerId
          && event.from.phase === 'MOVEMENT' && event.from.segment === 'MOVEMENT'
          && (event.to.phase !== 'MOVEMENT' || event.to.segment !== 'MOVEMENT'));
        if (event) {
          assert.equal(action.kind, 'ADVANCE_SEQUENCE');
          assert.deepEqual(state.sequence, event.from);
          assert.equal(state.pendingDecision, null);
          const piece = state.pieceState.pieces.find(piece => piece.id === pair.choices[0].pieceId);
          const onMap = piece?.location.kind === 'ON_MAP' && (piece.remainingSteps ?? 0) > 0;
          const victory = m.calculateVictory(state);
          const scores = Object.fromEntries(victory.scores.map(score => [score.playerId, score.points]));
          boundary = { at, revision: state.revision, stateHash: (await m.hashGameState(state)).value,
            sequence: state.sequence, pendingDecision: state.pendingDecision,
            exitAction: action, exitEvent: event, postStateHash: (await m.hashGameState(applied.state)).value,
            piece: piece ? { location: piece.location, remainingSteps: piece.remainingSteps, mode: piece.mode } : null,
            distance: onMap ? m.hexDistanceBetween(piece.location.hexId, pair.choices[0].target) : null,
            distanceStatus: onMap ? 'OBSERVED' : 'UNAVAILABLE', currentScores: scores,
            axisMargin: scores['player:axis'] - scores['player:allied'], cachedVictory: state.victory,
            targetHolder: state.mapState.hexControl.find(entry => entry.hexId === pair.choices[0].target)?.controllerId ?? null };
        }
      }
      if (at > pair.commonActions && !nextMove && action.kind === 'MOVE_PIECE' && action.pieceId === pair.choices[0].pieceId)
        nextMove = { status: 'OBSERVED', at, sequence: state.sequence, action,
          postStateHash: (await m.hashGameState(applied.state)).value };
      state = applied.state;
      if (boundary && nextMove) break;
    }
    assert.ok(boundary, `Missing movement boundary ${path}`);
    replayedActions += actionsReplayed;
    observations.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), initialStateHash: save.initialStateHash,
      fork, boundary, nextMove: nextMove ?? { status: 'CENSORED', observedThrough: state.sequence,
        finalStateHash: (await m.hashGameState(state)).value }, actionsReplayed });
  }
  assert.equal(observations[0].initialStateHash, observations[1].initialStateHash);
  assert.deepEqual(observations[0].fork, observations[1].fork);
  const a = observations[0].boundary, b = observations[1].boundary;
  const retainedScaledProgress = a.distance === null || b.distance === null ? null : (b.distance - a.distance) * pair.choices[0].pointScale;
  const outcome = local.rows.find(row => row.firstMatch === first);
  rows.push({ firstMatch: first, mapSeed: pair.mapSeed, target: pair.choices[0].target, pieceId: pair.choices[0].pieceId,
    pointScale: pair.choices[0].pointScale, initialScaledProgress: outcome.features.addedScaledProgress,
    retainedScaledProgress, boundaryVpEffect: a.axisMargin - b.axisMargin, terminalLocalEffect: outcome.localMarginEffect,
    observations });
  console.log(JSON.stringify({ firstMatch: first, retainedScaledProgress, boundaryVpEffect: a.axisMargin - b.axisMargin }));
}
assert.equal(rows.length, 15);
const output = { sourceCommit: '36e24ccf3af6d9dd83810bbcf9d360f93bc8231b',
  scriptSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex'),
  protocolSha256: createHash('sha256').update(readFileSync(`${root}/protocol.md`)).digest('hex'),
  coverage: { pairs: rows.length, histories: rows.length * 2, replayedActions,
    availableRetainedProgress: rows.filter(row => row.retainedScaledProgress !== null).length,
    identicalToFirstProgress: rows.every(row => row.retainedScaledProgress !== null
      && Math.abs(row.retainedScaledProgress - row.initialScaledProgress) < 1e-9) }, rows };
writeFileSync(`${root}/measurements.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.coverage));
