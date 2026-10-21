#!/usr/bin/env node
// Record position metrics turn by turn from saved ai-match games, for later analysis (docs/ai/policy-errors.md). Build first.
//
//   node scripts/ai-position-record.mjs <match directory> [...] --out <file.jsonl>
//
// One JSON line per game and player turn: both players' current-position metrics (positionMetrics) and next-turn metrics
// (nextTurnMetrics) of scripts/ai-position-metrics.mjs, the supply-cut estimate only for the player not moving (the one
// the phasing player can cut in this turn), then what happened in that player turn (steps each player lost, split into
// attrition and the rest, objectives and objective VP each player gained and lost, SP of each player's dumps captured,
// destroyed or blown), the game's final VP, the engagement and each player's policy (summary.json). A row is taken before
// the player turn's first action after the weather and first-player roll: before them, the phasing player is still the
// previous turn's. Events belong to the player turn the sequence is in when they happen (SEQUENCE_ADVANCED inside an
// action moves the following events on). A step loss is attrition when it follows ATTRITION_ROLLED or answers an
// ATTRITION_LOSS decision (as in scripts/ai-outcome-metrics-observer.mjs). Games are replayed on this build; a game whose
// replay does not reach its recorded final state hash is skipped and reported, so rows never mix rule versions silently.
//
// With --theater <capture-model.json> (the frozen model of plan P11.3) each row also gets `theater`: both players'
// theaterMetrics (scripts/ai-theater-allocation.mjs) at the row's state, and `theaterRealized`: what the phasing player
// realized by this player turn's Combat segment entry, the points of objectives gained since the row plus the potential
// with units where they stand (null when that entry cannot be rebuilt). Each computation leaves the state unchanged.
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine, nextTurnMetrics, positionMetrics } from './ai-position-metrics.mjs';
import { loadAllocationEngine, theaterMetrics } from './ai-theater-allocation.mjs';
import { segmentEntry } from './ai-theater-supply.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const out = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : null;
if (!out) throw new Error('--out <file.jsonl>');
const theaterModel = args.includes('--theater') ? JSON.parse(readFileSync(resolve(args[args.indexOf('--theater') + 1]), 'utf8')).frozen : null;
const dirs = args.filter((arg, index) => !['--out', '--theater'].includes(arg) && !['--out', '--theater'].includes(args[index - 1]));
const engine = await loadEngine(join(root, 'dist'));
const { m } = engine;
const allocationEngine = theaterModel ? await loadAllocationEngine(join(root, 'dist')) : null;
const unchanged = (state, compute) => {
  const before = m.serializeGameState(state).value;
  const value = compute();
  if (m.serializeGameState(state).value !== before) throw new Error('theater metrics changed the state');
  return value;
};
writeFileSync(out, '');
let games = 0; let rows = 0; const skipped = [];

for (const dir of dirs) {
  const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
  for (const record of records) {
    const file = join(dir, `match-${record.match}.save.json`);
    const save = JSON.parse(readFileSync(file, 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const players = state.scenario.players.map(({ id }) => id);
    const sideOf = (playerId) => (String(playerId).endsWith('axis') ? 'axis' : 'allied');
    const control = (current, hexId) => current.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
    const objectives = state.configuration.objectives.map(({ hexId, points }) => ({ hexId: String(hexId), points }));
    const pending = [];
    const outcomes = new Map();
    const outcomeOf = (key) => {
      if (!outcomes.has(key)) {
        outcomes.set(key, Object.fromEntries(players.map((playerId) => [playerId, {
          stepsLost: 0, combatStepsLost: 0, attritionStepsLost: 0,
          objectivesGained: 0, objectivesLost: 0, objectiveVpGained: 0, objectiveVpLost: 0, spCapturedOrDestroyed: 0,
        }])));
      }
      return outcomes.get(key);
    };
    const keyOf = (sequence) => `${sequence.gameTurn}:${sequence.playerTurnIndex}`;
    let row = null; let turnKey = null;
    const close = () => { if (row) pending.push(row); row = null; };
    for (const action of save.acceptedActions) {
      const key = keyOf(state.sequence);
      // The first-player roll decides who moves first in a Game Turn; until it is resolved phasingPlayerId is last turn's.
      if (key !== turnKey && !['WEATHER', 'FIRST_PLAYER'].includes(state.sequence.phase)) {
        close();
        turnKey = key;
        const position = positionMetrics(m, state);
        const other = players.find((playerId) => playerId !== state.sequence.phasingPlayerId);
        const nextTurn = nextTurnMetrics(engine, state, { supplyCutFor: [other] });
        row = {
          dir: resolve(dir).replace(`${root}/`, ''), match: record.match, engagement: record.summary.engagement,
          attackerId: state.configuration.attackVictory?.attackerId ?? null,
          policies: Object.fromEntries(players.map((playerId) => [playerId, record.sides[sideOf(playerId)].policy])),
          gameTurn: state.sequence.gameTurn, playerTurnIndex: state.sequence.playerTurnIndex, phasingPlayerId: state.sequence.phasingPlayerId,
          metrics: Object.fromEntries(players.map((playerId) => [playerId, { ...position[playerId], ...nextTurn[playerId] }])),
          turn: outcomeOf(key),
        };
        if (theaterModel) {
          row.theater = unchanged(state, () => Object.fromEntries(players.map((playerId) => [playerId, theaterMetrics(allocationEngine, state, playerId, theaterModel)])));
          row.theaterRealized = null;
          row.heldAtStart = objectives.filter(({ hexId }) => control(state, hexId) === state.sequence.phasingPlayerId).map(({ hexId }) => hexId);
        }
      }
      const next = m.ruleEngine.applyAction(state, action);
      if (theaterModel && row && row.theaterRealized === null) {
        const entry = segmentEntry(m, state, action, next, 'COMBAT', 'COMBAT', { unavailable: 0 });
        if (entry && keyOf(entry.sequence) === turnKey) {
          const phasing = entry.sequence.phasingPlayerId;
          const gained = objectives.filter(({ hexId }) => control(entry, hexId) === phasing && !row.heldAtStart.includes(hexId)).reduce((sum, { points }) => sum + points, 0);
          row.theaterRealized = gained + unchanged(entry, () => theaterMetrics(allocationEngine, entry, phasing, theaterModel, { move: false }).potential);
        }
      }
      const ownerOf = (pieceId) => (state.pieceState.pieces.find(({ id }) => id === pieceId) ?? next.state.pieceState.pieces.find(({ id }) => id === pieceId))?.ownerId;
      let eventTurn = outcomeOf(key);
      let attrition = state.pendingDecision?.kind === 'ATTRITION_LOSS';
      for (const event of next.events) {
        if (event.kind === 'SEQUENCE_ADVANCED') { eventTurn = outcomeOf(keyOf(event.to)); attrition = false; }
        if (event.kind === 'ATTRITION_ROLLED') attrition = true;
        if (event.kind === 'DECISION_REQUESTED') attrition = event.decision.kind === 'ATTRITION_LOSS';
        // Tokens of a dump the opponent captured or destroyed, or its owner blew to deny it (4 Tokens = 1 SP).
        const tokens = event.kind === 'SUPPLY_CAPTURED' ? event.captured + event.destroyed : event.kind === 'DUMP_BLOWN' ? event.destroyed : 0;
        if (tokens > 0 && eventTurn[ownerOf(event.resourcePieceId)]) eventTurn[ownerOf(event.resourcePieceId)].spCapturedOrDestroyed += tokens / 4;
        if (event.kind !== 'STEP_LOST') continue;
        const owner = ownerOf(event.pieceId);
        if (eventTurn[owner]) {
          eventTurn[owner].stepsLost += 1;
          if (attrition) eventTurn[owner].attritionStepsLost += 1; else eventTurn[owner].combatStepsLost += 1;
        }
      }
      for (const { hexId, points } of objectives) {
        const before = control(state, hexId); const after = control(next.state, hexId);
        if (before === after) continue;
        if (row.turn[after]) { row.turn[after].objectivesGained += 1; row.turn[after].objectiveVpGained += points; }
        if (row.turn[before]) { row.turn[before].objectivesLost += 1; row.turn[before].objectiveVpLost += points; }
      }
      state = next.state;
    }
    close();
    const hash = (await m.hashGameState(state)).value;
    if (hash !== record.finalStateHash) { skipped.push(file); continue; }
    const finalVp = Object.fromEntries(players.map((playerId) => [playerId, record.sides[sideOf(playerId)].vp]));
    for (const { heldAtStart, ...entry } of pending) appendFileSync(out, `${JSON.stringify({ ...entry, finalVp })}\n`);
    games += 1; rows += pending.length;
  }
}
console.log(`${games} games, ${rows} player-turn rows written to ${out}; skipped (replay hash differs): ${skipped.length}`);
for (const file of skipped) console.log(`  ${file}`);
