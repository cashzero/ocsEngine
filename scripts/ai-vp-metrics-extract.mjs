#!/usr/bin/env node
// Replay one ai-match directory; observations stop before the first action of the next turn.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadOutcomeObserver } from './ai-outcome-metrics-observer.mjs';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
for (const name of ['--directory', '--engine', '--variant', '--out']) {
  if (!args.includes(name) || !option(name)) throw new Error(`Required: ${name}`);
}
const directory = resolve(option('--directory'));
const engine = resolve(option('--engine'));
const cutoffTurn = args.includes('--cutoff') ? Number(option('--cutoff')) : 4;
assert(Number.isInteger(cutoffTurn) && cutoffTurn > 0);
const variant = option('--variant');
const m = await import(pathToFileURL(join(engine, 'index.js')).href);
const advanced = args.includes('--advanced');
const createObserver = advanced ? await loadOutcomeObserver(engine, m) : null;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const engineFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
  ? engineFiles(join(dir, entry.name)) : entry.name.endsWith('.js') ? [join(dir, entry.name)] : []).sort();
const engineHash = hash(engineFiles(engine).map((file) => `${relative(engine, file)}\t${hash(readFileSync(file))}`).join('\n'));
const summary = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
const counters = () => ({ gainedVp: 0, lostVp: 0, moveGainedVp: 0, combatGainedVp: 0,
  objectiveAttacks: 0, otherAttacks: 0, regularAttacks: 0, barrages: 0, objectiveSupplyRequirementTokens: 0,
  objectiveColumnSum: 0, objectiveResolved: 0, objectiveCaptured: 0, objectiveCleared: 0 });
const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator : null;
const games = [];
const started = Date.now();

for (const record of summary.records) {
  if (args.includes('--match') && record.match !== Number(option('--match'))) continue;
  assert.equal(record.stopReason, 'FINISHED');
  assert.equal(record.rejected, 0);
  assert.equal(record.errors.length, 0);
  const savePath = join(directory, `match-${record.match}.save.json`);
  const tracePath = join(directory, `match-${record.match}.trace.jsonl`);
  const saveText = readFileSync(savePath, 'utf8');
  const traceText = readFileSync(tracePath, 'utf8');
  const save = JSON.parse(saveText);
  const parsed = m.parseGameStateJson(save.initialSnapshot);
  assert(parsed.ok, 'initial snapshot parses');
  let state = parsed.value;
  const initial = state;
  const observer = createObserver?.(initial, cutoffTurn, record);
  const initialHash = await m.hashGameState(state);
  assert(initialHash.ok);
  assert.equal(initialHash.value, save.initialStateHash);
  assert(state.configuration.turnLimit > cutoffTurn, 'cutoff precedes terminal turn');
  const accepted = new Map(traceText.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
    .filter((entry) => entry.status === 'ACCEPTED').map((entry) => [entry.revision, entry]));
  const objectives = state.configuration.objectives;
  const objectivePoints = new Map(objectives.map((o) => [o.hexId, o.points]));
  const definitions = new Map(state.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
  const players = state.scenario.players.map((p) => p.id);
  const sideOf = (id) => String(id).split(':').at(-1);
  const control = (current, hexId) => current.mapState.hexControl.find((h) => h.hexId === hexId)?.controllerId ?? null;
  const vp = (current, playerId) => objectives.reduce((sum, o) => sum + (control(current, o.hexId) === playerId ? o.points : 0), 0);
  const counts = Object.fromEntries(players.map((id) => [id, counters()]));
  const histories = Object.fromEntries(players.map((id) => [id, objectives.map((o) => ({
    hexId: o.hexId, points: o.points, initiallyHeld: control(initial, o.hexId) === id, events: [],
  }))]));
  const onMapCombat = (current, owner) => current.pieceState.pieces.filter((p) => p.ownerId === owner
    && p.location.kind === 'ON_MAP' && definitions.get(p.definitionId)?.counter?.kind === 'COMBAT');
  const strength = (p) => definitions.get(p.definitionId)?.faces.find((f) => f.id === 'combat')?.steps
    .find((s) => s.remainingSteps === p.remainingSteps)?.combatStrength ?? 0;
  const readiness = {};
  let cutoff = null;
  let pending = null;

  for (const action of save.acceptedActions) {
    observer?.before(state);
    const trace = accepted.get(state.revision);
    assert(trace, `trace exists at ${state.revision}`);
    assert.deepEqual(trace.action, action, 'trace and save action agree');
    const { gameTurn, playerTurnIndex, phase, segment, phasingPlayerId } = state.sequence;
    assert.equal(trace.stepKey, `${gameTurn}:${playerTurnIndex}:${phase}:${segment}`);
    const observed = gameTurn <= cutoffTurn;
    if (observed && gameTurn === cutoffTurn && phase === 'COMBAT' && segment === 'COMBAT' && !readiness[phasingPlayerId]) {
      const best = new Map();
      const candidates = m.ruleEngine.getActionCandidates(state, { actorId: phasingPlayerId, kind: 'DECLARE_COMBAT', pieceId: null, budget: 400 });
      for (const candidate of candidates.actions) {
        if (candidate.combatKind !== 'REGULAR' || !objectivePoints.has(candidate.targetHexId)
          || control(state, candidate.targetHexId) === phasingPlayerId) continue;
        const explanation = m.ruleEngine.explain(state, candidate);
        const forecast = explanation.allowed ? m.forecastCombat(explanation.facts) : null;
        if (forecast) best.set(candidate.targetHexId, Math.max(best.get(candidate.targetHexId) ?? -1, forecast.columnIndex));
      }
      readiness[phasingPlayerId] = { observed: true,
        foundColumn6ObjectiveVp: [...best].reduce((sum, [hex, column]) => sum + (column >= 6 ? objectivePoints.get(hex) : 0), 0),
        meanFoundObjectiveColumn: ratio([...best.values()].reduce((sum, x) => sum + x, 0), best.size),
        bestSearchTruncated: Number(candidates.truncated),
        targetColumns: Object.fromEntries(best), revision: state.revision,
      };
    }
    if (observed && action.kind === 'DECLARE_COMBAT') {
      const count = counts[action.actorId];
      if (action.combatKind === 'REGULAR') count.regularAttacks++;
      if (objectivePoints.has(action.targetHexId)) {
        const explanation = m.ruleEngine.explain(state, action);
        assert(explanation.allowed);
        const forecast = m.forecastCombat(explanation.facts);
        assert(forecast);
        count.objectiveAttacks++;
        count.objectiveColumnSum += forecast.columnIndex;
        count.objectiveSupplyRequirementTokens += forecast.supplyTokens;
        assert.equal(pending, null, 'one pending combat');
        pending = { actor: action.actorId, target: action.targetHexId, turn: gameTurn };
      } else count.otherAttacks++;
    }
    if (observed && action.kind === 'DECLARE_BARRAGE') counts[action.actorId].barrages++;
    const before = state;
    const applied = m.ruleEngine.applyAction(state, action);
    assert(applied.ok, `replay action accepted at ${state.revision}`);
    state = applied.state;
    observer?.after(before, action, applied);
    if (observed) {
      for (const objective of objectives) {
        const from = control(before, objective.hexId);
        const to = control(state, objective.hexId);
        if (from === to) continue;
        for (const id of players) {
          if (id !== from && id !== to) continue;
          const direction = id === to ? 'gained' : 'lost';
          counts[id][direction === 'gained' ? 'gainedVp' : 'lostVp'] += objective.points;
          const combat = pending?.target === objective.hexId && pending.actor === id;
          if (direction === 'gained' && action.kind === 'MOVE_PIECE') counts[id].moveGainedVp += objective.points;
          if (direction === 'gained' && combat) counts[id].combatGainedVp += objective.points;
          histories[id].find((o) => o.hexId === objective.hexId).events.push({
            revision: state.revision, turn: gameTurn, direction, actionKind: action.kind, combat,
          });
        }
      }
      if (pending && state.activeTransaction === null && state.pendingDecision === null) {
        const count = counts[pending.actor];
        count.objectiveResolved++;
        if (control(state, pending.target) === pending.actor) count.objectiveCaptured++;
        if (!state.pieceState.pieces.some((p) => p.ownerId !== pending.actor && p.location.kind === 'ON_MAP'
          && p.location.hexId === pending.target && m.isOnMapCombatUnit(state, p))) count.objectiveCleared++;
        pending = null;
      }
      if (state.sequence.gameTurn > cutoffTurn) {
        assert.equal(pending, null);
        cutoff = state;
      }
    }
  }
  assert(cutoff, 'cutoff reached');
  assert.equal(state.sequence.phase, 'COMPLETE');
  const finalHash = await m.hashGameState(state);
  assert(finalHash.ok);
  assert.equal(finalHash.value, record.finalStateHash);
  assert.equal(finalHash.value, save.finalStateHash);
  const advancedSides = observer?.finish(cutoff, state);
  const sides = {};
  for (const id of players) {
    const other = players.find((p) => p !== id);
    const own = onMapCombat(cutoff, id);
    const enemy = onMapCombat(cutoff, other);
    const enemyHexSet = new Set(enemy.map((p) => String(p.location.hexId)));
    const totalStrength = own.reduce((sum, p) => sum + strength(p), 0);
    const unowned = objectives.filter((o) => control(cutoff, o.hexId) !== id);
    let bestObjectiveEffectiveColumn = -1;
    let bestFocalOwn2 = -1;
    let bestFocalPoints = -1;
    let localForceRatioAt2Hex = 0;
    for (const o of unowned) {
      const objHex = String(o.hexId);
      const nearOwn = own.filter((p) => p.mode !== 'STRAT' && m.hexDistanceBetween(p.location.hexId, objHex) <= 2);
      const nearOwnSupplied = nearOwn.filter((p) => !p.statuses?.some((s) => s.statusDefinitionId === 'status:out-of-supply'));
      const own2Strength = nearOwnSupplied.reduce((sum, p) => sum + strength(p), 0);
      const enemy2Strength = enemy.filter((p) => m.hexDistanceBetween(p.location.hexId, objHex) <= 2)
        .reduce((sum, p) => sum + strength(p), 0);
      if (own2Strength > bestFocalOwn2 || (own2Strength === bestFocalOwn2 && o.points > bestFocalPoints)) {
        bestFocalOwn2 = own2Strength;
        bestFocalPoints = o.points;
        localForceRatioAt2Hex = own2Strength > 0 ? Number((own2Strength / Math.max(1, enemy2Strength)).toFixed(6)) : 0;
      }
      if (nearOwn.length > 0 && typeof m.calculateCombatOdds === 'function') {
        const defenders = enemy.filter((p) => String(p.location.hexId) === objHex);
        if (defenders.length === 0) {
          bestObjectiveEffectiveColumn = Math.max(bestObjectiveEffectiveColumn, 12);
        } else {
          const adjHexes = m.adjacentHexIds(objHex).map(String).filter((hexId) => !enemyHexSet.has(hexId));
          if (adjHexes.length > 0) {
            const nearIds = new Set(nearOwn.map((p) => p.id));
            const projectedPieces = cutoff.pieceState.pieces.map((piece) => {
              if (!nearIds.has(piece.id)) return piece;
              const curHex = String(piece.location.hexId);
              const targetAdj = m.hexDistanceBetween(curHex, objHex) === 1 ? curHex
                : [...adjHexes].sort((a, b) => m.hexDistanceBetween(curHex, a) - m.hexDistanceBetween(curHex, b))[0];
              return { ...piece, currentFaceId: 'combat', location: { ...piece.location, hexId: targetAdj } };
            });
            const projectedState = { ...cutoff, pieceState: { ...cutoff.pieceState, pieces: projectedPieces } };
            const odds = m.calculateCombatOdds(projectedState, nearOwn.map((p) => p.id), defenders.map((p) => p.id), objHex, defenders.map((p) => p.id), null, null);
            bestObjectiveEffectiveColumn = Math.max(bestObjectiveEffectiveColumn, odds.columnIndex);
          }
        }
      }
    }
    const count = counts[id];
    const r = readiness[id] ?? { observed: false, reason: 'no sampled COMBAT:COMBAT window at cutoff turn',
      foundColumn6ObjectiveVp: null, meanFoundObjectiveColumn: null, bestSearchTruncated: null, targetColumns: {}, revision: null };
    const held = vp(cutoff, id);
    const occupiedHeldVp = objectives.filter((o) => control(cutoff, o.hexId) === id
      && own.some((p) => p.location.hexId === o.hexId)).reduce((sum, o) => sum + o.points, 0);
    assert.equal(vp(state, id), record.sides[sideOf(id)].vp);
    assert.equal(held - vp(initial, id), count.gainedVp - count.lostVp, 'control events reconcile');
    const metrics = {
      earlyMargin: held - vp(cutoff, other),
      gainedVp: count.gainedVp, lostVp: count.lostVp, moveGainedVp: count.moveGainedVp, combatGainedVp: count.combatGainedVp,
      objectiveAttacks: count.objectiveAttacks, otherAttacks: count.otherAttacks,
      regularAttacks: count.regularAttacks, barrages: count.barrages, objectiveSupplyRequirementTokens: count.objectiveSupplyRequirementTokens,
      objectiveAttackMeanColumn: ratio(count.objectiveColumnSum, count.objectiveAttacks),
      objectiveAttackCaptureRate: ratio(count.objectiveCaptured, count.objectiveResolved),
      objectiveAttackClearRate: ratio(count.objectiveCleared, count.objectiveResolved),
      adjacentStrengthShare: ratio(own.filter((p) => unowned.some((o) => m.hexDistanceBetween(p.location.hexId, o.hexId) === 1))
        .reduce((sum, p) => sum + strength(p), 0), totalStrength),
      bestObjectiveEffectiveColumn: bestObjectiveEffectiveColumn >= 0 ? bestObjectiveEffectiveColumn : null,
      localForceRatioAt2Hex,
      occupiedHeldVpShare: ratio(occupiedHeldVp, held),
      occupiedHeldVp, unoccupiedHeldVp: held - occupiedHeldVp,
      outOfSupplyStrengthShare: ratio(own.filter((p) => p.statuses.some((s) => s.statusDefinitionId === 'status:out-of-supply'))
        .reduce((sum, p) => sum + strength(p), 0), totalStrength),
      foundColumn6ObjectiveVp: r.foundColumn6ObjectiveVp, meanFoundObjectiveColumn: r.meanFoundObjectiveColumn,
      bestSearchTruncated: r.bestSearchTruncated,
    };
    sides[sideOf(id)] = { role: initial.configuration.attackVictory?.attackerId === id ? 'ATTACKER' : 'DEFENDER',
      ...(advancedSides ? { advanced: advancedSides[sideOf(id)] } : {}),
      metrics, finalMargin: vp(state, id) - vp(state, other), readiness: r, counts: count,
      objectives: histories[id].map((o) => ({ ...o, heldAtCutoff: control(cutoff, o.hexId) === id,
        heldAtEnd: control(state, o.hexId) === id })) };
  }
  const candidateSides = Object.entries(record.sides).filter(([, info]) => !info.policy.includes('@'));
  assert(candidateSides.length <= 1);
  games.push({ match: record.match, seeds: record.seeds, initialHash: initialHash.value, finalHash: finalHash.value,
    replayOk: true, candidateSide: candidateSides[0]?.[0] ?? null, cutoffRevision: cutoff.revision,
    saveHash: hash(saveText), traceHash: hash(traceText), policies: record.sides, sides });
  console.log(`${variant} ${summary.options.style} ${record.match}: hash and VP verified`);
}
const output = resolve(option('--out'));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ schemaVersion: 1, ...(advanced ? { advanced: true } : {}), variant, directory, style: summary.options.style,
  cutoffTurn, engine, engineHash, summaryHash: hash(readFileSync(join(directory, 'summary.json'))),
  elapsedMs: Date.now() - started, games }, null, 2) + '\n');
