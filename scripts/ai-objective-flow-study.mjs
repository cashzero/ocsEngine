#!/usr/bin/env node
// Where a side's VP comes from: replays saved ai-match games (docs/ai/evaluation.md). Build first.
//
//   node scripts/ai-objective-flow-study.mjs <match directory> [...] [--out <dir>] [--defender]
//
// For the attacker of an attack engagement (with --defender, its defender), and for both sides of a meeting engagement,
// split by policy when the two sides played different policies (summary.json):
// - Objectives gained and lost, by the action that changed control (a move into the hex, or a combat decision such as an
//   advance), and whether the hex held a combat unit of the other side when the player turn began.
// - Its regular attacks on objectives: the Combat Table column index (Open 3:1 is 6), the best column any legal attack on
//   that hex had when the Combat Segment began, the units attacking, and the outcome once resolved: the defenders stayed,
//   left and the hex was taken, or left and nobody entered.
// - All its regular attacks and barrages: counts and the mean Combat Table column of the attacks.
// Writes objective-flow.json.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const out = outIndex >= 0 ? argv[outIndex + 1] : join('tmp', 'objective-flow');
const defender = argv.includes('--defender');
const dirs = argv.filter((arg, index) => arg !== '--defender' && (outIndex < 0 || (index !== outIndex && index !== outIndex + 1)));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);

const roles = {};
const bump = (role, key, value = 1) => { const counts = (roles[role] ??= { games: 0, heldVp: 0, counts: {} }).counts; counts[key] = (counts[key] ?? 0) + value; };

for (const dir of dirs) {
  const records = existsSync(join(dir, 'summary.json')) ? JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records : [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.save.json'))) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const initial = m.parseGameStateJson(save.initialSnapshot).value;
    const record = records.find(({ match }) => file === `match-${match}.save.json`);
    const attackerId = initial.configuration.attackVictory?.attackerId;
    const players = attackerId === undefined ? initial.scenario.players.map(({ id }) => id)
      : defender ? initial.scenario.players.map(({ id }) => id).filter((id) => id !== attackerId) : [attackerId];
    for (const playerId of players) {
      const side = String(playerId).endsWith('axis') ? 'axis' : 'allied';
      const kind = attackerId === undefined ? 'meeting side' : defender ? 'defender' : 'attacker';
      const role = record && record.sides.allied.policy !== record.sides.axis.policy ? `${kind} ${record.sides[side].policy}` : kind;
      (roles[role] ??= { games: 0, heldVp: 0, counts: {} }).games += 1;
      let state = initial;
      const objectives = state.configuration.objectives.map(({ hexId, points }) => ({ hexId: String(hexId), points }));
      const controller = (current, hexId) => current.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
      const defended = (current, hexId) => current.pieceState.pieces.some((piece) => piece.ownerId !== playerId && piece.location.kind === 'ON_MAP'
        && String(piece.location.hexId) === hexId && m.isOnMapCombatUnit(current, piece));
      let turn = null;
      let atTurnStart = new Map();
      let segment = null;
      let bestAtStart = new Map();
      let pending = null;
      for (const action of save.acceptedActions) {
        const { gameTurn, playerTurnIndex, phase, segment: step, phasingPlayerId } = state.sequence;
        const turnKey = `${gameTurn}:${playerTurnIndex}`;
        if (turnKey !== turn) { turn = turnKey; atTurnStart = new Map(objectives.map(({ hexId }) => [hexId, defended(state, hexId)])); }
        if (phase === 'COMBAT' && step === 'COMBAT' && phasingPlayerId === playerId && segment !== `${turnKey}:${phase}`) {
          segment = `${turnKey}:${phase}`;
          bestAtStart = new Map();
          for (const candidate of m.ruleEngine.getActionCandidates(state, { actorId: playerId, kind: 'DECLARE_COMBAT', pieceId: null, budget: 400 }).actions) {
            if (candidate.combatKind === 'OVERRUN') continue;
            const explanation = m.ruleEngine.explain(state, candidate);
            const forecast = explanation.allowed ? m.forecastCombat(explanation.facts) : null;
            if (forecast && (bestAtStart.get(String(candidate.targetHexId)) ?? -1) < forecast.columnIndex) bestAtStart.set(String(candidate.targetHexId), forecast.columnIndex);
          }
        }
        if (action.kind === 'DECLARE_COMBAT' && action.actorId === playerId && action.combatKind === 'REGULAR') {
          bump(role, 'regular attacks');
          bump(role, 'regular attack column', m.forecastCombat(m.ruleEngine.explain(state, action).facts)?.columnIndex ?? 0);
        }
        if (action.kind === 'DECLARE_BARRAGE' && action.actorId === playerId) bump(role, 'barrages');
        if (action.kind === 'DECLARE_COMBAT' && action.actorId === playerId && action.combatKind === 'REGULAR' && objectives.some(({ hexId }) => hexId === String(action.targetHexId))) {
          const hexId = String(action.targetHexId);
          bump(role, 'objective attacks');
          bump(role, 'objective attack column', m.forecastCombat(m.ruleEngine.explain(state, action).facts)?.columnIndex ?? 0);
          bump(role, 'objective attack best column at segment start', bestAtStart.get(hexId) ?? 0);
          bump(role, 'objective attack units', action.attackerIds.length);
          pending = hexId;
        }
        const next = m.ruleEngine.applyAction(state, action).state;
        for (const { hexId, points } of objectives) {
          const before = controller(state, hexId);
          const after = controller(next, hexId);
          if (before === after || (after !== playerId && before !== playerId)) continue;
          const how = action.kind === 'MOVE_PIECE' ? 'by moving in' : action.kind === 'RESPOND_DECISION' ? 'by a combat decision' : `by ${action.kind}`;
          const direction = after === playerId ? 'gained' : 'lost';
          bump(role, `objectives ${direction} ${how}, ${atTurnStart.get(hexId) ? 'an' : 'no'} enemy combat unit in the hex at turn start`);
          bump(role, `objective VP ${direction}`, points);
        }
        state = next;
        if (pending !== null && state.activeTransaction === null && state.pendingDecision === null) {
          bump(role, defended(state, pending) ? 'objective attacks the defenders stayed' : controller(state, pending) === playerId ? 'objective attacks taken' : 'objective attacks cleared, not entered');
          pending = null;
        }
      }
      for (const { hexId, points } of objectives) if (controller(state, hexId) === playerId) roles[role].heldVp += points;
    }
  }
}

const summary = Object.fromEntries(Object.entries(roles).map(([role, { games, heldVp, counts }]) => [role, {
  games, objectiveVpHeldAtEnd: heldVp / games,
  perGame: Object.fromEntries(Object.entries(counts).filter(([key]) => !/column|units/.test(key)).sort().map(([key, value]) => [key, value / games])),
  objectiveAttackMeanColumn: (counts['objective attack column'] ?? 0) / Math.max(1, counts['objective attacks'] ?? 0),
  objectiveAttackMeanBestColumnAtSegmentStart: (counts['objective attack best column at segment start'] ?? 0) / Math.max(1, counts['objective attacks'] ?? 0),
  objectiveAttackMeanUnits: (counts['objective attack units'] ?? 0) / Math.max(1, counts['objective attacks'] ?? 0),
  regularAttackMeanColumn: (counts['regular attack column'] ?? 0) / Math.max(1, counts['regular attacks'] ?? 0),
}]));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'objective-flow.json'), JSON.stringify({ dirs, sides: summary }, null, 2));
for (const [role, s] of Object.entries(summary)) {
  console.log(`${role}: ${s.games} games, objective VP held at the end ${s.objectiveVpHeldAtEnd.toFixed(1)}; objective attacks at column ${s.objectiveAttackMeanColumn.toFixed(1)} (best at segment start ${s.objectiveAttackMeanBestColumnAtSegmentStart.toFixed(1)}) with ${s.objectiveAttackMeanUnits.toFixed(1)} units; all regular attacks at column ${s.regularAttackMeanColumn.toFixed(1)}`);
  for (const [key, value] of Object.entries(s.perGame)) console.log(`  ${key}: ${value.toFixed(2)} a game`);
}
