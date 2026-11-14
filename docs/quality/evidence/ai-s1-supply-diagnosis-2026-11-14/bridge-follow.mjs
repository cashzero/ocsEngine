// For rollouts played with hqBridge: in each attacker Movement segment of Game Turns 3-6, re-plan at its first decision
// (the plan the bot made), and at the segment's end check each bridge: is the HQ at its hex, are the bridged piles
// (no front unit could draw them at the start) now drawn by a front unit, and how much SP no front unit can draw ends
// the segment.  node bridge-follow.mjs <root> <dir> [--shard i/n]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : '0/1';
const [shard, shards] = shardArg.split('/').map(Number);
const [root, dir] = args.filter((a, i) => a !== '--shard' && args[i - 1] !== '--shard');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const access = (st, me) => ({
  families: () => m.ruleEngine.getActionFamilies(st, me).filter((f) => f.enabled).map((f) => f.kind),
  movementRange: (p) => m.ruleEngine.queryMovementRange(st, me, p).value ?? [],
  candidates: (kind, pieceId = null, budget = 400) => m.ruleEngine.getActionCandidates(st, { actorId: me, kind, pieceId, budget }).actions,
  explain: (action) => ({ current: true, explanation: m.ruleEngine.explain(st, action) }),
  traceCoverage: (p = null) => m.ruleEngine.queryTraceCoverage(st, me, p).value ?? { hexIds: [], directHexIds: [] },
  feedCoverage: (p = null) => m.ruleEngine.queryFeedCoverage(st, me, p).value ?? [],
  drawReach: (h) => new Set((m.ruleEngine.queryDrawReach(st, me, h).value ?? []).map(String)),
  attackStrength: (a, t) => m.ruleEngine.queryAttackStrength(st, me, a, t).value,
  projectedReach: (p, f, mode) => m.ruleEngine.queryProjectedReach(st, me, p, f, mode).value ?? [],
  hqThrow: (h, f) => m.ruleEngine.queryHqThrow(st, me, h, f).value,
  railArrivalReach: (h) => (m.ruleEngine.queryRailArrivalReach(st, me, h).value ?? []).map(({ hexId }) => hexId),
});
const files = readdirSync(dir).filter((f) => /^match-\d+\.save\.json$/u.test(f)).sort().filter((_, i) => i % shards === shard);
for (const f of files) {
  const save = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const me = state.configuration.attackVictory.attackerId;
  const defs = new Map(state.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
  const isHq = (p) => String(defs.get(p.definitionId)?.categoryDefinitionId).endsWith(':hq');
  const frontDrawn = (st) => {
    const enemy = st.pieceState.pieces.filter((p) => p.ownerId !== me && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(st, p));
    const front = new Set(st.pieceState.pieces.filter((p) => p.ownerId === me && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(st, p) && !isHq(p)
      && enemy.some((e) => m.hexDistanceBetween(String(e.location.hexId), String(p.location.hexId)) <= 4)).map((p) => String(p.location.hexId)));
    const feeds = (m.ruleEngine.queryFeedCoverage(st, me, null).value ?? []).filter((x) => !String(x.dumpId).includes('-stock-'));
    return new Map(feeds.map((x) => [x.dumpId, { tokens: x.tokens, drawn: x.hexIds.some((h) => front.has(String(h))) }]));
  };
  let seg = null;
  for (const action of save.acceptedActions) {
    const s = state.sequence;
    const inSeg = s.gameTurn >= 3 && s.gameTurn <= 6 && s.phasingPlayerId === me && s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT';
    if (inSeg && !seg && s.actingPlayerId === me && !state.pendingDecision) {
      const lines = [];
      const policy = m.createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }, { weights: m.heuristicWeights({ hqBridge: 1, arrivalRailForward: 1 }), debug: (l) => { if (l.includes('THEATER')) lines.push(l); } });
      policy.decide({ seatId: 'seat:x', playerId: me, memory: { stepKey: 'x', actions: 0, notes: new Map() }, rng: m.createBotRng(7, 'x', 0),
        view: { playerId: me, projection: m.ruleEngine.projectForViewer(state, me), pendingDecision: null }, actions: access(state, me) });
      const bridges = [...(lines[0] ?? '').matchAll(/ BRIDGE (\S+)>(\S+)#(\d+)T/g)].map(([, hqId, hexId, tokens]) => ({ hqId, hexId, tokens: Number(tokens) }));
      const start = frontDrawn(state);
      seg = { gameTurn: s.gameTurn, bridges, start, hqFrom: new Map(bridges.map(({ hqId }) => [hqId, String(state.pieceState.pieces.find((p) => p.id === hqId)?.location.hexId)])) };
    }
    const next = m.ruleEngine.applyAction(state, action).state;
    if (inSeg && seg && !(next.sequence.phase === 'MOVEMENT' && next.sequence.segment === 'MOVEMENT')) {
      const end = frontDrawn(next);
      const strandedStart = [...seg.start.values()].filter((x) => !x.drawn).reduce((a, x) => a + x.tokens, 0);
      const strandedEnd = [...end.values()].filter((x) => !x.drawn).reduce((a, x) => a + x.tokens, 0);
      // Piles undrawn at the start that are drawn at the end, and drawn at the start that are undrawn at the end.
      let gained = 0; let lost = 0;
      for (const [id, x] of end) { const before = seg.start.get(id); if (before && !before.drawn && x.drawn) gained += x.tokens; if (before && before.drawn && !x.drawn) lost += x.tokens; }
      const bridgeRows = seg.bridges.map((b) => { const hq = next.pieceState.pieces.find((p) => p.id === b.hqId); return { ...b, hqId: b.hqId.split(':').slice(-2).join(':'), at: hq?.location.kind === 'ON_MAP' ? String(hq.location.hexId) : null }; });
      console.log(JSON.stringify({ file: f, gameTurn: seg.gameTurn, bridges: bridgeRows, strandedStart, strandedEnd, gained, lost }));
      seg = null;
    }
    state = next;
  }
}
