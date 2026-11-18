#!/usr/bin/env node
// How an attack develops turn by turn, and what its attacks on objectives achieve (docs/ai/evaluation.md). Replays saved
// ai-match attack games; build first.
//
//   node scripts/ai-attack-progress-study.mjs <match directory> [...] [--policy <substring of the attacker's policy>] --out <file.json>
//
// Per game, for the attacker of an attack engagement:
// - at the start of each Game Turn: objective points held, objectives not held and the mean distance from each to the
//   nearest attacker combat unit, its combat units and how many are out of trace, SP on the map and SP a front unit can
//   draw (scripts/ai-position-metrics.mjs), and during the turn its regular attacks and attacks on objectives;
// - each regular attack on an objective: Game Turn, Combat Table column (Open 3:1 is 6), attackers, the objective's points,
//   the outcome (taken, defenders stayed, cleared and not entered), and the attacker's other attack-capable combat units
//   beside the target that did not take part.
// Writes both tables; prints the turn table and the outcomes by column.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine, positionMetrics } from './ai-position-metrics.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = option('--out');
const policyFilter = option('--policy');
const dirs = args.filter((arg, index) => !arg.startsWith('--') && !['--out', '--policy'].includes(args[index - 1]));
if (!out || dirs.length === 0) throw new Error('see usage');
const engine = await loadEngine(resolve(root, 'dist'));
const { m } = engine;

const turns = [];
const attacks = [];
for (const dir of dirs) {
  for (const record of JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records) {
    const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId;
    if (attackerId === undefined) continue;
    const side = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
    if (policyFilter && !record.sides[side].policy.includes(policyFilter)) continue;
    const style = record.summary.mapStyle;
    const objectives = state.configuration.objectives.map(({ hexId, points }) => ({ hexId: String(hexId), points }));
    const controller = (current, hexId) => current.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
    const combatUnits = (current, own) => current.pieceState.pieces.filter((piece) => (piece.ownerId === attackerId) === own
      && piece.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(current, piece));
    const snapshot = (current, turn) => {
      const own = combatUnits(current, true);
      const open = objectives.filter(({ hexId }) => controller(current, hexId) !== attackerId);
      const metrics = positionMetrics(engine, current)[attackerId];
      return { match: record.match, style, turn, held: objectives.filter(({ hexId }) => controller(current, hexId) === attackerId).reduce((total, { points }) => total + points, 0),
        open: open.length, openDistance: open.length === 0 || own.length === 0 ? null
          : open.reduce((total, { hexId }) => total + Math.min(...own.map((piece) => m.hexDistanceBetween(piece.location.hexId, hexId))), 0) / open.length,
        units: own.length, outOfTrace: metrics.outOfTrace, spOnMap: metrics.spOnMap, spFront: metrics.spFront, attacks: 0, objectiveAttacks: 0 };
    };
    let row = snapshot(state, 1);
    let pending = null;
    for (const action of save.acceptedActions) {
      if (action.kind === 'DECLARE_COMBAT' && action.actorId === attackerId && action.combatKind === 'REGULAR') {
        row.attacks += 1;
        const hexId = String(action.targetHexId);
        const objective = objectives.find((entry) => entry.hexId === hexId);
        if (objective) {
          row.objectiveAttacks += 1;
          const explanation = m.ruleEngine.explain(state, action);
          const taking = new Set(action.attackerIds.map(String));
          const idle = combatUnits(state, true).filter((piece) => !taking.has(String(piece.id)) && m.hexDistanceBetween(piece.location.hexId, action.targetHexId) === 1
            && m.ruleEngine.getActionCandidates(state, { actorId: attackerId, kind: 'DECLARE_COMBAT', pieceId: piece.id, budget: 40 }).actions
              .some((candidate) => String(candidate.targetHexId) === hexId && candidate.combatKind === 'REGULAR')).length;
          pending = { match: record.match, style, turn: state.sequence.gameTurn, phase: state.sequence.phase, hexId, points: objective.points,
            column: m.forecastCombat(explanation.facts)?.columnIndex ?? null, attackers: action.attackerIds.length, idleBeside: idle };
        }
      }
      const next = m.ruleEngine.applyAction(state, action).state;
      if (pending && next.activeTransaction === null && next.pendingDecision === null) {
        const defended = next.pieceState.pieces.some((piece) => piece.ownerId !== attackerId && piece.location.kind === 'ON_MAP'
          && String(piece.location.hexId) === pending.hexId && m.isOnMapCombatUnit(next, piece));
        attacks.push({ ...pending, outcome: defended ? 'stayed' : controller(next, pending.hexId) === attackerId ? 'taken' : 'cleared' });
        pending = null;
      }
      if (next.sequence.gameTurn !== state.sequence.gameTurn) { turns.push(row); row = snapshot(next, next.sequence.gameTurn); }
      state = next;
    }
    turns.push(row);
  }
}

const mean = (list, value) => list.reduce((total, entry) => total + value(entry), 0) / Math.max(1, list.length);
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, JSON.stringify({ dirs, policy: policyFilter, turns, attacks }));
for (const style of [...new Set(turns.map((entry) => entry.style))]) {
  console.log(`== ${style}: at the start of each Game Turn (and during it), a game`);
  console.log('  turn  held  open  distance  units  outOfTrace  spOnMap  spFront  attacks  objectiveAttacks');
  for (let turn = 1; turn <= 8; turn += 1) {
    const list = turns.filter((entry) => entry.style === style && entry.turn === turn);
    const far = list.filter(({ openDistance }) => openDistance !== null);
    console.log(`  ${turn}  ${mean(list, (e) => e.held).toFixed(1)}  ${mean(list, (e) => e.open).toFixed(1)}  ${mean(far, (e) => e.openDistance).toFixed(1)}  ${mean(list, (e) => e.units).toFixed(1)}  `
      + `${mean(list, (e) => e.outOfTrace).toFixed(1)}  ${mean(list, (e) => e.spOnMap).toFixed(1)}  ${mean(list, (e) => e.spFront).toFixed(1)}  ${mean(list, (e) => e.attacks).toFixed(2)}  ${mean(list, (e) => e.objectiveAttacks).toFixed(2)}`);
  }
  const mine = attacks.filter((entry) => entry.style === style);
  console.log(`  attacks on objectives by column (${mine.length}): column  n  taken  stayed  cleared  attackers  idle beside`);
  for (const [label, test] of [['0-3', (c) => c <= 3], ['4-5', (c) => c >= 4 && c <= 5], ['6-7', (c) => c >= 6 && c <= 7], ['8-9', (c) => c >= 8 && c <= 9], ['10+', (c) => c >= 10]]) {
    const list = mine.filter(({ column }) => column !== null && test(column));
    if (list.length === 0) continue;
    const share = (outcome) => (list.filter((entry) => entry.outcome === outcome).length / list.length).toFixed(2);
    console.log(`    ${label}  ${list.length}  ${share('taken')}  ${share('stayed')}  ${share('cleared')}  ${mean(list, (e) => e.attackers).toFixed(1)}  ${mean(list, (e) => e.idleBeside).toFixed(2)}`);
  }
}
