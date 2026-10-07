#!/usr/bin/env node
// Out-of-trace census (M9 strategy study): for every Supply Phase of the side a policy played, each combat unit out of its own
// trace and what enemy stands within 3 hexes (objective garrison, other combat units, nobody). Build first: `npm run build`.
//   node scripts/ai-oos-census.mjs <ai-match output dir> <policy as printed in summary.json>
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const [dir, policy] = process.argv.slice(2);
const summary = JSON.parse(readFileSync(`${dir}/summary.json`, 'utf8'));
if (!dir || !policy) { console.error("usage: node scripts/ai-oos-census.mjs <dir> <policy>"); process.exit(2); }
const tally = { units: 0, garrisonWithin3: 0, combatEnemyWithin3: 0, noEnemyWithin3: 0, sideTraceOk: 0, garrisonOnly: 0 };
for (const record of summary.records) {
  const side = Object.entries(record.sides).find(([, info]) => info.policy === policy)?.[0];
  if (!side) continue;
  const save = JSON.parse(readFileSync(`${dir}/match-${record.match}.save.json`, 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  let lastKey = '';
  const garrisonIds = new Set(state.scenario.pieceCatalog.definitions.filter((d) => /Objective Garrison/.test(d.name)).map((d) => d.id));
  for (const action of save.acceptedActions) {
    const s = state.sequence;
    const key = `${s.gameTurn}`;
    if (s.phase === 'SUPPLY' && String(s.phasingPlayerId).endsWith(side) && key !== lastKey) {
      lastKey = key;
      const me = s.phasingPlayerId;
      const sideCov = new Set(m.ruleEngine.queryTraceCoverage(state, me, null).value.hexIds);
      const enemy = state.pieceState.pieces.filter((p) => p.ownerId !== me && p.location.kind === 'ON_MAP' && p.remainingSteps !== null);
      for (const p of state.pieceState.pieces.filter((x) => x.ownerId === me && x.location.kind === 'ON_MAP' && x.remainingSteps !== null)) {
        if (m.ruleEngine.queryTraceCoverage(state, me, p.id).value.hexIds.includes(p.location.hexId)) continue;
        tally.units++;
        if (sideCov.has(p.location.hexId)) tally.sideTraceOk++;
        const near = enemy.filter((e) => m.hexDistanceBetween(e.location.hexId, p.location.hexId) <= 3);
        const g = near.some((e) => garrisonIds.has(e.definitionId)); const c = near.some((e) => !garrisonIds.has(e.definitionId));
        if (g) tally.garrisonWithin3++; if (c) tally.combatEnemyWithin3++; if (!near.length) tally.noEnemyWithin3++; if (g && !c) tally.garrisonOnly++;
      }
    }
    state = m.ruleEngine.applyAction(state, action).state;
  }
}
console.log(policy, JSON.stringify(tally));
