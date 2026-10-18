#!/usr/bin/env node
// Is attack strength misallocated? Replays saved ai-match games (docs/ai/policy-errors.md, E4). Build first.
//
//   node scripts/ai-attack-allocation-study.mjs <match directory> [...] [--out <file.json>]
//
// Each regular attack declared in a Combat Segment from Game Turn 2, per side role:
// - Excess: for an attack at Combat Table column 10 or more, attackers are dropped one at a time, weakest printed strength
//   first, while the attack stays at column 9 or more; the dropped ones are excess. For each excess unit: whether it stood
//   adjacent to another enemy combat unit's hex at the declaration, and what that hex got in the segment (attacked, and at
//   which column, or not attacked).
// - Idle neighbours: for an attack on an objective at column 5 or less, own combat units adjacent to the target that
//   attacked nothing in the segment.
// Counts are candidates for the error list, not proven mistakes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const dirs = args.filter((arg, index) => arg !== '--out' && args[index - 1] !== '--out');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const roles = {};
const bump = (role, key, value = 1) => { const c = (roles[role] ??= { sideGames: 0 }); c[key] = (c[key] ?? 0) + value; };

for (const dir of dirs) {
  const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
  for (const record of records) {
    const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId;
    const roleOf = (playerId) => (attackerId === undefined ? 'meeting side' : playerId === attackerId ? 'attacker' : 'defender');
    for (const { id } of state.scenario.players) bump(roleOf(id), 'sideGames');
    const definitions = new Map(state.scenario.pieceCatalog.definitions.map((definition) => [definition.id, definition]));
    const printed = (piece) => Math.max(0, ...(definitions.get(piece.definitionId)?.faces ?? []).flatMap((face) => face.steps.map((step) => step.combatStrength ?? 0)));
    const objectives = new Set(state.configuration.objectives.map(({ hexId }) => String(hexId)));
    const column = (current, action) => m.forecastCombat(m.ruleEngine.explain(current, action).facts)?.columnIndex ?? null;
    let segmentKey = null; let segment = null;
    const closeSegment = () => {
      if (!segment) return;
      const role = roleOf(segment.playerId);
      for (const excess of segment.excess) {
        bump(role, 'excess units');
        if (excess.otherTargets.length === 0) { bump(role, 'excess units: no other enemy adjacent'); continue; }
        const got = excess.otherTargets.map((hexId) => segment.attacked.get(hexId));
        const best = got.filter((value) => value !== undefined);
        if (best.length === 0) bump(role, 'excess units: another adjacent enemy hex was not attacked');
        else if (Math.min(...best) <= 5) bump(role, 'excess units: another adjacent enemy hex was attacked at column 5 or less');
        else bump(role, 'excess units: other adjacent enemy hexes were attacked at column 6+');
      }
      for (const attack of segment.weakObjectiveAttacks) {
        const idle = attack.neighbours.filter((id) => !segment.attackers.has(id)).length;
        bump(role, 'objective attacks at column 5 or less');
        bump(role, 'idle own combat units adjacent to those targets', idle);
        if (idle > 0) bump(role, 'objective attacks at column 5 or less with an idle adjacent own unit');
      }
      segment = null;
    };
    for (const action of save.acceptedActions) {
      const { gameTurn, playerTurnIndex, phase, segment: step, phasingPlayerId } = state.sequence;
      const key = `${gameTurn}:${playerTurnIndex}:${phase}:${step}`;
      if (key !== segmentKey) {
        closeSegment();
        segmentKey = key;
        if (phase === 'COMBAT' && step === 'COMBAT' && gameTurn >= 2) segment = { playerId: phasingPlayerId, excess: [], weakObjectiveAttacks: [], attacked: new Map(), attackers: new Set() };
      }
      if (segment && action.kind === 'DECLARE_COMBAT' && action.combatKind === 'REGULAR' && action.actorId === segment.playerId) {
        const role = roleOf(action.actorId);
        const target = String(action.targetHexId);
        const col = column(state, action);
        bump(role, 'regular attacks');
        if (col !== null) segment.attacked.set(target, Math.max(segment.attacked.get(target) ?? -1, col));
        for (const id of action.attackerIds) segment.attackers.add(String(id));
        const pieces = action.attackerIds.map((id) => state.pieceState.pieces.find((piece) => piece.id === id)).filter(Boolean);
        const enemyHexes = [...new Set(state.pieceState.pieces.filter((piece) => piece.ownerId !== action.actorId && piece.location.kind === 'ON_MAP'
          && m.isOnMapCombatUnit(state, piece)).map((piece) => String(piece.location.hexId)))];
        if (col !== null && col >= 10) {
          bump(role, 'attacks at column 10+');
          bump(role, 'attackers in attacks at column 10+', pieces.length);
          let kept = [...pieces].sort((left, right) => printed(left) - printed(right) || String(left.id).localeCompare(String(right.id)));
          const dropped = [];
          for (const candidate of [...kept]) {
            if (kept.length <= 1) break;
            const trial = kept.filter((piece) => piece !== candidate);
            const trialColumn = column(state, { ...action, attackerIds: trial.map((piece) => piece.id) });
            if (trialColumn !== null && trialColumn >= 9) { kept = trial; dropped.push(candidate); }
          }
          for (const piece of dropped) {
            segment.excess.push({ id: String(piece.id), otherTargets: enemyHexes.filter((hexId) => hexId !== target && m.hexDistanceBetween(hexId, piece.location.hexId) === 1) });
          }
        }
        if (col !== null && col <= 5 && objectives.has(target)) {
          const neighbours = state.pieceState.pieces.filter((piece) => piece.ownerId === action.actorId && piece.location.kind === 'ON_MAP'
            && m.isOnMapCombatUnit(state, piece) && m.hexDistanceBetween(piece.location.hexId, target) === 1).map((piece) => String(piece.id));
          segment.weakObjectiveAttacks.push({ target, neighbours });
        }
      }
      state = m.ruleEngine.applyAction(state, action).state;
    }
    closeSegment();
  }
}
const summary = Object.fromEntries(Object.entries(roles).map(([role, { sideGames, ...counts }]) => [role,
  { sideGames, perSideGame: Object.fromEntries(Object.entries(counts).sort().map(([key, value]) => [key, value / sideGames])) }]));
for (const [role, { sideGames, perSideGame }] of Object.entries(summary)) {
  console.log(`${role}: ${sideGames} side-games, per side-game:`);
  for (const [key, value] of Object.entries(perSideGame)) console.log(`  ${key}: ${value.toFixed(2)}`);
}
if (out) writeFileSync(out, JSON.stringify({ dirs, roles: summary }, null, 2));
