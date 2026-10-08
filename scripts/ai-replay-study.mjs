#!/usr/bin/env node
// Replays saved ai-match games and explains how each side won or lost (M9 strategy study). Build first: `npm run build`.
//
//   node scripts/ai-replay-study.mjs tmp/ai-match/final2-hvh tmp/ai-match/final2 [--out tmp/replay-study]
//
// Reads summary.json and match-<n>.save.json from each directory (ai-match runs without --no-replay), replays every
// accepted action with the Rule Engine and records, per side: Victory Points at each player turn, every objective
// that changed hands (how, and whether it was empty), step losses by cause, units out of supply, attacks and their
// results, and combat units that never moved. Writes study.json and study.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const out = outIndex >= 0 ? argv[outIndex + 1] : join('tmp', 'replay-study');
const dirs = argv.filter((_, index) => index !== outIndex && index !== outIndex + 1);
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const OOS = 'status:out-of-supply';
const sideOf = (playerId) => (String(playerId).endsWith('axis') ? 'axis' : 'allied');

/** Each unit's moves with the bot's stated purpose, from an ai-match --trace file: pieceId → [{ revision, purpose }]. */
const purposesFrom = (tracePath) => {
  const moves = new Map();
  if (!existsSync(tracePath)) return moves;
  for (const line of readFileSync(tracePath, 'utf8').split('\n')) {
    if (!line) continue;
    const trace = JSON.parse(line);
    if (trace.status !== 'ACCEPTED' || trace.action.kind !== 'MOVE_PIECE') continue;
    const purpose = /\((capture|garrison|hunt|front|resupply) /u.exec(trace.intent)?.[1] ?? trace.intent.split(' ')[0];
    const list = moves.get(String(trace.action.pieceId)) ?? [];
    list.push({ revision: trace.revision, purpose });
    moves.set(String(trace.action.pieceId), list);
  }
  return moves;
};

const studyGame = (record, save, purposes = new Map()) => {
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const objectives = state.configuration.objectives;
  const players = state.scenario.players.map(({ id }) => id);
  const control = (current, hexId) => current.mapState.hexControl.find((entry) => entry.hexId === hexId)?.controllerId ?? null;
  const roles = new Map();
  const refreshRoles = (current) => {
    for (const player of players) {
      for (const stack of m.ruleEngine.projectForViewer(current, player).stacks) {
        for (const piece of stack.pieces) if (piece.ownerId === player) roles.set(String(piece.id), piece.role);
      }
    }
  };
  refreshRoles(state);
  const sides = Object.fromEntries(players.map((player) => [sideOf(player), {
    policy: record.sides?.[sideOf(player)]?.policy ?? '?', vpTimeline: [], flipsGained: [], flipsLost: [], losses: {}, oosUnitTurns: 0,
    attacks: { declared: 0, regular: 0, overrun: 0, barrage: 0, results: {} }, neverMoved: 0, startSteps: 0, endSteps: 0,
  }]));
  const combatSteps = (current, player) => current.pieceState.pieces
    .filter((piece) => piece.ownerId === player && piece.location.kind === 'ON_MAP' && roles.get(String(piece.id)) === 'COMBAT')
    .reduce((total, piece) => total + (piece.remainingSteps ?? 0), 0);
  for (const player of players) sides[sideOf(player)].startSteps = combatSteps(state, player);
  const moved = new Set();
  const heldFrom = new Map();
  let turnKey = '';
  const atTurnBoundary = (current) => {
    const key = `${current.sequence.gameTurn}:${current.sequence.playerTurnIndex}`;
    if (key === turnKey) return;
    turnKey = key;
    refreshRoles(current);
    for (const player of players) {
      const side = sides[sideOf(player)];
      side.vpTimeline.push(objectives.reduce((total, objective) => total + (control(current, objective.hexId) === player ? objective.points : 0), 0));
      side.oosUnitTurns += current.pieceState.pieces.filter((piece) => piece.ownerId === player && piece.location.kind === 'ON_MAP'
        && roles.get(String(piece.id)) === 'COMBAT' && piece.statuses.some(({ statusDefinitionId }) => statusDefinitionId === OOS)).length;
    }
  };
  atTurnBoundary(state);
  for (const action of save.acceptedActions) {
    const before = state;
    const next = m.ruleEngine.applyAction(state, action);
    if (!next.ok) throw new Error(`replay rejected ${action.kind}`);
    state = next.state;
    const where = `T${before.sequence.gameTurn}.${before.sequence.playerTurnIndex} ${before.sequence.phase}`;
    // Objectives that changed hands with this action, and how.
    for (const objective of objectives) {
      const from = control(before, objective.hexId);
      const to = control(state, objective.hexId);
      if (from === to) continue;
      const defended = from !== null && before.pieceState.pieces.some((piece) => piece.ownerId === from && piece.location.kind === 'ON_MAP'
        && piece.location.hexId === objective.hexId && roles.get(String(piece.id)) === 'COMBAT');
      const how = action.kind === 'MOVE_PIECE' ? `moved through by ${roles.get(String(action.pieceId)) ?? 'unit'}`
        : before.activeTransaction ? `${before.activeTransaction.kind.toLowerCase()} advance` : action.kind.toLowerCase();
      // Context for the study: the loser's nearest combat unit, and whether the winner's unit stayed on the objective.
      const nearestDefender = from === null ? null : Math.min(...before.pieceState.pieces
        .filter((piece) => piece.ownerId === from && piece.location.kind === 'ON_MAP' && roles.get(String(piece.id)) === 'COMBAT')
        .map((piece) => m.hexDistanceBetween(piece.location.hexId, objective.hexId)));
      const stayed = action.kind === 'MOVE_PIECE' ? action.path.at(-1) === objective.hexId : true;
      const heldSince = heldFrom.get(objective.hexId) ?? null;
      heldFrom.set(objective.hexId, where);
      // An advance after combat enters a hex the defenders just left: it was defended until the attack, not empty.
      const flip = { where, hexId: objective.hexId, points: objective.points, how, wasEmpty: !defended && !how.endsWith('advance'), nearestDefender, stayed, heldSince };
      if (to !== null) sides[sideOf(to)].flipsGained.push(flip);
      if (from !== null) sides[sideOf(from)].flipsLost.push(flip);
    }
    // Step losses and their causes.
    const transaction = before.activeTransaction ?? state.activeTransaction;
    for (const event of next.events) {
      if (event.kind === 'PIECE_MOVED') moved.add(String(event.pieceId));
      if (event.kind === 'TRANSACTION_DECLARED') {
        const declared = state.activeTransaction;
        if (declared) {
          const side = sides[sideOf(declared.ownerId)];
          side.attacks.declared += 1;
          side.attacks[declared.kind === 'COMBAT' ? 'regular' : declared.kind === 'OVERRUN' ? 'overrun' : 'barrage'] += 1;
        }
      }
      if (event.kind === 'TRANSACTION_RESOLVED' && before.activeTransaction && before.activeTransaction.kind !== 'BARRAGE') {
        // The defender's view of each ground combat: how big the defending stack was and whether friends were near.
        const tx = before.activeTransaction;
        const defender = sides[sideOf(tx.defenderOwnerId)];
        const neighbours = before.pieceState.pieces.filter((piece) => piece.ownerId === tx.defenderOwnerId && piece.location.kind === 'ON_MAP'
          && roles.get(String(piece.id)) === 'COMBAT' && m.hexDistanceBetween(piece.location.hexId, tx.targetHexId) === 1).length;
        defender.defended = defender.defended ?? [];
        const defenders = before.pieceState.pieces.filter((piece) => tx.defenderIds.includes(piece.id));
        // What the defenders were doing: the purpose of each one's last move before this combat, or that it had not moved.
        const lastPurpose = (pieceId) => (purposes.get(String(pieceId)) ?? []).filter(({ revision }) => revision < before.revision).at(-1)?.purpose ?? 'never moved';
        const friends = before.pieceState.pieces.filter((piece) => piece.ownerId === tx.defenderOwnerId && piece.location.kind === 'ON_MAP'
          && roles.get(String(piece.id)) === 'COMBAT');
        const within = (radius) => friends.filter((piece) => m.hexDistanceBetween(piece.location.hexId, tx.targetHexId) <= radius).length;
        defender.defended.push({ where, hexId: tx.targetHexId, kind: tx.kind, result: event.result, defenders: tx.defenderIds.length,
          attackers: tx.attackerIds.length, neighbours, onObjective: objectives.some(({ hexId }) => hexId === tx.targetHexId),
          purposes: defenders.map((piece) => lastPurpose(piece.id)), modes: defenders.map((piece) => piece.mode),
          roles: defenders.map((piece) => roles.get(String(piece.id)) ?? '?'), friendsWithin3: within(3) - defenders.length });
      }
      if (event.kind === 'TRANSACTION_RESOLVED' && before.activeTransaction) {
        const side = sides[sideOf(before.activeTransaction.ownerId)];
        const key = `${before.activeTransaction.kind.toLowerCase()} ${event.result}`;
        side.attacks.results[key] = (side.attacks.results[key] ?? 0) + 1;
      }
      if (event.kind !== 'STEP_LOST') continue;
      const piece = before.pieceState.pieces.find(({ id }) => id === event.pieceId) ?? state.pieceState.pieces.find(({ id }) => id === event.pieceId);
      if (!piece) continue;
      const pending = before.pendingDecision?.kind;
      const cause = pending === 'ATTRITION_LOSS' || next.events.some(({ kind }) => kind === 'ATTRITION_ROLLED') ? 'attrition (out of supply)'
        : pending === 'OVERSTACK_ELIMINATION' ? 'overstack'
          : transaction ? `${transaction.kind.toLowerCase()} ${transaction.ownerId === piece.ownerId ? 'attacking' : 'defending'}`
            : `other (${action.kind.toLowerCase()})`;
      const side = sides[sideOf(piece.ownerId)];
      side.losses[cause] = (side.losses[cause] ?? 0) + 1;
      if (cause.startsWith('attrition') && piece.location.kind === 'ON_MAP') {
        // Where attrition struck: distance to the owner's nearest dump or loaded truck, and to its nearest HQ.
        const hexId = piece.location.hexId;
        const near = (filter) => Math.min(99, ...before.pieceState.pieces.filter((other) => other.ownerId === piece.ownerId && other.location.kind === 'ON_MAP' && filter(other))
          .map((other) => m.hexDistanceBetween(other.location.hexId, hexId)));
        side.attrition = side.attrition ?? [];
        side.attrition.push({ where, hexId, pieceId: String(piece.id), role: roles.get(String(piece.id)) ?? '?', garrison: /Garrison/.test(state.scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)?.name ?? ''), onObjective: objectives.some((objective) => objective.hexId === hexId), nearestSupply: near((other) => ['DUMP', 'TRUCK'].includes(roles.get(String(other.id))) && (other.resourceQuantity ?? 1) > 0),
          nearestHq: near((other) => roles.get(String(other.id)) === 'HQ'), nearestEnemy: Math.min(99, ...before.pieceState.pieces
            .filter((other) => other.ownerId !== piece.ownerId && other.location.kind === 'ON_MAP' && roles.get(String(other.id)) !== 'DUMP')
            .map((other) => m.hexDistanceBetween(other.location.hexId, hexId))) });
      }
    }
    atTurnBoundary(state);
  }
  for (const player of players) {
    const side = sides[sideOf(player)];
    side.endSteps = combatSteps(state, player);
    side.neverMoved = state.pieceState.pieces.filter((piece) => piece.ownerId === player && roles.get(String(piece.id)) === 'COMBAT'
      && piece.location.kind === 'ON_MAP' && !moved.has(String(piece.id))).length;
  }
  return { match: record.match, winner: record.winner, style: record.summary?.mapStyle ?? null, engagement: record.summary?.engagement ?? 'MEETING', sides };
};

const games = [];
for (const dir of dirs) {
  const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  for (const record of summary.records) {
    const savePath = join(dir, `match-${record.match}.save.json`);
    if (!existsSync(savePath) || record.stopReason !== 'FINISHED') continue;
    games.push({ dir, ...studyGame(record, JSON.parse(readFileSync(savePath, 'utf8')), purposesFrom(join(dir, `match-${record.match}.trace.jsonl`))) });
  }
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'study.json'), `${JSON.stringify(games, null, 2)}\n`);

// Aggregate: every side of every game, grouped by its policy and the game's outcome for it.
const groups = new Map();
for (const game of games) {
  for (const [sideName, side] of Object.entries(game.sides)) {
    const outcome = game.winner === 'draw' ? 'draw' : game.winner === sideName ? 'won' : 'lost';
    // In an attack, a side's role matters as much as its policy.
    const attacker = game.engagement === 'ALLIED_ATTACKS' ? 'allied' : game.engagement === 'AXIS_ATTACKS' ? 'axis' : null;
    const key = `${side.policy}${attacker === null ? '' : attacker === sideName ? ' attacker' : ' defender'} ${outcome}`;
    const group = groups.get(key) ?? { sides: 0, losses: {}, lostEmpty: 0, lostDefended: 0, lostHow: {}, gained: 0, oos: 0, attacks: 0, neverMoved: 0, stepsKept: 0, finalVp: 0 };
    group.sides += 1;
    for (const [cause, count] of Object.entries(side.losses)) group.losses[cause] = (group.losses[cause] ?? 0) + count;
    for (const flip of side.flipsLost) {
      if (flip.wasEmpty) group.lostEmpty += 1; else group.lostDefended += 1;
      group.lostHow[flip.how] = (group.lostHow[flip.how] ?? 0) + 1;
    }
    group.gained += side.flipsGained.length;
    group.oos += side.oosUnitTurns;
    group.attacks += side.attacks.regular + side.attacks.overrun;
    group.neverMoved += side.neverMoved;
    group.stepsKept += side.startSteps ? side.endSteps / side.startSteps : 0;
    group.finalVp += side.vpTimeline.at(-1) ?? 0;
    groups.set(key, group);
  }
}
const per = (value, group) => (value / group.sides).toFixed(1);
const lines = ['# Replay study', '', `${games.length} games from ${dirs.join(', ')}.`, '',
  '| policy / outcome | sides | objectives lost while empty | lost while defended | objectives gained | step losses by cause (per side) | out-of-supply unit-turns | attacks | never moved | combat steps kept | final VP |',
  '|---|---|---|---|---|---|---|---|---|---|---|'];
for (const [key, group] of [...groups.entries()].sort()) {
  lines.push(`| ${key} | ${group.sides} | ${per(group.lostEmpty, group)} | ${per(group.lostDefended, group)} | ${per(group.gained, group)} | `
    + `${Object.entries(group.losses).sort((a, b) => b[1] - a[1]).map(([cause, count]) => `${cause} ${per(count, group)}`).join('; ')} | `
    + `${per(group.oos, group)} | ${per(group.attacks, group)} | ${per(group.neverMoved, group)} | ${Math.round(100 * group.stepsKept / group.sides)}% | ${per(group.finalVp, group)} |`);
}
lines.push('', '## How objectives were lost (per side)', '');
for (const [key, group] of [...groups.entries()].sort()) {
  lines.push(`- ${key}: ${Object.entries(group.lostHow).sort((a, b) => b[1] - a[1]).map(([how, count]) => `${how} ${per(count, group)}`).join('; ') || 'none'}`);
}
writeFileSync(join(out, 'study.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
