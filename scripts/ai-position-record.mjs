#!/usr/bin/env node
// Record position metrics turn by turn from saved ai-match games, for later analysis (docs/ai/policy-errors.md). Build first.
//
//   node scripts/ai-position-record.mjs <match directory> [...] --out <file.jsonl>
//
// One JSON line per game and player turn, taken before that player turn's first action: both players' current-position
// metrics (positionMetrics) and next-turn metrics (nextTurnMetrics) of scripts/ai-position-metrics.mjs, the supply-cut
// estimate only for the player not moving (the one the phasing player can cut in this turn), then what happened in that
// player turn (steps each player lost, objectives and objective VP each player gained and lost, SP of each player's dumps
// captured, destroyed or blown), the game's final VP, the engagement and each player's policy (summary.json). Games are
// replayed on this build; a game whose replay does not reach its recorded final state hash is skipped and reported, so
// rows never mix rule versions silently.
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine, nextTurnMetrics, positionMetrics } from './ai-position-metrics.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const out = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : null;
if (!out) throw new Error('--out <file.jsonl>');
const dirs = args.filter((arg, index) => arg !== '--out' && args[index - 1] !== '--out');
const engine = await loadEngine(join(root, 'dist'));
const { m } = engine;
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
    let row = null; let turnKey = null;
    const close = () => { if (row) pending.push(row); row = null; };
    for (const action of save.acceptedActions) {
      const key = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}`;
      if (key !== turnKey) {
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
          turn: Object.fromEntries(players.map((playerId) => [playerId, { stepsLost: 0, objectivesGained: 0, objectivesLost: 0, objectiveVpGained: 0, objectiveVpLost: 0, spCapturedOrDestroyed: 0 }])),
        };
      }
      const next = m.ruleEngine.applyAction(state, action);
      const ownerOf = (pieceId) => (state.pieceState.pieces.find(({ id }) => id === pieceId) ?? next.state.pieceState.pieces.find(({ id }) => id === pieceId))?.ownerId;
      for (const event of next.events) {
        // Tokens of a dump the opponent captured or destroyed, or its owner blew to deny it (4 Tokens = 1 SP).
        const tokens = event.kind === 'SUPPLY_CAPTURED' ? event.captured + event.destroyed : event.kind === 'DUMP_BLOWN' ? event.destroyed : 0;
        if (tokens > 0 && row.turn[ownerOf(event.resourcePieceId)]) row.turn[ownerOf(event.resourcePieceId)].spCapturedOrDestroyed += tokens / 4;
        if (event.kind !== 'STEP_LOST') continue;
        const owner = ownerOf(event.pieceId);
        if (row.turn[owner]) row.turn[owner].stepsLost += 1;
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
    for (const entry of pending) appendFileSync(out, `${JSON.stringify({ ...entry, finalVp })}\n`);
    games += 1; rows += pending.length;
  }
}
console.log(`${games} games, ${rows} player-turn rows written to ${out}; skipped (replay hash differs): ${skipped.length}`);
for (const file of skipped) console.log(`  ${file}`);
