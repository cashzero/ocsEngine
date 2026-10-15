// Objectives not ours and without enemy combat units, with an own mobile combat unit within its MA at the start of
// our player turn, still not ours at its end. node missed-capture.mjs <dist> <match dir>...
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [build, ...dirs] = process.argv.slice(2);
const m = await import(pathToFileURL(resolve(build, 'index.js')));
const { analyze } = await import(pathToFileURL(resolve(build, 'ai/analysis.js')));
const out = { cand: { chances: 0, missed: 0, vp: 0 }, base: { chances: 0, missed: 0, vp: 0 } };
for (const dir of dirs) {
  const summary = JSON.parse(readFileSync(join(dir, 'summary.json')));
  for (const record of summary.records) {
    const who = Object.fromEntries(Object.entries(record.sides).map(([side, s]) => [`player:${side}`, s.policy.startsWith('heuristic@') ? 'base' : 'cand']));
    const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`)));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const facts = { scenario: state.scenario, turnLimit: state.configuration.turnLimit };
    const turns = []; let key = '';
    for (const action of save.acceptedActions) {
      const k = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}`;
      if (k !== key) { key = k; turns.push(state); }
      state = m.ruleEngine.applyAction(state, action).state;
    }
    turns.push(state);
    for (let i = 0; i + 1 < turns.length; i++) {
      const start = turns[i], end = turns[i + 1], owner = start.sequence.actingPlayerId;
      const s = analyze(m.ruleEngine.projectForViewer(start, owner), owner, facts);
      const endObj = m.ruleEngine.projectForViewer(end, owner).objectives;
      for (const o of s.objectives) {
        if (o.controllerId === owner || s.enemy.get(o.hexId)?.hasCombatUnit) continue;
        const near = s.own.filter(u => s.isCombatUnit(u) && (u.profile?.movement ?? 0) > 0 && m.hexDistanceBetween(u.hexId, o.hexId) <= Math.max(1, Math.floor(u.profile.movement / 2)));
        if (!near.length) continue;
        const w = who[owner]; out[w].chances += 1;
        if (endObj.find(x => x.hexId === o.hexId)?.controllerId !== owner) {
          out[w].missed += 1; out[w].vp += o.points;
          if (w === 'cand') console.log(record.match, `T${start.sequence.gameTurn}.${start.sequence.playerTurnIndex}`, o.hexId, o.points + 'VP', o.controllerId ? 'enemy' : 'neutral', near.slice(0, 2).map(u => `${String(u.piece.id).split(':').at(-2)}@${u.hexId} d${m.hexDistanceBetween(u.hexId, o.hexId)} mv${u.profile.movement}`).join(' '));
        }
      }
    }
  }
}
console.log(JSON.stringify(out));
