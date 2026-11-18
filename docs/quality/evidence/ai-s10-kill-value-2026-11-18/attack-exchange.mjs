// node docs/quality/evidence/ai-s10-kill-value-2026-11-18/attack-exchange.mjs <attack match directory> [...] (build first)
// every regular attack of heuristic@88 as the attacker: Combat Table column, steps each side lost while it
// resolved, whether the target was an objective and the outcome, and the bot's intent for the declaration.
import { readFileSync, writeFileSync } from 'node:fs';
const m = await import('../../../../dist/index.js');
const rows = [];
for (const dir of process.argv.slice(2)) {
  for (const record of JSON.parse(readFileSync(`${dir}/summary.json`, 'utf8')).records) {
    if (record.sides.axis.policy !== 'heuristic') continue;
    const save = JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`, 'utf8'));
    const trace = new Map(readFileSync(`${dir}/match-${record.match}.trace.jsonl`, 'utf8').split('\n').filter(Boolean).map(JSON.parse)
      .filter((row) => row.status === 'ACCEPTED').map((row) => [row.revision, row]));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory.attackerId;
    const objectives = new Map(state.configuration.objectives.map(({ hexId, points }) => [String(hexId), points]));
    const controller = (s, hexId) => s.mapState.hexControl.find((e) => String(e.hexId) === hexId)?.controllerId ?? null;
    let pending = null;
    for (const [revision, action] of save.acceptedActions.entries()) {
      if (action.kind === 'DECLARE_COMBAT' && action.actorId === attackerId && action.combatKind === 'REGULAR') {
        const hexId = String(action.targetHexId);
        pending = { match: record.match, style: record.summary.mapStyle, turn: state.sequence.gameTurn, hexId, objective: objectives.get(hexId) ?? 0,
          heldBefore: controller(state, hexId) === attackerId, column: m.forecastCombat(m.ruleEngine.explain(state, action).facts)?.columnIndex ?? null,
          attackers: action.attackerIds.length, intent: trace.get(revision)?.intent ?? null, ownLost: 0, enemyLost: 0 };
      }
      const next = m.ruleEngine.applyAction(state, action);
      if (pending) {
        for (const event of next.events) {
          if (event.kind !== 'STEP_LOST') continue;
          const piece = state.pieceState.pieces.find((p) => p.id === event.pieceId) ?? next.state.pieceState.pieces.find((p) => p.id === event.pieceId);
          if (piece?.ownerId === attackerId) pending.ownLost += 1; else pending.enemyLost += 1;
        }
      }
      state = next.state;
      if (pending && state.activeTransaction === null && state.pendingDecision === null) {
        const defended = state.pieceState.pieces.some((p) => p.ownerId !== attackerId && p.location.kind === 'ON_MAP' && String(p.location.hexId) === pending.hexId && m.isOnMapCombatUnit(state, p));
        rows.push({ ...pending, outcome: defended ? 'stayed' : controller(state, pending.hexId) === attackerId ? 'taken' : 'cleared' });
        pending = null;
      }
    }
  }
}
writeFileSync('artifacts/ai-next/attack-exchange.json', JSON.stringify(rows));
const mean = (list, f) => list.reduce((t, e) => t + f(e), 0) / Math.max(1, list.length);
for (const [label, test] of [['objective attacks', (r) => r.objective > 0 && !r.heldBefore], ['other attacks', (r) => !(r.objective > 0 && !r.heldBefore)]]) {
  console.log(`== ${label}`);
  for (const [band, lo, hi] of [['0-3', 0, 3], ['4-5', 4, 5], ['6-7', 6, 7], ['8-9', 8, 9], ['10+', 10, 99]]) {
    const list = rows.filter((r) => test(r) && r.column !== null && r.column >= lo && r.column <= hi);
    if (!list.length) continue;
    console.log(`  column ${band}: ${(list.length / 80).toFixed(2)} a game; attacker lost ${mean(list, (r) => r.ownLost).toFixed(2)}, defender lost ${mean(list, (r) => r.enemyLost).toFixed(2)}, Kill - Loss ${mean(list, (r) => r.enemyLost - r.ownLost).toFixed(2)}; taken ${mean(list, (r) => r.outcome === 'taken').toFixed(2)}, stayed ${mean(list, (r) => r.outcome === 'stayed').toFixed(2)}; attackers ${mean(list, (r) => r.attackers).toFixed(1)}`);
  }
}
const low = rows.filter((r) => r.objective > 0 && !r.heldBefore && r.column !== null && r.column <= 3);
const kinds = {}; for (const r of low) { const k = (/\(([a-z-]+)/.exec(r.intent ?? '')?.[1] ?? r.intent ?? 'none').slice(0, 40); kinds[k] = (kinds[k] ?? 0) + 1; }
console.log('low-odds objective attacks by intent:', JSON.stringify(kinds));
console.log('low-odds objective attacks by turn:', JSON.stringify(low.reduce((acc, r) => ({ ...acc, [r.turn]: (acc[r.turn] ?? 0) + 1 }), {})));
