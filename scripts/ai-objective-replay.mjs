#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FEATURE_KEYS = ['occupied', 'nearestP', 'ownAbsent', 'nearestO', 'opponentAbsent', 'points',
  'turnFraction', 'attackerMoving', 'defenderMoving', 'logRatio', 'zeroEnemyStrength', 'column',
  'supplyColumnGain', 'drm', 'hedgehog', 'noAdjacent', 'undefended', 'lineClose', 'lineVeryClose', 'lineExtremelyClose'];
const OBJECTIVE_TOTALS = ['objectivesGained', 'objectivesLost', 'objectiveVpGained', 'objectiveVpLost'];
const LINES = ['OPEN', 'CLOSE', 'VERY_CLOSE', 'EXTREMELY_CLOSE'];
export const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const digest = (value) => sha256(canonical(value));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const jsonLines = (path) => readFileSync(path, 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
};
const holder = (state, hexId) => state.mapState.hexControl.find((entry) => String(entry.hexId) === String(hexId))?.controllerId ?? null;
const turnKey = (state) => `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}`;
const stepKey = (state) => `${turnKey(state)}:${state.sequence.phase}:${state.sequence.segment}`;
const resolveInput = (root, path) => isAbsolute(path) ? path : resolve(root, path);
const roleOf = (state) => !state.configuration.attackVictory?.attackerId ? 'meeting'
  : state.configuration.attackVictory.attackerId === state.sequence.phasingPlayerId ? 'attacker-moving' : 'defender-moving';

export async function loadEngine(directory) {
  const load = (file) => import(pathToFileURL(join(directory, file)).href);
  const [m, pieces, strength, combat] = await Promise.all([
    load('index.js'), load('rules/pieces.js'), load('rules/combat/strength.js'), load('rules/combat/combat.js'),
  ]);
  assert.deepEqual(Object.keys(m.COMBAT_TABLE_COLUMNS).sort(), [...LINES].sort(), 'unmodelled CRT line');
  for (const line of LINES) assert.equal(m.COMBAT_TABLE_COLUMNS[line].length, 13, `${line} CRT columns`);
  return { m, pieces, strength, combat };
}

function engineDigest(directory) {
  const files = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.name.endsWith('.js')) files.push([relative(directory, child), sha256(readFileSync(child))]);
    }
  };
  visit(directory);
  files.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return sha256(files.map(([path, hash]) => `${path}\t${hash}`).join('\n'));
}

export async function immutableProbe(state, query) {
  const before = digest(state);
  const result = await query();
  assert.equal(digest(state), before, 'observer query mutated the state');
  return result;
}

export function snapshotTargets(engine, state, role = roleOf(state)) {
  assert.notEqual(state.pendingDecision?.kind, 'FIRST_PLAYER', 'turn order unresolved');
  const { m, pieces, strength } = engine;
  const phasing = state.sequence.phasingPlayerId;
  const players = state.scenario.players.map(({ id }) => id);
  assert.equal(players.length, 2, 'two-player target accounting required');
  const other = players.find((id) => id !== phasing);
  const combat = state.pieceState.pieces.filter((piece) => m.isOnMapCombatUnit(state, piece));
  const own = combat.filter((piece) => piece.ownerId === phasing);
  const enemy = combat.filter((piece) => piece.ownerId === other);
  const eligible = (piece) => !pieces.isHq(state, piece) && piece.mode !== 'STRAT';
  const printed = (piece) => strength.baseStrength(state, piece);
  const member = (piece) => ({ pieceId: piece.id, hexId: piece.location.hexId, currentFaceId: piece.currentFaceId,
    remainingSteps: piece.remainingSteps, mode: piece.mode, outOfSupply: pieces.isOutOfSupply(piece),
    printedStrength: printed(piece), combatActionRating: strength.combatActionRating(state, piece) });
  const leader = (members) => {
    const selected = [...members].sort((a, b) => strength.combatActionRating(state, b) - strength.combatActionRating(state, a)
      || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0))[0];
    assert(selected?.id != null, 'computed formation has no explicit leader');
    assert(Number.isFinite(strength.combatActionRating(state, selected)), 'leader AR missing');
    return { pieceId: selected.id, actionRating: strength.combatActionRating(state, selected) };
  };
  const distance = (piece, hexId) => m.hexDistanceBetween(piece.location.hexId, hexId);
  assert.equal(new Set(state.configuration.objectives.map(({ hexId }) => String(hexId))).size,
    state.configuration.objectives.length, 'duplicate objective hex IDs');
  return state.configuration.objectives.map(({ hexId, points }) => {
    const ratioOwn = own.filter((piece) => eligible(piece) && !pieces.isOutOfSupply(piece) && distance(piece, hexId) <= 2);
    const ratioEnemy = enemy.filter((piece) => distance(piece, hexId) <= 2);
    const ownStrength = ratioOwn.reduce((sum, piece) => sum + printed(piece), 0);
    const enemyStrength = ratioEnemy.reduce((sum, piece) => sum + printed(piece), 0);
    const attackers = own.filter((piece) => eligible(piece) && distance(piece, hexId) === 1);
    const defenders = enemy.filter((piece) => distance(piece, hexId) === 0);
    let conditional = { kind: defenders.length === 0 ? 'undefended' : 'noAdjacentFormation',
      attackers: attackers.map(member), defenders: defenders.map(member) };
    let supplied = null; let unsupplied = null;
    if (defenders.length && attackers.length) {
      const attackerLeader = leader(attackers); const defenderLeader = leader(defenders);
      const attackerIds = attackers.map(({ id }) => id); const defenderIds = defenders.map(({ id }) => id);
      supplied = strength.calculateCombatOdds(state, attackerIds, defenderIds, hexId, defenderIds, attackerLeader.pieceId, defenderLeader.pieceId);
      unsupplied = strength.calculateCombatOdds(state, attackerIds, defenderIds, hexId, [], attackerLeader.pieceId, defenderLeader.pieceId);
      assert(LINES.includes(supplied.line) && LINES.includes(unsupplied.line), 'unmodelled conditional line');
      assert.equal(supplied.leadAttackerRating, attackerLeader.actionRating);
      assert.equal(supplied.leadDefenderRating, defenderLeader.actionRating);
      conditional = { kind: 'computed', attackers: attackers.map(member), defenders: defenders.map(member),
        attackerLeader, defenderLeader, supplied, unsupplied };
    }
    const features = {
      occupied: Number(defenders.length > 0), nearestP: Math.min(10, ...own.map((piece) => distance(piece, hexId))),
      ownAbsent: Number(own.length === 0), nearestO: Math.min(10, ...enemy.map((piece) => distance(piece, hexId))),
      opponentAbsent: Number(enemy.length === 0), points, turnFraction: state.sequence.gameTurn / state.configuration.turnLimit,
      attackerMoving: Number(role === 'attacker-moving'), defenderMoving: Number(role === 'defender-moving'),
      logRatio: Math.log1p(ownStrength / Math.max(1, enemyStrength)), zeroEnemyStrength: Number(enemyStrength === 0),
      column: supplied ? supplied.columnIndex / 12 : null,
      supplyColumnGain: supplied ? (unsupplied.columnIndex - supplied.columnIndex) / 12 : null,
      drm: supplied?.drm ?? null, hedgehog: supplied?.hedgehogLevel ?? null,
      noAdjacent: Number(conditional.kind === 'noAdjacentFormation'), undefended: Number(conditional.kind === 'undefended'),
      lineClose: Number(supplied?.line === 'CLOSE'), lineVeryClose: Number(supplied?.line === 'VERY_CLOSE'),
      lineExtremelyClose: Number(supplied?.line === 'EXTREMELY_CLOSE'),
    };
    assert.deepEqual(Object.keys(features), FEATURE_KEYS);
    for (const [key, value] of Object.entries(features)) assert(value === null && ['column', 'supplyColumnGain', 'drm', 'hedgehog'].includes(key)
      || Number.isFinite(value), `nonfinite feature ${key}`);
    return { hexId, points, initialHolder: holder(state, hexId), endHolder: null, features: deepFreeze(features),
      conditions: deepFreeze({ ratio: { own: ratioOwn.map(member), enemy: ratioEnemy.map(member), ownStrength, enemyStrength }, combat: conditional }),
      controlEvents: [], labels: null };
  });
}

export function observeControls(targets, before, after, action, actionIndex) {
  for (const target of targets) {
    const from = holder(before, target.hexId); const to = holder(after, target.hexId);
    if (from !== to) target.controlEvents.push({ actionIndex, revision: after.revision, from, to, actionKind: action.kind });
  }
}

export function reconcileTargets(targets, endState, players, phasing, expectedTurn) {
  const totals = Object.fromEntries(players.map((id) => [id, { ...Object.fromEntries(OBJECTIVE_TOTALS.map((key) => [key, 0])),
    startVp: 0, endVp: 0, signedVpDelta: 0, recaptures: 0 }]));
  for (const target of targets) {
    target.endHolder = holder(endState, target.hexId);
    let previous = target.initialHolder;
    for (const event of target.controlEvents) {
      assert.equal(event.from, previous, `broken control history ${target.hexId}`);
      assert.notEqual(event.from, event.to, 'spurious control event');
      previous = event.to;
    }
    assert.equal(previous, target.endHolder, `control history endpoint ${target.hexId}`);
    target.labels = { everCaptured: target.controlEvents.some(({ to }) => to === phasing), retainedCapture: target.endHolder === phasing };
    for (const id of players) {
      const entry = totals[id];
      if (target.initialHolder === id) entry.startVp += target.points;
      if (target.endHolder === id) entry.endVp += target.points;
      let previouslyHeld = target.initialHolder === id;
      for (const event of target.controlEvents) {
        if (event.to === id) {
          entry.objectivesGained += 1; entry.objectiveVpGained += target.points;
          if (previouslyHeld) entry.recaptures += 1;
          previouslyHeld = true;
        }
        if (event.from === id) { entry.objectivesLost += 1; entry.objectiveVpLost += target.points; }
      }
    }
  }
  for (const id of players) {
    const entry = totals[id]; entry.signedVpDelta = entry.endVp - entry.startVp;
    assert.equal(entry.objectiveVpGained - entry.objectiveVpLost, entry.signedVpDelta, `signed VP mismatch ${id}`);
    for (const key of OBJECTIVE_TOTALS) assert.equal(entry[key], expectedTurn[id]?.[key], `gross accounting mismatch ${id} ${key}`);
  }
  return { players: totals, grossMatchesExpectedTurn: true, signedMatchesEndpoints: true };
}

export function windowFromSource(row, traces, gameId) {
  const key = `${row.gameTurn}:${row.playerTurnIndex}`;
  const actions = traces.filter((trace) => trace.stepKey.split(':').slice(0, 2).join(':') === key);
  assert(actions.length > 0, `source window has no actions ${key}`);
  const first = actions[0];
  const phase = first.stepKey.split(':')[2];
  let phasingPlayerId = row.phasingPlayerId;
  let firstPlayerDecision = null;
  let expectedStartRevision = first.revision;
  if (phase === 'FIRST_PLAYER' && first.action.kind === 'RESPOND_DECISION') {
    assert.equal(first.action.actorId, row.phasingPlayerId, 'recorded first-player chooser mismatch');
    assert(['first', 'second'].includes(first.action.choiceId), 'unknown first-player choice');
    assert(actions.length > 1, 'no action after first-player decision');
    firstPlayerDecision = { chooserId: first.action.actorId, choiceId: first.action.choiceId,
      revision: first.revision, actionIndex: first.ordinal };
    if (first.action.choiceId === 'second') phasingPlayerId = Object.keys(row.turn).find((id) => id !== first.action.actorId);
    expectedStartRevision = actions[1].revision;
  }
  const roleFor = (player) => row.attackerId == null ? 'meeting' : row.attackerId === player ? 'attacker-moving' : 'defender-moving';
  return { id: `${gameId}:${key}`, gameTurn: row.gameTurn, playerTurnIndex: row.playerTurnIndex,
    phasingPlayerId, role: roleFor(phasingPlayerId), recordedPhasingPlayerId: row.phasingPlayerId,
    recordedRole: roleFor(row.phasingPlayerId), recordedStartRevision: first.revision,
    expectedStartRevision, firstPlayerDecision, expectedTurn: row.turn };
}

function verifyAliases(game, artifactRoot) {
  assert(game.aliases.length > 0, 'missing aliases');
  let canonicalSave = null;
  const audits = []; const aliasSnapshots = [];
  const expected = game.expectedWindows;
  assert(Array.isArray(expected) && expected.length > 0, 'missing expectedWindows');
  assert.equal(new Set(expected.map(({ id }) => id)).size, expected.length, 'duplicate window IDs');
  for (const alias of game.aliases) {
    const source = resolveInput(artifactRoot, alias.source);
    const savePath = join(source, `match-${alias.match}.save.json`);
    const tracePath = join(source, `match-${alias.match}.trace.jsonl`);
    const rowsPath = resolveInput(artifactRoot, alias.file);
    const rawSave = readFileSync(savePath); const save = JSON.parse(rawSave);
    aliasSnapshots.push({ initial: save.initialSnapshot, final: save.currentSnapshot });
    assert.equal(sha256(rawSave), alias.saveSha256, `save hash ${savePath}`);
    assert.equal(digest(save.acceptedActions), alias.acceptedActionsSha256, `action hash ${savePath}`);
    assert.equal(save.initialStateHash, alias.initialStateHash); assert.equal(save.finalStateHash, alias.finalStateHash);
    assert.equal(digest([save.initialStateHash, save.finalStateHash, alias.acceptedActionsSha256]), game.id, 'trajectory identity');
    assert.equal(alias.seeds.map, game.mapSeed, 'map seed identity');
    const records = readJson(join(source, 'summary.json')).records.filter(({ match }) => match === alias.match);
    assert.equal(records.length, 1, 'ambiguous source summary');
    const record = records[0];
    assert.equal(record.stopReason, 'FINISHED'); assert.equal(record.errors.length, 0);
    assert.equal(record.accepted, save.acceptedActions.length); assert.equal(record.finalStateHash, save.finalStateHash);
    const rows = jsonLines(rowsPath).filter(({ match }) => match === alias.match).sort((a, b) => a.gameTurn - b.gameTurn || a.playerTurnIndex - b.playerTurnIndex);
    assert(rows.length > 1, 'source rows missing');
    const traces = jsonLines(tracePath).filter(({ status }) => status === 'ACCEPTED');
    const eligible = rows.slice(0, -1).filter(({ gameTurn }) => gameTurn >= 2)
      .map((row) => windowFromSource(row, traces, game.id));
    assert.deepEqual(expected, eligible, 'worklist/source eligible windows disagree');
    assert.equal(traces.length, save.acceptedActions.length, 'accepted trace count');
    for (let index = 0; index < traces.length; index += 1) {
      assert.deepEqual(traces[index].action, save.acceptedActions[index], `trace action ${index}`);
      assert.equal(traces[index].ordinal, index, `trace ordinal ${index}`);
    }
    if (canonicalSave) assert.equal(digest(save.acceptedActions), digest(canonicalSave.save.acceptedActions), 'alias action identity');
    else canonicalSave = { save, traces };
    audits.push({ ...alias, traceSha256: sha256(readFileSync(tracePath)), rowsSha256: sha256(readFileSync(rowsPath)),
      summarySha256: sha256(readFileSync(join(source, 'summary.json'))), traces });
  }
  return { ...canonicalSave, audits, aliasSnapshots };
}

async function replayGame(engine, game, artifactRoot) {
  const { m, combat } = engine;
  const { save, audits, aliasSnapshots } = verifyAliases(game, artifactRoot);
  const parse = (snapshot) => { const parsed = m.parseGameStateJson(snapshot); assert(parsed.ok, 'snapshot parse failed'); return parsed.value; };
  let state = parse(save.initialSnapshot); let control = parse(save.initialSnapshot);
  const stateHash = async (current) => { const result = await m.hashGameState(current); assert(result.ok); return result.value; };
  assert.equal(await stateHash(state), save.initialStateHash, 'initial state hash');
  for (const snapshots of aliasSnapshots) {
    assert.equal(await stateHash(parse(snapshots.initial)), save.initialStateHash, 'alias initial snapshot identity');
    assert.equal(await stateHash(parse(snapshots.final)), save.finalStateHash, 'alias final snapshot identity');
  }
  const players = state.scenario.players.map(({ id }) => id);
  const expected = new Map(game.expectedWindows.map((window) => [`${window.gameTurn}:${window.playerTurnIndex}`, window]));
  const windows = []; let active = null; let boundary = null;
  let observerQueries = 0; let checkedActions = 0;
  const close = async () => {
    if (!active) return;
    active.endRevision = state.revision; active.endStateHash = await stateHash(state);
    active.reconciliation = reconcileTargets(active.targets, state, players, active.phasingPlayerId, expected.get(boundary).expectedTurn);
    windows.push(active); active = null;
  };
  for (let index = 0; index < save.acceptedActions.length; index += 1) {
    const action = save.acceptedActions[index];
    if (turnKey(state) !== boundary) {
      await close(); boundary = turnKey(state);
    }
    const wanted = expected.get(boundary);
    if (!active && wanted && state.pendingDecision?.kind !== 'FIRST_PLAYER') {
        assert.equal(state.sequence.phasingPlayerId, wanted.phasingPlayerId); assert.equal(roleOf(state), wanted.role);
        assert.equal(state.revision, wanted.expectedStartRevision, 'snapshot must follow first-player choice');
        const targets = await immutableProbe(state, () => snapshotTargets(engine, state, wanted.role)); observerQueries += 1;
        active = { id: wanted.id, gameTurn: wanted.gameTurn, playerTurnIndex: wanted.playerTurnIndex,
          role: wanted.role, phasingPlayerId: wanted.phasingPlayerId, otherPlayerId: players.find((id) => id !== wanted.phasingPlayerId),
          recordedPhasingPlayerId: wanted.recordedPhasingPlayerId, recordedRole: wanted.recordedRole,
          recordedStartRevision: wanted.recordedStartRevision, firstPlayerDecision: wanted.firstPlayerDecision,
          startSequence: { ...state.sequence },
          startRevision: state.revision, endRevision: null, startStateHash: await stateHash(state), endStateHash: null,
          targets, declarations: [], reconciliation: null };
    }
    if (active) assert.equal(state.sequence.phasingPlayerId, active.phasingPlayerId, 'phasing player changed within observed turn');
    for (const audit of audits) {
      assert.equal(audit.traces[index].revision, state.revision, `trace revision ${index}`);
      assert.equal(audit.traces[index].stepKey, stepKey(state), `trace step key ${index}`);
    }
    assert.equal(action.expectedRevision, state.revision, `action revision ${index}`);
    if (active && action.kind === 'DECLARE_COMBAT' && active.targets.some(({ hexId }) => hexId === action.targetHexId)) {
      const witness = await immutableProbe(state, () => ({ explain: m.ruleEngine.explain(state, action),
        forecast: combat.previewCombat(state, action.actorId, action.attackerIds, action.targetHexId, action.leadAttackerId, action.attackerSupply) }));
      observerQueries += 1;
      assert.equal(witness.explain.allowed, true, 'accepted declaration explanation rejected');
      active.declarations.push({ hexId: action.targetHexId, actionIndex: index, revision: state.revision, action, ...witness });
    }
    const before = state;
    const observed = m.ruleEngine.applyAction(state, action); const plain = m.ruleEngine.applyAction(control, action);
    assert.equal(observed.ok, plain.ok, `observer acceptance equivalence ${index}`);
    assert(observed.ok, `replay rejected ${index} ${action.kind}`);
    assert.equal(digest(observed.events), digest(plain.events), `observer events equivalence ${index}`);
    assert.equal(await stateHash(observed.state), await stateHash(plain.state), `observer state equivalence ${index}`);
    state = observed.state; control = plain.state; checkedActions += 1;
    if (active) observeControls(active.targets, before, state, action, index);
  }
  await close();
  assert.equal(await stateHash(state), save.finalStateHash, 'final state hash');
  assert.equal(await stateHash(parse(save.currentSnapshot)), save.finalStateHash, 'saved final snapshot hash');
  assert.deepEqual(windows.map(({ id }) => id), game.expectedWindows.map(({ id }) => id), 'expected window coverage');
  return { id: game.id, mapSeed: game.mapSeed, aliases: audits.map(({ traces, ...audit }) => audit),
    replay: { initialStateHash: save.initialStateHash, finalStateHash: save.finalStateHash, acceptedActions: checkedActions,
      traceAliasesVerified: audits.length, observerQueries, observerStateAndEventEquivalence: true, windowCoverage: true,
      turnOwnerStable: true, deferredFirstPlayerWindows: windows.filter((window) => window.firstPlayerDecision).length,
      correctedTurnOwnerWindows: windows.filter((window) => window.phasingPlayerId !== window.recordedPhasingPlayerId).length }, windows };
}

export async function extract(inputPath, engineDirectory, outputPath) {
  const inputRaw = readFileSync(inputPath); const worklist = JSON.parse(inputRaw);
  assert.equal(worklist.schemaVersion, 2); assert(isAbsolute(worklist.artifactRoot), 'artifactRoot must be absolute');
  assert(Array.isArray(worklist.games) && worklist.games.length, 'games missing');
  assert.equal(new Set(worklist.games.map(({ id }) => id)).size, worklist.games.length, 'duplicate trajectory IDs');
  const engine = await loadEngine(engineDirectory);
  const result = { schemaVersion: 2, provenance: { inputSha256: sha256(inputRaw), engineSha256: engineDigest(engineDirectory),
    extractorSha256: sha256(readFileSync(fileURLToPath(import.meta.url))) }, games: [] };
  for (const game of worklist.games) result.games.push(await replayGame(engine, game, worklist.artifactRoot));
  mkdirSync(dirname(outputPath), { recursive: true }); writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => { const index = args.indexOf(name); assert(index >= 0 && args[index + 1], `${name} required`); return resolve(args[index + 1]); };
  const started = performance.now();
  const output = option('--out'); const result = await extract(option('--input'), option('--engine'), output);
  console.log(JSON.stringify({ out: output, games: result.games.length, windows: result.games.reduce((n, game) => n + game.windows.length, 0),
    targets: result.games.flatMap((game) => game.windows).reduce((n, window) => n + window.targets.length, 0) }));
  console.error(JSON.stringify({ extractionElapsedMs: performance.now() - started }));
}
