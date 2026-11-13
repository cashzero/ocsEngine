// Attacker rail moves of SP, Game Turns 3-6: destination distance from the enemy and from the nearest front unit, and
// whether a front unit can draw the destination pile when the segment ends. node rail-dest.mjs <root> <arm=dir>...
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, ...arms] = process.argv.slice(2);
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const out = {};
for (const spec of arms) {
  const [label, dir] = spec.split('=');
  const rows = [];
  for (const file of readdirSync(dir).filter((f) => /^match-\d+\.save\.json$/u.test(f))) {
    const match = Number(file.match(/\d+/u)[0]);
    if (match % 2) continue;
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory.attackerId;
    const defs = new Map(state.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
    const isHq = (p) => String(defs.get(p.definitionId)?.categoryDefinitionId).endsWith(':hq');
    let pending = [];
    for (const action of save.acceptedActions) {
      const s = state.sequence;
      const inSeg = s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT' && s.phasingPlayerId === attackerId && s.gameTurn >= 3 && s.gameTurn <= 6;
      if (inSeg && action.kind === 'RAIL_MOVE') {
        const tokens = action.supply.filter((x) => !String(x.sourcePieceId).includes('-stock-')).reduce((a, x) => a + x.tokens, 0);
        if (tokens > 0) {
          const enemy = state.pieceState.pieces.filter((p) => p.ownerId !== attackerId && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p) && !/garrison/u.test(String(p.definitionId)));
          const d = (h) => Math.min(99, ...enemy.map((e) => m.hexDistanceBetween(String(e.location.hexId), String(h))));
          pending.push({ match, gameTurn: s.gameTurn, tokens, from: d(action.fromHexId), to: d(action.toHexId), toHexId: String(action.toHexId) });
        }
      }
      const next = m.ruleEngine.applyAction(state, action).state;
      const leaving = !(next.sequence.phase === 'MOVEMENT' && next.sequence.segment === 'MOVEMENT');
      if (inSeg && leaving && pending.length) {
        const enemyAll = next.pieceState.pieces.filter((p) => p.ownerId !== attackerId && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(next, p));
        const front = new Set(next.pieceState.pieces.filter((p) => p.ownerId === attackerId && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(next, p) && !isHq(p)
          && enemyAll.some((e) => m.hexDistanceBetween(String(e.location.hexId), String(p.location.hexId)) <= 4)).map((p) => String(p.location.hexId)));
        const feeds = m.ruleEngine.queryFeedCoverage(next, attackerId, null).value ?? [];
        const drawable = new Set(feeds.filter((f) => f.hexIds.some((h) => front.has(String(h)))).map((f) => { const p = next.pieceState.pieces.find((x) => x.id === f.dumpId); return p?.location.kind === 'ON_MAP' ? String(p.location.hexId) : null; }));
        for (const row of pending) rows.push({ ...row, frontDrawable: drawable.has(row.toHexId) });
        pending = [];
      }
      state = next;
    }
  }
  const sum = (f) => rows.filter(f).reduce((a, r) => a + r.tokens, 0) / 4;
  const all = sum(() => true);
  out[label] = { moves: rows.length, sp: all, toNear: sum((r) => r.to < 6), toMid: sum((r) => r.to >= 6 && r.to < 10), toFar: sum((r) => r.to >= 10), frontDrawable: sum((r) => r.frontDrawable), meanTo: rows.reduce((a, r) => a + r.to * r.tokens, 0) / rows.reduce((a, r) => a + r.tokens, 0) };
}
console.log(JSON.stringify(out, null, 1));
