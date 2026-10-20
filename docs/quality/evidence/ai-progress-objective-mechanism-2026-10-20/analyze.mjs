import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as m from '../../dist/index.js';

const input = 'artifacts/ai-progress-objective-30games';
const out = 'artifacts/ai-progress-objective-mechanism';
const resultsBytes = readFileSync(`${input}/results.json`);
const results = JSON.parse(resultsBytes);
assert.equal(results.pairs.length, 15);
const pairs = [];
let actionCount = 0;
for (const pair of results.pairs) {
  const ids = [pair.firstMatch, pair.firstMatch + 1];
  const saveBytes = ids.map(id => readFileSync(`${input}/matches/match-${id}.save.json`));
  const traceBytes = ids.map(id => readFileSync(`${input}/matches/match-${id}.trace.jsonl`));
  const saves = saveBytes.map(bytes => JSON.parse(bytes));
  const traces = traceBytes.map(bytes => bytes.toString().trim().split('\n').map(JSON.parse));
  assert.equal(saves[0].initialStateHash, saves[1].initialStateHash);
  let prefix = 0;
  while (prefix < Math.min(...saves.map(save => save.acceptedActions.length))
    && isDeepStrictEqual(saves[0].acceptedActions[prefix], saves[1].acceptedActions[prefix])) prefix++;
  const choices = [], outcomes = [], preHashes = [];
  for (const [index, save] of saves.entries()) {
    assert.ok(prefix < save.acceptedActions.length, 'No divergent action');
    const parsed = m.parseGameStateJson(save.initialSnapshot);
    assert.ok(parsed.ok);
    let state = parsed.value;
    assert.equal((await m.hashGameState(state)).value, save.initialStateHash);
    for (const action of save.acceptedActions.slice(0, prefix)) {
      const applied = m.ruleEngine.applyAction(state, action);
      assert.ok(applied.ok); state = applied.state;
    }
    const preHash = (await m.hashGameState(state)).value;
    preHashes.push(preHash);
    const action = save.acceptedActions[prefix];
    assert.equal(action.kind, 'MOVE_PIECE', 'Unsupported first divergence');
    const matches = traces[index].filter(row => row.revision === state.revision && isDeepStrictEqual(row.action, action));
    assert.equal(matches.length, 1);
    const trace = matches[0];
    assert.ok(trace.status === 'ACCEPTED' && trace.attempts === 1 && trace.rejections.length === 0);
    const intent = /^combat to [-\d]+,[-\d]+ \((capture|assault|garrison) ([-\d]+,[-\d]+)\)$/.exec(trace.intent);
    assert.ok(intent, 'Unsupported planning intent');
    const target = intent[2], objective = state.configuration.objectives.find(o => o.hexId === target);
    assert.ok(objective);
    const weight = index === 0 ? 15 : 30;
    assert.equal(trace.policy, index === 0 ? 'heuristic@85' : 'heuristic@85+progressObjective30-western');
    const distanceProgress = m.hexDistanceBetween(action.path[0], target) - m.hexDistanceBetween(action.path.at(-1), target);
    const pointScale = intent[1] === 'garrison' ? 1
      : objective.points / (state.configuration.objectives.reduce((n, o) => n + o.points, 0) / state.configuration.objectives.length);
    const slope = distanceProgress * pointScale;
    const terms = Object.fromEntries([...new Set(trace.breakdown.map(term => term.term))]
      .map(name => [name, trace.breakdown.filter(term => term.term === name).reduce((n, term) => n + term.value, 0)]));
    assert.ok(Math.abs(terms.progress - slope * weight) < 1e-9);
    assert.ok(Math.abs(trace.score - Object.values(terms).reduce((n, term) => n + term, 0)) < 1e-9);
    const otherScore = trace.score - terms.progress;
    choices.push({ match: ids[index], weight, actor: action.actorId, pieceId: action.pieceId,
      purpose: intent[1], target, targetPoints: objective.points, pointScale, origin: action.path[0],
      destination: action.path.at(-1), distanceProgress, slope, otherScore, terms, score: trace.score,
      retainedAt15: slope * 15 + otherScore, retainedAt30: slope * 30 + otherScore });
    const changes = [];
    let holder = state.mapState.hexControl.find(entry => entry.hexId === target)?.controllerId ?? null;
    const initialHolder = holder;
    for (let at = prefix; at < save.acceptedActions.length; at++) {
      const applied = m.ruleEngine.applyAction(state, save.acceptedActions[at]);
      assert.ok(applied.ok, `Illegal action ${ids[index]}:${at}`);
      state = applied.state;
      const nextHolder = state.mapState.hexControl.find(entry => entry.hexId === target)?.controllerId ?? null;
      if (nextHolder !== holder) changes.push({ at, revision: state.revision, turn: state.sequence.gameTurn,
        sequence: state.sequence, from: holder, to: nextHolder, actionKind: save.acceptedActions[at].kind });
      holder = nextHolder;
    }
    actionCount += save.acceptedActions.length;
    const finalHash = (await m.hashGameState(state)).value;
    assert.equal(finalHash, save.finalStateHash);
    assert.equal(state.sequence.phase, 'COMPLETE');
    let axisMargin = 0;
    const objectiveContributions = state.configuration.objectives.map(objective => {
      const owner = state.mapState.hexControl.find(entry => entry.hexId === objective.hexId)?.controllerId ?? null;
      const axisContribution = objective.points * (owner === 'player:axis' ? 1 : owner === 'player:allied' ? -1 : 0);
      axisMargin += axisContribution;
      return { ...objective, owner, axisContribution };
    });
    const piece = state.pieceState.pieces.find(piece => piece.id === action.pieceId);
    outcomes.push({ match: ids[index], finalHash, acceptedActions: save.acceptedActions.length, initialHolder,
      changes, firstAxisAcquisition: changes.find(change => change.to === 'player:axis') ?? null,
      finalHolder: holder, axisMargin, objectiveContributions,
      movedPieceFinal: piece ? { remainingSteps: piece.remainingSteps, location: piece.location, statuses: piece.statuses } : null });
  }
  assert.equal(preHashes[0], preHashes[1]);
  assert.equal(choices[0].actor, 'player:axis');
  for (const field of ['actor', 'pieceId', 'purpose', 'target', 'targetPoints', 'pointScale', 'origin'])
    assert.deepEqual(choices[0][field], choices[1][field], `Different ${field}`);
  assert.equal(outcomes[0].axisMargin, -pair.defenderVpMargin);
  assert.equal(outcomes[1].axisMargin, pair.attackerVpMargin);
  assert.equal((outcomes[1].axisMargin - outcomes[0].axisMargin) / 2, pair.vpMargin);
  const slopeDelta = choices[1].slope - choices[0].slope;
  const otherDelta = choices[1].otherScore - choices[0].otherScore;
  const targetDelta = outcomes[1].objectiveContributions.find(o => o.hexId === choices[0].target).axisContribution
    - outcomes[0].objectiveContributions.find(o => o.hexId === choices[0].target).axisContribution;
  pairs.push({ firstMatch: pair.firstMatch, mapSeed: pair.mapSeed, pairedVpMargin: pair.vpMargin,
    commonActions: prefix, preStateHash: preHashes[0], choices, outcomes,
    difference: { distanceProgress: choices[1].distanceProgress - choices[0].distanceProgress,
      exposureScore: (choices[1].terms.exposure ?? 0) - (choices[0].terms.exposure ?? 0),
      otherScore: otherDelta, slope: slopeDelta, twoRouteSwitchWeight: slopeDelta === 0 ? null : -otherDelta / slopeDelta,
      targetPairContribution: targetDelta / 2, otherObjectivesPairContribution: pair.vpMargin - targetDelta / 2 },
    inputs: ids.map((match, i) => ({ match, saveSha256: createHash('sha256').update(saveBytes[i]).digest('hex'),
      traceSha256: createHash('sha256').update(traceBytes[i]).digest('hex') })) });
}
assert.equal(actionCount, 25856);
const worst = JSON.parse(readFileSync(`${input}/worst-pair-case.json`));
const reproduced = pairs.find(pair => pair.firstMatch === worst.pair.firstMatch);
assert.equal(reproduced.preStateHash, worst.preStateHash);
assert.equal(reproduced.commonActions, worst.commonActions);
for (const [i, choice] of reproduced.choices.entries()) {
  assert.equal(choice.score, worst.rows[i].score);
  assert.equal(choice.distanceProgress, worst.rows[i].distanceProgress);
}
const summary = { pairs: pairs.length, games: pairs.length * 2, acceptedActions: actionCount,
  allSameUnitAndTarget: pairs.every(pair => pair.choices[0].pieceId === pair.choices[1].pieceId && pair.choices[0].target === pair.choices[1].target),
  moreProgress: pairs.filter(pair => pair.difference.distanceProgress > 0).length,
  worseOtherScore: pairs.filter(pair => pair.difference.otherScore < 0).length,
  worseExposure: pairs.filter(pair => pair.difference.exposureScore < 0).length,
  targetTerminalChanged: pairs.filter(pair => pair.difference.targetPairContribution !== 0).length,
  targetContributionSum: pairs.reduce((n, pair) => n + pair.difference.targetPairContribution, 0),
  otherContributionSum: pairs.reduce((n, pair) => n + pair.difference.otherObjectivesPairContribution, 0),
  signs: ['positive', 'zero', 'negative'].map((name, i) => {
    const subset = pairs.filter(pair => Math.sign(pair.pairedVpMargin) === [1, 0, -1][i]);
    return { name, pairs: subset.length, moreProgress: subset.filter(pair => pair.difference.distanceProgress > 0).length,
      worseExposure: subset.filter(pair => pair.difference.exposureScore < 0).length };
  }) };
const output = { source: { resultsSha256: createHash('sha256').update(resultsBytes).digest('hex'),
  scriptSha256: createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex') },
  scope: 'Post-result descriptive analysis of all15 existing pairs. No new games, full candidate enumeration, isolated-action causality or independent predictor validation.',
  summary, pairs };
writeFileSync(`${out}/results.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(summary));
