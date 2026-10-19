#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value);
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const names = ['routeRefusals', 'exhaustedGroups', 'scoreBlocked', 'crowdingCrossing', 'exposureCrossing', 'correctionBudget'];
const empty = () => ({ scored: 0, improving: 0, routeRefusals: 0, exhaustedGroups: 0,
  crowdingCrossing: false, exposureCrossing: false, correctionBudget: 0, groups: 0 });
const sumTerm = (terms, name) => terms.filter(term => term.term === name).reduce((n, term) => n + term.value, 0);
const crosses = (candidate, stay, name) => {
  const margin = candidate.retainedScore - stay.score;
  return margin <= 0 && margin - (sumTerm(candidate.retainedTerms, name) - sumTerm(stay.terms, name)) > 0;
};
const treeHash = directory => {
  const digest = createHash('sha256');
  for (const file of readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.js')).sort()) {
    digest.update(file).update('\0').update(sha(readFileSync(join(directory, file)))).update('\0');
  }
  return digest.digest('hex');
};
const options = { engine: 'dist' };
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  assert.ok(['--cohort', '--game', '--engine', '--out'].includes(flag), `Unknown option ${flag}`);
  const value = process.argv[++index]; assert.ok(value && !value.startsWith('--'), `Missing value for ${flag}`);
  options[flag.slice(2)] = value;
}
assert.ok(options.cohort && options.game !== undefined && options.out, 'Use --cohort --game --out');
const started = performance.now(), scriptSha256 = sha(readFileSync(new URL(import.meta.url)));
const cohortBytes = readFileSync(options.cohort), cohort = JSON.parse(cohortBytes);
const games = cohort.pairs.flatMap(pair => pair.games.map(game => ({ ...game, family: pair.family, direction: pair.direction,
  climate: pair.climate, pair: pair.pair })));
const gameIndex = Number(options.game);
assert.ok(Number.isInteger(gameIndex) && gameIndex >= 0 && gameIndex < games.length, 'Invalid game index');
const game = games[gameIndex], source = join(cohort.artifactRoot, game.source, `match-${game.match}.save.json`);
const bytes = readFileSync(source), save = JSON.parse(bytes);
assert.equal(sha(bytes), game.saveSha256, 'Historical save bytes mismatch');
assert.equal(sha(canonical(save.acceptedActions)), game.acceptedActionsSha256, 'Historical action identity mismatch');
const m = await import(pathToFileURL(resolve(options.engine, 'index.js')).href);
const parsed = m.parseGameStateJson(save.initialSnapshot);
assert.ok(parsed.ok, 'Historical initial snapshot invalid');
let state = parsed.value;
const initialHash = await m.hashGameState(state); assert.ok(initialHash.ok);
assert.equal(initialHash.value, game.initialStateHash, 'Initial snapshot hash mismatch');
assert.equal(state.sequence.gameTurn, 1, 'Fresh phase memory requires original initial state');
const fixture = await m.createGameplayFixture({ scenario: state.scenario, configuration: state.configuration });
const session = await fixture.engine.loadSession(json({ ...fixture.session.save(), bindings: save.bindings,
  activeSeatId: save.bindings[0].seatId,
  initialSnapshot: save.initialSnapshot, currentSnapshot: save.initialSnapshot,
  initialStateHash: game.initialStateHash, finalStateHash: game.initialStateHash }));
session.start();
assert.equal(session.getMetadata().stateHash, game.initialStateHash);
const objectives = state.configuration.objectives;
const totalVp = objectives.reduce((n, objective) => n + objective.points, 0);
assert.ok(totalVp > 0);
const players = state.scenario.players.map(player => player.id);
const weightIdentities = [];
const registration = JSON.parse(readFileSync('docs/quality/evidence/ai-position-surrogacy-2026-10-19/registration.json'));
const seats = session.getBindings().map(binding => {
  const id = game.policies[binding.playerId]; let policy;
  if (id === 'heuristic') policy = m.createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit });
  else {
    assert.ok(id.startsWith('heuristic:'), 'Only registered heuristic policies supported');
    const relative = id.slice('heuristic:'.length), weightBytes = readFileSync(join(cohort.artifactRoot, relative));
    const registered = registration.variants.find(variant => variant.file === relative);
    assert.ok(registered && sha(weightBytes) === registered.sha256, 'Registered weight identity mismatch');
    const file = JSON.parse(weightBytes); weightIdentities.push({ file: relative, sha256: sha(weightBytes) });
    policy = m.createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit },
      { weights: m.heuristicWeights(file.weights ?? file), label: file.label ?? relative });
  }
  const side = binding.playerId === 'player:axis' ? 'axis' : 'allied';
  return { ...binding, policy, seed: game.seeds[side] };
});
const windows = new Map(), groupRows = [], controlEvents = [], turnClosures = [], reportDigests = [];
let accepted = 0, dispatches = 0, rejected = 0, earlyGroups = 0, earlyQueries = 0, truncatedQueries = 0;
let preState = state, preHash = initialHash.value, witness = null;
const dispatch = session.dispatch;
session.dispatch = async request => {
  const result = await dispatch(request); dispatches++;
  if (result.status !== 'ACCEPTED') { rejected++; return result; }
  const expected = save.acceptedActions[accepted];
  assert.deepEqual(request.action, expected, `Policy regeneration differs at accepted action ${accepted}`);
  const replay = m.ruleEngine.applyAction(state, request.action);
  assert.ok(replay.ok, `Independent replay rejected ${accepted}`);
  assert.deepEqual(replay.events, result.events, `Independent replay events differ ${accepted}`);
  const hashed = await m.hashGameState(replay.state); assert.ok(hashed.ok);
  assert.equal(hashed.value, session.getMetadata().stateHash, `Independent replay hash differs ${accepted}`);
  const holder = (current, hexId) => current.mapState.hexControl.find(entry => entry.hexId === hexId)?.controllerId ?? null;
  for (const objective of objectives) {
    const from = holder(state, objective.hexId), to = holder(replay.state, objective.hexId);
    if (from !== to) controlEvents.push({ actionIndex: accepted, requestId: request.requestId, revision: replay.state.revision,
      gameTurn: state.sequence.gameTurn, phasingPlayerId: state.sequence.phasingPlayerId, ...objective, from, to });
  }
  for (const [eventIndex, event] of result.events.entries()) if (event.kind === 'SEQUENCE_ADVANCED' && event.from.phase === 'CLEAN_UP') {
    turnClosures.push({ actionIndex: accepted, revision: replay.state.revision, eventIndex,
      gameTurn: event.from.gameTurn, playerTurnIndex: event.from.playerTurnIndex, owner: event.from.phasingPlayerId });
  }
  state = replay.state; accepted++;
  return result;
};
const observe = report => {
  assert.equal(report.revision, preState.revision, 'Observer pre-state revision mismatch');
  assert.equal(report.stateHash, preHash, 'Observer pre-state hash mismatch');
  assert.equal(report.stepKey.split(':')[0], String(preState.sequence.gameTurn));
  if (preState.sequence.gameTurn >= 4) return;
  const reportSha256 = sha(json(report));
  reportDigests.push({ ordinal: report.decisionOrdinal, revision: report.revision, stateHash: report.stateHash, reportSha256 });
  earlyQueries += report.queries.length; truncatedQueries += report.queries.filter(query => query.truncated).length;
  const actions = new Map(report.candidates.map(candidate => [candidate.id, candidate.action]));
  for (const [groupIndex, group] of (report.movementGroups ?? []).entries()) {
    earlyGroups++;
    assert.equal(report.playerId, preState.sequence.phasingPlayerId, 'Movement observation outside own turn');
    const compactGroup = { ordinal: report.decisionOrdinal, groupIndex, reportSha256, revision: report.revision,
      playerId: report.playerId, gameTurn: preState.sequence.gameTurn, role: group.role, pieceId: group.pieceId,
      assignedTarget: group.assignedTarget, objectives: [] };
    for (const objective of objectives) {
      const controller = preState.mapState.hexControl.find(entry => entry.hexId === objective.hexId)?.controllerId ?? null;
      if (controller === report.playerId) continue;
      const relevant = group.candidates.map(candidate => {
        const action = actions.get(candidate.candidateId);
        assert.ok(action?.kind === 'MOVE_PIECE' && action.pieceId === group.pieceId, 'Movement candidate identity mismatch');
        assert.equal(candidate.retainedScore, candidate.retainedTerms.reduce((n, term) => n + term.value, 0));
        const path = action.path.slice(1).includes(objective.hexId);
        const approach = group.assignedTarget?.hexId === objective.hexId
          && m.hexDistanceBetween(action.path.at(-1), objective.hexId) < m.hexDistanceBetween(action.path[0], objective.hexId);
        return { candidate, path, approach };
      });
      for (const basis of ['path', 'approach']) {
        const rows = relevant.filter(row => row.path || basis === 'approach' && row.approach).map(row => row.candidate);
        if (!rows.length) continue;
        const key = `${basis}:${report.playerId}:${preState.sequence.gameTurn}:${objective.hexId}`;
        if (!windows.has(key)) windows.set(key, { key, basis, playerId: report.playerId,
          gameTurn: preState.sequence.gameTurn, hexId: objective.hexId, points: objective.points, ...empty() });
        const window = windows.get(key), improving = rows.filter(row => row.retainedScore > group.stay.score);
        const refused = rows.filter(row => row.finalSupply.status === 'EVALUATED' && !row.finalSupply.preserved);
        const exhausted = improving.length > 0 && improving.every(row => row.finalSupply.status === 'EVALUATED' && !row.finalSupply.preserved);
        const crowding = rows.some(row => crosses(row, group.stay, 'crowding'));
        const exposure = rows.some(row => crosses(row, group.stay, 'exposure'));
        const budget = rows.filter(row => row.correction.status === 'NOT_EVALUATED' && row.correction.reason === 'CORRECTION_BUDGET').length;
        window.groups++; window.scored += rows.length; window.improving += improving.length;
        window.routeRefusals += refused.length; window.exhaustedGroups += Number(exhausted);
        window.crowdingCrossing ||= crowding; window.exposureCrossing ||= exposure; window.correctionBudget += budget;
        compactGroup.objectives.push({ basis, hexId: objective.hexId, points: objective.points, initialHolder: controller,
          scored: rows.length, improving: improving.length, routeRefusals: refused.length, exhausted,
          crowdingCrossing: crowding, exposureCrossing: exposure, correctionBudget: budget,
          finalSupplyChecked: rows.filter(row => row.finalSupply.status === 'EVALUATED').length,
          finalSupplyPreserved: rows.filter(row => row.finalSupply.status === 'EVALUATED' && row.finalSupply.preserved).length,
          correctionEligible: rows.filter(row => row.correction.status === 'EVALUATED' || row.correction.reason === 'CORRECTION_BUDGET').length,
          correctionChecked: rows.filter(row => row.correction.status === 'EVALUATED').length,
          pathLinked: relevant.filter(row => row.path).length, approachLinked: relevant.filter(row => row.approach).length });
        if (witness === null) witness = { reportSha256, report };
      }
    }
    groupRows.push(compactGroup);
  }
};
const runner = m.createBotSeatRunner({ session, seats, observation: { runId: `panel:${gameIndex}`, onDecision: observe } });
for (let guard = 0; guard < save.acceptedActions.length * 2 + 100; guard++) {
  preState = state; preHash = session.getMetadata().stateHash;
  const result = await runner.step();
  if (result.kind === 'FINISHED') break;
  assert.equal(result.kind, 'ACTED', `Regeneration stopped: ${json(result)}`);
}
assert.equal(session.getMetadata().lifecycle, 'FINISHED', 'Regeneration did not complete');
assert.equal(accepted, save.acceptedActions.length, 'Historical action coverage mismatch');
assert.equal(session.getMetadata().stateHash, game.finalStateHash, 'Historical final hash mismatch');
assert.deepEqual(session.save().acceptedActions, save.acceptedActions, 'Complete historical action sequence mismatch');
const denominator = 3 * totalVp;
for (const player of players) assert.equal(turnClosures.filter(closure => closure.gameTurn < 4 && closure.owner === player).length, 3,
  'Missing early player-turn denominator');
const features = Object.fromEntries(players.map(player => [player, Object.fromEntries(['path', 'approach'].map(basis => {
  const selected = [...windows.values()].filter(window => window.playerId === player && window.basis === basis);
  return [basis, Object.fromEntries(names.map(name => [name, selected.reduce((n, window) => n + window.points
    * (name === 'scoreBlocked' ? Number(window.scored > 0 && window.improving === 0) : Number(window[name])), 0) / denominator]))];
}))]));
mkdirSync(dirname(options.out), { recursive: true });
const witnessPath = `${options.out}.witness.json.gz`;
if (witness) writeFileSync(witnessPath, gzipSync(json(witness)));
const output = { schemaVersion: 1, gameIndex, game, provenance: { cohortSha256: sha(cohortBytes), saveSha256: sha(bytes),
  scriptSha256, engineTreeSha256: treeHash(options.engine), weights: weightIdentities,
  node: process.version, elapsedMs: performance.now() - started, fullCandidateArchive: false,
  witness: witness ? { path: witnessPath, sha256: sha(readFileSync(witnessPath)), reportSha256: witness.reportSha256 } : null },
  verification: { acceptedActionsMatched: accepted, dispatches, rejected, initialStateHash: game.initialStateHash,
    finalStateHash: game.finalStateHash, independentReplayEventsAndHashes: true, historicalTrajectoryMatched: true },
  diagnostics: { earlyGroups, earlyQueries, truncatedQueries, totalVp, denominator, earlyReports: reportDigests.length,
    objectiveWindows: windows.size, distinctSourceTrajectoryId: game.id },
  features, windows: [...windows.values()], groupRows, reportDigests, controlEvents, turnClosures };
writeFileSync(options.out, `${JSON.stringify(output)}\n`);
console.log(json({ gameIndex, variant: game.variant, match: game.match, accepted, earlyGroups,
  objectiveWindows: windows.size, elapsedMs: output.provenance.elapsedMs, bytes: readFileSync(options.out).length }));
