import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const options = { root: 'artifacts/ai-progress-combat-opportunity', engine: 'artifacts/ai-progress-objective-goal-continuity/engine' };
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index].slice(2), value = process.argv[index + 1];
  assert.ok(['root', 'engine', 'case'].includes(name) && value); options[name] = value;
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path));
const registration = read(`${options.root}/registration.json`);
for (const [path, digest] of Object.entries(registration.files)) assert.equal(sha(readFileSync(path)), digest, `Registered file changed ${path}`);
const tree = createHash('sha256');
for (const file of readdirSync(options.engine, { recursive: true }).filter(file => file.endsWith('.js')).sort())
  tree.update(file).update('\0').update(sha(readFileSync(`${options.engine}/${file}`))).update('\0');
assert.equal(tree.digest('hex'), registration.engineTreeSha256);
const m = await import(pathToFileURL(resolve(options.engine, 'index.js')).href);
const persistence = read('artifacts/ai-progress-objective-persistence/measurements.json');
const resumes = readFileSync('artifacts/ai-progress-objective-persistence/boundary-snapshots.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const local = read('artifacts/ai-progress-objective-original-continuation/results.json');
const mechanism = read('artifacts/ai-progress-objective-mechanism/results.json');
const outputs = [];
for (const pair of persistence.rows.filter(pair => !options.case || pair.firstMatch === Number(options.case))) {
  const sourcePair = mechanism.pairs.find(row => row.firstMatch === pair.firstMatch);
  assert.equal(pair.target, sourcePair.choices[0].target);
  const arms = [], raw = [];
  for (const [armIndex, observation] of pair.observations.entries()) {
    const sourceBytes = readFileSync(observation.path), save = JSON.parse(sourceBytes);
    assert.equal(sha(sourceBytes), observation.sha256);
    const resume = resumes.find(row => row.firstMatch === pair.firstMatch && row.path === observation.path); assert.ok(resume);
    const parsed = m.parseGameStateJson(resume.snapshot); assert.ok(parsed.ok);
    let state = parsed.value, boundary = null, count = 0;
    assert.equal((await m.hashGameState(state)).value, observation.boundary.stateHash);
    for (let at = observation.boundary.at; at < save.acceptedActions.length; at++) {
      const action = save.acceptedActions[at], before = state, applied = m.ruleEngine.applyAction(before, action);
      assert.ok(applied.ok, `Recorded action rejected ${observation.path}:${at}`); count++; state = applied.state;
      const entry = applied.events.find(event => event.kind === 'SEQUENCE_ADVANCED'
        && event.to.phase === 'COMBAT' && event.to.segment === 'COMBAT'
        && event.to.gameTurn === observation.fork.gameTurn && event.to.playerTurnIndex === observation.fork.playerTurnIndex
        && event.to.phasingPlayerId === observation.fork.phasingPlayerId);
      if (!entry) continue;
      assert.equal(action.kind, 'ADVANCE_SEQUENCE');
      let reconstructed = before, measured = null;
      const regenerated = [], transitions = applied.events.filter(event => event.kind === 'SEQUENCE_ADVANCED');
      for (const event of transitions) {
        assert.deepEqual(reconstructed.sequence, event.from);
        assert.deepEqual(m.nextSequence(reconstructed), event.to);
        const lifecycle = m.applySequenceLifecycle(reconstructed, event.to);
        reconstructed = lifecycle.state; regenerated.push(...lifecycle.events);
        if (event.sequence === entry.sequence) measured = reconstructed;
      }
      assert.deepEqual(regenerated.map((event, sequence) => ({ ...event, sequence })), applied.events);
      assert.deepEqual({ ...reconstructed, revision: state.revision }, state);
      assert.ok(measured); assert.deepEqual(measured.sequence, entry.to);
      assert.equal(measured.pendingDecision, null); assert.equal(measured.activeTransaction, null);
      const beforeQueries = m.serializeGameState(measured).value;
      const candidates = m.ruleEngine.getActionCandidates(measured, { actorId: 'player:axis', kind: 'DECLARE_COMBAT', pieceId: null, budget: 200 });
      const targetActions = candidates.actions.filter(action => action.targetHexId === pair.target);
      assert.ok(!candidates.truncated || targetActions.length > 0, 'Unknown original-target absence in truncated query');
      const witnesses = targetActions.map(action => {
        assert.equal(action.kind, 'DECLARE_COMBAT'); assert.equal(action.combatKind, 'REGULAR');
        assert.equal(action.actorId, 'player:axis');
        const validation = m.ruleEngine.validateAction(measured, action); assert.ok(validation.allowed);
        const settlement = m.settleDeclaredAttackerSupply(measured, action.actorId, action.attackerIds, action.attackerSupply);
        assert.deepEqual(settlement.violations, []);
        const explanation = m.ruleEngine.explain(measured, action); assert.ok(explanation.allowed);
        const fact = key => explanation.facts.find(fact => fact.key === key)?.value;
        const attackerStrength = fact('combat.attackerStrength'); assert.ok(typeof attackerStrength === 'number' && Number.isFinite(attackerStrength));
        return { action, attackerStrength, externalPayments: settlement.payments, internalIds: settlement.internalIds,
          odds: fact('combat.odds'), line: fact('combat.line'), defenderCanPay: fact('combat.defenderCanPay') };
      });
      assert.equal(m.serializeGameState(measured).value, beforeQueries, 'Opportunity queries changed state or rules RNG');
      const objective = measured.configuration.objectives.find(objective => objective.hexId === pair.target); assert.ok(objective);
      const holder = measured.mapState.hexControl.find(entry => entry.hexId === pair.target)?.controllerId ?? null;
      const scores = Object.fromEntries(m.calculateVictory(measured).scores.map(score => [score.playerId, score.points]));
      const pointScale = objective.points / (measured.configuration.objectives.reduce((sum, objective) => sum + objective.points, 0) / measured.configuration.objectives.length);
      assert.ok(Math.abs(pointScale - pair.pointScale) < 1e-9);
      const best = [...witnesses].sort((left, right) => right.attackerStrength - left.attackerStrength
        || left.action.actionId.localeCompare(right.action.actionId))[0] ?? null;
      boundary = { sourcePath: observation.path, sourceSha256: observation.sha256, armIndex,
        resumeAt: observation.boundary.at, resumeHash: observation.boundary.stateHash, replayedActions: count,
        at, internalBoundary: true, revision: measured.revision, stateHash: (await m.hashGameState(measured)).value,
        sequence: measured.sequence, entryEvent: entry, eventIndex: entry.sequence,
        containerPreHash: (await m.hashGameState(before)).value, containerPostHash: (await m.hashGameState(state)).value,
        containerPostRevision: state.revision, action, reconstruction: { transitions: transitions.length, allEventsMatch: true, normalizedFinalStateMatches: true },
        query: { budget: 200, candidates: candidates.actions.length, truncated: candidates.truncated, actionsSha256: sha(JSON.stringify(candidates.actions)) },
        targetHolder: holder, targetPoints: objective.points, pointScale, scores, axisMargin: scores['player:axis'] - scores['player:allied'],
        witnesses, attackAvailableValue: witnesses.length ? objective.points * (holder === 'player:axis' ? 0 : holder === null ? 1 : 2) : 0,
        offeredAttackStrength: best ? best.attackerStrength * pointScale : 0, bestActionId: best?.action.actionId ?? null,
        supplementaryQueriesPreserveRulesState: true };
      raw.push({ firstMatch: pair.firstMatch, armIndex, path: observation.path, snapshot: beforeQueries,
        containerBeforeSnapshot: m.serializeGameState(before).value, allContainerEvents: applied.events, candidates });
      break;
    }
    assert.ok(boundary, `Missing Combat entry ${observation.path}`); arms.push(boundary);
  }
  const outcome = local.rows.find(row => row.firstMatch === pair.firstMatch);
  const rawPath = `${options.root}/pair-${pair.firstMatch}.raw.json.gz`;
  writeFileSync(rawPath, gzipSync(JSON.stringify(raw)));
  const output = { firstMatch: pair.firstMatch, mapSeed: pair.mapSeed, originalTarget: pair.target,
    fork: pair.observations[0].fork, terminalLocalEffect: outcome.localMarginEffect, arms,
    features: { boundaryVp: arms[0].axisMargin - arms[1].axisMargin,
      attackAvailableValue: arms[0].attackAvailableValue - arms[1].attackAvailableValue,
      offeredAttackStrength: arms[0].offeredAttackStrength - arms[1].offeredAttackStrength },
    provenance: { rawPath, rawSha256: sha(readFileSync(rawPath)), registrationSha256: sha(readFileSync(`${options.root}/registration.json`)),
      scriptSha256: sha(readFileSync(import.meta.filename)), engineTreeSha256: registration.engineTreeSha256 } };
  writeFileSync(`${options.root}/pair-${pair.firstMatch}.json`, `${JSON.stringify(output, null, 2)}\n`);
  outputs.push(output);
  console.log(JSON.stringify({ firstMatch: pair.firstMatch, features: output.features,
    witnesses: arms.map(arm => arm.witnesses.length), replayedActions: arms.reduce((sum, arm) => sum + arm.replayedActions, 0) }));
}
assert.equal(outputs.length, options.case ? 1 : 15);
