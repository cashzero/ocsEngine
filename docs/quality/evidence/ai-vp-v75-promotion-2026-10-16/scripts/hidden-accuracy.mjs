// Compares hidden-stack strength estimators with the truth at every player-turn start of saved games.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [build, ...dirs] = process.argv.slice(2);
const m = await import(pathToFileURL(resolve(build, 'index.js')));
const { knowledgeOf } = await import(pathToFileURL(resolve(build, 'ai/knowledge.js')));
const GROUND = ['COMBAT', 'ARTILLERY', 'HQ'];
const err = { old: [], oob: [], oobTop: [] };
for (const dir of dirs) for (const f of readdirSync(dir).filter(f => f.endsWith('.save.json'))) {
  const save = JSON.parse(readFileSync(join(dir, f)));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const facts = { scenario: state.scenario, turnLimit: state.configuration.turnLimit };
  const k = knowledgeOf(facts);
  const defs = new Map(state.scenario.pieceCatalog.definitions.map(d => [String(d.id), d]));
  const oobAvg = {};
  for (const owner of ['player:allied', 'player:axis']) {
    let n = 0, s = 0;
    for (const p of state.scenario.initialPieceState.pieces) {
      if (p.ownerId !== owner) continue;
      const d = defs.get(String(p.definitionId));
      if (!d || d.family === 'AIR' || d.facility) continue;
      n += 1;
      if (['COMBAT', 'ARTILLERY', 'HQ'].includes(d.counter?.kind)) s += k.profile({ definitionId: p.definitionId, currentFaceId: p.currentFaceId, remainingSteps: null })?.strength ?? 0;
    }
    oobAvg[owner] = s / Math.max(1, n);
  }
  let key = '';
  const sample = () => {
    for (const viewer of ['player:allied', 'player:axis']) {
      const enemyId = viewer === 'player:allied' ? 'player:axis' : 'player:allied';
      const proj = m.ruleEngine.projectForViewer(state, viewer);
      const vis = proj.stacks.flatMap(s => s.pieces).filter(p => p.ownerId !== viewer && p.role === 'COMBAT').map(p => k.profile(p)?.strength ?? 0).filter(v => v > 0);
      const avgVis = vis.length ? vis.reduce((a, b) => a + b, 0) / vis.length : 4;
      for (const st of proj.stacks) {
        if (st.location.kind !== 'ON_MAP' || st.hiddenCount === 0) continue;
        const hexId = st.location.hexId;
        const truth = state.pieceState.pieces.filter(p => p.ownerId === enemyId && p.location.kind === 'ON_MAP' && p.location.hexId === hexId)
          .map(p => ({ p, role: m.ruleEngine.projectForViewer ? null : null }));
        const tp = m.ruleEngine.projectForViewer(state, enemyId).stacks.find(s => s.location.kind === 'ON_MAP' && s.location.hexId === hexId);
        const trueStr = (tp?.pieces ?? []).filter(p => p.ownerId === enemyId && GROUND.includes(p.role)).reduce((a, p) => a + (k.profile(p)?.strength ?? 0), 0);
        const visible = st.pieces.filter(p => p.ownerId !== viewer);
        const visStr = visible.filter(p => GROUND.includes(p.role)).reduce((a, p) => a + (k.profile(p)?.strength ?? 0), 0);
        const hasCombatTop = visible.some(p => p.role === 'COMBAT');
        err.old.push(visStr + st.hiddenCount * avgVis - trueStr);
        err.oob.push(visStr + st.hiddenCount * oobAvg[enemyId] - trueStr);
        err.oobTop.push(visStr + (hasCombatTop ? st.hiddenCount * oobAvg[enemyId] : 0) - trueStr);
      }
    }
  };
  for (const action of save.acceptedActions) {
    const kk = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}`;
    if (kk !== key) { key = kk; sample(); }
    state = m.ruleEngine.applyAction(state, action).state;
  }
}
for (const [name, e] of Object.entries(err)) {
  const mean = e.reduce((a, b) => a + b, 0) / e.length, mae = e.reduce((a, b) => a + Math.abs(b), 0) / e.length;
  console.log(name, 'n', e.length, 'bias', mean.toFixed(2), 'MAE', mae.toFixed(2));
}
