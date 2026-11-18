// node docs/quality/evidence/ai-s9-eastern-attack-2026-11-18/never-attacked.mjs <attack match directory> [...] (after scripts/ai-attack-progress-study.mjs; build first)
// objectives never attacked and not held at the end, for the attacker heuristic@88: was any unit ever sent at
// them (trace intents), from which Game Turn, how near the attacker's combat units came, and how far it started.
import { readFileSync } from 'node:fs';
const m = await import('../../../../dist/index.js');
const attacks = JSON.parse(readFileSync('artifacts/ai-next/progress-all.json', 'utf8')).attacks;
const attacked = new Set(attacks.map((a) => `${a.match}|${a.hexId}`));
const rows = [];
for (const dir of process.argv.slice(2)) {
  for (const record of JSON.parse(readFileSync(`${dir}/summary.json`, 'utf8')).records) {
    if (record.sides.axis.policy !== 'heuristic') continue;
    const save = JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`, 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory.attackerId;
    const final = m.parseGameStateJson(save.currentSnapshot).value;
    const targets = state.configuration.objectives.filter(({ hexId }) => final.mapState.hexControl.find((e) => String(e.hexId) === String(hexId))?.controllerId !== attackerId
      && !attacked.has(`${record.match}|${hexId}`)).map(({ hexId, points }) => ({ hexId: String(hexId), points, near: Infinity, start: null, intents: 0, firstIntentTurn: null, turnsTargeted: new Set(), nearByTurn: {} }));
    if (targets.length === 0) continue;
    const units = (s) => s.pieceState.pieces.filter((p) => p.ownerId === attackerId && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(s, p));
    const measure = (s) => { const own = units(s); for (const t of targets) { const d = Math.min(...own.map((p) => m.hexDistanceBetween(p.location.hexId, t.hexId))); t.near = Math.min(t.near, d); t.start ??= d; t.nearByTurn[s.sequence.gameTurn] = Math.min(t.nearByTurn[s.sequence.gameTurn] ?? Infinity, d); } };
    measure(state);
    for (const action of save.acceptedActions) { const next = m.ruleEngine.applyAction(state, action).state; if (action.kind === 'MOVE_PIECE' && action.actorId === attackerId) measure(next); state = next; }
    for (const line of readFileSync(`${dir}/match-${record.match}.trace.jsonl`, 'utf8').split('\n')) {
      if (!line) continue; const row = JSON.parse(line);
      if (row.seatId !== 'seat:axis') continue;
      const match = /\((assault|capture|hunt) ([^)]+)\)/u.exec(row.intent ?? ''); if (!match) continue;
      const t = targets.find((entry) => entry.hexId === match[2]); if (!t) continue;
      const turn = Number(String(row.stepKey).split(':')[0]); t.intents += 1; t.firstIntentTurn ??= turn; t.turnsTargeted.add(turn);
    }
    for (const t of targets) rows.push({ match: record.match, style: record.summary.mapStyle, ...t, turnsTargeted: t.turnsTargeted.size });
  }
}
for (const style of ['WESTERN_EUROPE', 'EASTERN_EUROPE']) {
  const list = rows.filter((r) => r.style === style); const n = 40;
  const vp = (some) => (some.reduce((t, r) => t + r.points, 0) / n).toFixed(2);
  console.log(`== ${style}: ${(list.length / n).toFixed(2)} never attacked a game (${vp(list)} VP); started ${(list.reduce((t, r) => t + r.start, 0) / list.length).toFixed(1)} hexes away`);
  const never = list.filter((r) => r.intents === 0);
  console.log(`  no unit was ever sent at it: ${(never.length / n).toFixed(2)} a game (${vp(never)} VP), nearest approach ${(never.reduce((t, r) => t + r.near, 0) / Math.max(1, never.length)).toFixed(1)}`);
  const sent = list.filter((r) => r.intents > 0);
  console.log(`  a unit was sent at it: ${(sent.length / n).toFixed(2)} a game (${vp(sent)} VP); first in Game Turn ${(sent.reduce((t, r) => t + r.firstIntentTurn, 0) / Math.max(1, sent.length)).toFixed(1)}, in ${(sent.reduce((t, r) => t + r.turnsTargeted, 0) / Math.max(1, sent.length)).toFixed(1)} turns, nearest approach ${(sent.reduce((t, r) => t + r.near, 0) / Math.max(1, sent.length)).toFixed(1)}`);
  for (const [label, test] of [['came beside it', (r) => r.near <= 1], ['came within 2-3', (r) => r.near >= 2 && r.near <= 3], ['never within 3', (r) => r.near > 3]]) console.log(`    ${label}: ${(sent.filter(test).length / n).toFixed(2)} a game (${vp(sent.filter(test))} VP)`);
}
