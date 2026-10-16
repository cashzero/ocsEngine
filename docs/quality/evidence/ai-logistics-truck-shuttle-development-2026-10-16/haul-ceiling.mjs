// Per attacker Movement Segment from turn 3: truck points, SP the trucks could load (dumps >= 5 hexes from enemy, not
// garrison stock, minus SP railed/shipped/unloaded this phase), and SP actually loaded. Usage: node haul-ceiling.mjs <root> <dir...>
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, ...dirs] = process.argv.slice(2);
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const totals = {};
for (const dir of dirs) {
  const records = existsSync(join(dir, 'summary.json')) ? JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records : [];
  for (const file of readdirSync(dir).filter((n) => n.endsWith('.save.json'))) {
    const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory.attackerId;
    const record = records.find(({ match }) => file === `match-${match}.save.json`);
    const policy = record?.sides[String(attackerId).endsWith('axis') ? 'axis' : 'allied'].policy ?? '?';
    const t = totals[policy] ??= { segs: 0, points: 0, loadableAtFirstTruck: 0, loaded: 0, income: 0 };
    const defs = new Map(state.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
    let key = null; let counted = false; let firstTruck = false;
    const loadable = (s) => {
      const enemy = s.pieceState.pieces.filter((p) => p.ownerId !== attackerId && m.isOnMapCombatUnit(s, p) && !/garrison/u.test(String(p.definitionId)));
      let tokens = 0;
      for (const p of s.pieceState.pieces) {
        if (p.ownerId !== attackerId || p.location.kind !== 'ON_MAP' || defs.get(p.definitionId)?.family !== 'RESOURCE' || String(p.id).includes('-stock-')) continue;
        const d = Math.min(99, ...enemy.map((e) => m.hexDistanceBetween(e.location.hexId, p.location.hexId)));
        if (d >= 5) tokens += Math.max(0, (p.resourceQuantity ?? 0) - (s.usage.find((u) => u.pieceId === p.id)?.unloadedTokens ?? 0));
      }
      return tokens;
    };
    for (const action of save.acceptedActions) {
      const q = state.sequence;
      const inMove = q.phase === 'MOVEMENT' && q.segment === 'MOVEMENT' && q.phasingPlayerId === attackerId && q.gameTurn >= 3;
      if (inMove && key !== q.gameTurn) {
        key = q.gameTurn; counted = true; firstTruck = false; t.segs += 1;
        t.points += state.pieceState.pieces.filter((p) => p.ownerId === attackerId && p.location.kind === 'ON_MAP' && m.isTransportPoint(state, p) && !m.isExtender(state, p)).reduce((a, p) => a + m.transportPointsOf(state, p), 0);
      }
      if (inMove && !firstTruck && ['MOVE_PIECE', 'LOAD_SUPPLY', 'UNLOAD_SUPPLY'].includes(action.kind)) {
        const id = action.truckId ?? action.pieceId; const p = state.pieceState.pieces.find((x) => x.id === id);
        if (p && m.isTransportPoint(state, p)) { firstTruck = true; t.loadableAtFirstTruck += loadable(state) / 4; }
      }
      if (inMove && action.kind === 'LOAD_SUPPLY') t.loaded += action.tokens / 4;
      const next = m.ruleEngine.applyAction(state, action);
      if (state.sequence.gameTurn >= 3) for (const e of next.events) if (e.kind === 'SUPPLY_ARRIVED' && e.playerId === attackerId) t.income += (e.tokens ?? 0) / 4;
      state = next.state;
    }
  }
}
for (const [p, t] of Object.entries(totals)) console.log(`${p.slice(0, 30).padEnd(30)} segs ${t.segs} pts/seg ${(t.points / t.segs).toFixed(1)} loadable-at-first-truck SP/seg ${(t.loadableAtFirstTruck / t.segs).toFixed(1)} loaded SP/seg ${(t.loaded / t.segs).toFixed(1)} haul ${(t.loaded / t.points).toFixed(2)} ceiling(loadable/pts) ${(t.loadableAtFirstTruck / t.points).toFixed(2)} income SP/seg ${(t.income / t.segs).toFixed(1)}`);
