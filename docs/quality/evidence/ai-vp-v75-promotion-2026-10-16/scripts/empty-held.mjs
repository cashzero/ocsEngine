// Held objectives left empty through a whole own player turn, and whether the opponent then took them.
// node empty-held.mjs <dist> <match dir>...
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [build, ...dirs] = process.argv.slice(2);
const m = await import(pathToFileURL(resolve(build, 'index.js')));
const out = { cand: { empty: 0, lostAfter: 0, vpLost: 0, mobileNear: 0 }, base: { empty: 0, lostAfter: 0, vpLost: 0, mobileNear: 0 } };
for (const dir of dirs) {
  const summary = JSON.parse(readFileSync(join(dir, 'summary.json')));
  for (const record of summary.records) {
    const who = Object.fromEntries(Object.entries(record.sides).map(([side, s]) => [`player:${side}`, s.policy.startsWith('heuristic@') ? 'base' : 'cand']));
    const save = JSON.parse(readFileSync(join(dir, `match-${record.match}.save.json`)));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const objectives = state.configuration.objectives;
    const control = (s, hexId) => m.ruleEngine.projectForViewer(s, 'player:allied').objectives.find(o => o.hexId === hexId)?.controllerId ?? null;
    const combatAt = (s, owner, hexId) => s.pieceState.pieces.some(p => p.ownerId === owner && p.location.kind === 'ON_MAP' && p.location.hexId === hexId && p.remainingSteps !== null
      && m.ruleEngine.projectForViewer(s, owner).stacks.flatMap(x => x.pieces).find(q => q.id === p.id)?.role === 'COMBAT');
    const turns = [];
    let key = '';
    const snap = (s) => turns.push({ owner: s.sequence.actingPlayerId, state: s });
    for (const action of save.acceptedActions) {
      const k = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}`;
      if (k !== key) { key = k; snap(state); }
      state = m.ruleEngine.applyAction(state, action).state;
    }
    snap(state);
    for (let i = 0; i + 2 < turns.length; i++) {
      const { owner, state: start } = turns[i];
      const end = turns[i + 1].state, after = turns[i + 2].state;
      for (const o of objectives) {
        if (control(start, o.hexId) !== owner || combatAt(start, owner, o.hexId) || combatAt(end, owner, o.hexId)) continue;
        const w = who[owner];
        out[w].empty += 1;
        if (control(after, o.hexId) !== owner) { out[w].lostAfter += 1; out[w].vpLost += o.points;
          const proj = m.ruleEngine.projectForViewer(start, owner);
          const mobile = proj.stacks.filter(x => x.location.kind === 'ON_MAP').flatMap(x => x.pieces.filter(q => q.ownerId === owner && q.role === 'COMBAT').map(q => ({ q, hex: x.location.hexId })))
            .map(({ q, hex }) => ({ hex, d: m.hexDistanceBetween(hex, o.hexId), name: String(q.id).split(':').at(-2) })).filter(x => !x.name.startsWith('garrison')).sort((a, b) => a.d - b.d).slice(0, 2);
          if (w === 'cand') console.log(record.match, `T${start.sequence.gameTurn}.${start.sequence.playerTurnIndex}`, o.hexId, o.points + 'VP', JSON.stringify(mobile));
        }
      }
    }
  }
}
console.log(JSON.stringify(out));
