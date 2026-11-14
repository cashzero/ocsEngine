// Could an HQ have bridged SP no front unit can draw to the front? At the end of each attacker Movement segment (Game
// Turns 3-6): for each pile no front unit can draw, is there an own HQ and a hex it could reach this segment (Move Mode,
// from where it began the segment, 3+ hexes from the enemy) within the pile's draw reach (12.3a) from which, fed, its
// throw (12.3b) reaches a front unit? An upper bound: moving that HQ may cost elsewhere.
//   node hq-bridge.mjs <root> <arm=dir>... [--shard i/n]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : '0/1';
const [shard, shards] = shardArg.split('/').map(Number);
const [root, ...specs] = args.filter((a, i) => a !== '--shard' && args[i - 1] !== '--shard');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const jobs = specs.flatMap((spec) => { const [arm, dir] = spec.split('='); return readdirSync(dir).filter((f) => /^match-\d+\.save\.json$/u.test(f)).sort().map((f) => ({ arm, dir, f })); })
  .filter(({ f }) => Number(f.match(/\d+/u)[0]) % 2 === 0).filter((_, i) => i % shards === shard);
for (const { arm, dir, f } of jobs) {
  const save = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const match = Number(f.match(/\d+/u)[0]);
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const me = state.configuration.attackVictory.attackerId;
  const defs = new Map(state.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
  const isHq = (p) => String(defs.get(p.definitionId)?.categoryDefinitionId).endsWith(':hq');
  let start = null;
  for (const action of save.acceptedActions) {
    const s = state.sequence;
    const inSeg = s.gameTurn >= 3 && s.gameTurn <= 6 && s.phasingPlayerId === me && s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT';
    if (inSeg && !start) {
      const enemy = state.pieceState.pieces.filter((p) => p.ownerId !== me && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p));
      const safe = (h) => Math.min(99, ...enemy.map((e) => m.hexDistanceBetween(String(e.location.hexId), String(h)))) >= 3;
      start = { gameTurn: s.gameTurn, hqs: state.pieceState.pieces.filter((p) => p.ownerId === me && p.location.kind === 'ON_MAP' && isHq(p)).map((hq) => ({
        id: hq.id, from: String(hq.location.hexId),
        mobile: (m.ruleEngine.queryMovementRange(state, me, hq.id).value ?? []).length > 0 || m.ruleEngine.getActionCandidates(state, { actorId: me, kind: 'PAY_FUEL', pieceId: hq.id, budget: 20 }).actions.length > 0,
        reach: [String(hq.location.hexId), ...(m.ruleEngine.queryProjectedReach(state, me, hq.id, hq.location.hexId, 'MOVE').value ?? []).map(({ hexId }) => String(hexId))].filter(safe) })) };
    }
    const next = m.ruleEngine.applyAction(state, action).state;
    if (inSeg && !(next.sequence.phase === 'MOVEMENT' && next.sequence.segment === 'MOVEMENT')) {
      const end = next;
      const enemyAll = end.pieceState.pieces.filter((p) => p.ownerId !== me && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(end, p));
      const front = new Set(end.pieceState.pieces.filter((p) => p.ownerId === me && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(end, p) && !isHq(p)
        && enemyAll.some((e) => m.hexDistanceBetween(String(e.location.hexId), String(p.location.hexId)) <= 4)).map((p) => String(p.location.hexId)));
      let stranded = 0; let bridgeable = 0; let piles = 0; let bridged = 0; let mobileBridgeable = 0;
      const throwCache = new Map();
      for (const feed of m.ruleEngine.queryFeedCoverage(end, me, null).value ?? []) {
        if (String(feed.dumpId).includes('-stock-') || feed.hexIds.some((h) => front.has(String(h)))) continue;
        const dump = end.pieceState.pieces.find((p) => p.id === feed.dumpId);
        if (!dump || dump.location.kind !== 'ON_MAP') continue;
        stranded += feed.tokens; piles += 1;
        const draw = new Set((m.ruleEngine.queryDrawReach(end, me, dump.location.hexId).value ?? []).map(String));
        let ok = false; let okMobile = false;
        for (const hq of start.hqs) {
          if (!end.pieceState.pieces.some((p) => p.id === hq.id && p.location.kind === 'ON_MAP')) continue;
          for (const h of hq.reach) {
            if (!draw.has(h)) continue;
            const key = `${hq.id}|${h}`;
            let t = throwCache.get(key);
            if (t === undefined) { const v = m.ruleEngine.queryHqThrow(end, me, hq.id, h).value; t = v?.fed ? new Set(v.hexIds.map(String)) : new Set(); throwCache.set(key, t); }
            if ([...front].some((fh) => t.has(fh))) { ok = true; if (hq.mobile) okMobile = true; break; }
          }
          if (okMobile) break;
        }
        if (ok) { bridgeable += feed.tokens; bridged += 1; }
        if (okMobile) mobileBridgeable += feed.tokens;
      }
      console.log(JSON.stringify({ arm, match, gameTurn: start.gameTurn, strandedTokens: stranded, bridgeableTokens: bridgeable, mobileBridgeableTokens: mobileBridgeable, mobileHqs: start.hqs.filter(({ mobile }) => mobile).length, piles, bridged, hqs: start.hqs.length }));
      start = null;
    }
    state = next;
  }
}
