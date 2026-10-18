#!/usr/bin/env node
// Replay the player turns picked by scripts/ai-position-residuals.py and describe what happened in them, so the cases the
// position metrics missed can be read for missing information (docs/roadmap/18-position-metrics-wbs.md, P3). Build first.
//
//   node scripts/ai-position-residual-review.mjs --cases <cases.json> --out <review.json>
//
// A player turn starts at its first action after the weather and first-player roll, as in ai-position-record.mjs. P is the
// phasing player, O the other. Per case:
// - combatStepsLost: every non-attrition step O lost in P's turn, with the combat (kind, target, declared column), its
//   attackers' distance to the target at the start of P's turn, and the defender's state then (DG, out of trace,
//   distance to P's nearest combat unit);
// - objectiveVpLost / moverObjectivesGained: every objective that changed hands from O to P, whether O had a combat
//   unit in it at the start, whether it changed by movement or in a combat (with that combat's kind, column and the
//   attackers' start distance), and the start distance of P's nearest unit;
// - attritionNextTurn: every attrition step O lost in its following player turn, with the unit's trace and distance to P's
//   nearest combat unit at the start of P's turn and of O's turn, and its trace routes at P's start (DRAW or an HQ throw)
//   with what became of each route's HQ by O's start (gone, still there and fed, still there but unfed).
// A summary counts these properties per outcome and role.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const supply = await import(pathToFileURL(join(root, 'dist', 'rules', 'supply', 'supply.js')).href);
const { cases } = JSON.parse(readFileSync(option('--cases'), 'utf8'));
const distance = (left, right) => m.hexDistanceBetween(String(left), String(right));
const combatOf = (state, playerId) => state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, piece));
const nearestEnemy = (state, playerId, hexId) => Math.min(99, ...combatOf(state, state.scenario.players.map(({ id }) => id).find((id) => id !== playerId)).map((piece) => distance(piece.location.hexId, hexId)));
const turnStarts = (state) => !['WEATHER', 'FIRST_PLAYER'].includes(state.sequence.phase);

const reviewed = [];
for (const item of cases) {
  const save = JSON.parse(readFileSync(join(root, item.source, `match-${item.match}.save.json`), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  let index = 0;
  const inTurn = (current, turn, playerTurnIndex) => current.sequence.gameTurn === turn && current.sequence.playerTurnIndex === playerTurnIndex && turnStarts(current);
  while (index < save.acceptedActions.length && !inTurn(state, item.gameTurn, item.playerTurnIndex)) state = m.ruleEngine.applyAction(state, save.acceptedActions[index++]).state;
  const start = state;
  const P = start.sequence.phasingPlayerId;
  const O = start.scenario.players.map(({ id }) => id).find((id) => id !== P);
  const objectives = start.configuration.objectives.map(({ hexId, points }) => ({ hexId: String(hexId), points }));
  const control = (current, hexId) => current.mapState.hexControl.find((entry) => String(entry.hexId) === hexId)?.controllerId ?? null;
  const findings = [];
  let declared = null;
  let oTurnStart = null;
  let attrition = start.pendingDecision?.kind === 'ATTRITION_LOSS';
  let phase = 'P';
  while (index < save.acceptedActions.length) {
    const action = save.acceptedActions[index++];
    if (action.kind === 'DECLARE_COMBAT' || action.kind === 'DECLARE_BARRAGE') {
      const facts = m.ruleEngine.explain(state, action).facts;
      declared = { kind: action.kind === 'DECLARE_BARRAGE' ? 'BARRAGE' : action.combatKind, target: String(action.targetHexId),
        column: m.forecastCombat(facts)?.columnIndex ?? null,
        attackerStartDistance: (action.attackerIds ?? action.firerIds ?? []).map((id) => {
          const piece = start.pieceState.pieces.find((candidate) => candidate.id === id);
          return piece?.location.kind === 'ON_MAP' ? distance(piece.location.hexId, action.targetHexId) : null;
        }) };
    }
    const next = m.ruleEngine.applyAction(state, action);
    for (const event of next.events) {
      if (event.kind === 'SEQUENCE_ADVANCED') {
        attrition = false;
        if (phase === 'P' && (event.to.gameTurn !== item.gameTurn || event.to.playerTurnIndex !== item.playerTurnIndex)) phase = 'between';
      }
      if (event.kind === 'ATTRITION_ROLLED') attrition = true;
      if (event.kind === 'DECISION_REQUESTED') attrition = event.decision.kind === 'ATTRITION_LOSS';
      if (event.kind !== 'STEP_LOST') continue;
      const piece = state.pieceState.pieces.find((candidate) => candidate.id === event.pieceId) ?? next.state.pieceState.pieces.find((candidate) => candidate.id === event.pieceId);
      if (piece?.ownerId !== O) continue;
      const atStart = start.pieceState.pieces.find((candidate) => candidate.id === piece.id);
      const hexId = String((atStart ?? piece).location.hexId);
      if (phase === 'P' && !attrition && item.outcome === 'combatStepsLost') {
        findings.push({ type: 'combatLoss', combat: declared, hexId,
          defenderDgAtStart: atStart?.mode === 'DG', defenderOutOfTraceAtStart: atStart ? !m.pieceHasTrace(start, atStart) : null,
          defenderEnemyDistanceAtStart: nearestEnemy(start, O, hexId) });
      }
      if (phase === 'O' && attrition && item.outcome === 'attritionNextTurn') {
        findings.push({ type: 'attritionLoss', hexId,
          outOfTraceAtPStart: atStart ? !m.pieceHasTrace(start, atStart) : null, enemyDistanceAtPStart: nearestEnemy(start, O, hexId),
          outOfTraceAtOStart: oTurnStart && atStart ? !m.pieceHasTrace(oTurnStart, oTurnStart.pieceState.pieces.find((candidate) => candidate.id === piece.id) ?? atStart) : null,
          enemyDistanceAtOStart: oTurnStart ? nearestEnemy(oTurnStart, O, hexId) : null,
          routesAtPStart: atStart && m.pieceHasTrace(start, atStart) ? supply.traceRoutesFor(start, atStart).map((route) => {
            if (route === 'DRAW') return 'DRAW';
            const hqId = route.slice(3);
            const later = oTurnStart?.pieceState.pieces.find((candidate) => candidate.id === hqId);
            if (!later || later.location.kind !== 'ON_MAP') return 'HQ gone';
            return supply.traceRoutesFor(oTurnStart, later).length > 0 ? 'HQ fed' : 'HQ unfed';
          }) : null });
      }
    }
    if (phase === 'P' && (item.outcome === 'objectiveVpLost' || item.outcome === 'moverObjectivesGained')) {
      for (const { hexId, points } of objectives) {
        if (control(state, hexId) === O && control(next.state, hexId) === P) {
          const inCombat = state.activeTransaction !== null || action.kind === 'DECLARE_COMBAT';
          findings.push({ type: 'objectiveTaken', hexId, points, by: action.kind, inCombat, combat: inCombat ? declared : null,
            garrisonedAtStart: combatOf(start, O).some((piece) => String(piece.location.hexId) === hexId),
            enemyDistanceAtStart: nearestEnemy(start, P, hexId) });
        }
      }
    }
    state = next.state;
    if (phase === 'between' && state.sequence.phasingPlayerId === O && turnStarts(state)) { phase = 'O'; oTurnStart = state; }
    if (phase === 'between' && state.sequence.phasingPlayerId === P && turnStarts(state)) break;
    if (phase === 'O' && state.sequence.phasingPlayerId !== O) break;
    if (phase === 'P' && item.outcome !== 'attritionNextTurn' && !inTurn(state, item.gameTurn, item.playerTurnIndex) && turnStarts(state)) break;
  }
  reviewed.push({ ...item, findings });
}

const share = (list, test) => (list.length ? Number((list.filter(test).length / list.length).toFixed(3)) : null);
const summary = {};
for (const item of reviewed) {
  const key = `${item.outcome} | ${item.role}`;
  (summary[key] ??= { cases: 0, findings: [] }).cases += 1;
  summary[key].findings.push(...item.findings);
}
for (const [key, entry] of Object.entries(summary)) {
  const f = entry.findings;
  const combat = f.filter((x) => x.type === 'combatLoss');
  const taken = f.filter((x) => x.type === 'objectiveTaken');
  const attrition = f.filter((x) => x.type === 'attritionLoss');
  summary[key] = {
    cases: entry.cases, findings: f.length,
    ...(combat.length ? {
      combatLosses: combat.length,
      byKind: Object.fromEntries([...new Set(combat.map((x) => x.combat?.kind ?? 'unknown'))].map((kind) => [kind, combat.filter((x) => (x.combat?.kind ?? 'unknown') === kind).length])),
      declaredColumnMedian: (() => { const c = combat.map((x) => x.combat?.column).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b); return c.length ? c[Math.floor(c.length / 2)] : null; })(),
      attackerFrom3PlusHexes: share(combat, (x) => (x.combat?.attackerStartDistance ?? []).some((d) => d !== null && d >= 3)),
      allAttackersAdjacentAtStart: share(combat, (x) => (x.combat?.attackerStartDistance ?? []).every((d) => d === 1)),
      defenderDg: share(combat, (x) => x.defenderDgAtStart), defenderOutOfTrace: share(combat, (x) => x.defenderOutOfTraceAtStart),
      defenderNotInContactAtStart: share(combat, (x) => x.defenderEnemyDistanceAtStart >= 2),
    } : {}),
    ...(taken.length ? {
      objectivesTaken: taken.length, garrisoned: share(taken, (x) => x.garrisonedAtStart), inCombat: share(taken, (x) => x.inCombat),
      takerFrom3PlusHexes: share(taken, (x) => x.enemyDistanceAtStart >= 3),
      combatColumnBelow6: share(taken.filter((x) => x.combat?.column !== null && x.combat?.column !== undefined), (x) => x.combat.column < 6),
      combatAttackerFrom3PlusHexes: share(taken.filter((x) => x.combat), (x) => (x.combat.attackerStartDistance ?? []).some((d) => d !== null && d >= 3)),
      combatKinds: Object.fromEntries([...new Set(taken.filter((x) => x.combat).map((x) => x.combat.kind))].map((kind) => [kind, taken.filter((x) => x.combat?.kind === kind).length])),
    } : {}),
    ...(attrition.length ? {
      attritionLosses: attrition.length, outOfTraceAtPStart: share(attrition, (x) => x.outOfTraceAtPStart),
      outOfTraceAtOStart: share(attrition, (x) => x.outOfTraceAtOStart),
      enemyWithin1AtPStart: share(attrition, (x) => x.enemyDistanceAtPStart <= 1), enemyBeyond3AtPStart: share(attrition, (x) => x.enemyDistanceAtPStart > 3),
      inTraceAtPStartRoutes: (() => {
        const traced = attrition.filter((x) => x.routesAtPStart);
        const kind = (x) => (x.routesAtPStart.includes('DRAW') ? 'draw' : x.routesAtPStart.includes('HQ fed') ? 'an HQ still fed' : x.routesAtPStart.includes('HQ unfed') ? 'only HQs now unfed' : 'only HQs now gone');
        return Object.fromEntries([...new Set(traced.map(kind))].map((k) => [k, traced.filter((x) => kind(x) === k).length]));
      })(),
    } : {}),
  };
}
writeFileSync(resolve(option('--out')), `${JSON.stringify({ summary, cases: reviewed }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
