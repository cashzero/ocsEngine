#!/usr/bin/env node
// How hard each side's trucks work: replays ai-match saves and, per Movement Segment from Game Turn 3, counts trucks and
// truck points on the map, LOAD_SUPPLY actions per truck (the trips it made) and SP loaded. Build first.
// Usage: node scripts/ai-truck-trips.mjs <dist directory> <match directory> [...]
// The dist directory is the build that played the games, so older saves replay under their own rules.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [distDir, ...dirs] = process.argv.slice(2);
const m = await import(pathToFileURL(join(distDir, 'index.js')).href);
const acc = {};
const bump = (r, k, v) => { acc[r] ??= {}; acc[r][k] = (acc[r][k] ?? 0) + v; };
const hist = {};
for (const dir of dirs) {
  const records = existsSync(join(dir, 'summary.json')) ? JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records : [];
  for (const file of readdirSync(dir).filter((n) => n.endsWith('.save.json'))) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId ?? null;
    const record = records.find(({ match }) => file === `match-${match}.save.json`);
    const sideOf = (p) => (String(p).endsWith('axis') ? 'axis' : 'allied');
    const role = (p) => `${p === attackerId ? 'attacker' : 'defender'} ${record?.sides[sideOf(p)].policy ?? ''}`;
    let seg = null; let loads = new Map();
    const close = () => {
      if (!seg) return;
      const r = role(seg.player);
      bump(r, 'segments', 1);
      bump(r, 'trucks', seg.trucks);
      for (const n of loads.values()) { hist[r] ??= {}; hist[r][n] = (hist[r][n] ?? 0) + 1; }
      hist[r] ??= {}; hist[r][0] = (hist[r][0] ?? 0) + seg.trucks - loads.size;
      seg = null; loads = new Map();
    };
    for (const action of save.acceptedActions) {
      const s = state.sequence;
      const inMove = s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT';
      const key = `${s.gameTurn}:${s.playerTurnIndex}`;
      if (seg && (!inMove || seg.key !== key)) close();
      if (inMove && !seg && s.gameTurn >= 3) {
        const trucks = state.pieceState.pieces.filter((p) => p.ownerId === s.phasingPlayerId && p.location.kind === 'ON_MAP' && m.isTransportPoint(state, p) && !m.isExtender(state, p));
        seg = { key, player: s.phasingPlayerId, trucks: trucks.length };
        bump(role(s.phasingPlayerId), 'truckPoints', trucks.reduce((t, p) => t + m.transportPointsOf(state, p), 0));
      }
      if (seg && action.kind === 'LOAD_SUPPLY' && action.actorId === seg.player) {
        loads.set(action.truckId, (loads.get(action.truckId) ?? 0) + 1);
        bump(role(seg.player), 'loadedSp', action.tokens / 4);
        bump(role(seg.player), 'loads', 1);
      }
      state = m.ruleEngine.applyAction(state, action).state;
    }
    close();
  }
}
for (const [r, a] of Object.entries(acc)) {
  console.log(`${r}: segments ${a.segments}, trucks/seg ${(a.trucks / a.segments).toFixed(2)}, truck pts/seg ${(a.truckPoints / a.segments).toFixed(1)}, loads/truck/seg ${(a.loads / a.trucks).toFixed(2)}, SP loaded/seg ${(a.loadedSp / a.segments).toFixed(1)}, SP per load ${(a.loadedSp / a.loads).toFixed(2)}`);
  console.log(`   loads-per-truck histogram ${JSON.stringify(hist[r])}`);
}
