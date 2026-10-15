#!/usr/bin/env node
// Replay ai-match saves and report, per game, how the game develops by Game Turn: the first turn with an attack,
// attacks per turn, each side's Victory Points at the end of each turn, and the turn the game ended.
// Usage: node scripts/turn-limit-study.mjs <match directory> [out.json]
// Used to ground defaultTurnLimit (docs/game-flow/configuration.md): games are played with a long Turn limit and the
// turn by which the contest has played out is read from these series.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as m from '../dist/index.js';

const dir = process.argv[2];
if (!dir) throw new Error('usage: turn-limit-study.mjs <match directory> [out.json]');
const summary = JSON.parse(readFileSync(resolve(dir, 'summary.json'), 'utf8'));
const results = [];
for (const record of summary.records.filter((r) => r.stopReason === 'FINISHED')) {
  const save = JSON.parse(readFileSync(resolve(dir, `match-${record.match}.save.json`), 'utf8'));
  const parsed = m.parseGameStateJson(save.initialSnapshot);
  if (!parsed.ok) throw new Error('Invalid initial state');
  let state = parsed.value;
  const actor = save.acceptedActions[0]?.actorId;
  const projectionOf = (s) => m.ruleEngine.projectForViewer(s, actor);
  const scoresOf = (s) => Object.fromEntries(projectionOf(s).victory.scores.map(({ playerId, points }) => [String(playerId).endsWith('axis') ? 'axis' : 'allied', points]));
  const controllersOf = (s) => Object.fromEntries(projectionOf(s).objectives.map(({ hexId, controllerId }) => [hexId, controllerId]));
  // Objective hexes changing hands, with the Game Turn of each change (the contest is played out when they stop).
  let controllers = controllersOf(parsed.value);
  const handovers = [];
  const attacks = {};
  const vp = {};
  for (const action of save.acceptedActions) {
    const turn = state.sequence.gameTurn;
    if (action.kind === 'DECLARE_COMBAT') attacks[turn] = (attacks[turn] ?? 0) + 1;
    const next = m.ruleEngine.applyAction(state, action);
    if (!next.ok) throw new Error(`Replay rejected in ${record.match}`);
    state = next.state;
    vp[turn] = scoresOf(state);
    const now = controllersOf(state);
    for (const hex of Object.keys(now)) if (now[hex] !== controllers[hex]) handovers.push(turn);
    controllers = now;
  }
  const lastTurn = state.sequence.gameTurn;
  const ids = Object.keys(vp).map(Number);
  // VP movement: per turn, how far each side's points and the lead (Allied minus Axis) moved from the turn before.
  const start = scoresOf(parsed.value);
  const moved = {};
  let before = start;
  for (const t of ids) {
    const now = vp[t];
    moved[t] = { allied: now.allied - before.allied, axis: now.axis - before.axis, lead: (now.allied - now.axis) - (before.allied - before.axis) };
    before = now;
  }
  const total = ids.reduce((sum, t) => sum + Math.abs(moved[t].allied) + Math.abs(moved[t].axis), 0);
  const settleTurn = Math.max(0, ...ids.filter((t) => moved[t].allied !== 0 || moved[t].axis !== 0));
  // The turn by which a share of all VP movement has happened: late small changes do not move these.
  const turnByShare = (share) => {
    let running = 0;
    return total === 0 ? 0 : ids.find((t) => (running += Math.abs(moved[t].allied) + Math.abs(moved[t].axis)) >= share * total);
  };
  const turn75 = turnByShare(0.75);
  const handoverTurn75 = handovers.length === 0 ? 0 : [...handovers].sort((a, b) => a - b)[Math.ceil(0.75 * handovers.length) - 1];
  results.push({
    match: record.match, width: record.summary?.width, height: record.summary?.height, divisions: record.summary?.divisionsPerSide,
    turnLimit: state.configuration.turnLimit, endedOn: lastTurn, reason: state.victory.reason, winner: record.winner,
    firstAttackTurn: Math.min(...Object.keys(attacks).map(Number)), attacksByTurn: attacks,
    vpByTurn: Object.fromEntries(ids.map((t) => [t, vp[t]])),
    startVp: start, vpMovedByTurn: moved, totalVpMovement: total, lastVpChangeTurn: settleTurn, turn75Movement: turn75, handovers: handovers.length, lastHandoverTurn: Math.max(0, ...handovers), turn75Handover: handoverTurn75, engagement: state.configuration.engagement ?? null,
  });
  console.log(record.match, `ended T${lastTurn}`, state.victory.reason, `first attack T${results.at(-1).firstAttackTurn}`, `VP moved ${total} (last change T${settleTurn}, 75% by T${turn75}); ${handovers.length} objective handovers, 75% by T${handoverTurn75}, last T${Math.max(0, ...handovers)}`);
}
const out = process.argv[3] ?? resolve(dir, 'turn-limit-study.json');
writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
