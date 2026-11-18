// node docs/quality/evidence/ai-s9-eastern-attack-2026-11-18/reach.mjs <attack match directory> [...] (build first)
// At the start of each Game Turn, for every objective the attacker (heuristic@88, the "heuristic" seat) does not hold:
// hexes to its nearest combat unit and to the nearest hex of its side's trace coverage, and whether the objective is
// defended. Summarised by map style and turn.
import { readFileSync } from 'node:fs';
const m = await import('../../../../dist/index.js');
const rows = [];
for (const dir of process.argv.slice(2)) {
  for (const record of JSON.parse(readFileSync(`${dir}/summary.json`, 'utf8')).records) {
    if (record.sides.axis.policy !== 'heuristic') continue;
    const save = JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`, 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory.attackerId;
    const measure = (s) => {
      const own = s.pieceState.pieces.filter((p) => p.ownerId === attackerId && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(s, p));
      const covered = (m.ruleEngine.queryTraceCoverage(s, attackerId, null).value?.hexIds ?? []).map(String);
      for (const { hexId, points } of s.configuration.objectives) {
        if (s.mapState.hexControl.find((e) => String(e.hexId) === String(hexId))?.controllerId === attackerId) continue;
        const defended = s.pieceState.pieces.some((p) => p.ownerId !== attackerId && p.location.kind === 'ON_MAP' && String(p.location.hexId) === String(hexId) && m.isOnMapCombatUnit(s, p));
        rows.push({ style: record.summary.mapStyle, turn: s.sequence.gameTurn, points, defended,
          unit: Math.min(...own.map((p) => m.hexDistanceBetween(p.location.hexId, hexId))),
          trace: covered.length ? Math.min(...covered.map((h) => m.hexDistanceBetween(h, hexId))) : 99 });
      }
    };
    measure(state);
    let turn = 1;
    for (const action of save.acceptedActions) {
      state = m.ruleEngine.applyAction(state, action).state;
      if (state.sequence.gameTurn !== turn) { turn = state.sequence.gameTurn; measure(state); }
    }
  }
}
const mean = (list, f) => list.reduce((t, e) => t + f(e), 0) / Math.max(1, list.length);
for (const style of ['WESTERN_EUROPE', 'EASTERN_EUROPE']) {
  console.log(`== ${style}: objectives not held at the start of the Game Turn, a game (40 games)`);
  console.log('  turn  open  VP  toUnit  toTrace  inTrace  1-3 outside  4+ outside');
  for (let turn = 1; turn <= 8; turn += 1) {
    const list = rows.filter((r) => r.style === style && r.turn === turn);
    const vp = (test) => (list.filter(test).reduce((t, r) => t + r.points, 0) / 40).toFixed(2);
    console.log(`  ${turn}  ${(list.length / 40).toFixed(2)}  ${vp(() => true)}  ${mean(list, (r) => r.unit).toFixed(1)}  ${mean(list, (r) => r.trace).toFixed(1)}  ${vp((r) => r.trace === 0)}  ${vp((r) => r.trace >= 1 && r.trace <= 3)}  ${vp((r) => r.trace >= 4)}`);
  }
}
