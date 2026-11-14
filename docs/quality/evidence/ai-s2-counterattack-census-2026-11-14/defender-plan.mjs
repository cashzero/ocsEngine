// The defender's counterattack plan at its first Movement decision of each Game Turn (2-7) in recorded attack games: the
// groups the theater allocation would form (this step, attacker-held defended objectives) with their capture probability.
//   node defender-plan.mjs <root> <dir> [--shard i/n]   one JSON line per defender turn
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const shardArg = args.includes('--shard') ? args[args.indexOf('--shard') + 1] : '0/1';
const [shard, shards] = shardArg.split('/').map(Number);
const [root, dir] = args.filter((a, i) => a !== '--shard' && args[i - 1] !== '--shard');
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const files = readdirSync(dir).filter((f) => /^match-\d+\.save\.json$/u.test(f)).sort().filter((_, i) => i % shards === shard);
const records = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records;
for (const f of files) {
  const save = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const match = Number(f.match(/\d+/u)[0]);
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const attackerId = state.configuration.attackVictory?.attackerId;
  if (!attackerId) continue;
  const record = records.find((r) => r.match === match);
  const attackerPolicy = record?.sides[String(attackerId).endsWith('axis') ? 'axis' : 'allied'].policy ?? null;
  const seen = new Set();
  for (const action of save.acceptedActions) {
    const s = state.sequence;
    if (s.gameTurn >= 2 && s.gameTurn <= 7 && s.phasingPlayerId !== attackerId && s.actingPlayerId === s.phasingPlayerId && s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT' && !state.pendingDecision && !seen.has(s.gameTurn)) {
      seen.add(s.gameTurn);
      const me = s.phasingPlayerId;
      const access = {
        families: () => m.ruleEngine.getActionFamilies(state, me).filter((x) => x.enabled).map((x) => x.kind),
        movementRange: (p) => m.ruleEngine.queryMovementRange(state, me, p).value ?? [],
        candidates: (kind, pieceId = null, budget = 400) => m.ruleEngine.getActionCandidates(state, { actorId: me, kind, pieceId, budget }).actions,
        explain: (a) => ({ current: true, explanation: m.ruleEngine.explain(state, a) }),
        traceCoverage: (p = null) => m.ruleEngine.queryTraceCoverage(state, me, p).value ?? { hexIds: [], directHexIds: [] },
        feedCoverage: (p = null) => m.ruleEngine.queryFeedCoverage(state, me, p).value ?? [],
        drawReach: (h) => new Set((m.ruleEngine.queryDrawReach(state, me, h).value ?? []).map(String)),
        attackStrength: (a, t) => m.ruleEngine.queryAttackStrength(state, me, a, t).value,
        projectedReach: (p, fr, mode) => m.ruleEngine.queryProjectedReach(state, me, p, fr, mode).value ?? [],
        hqThrow: (h, fr) => m.ruleEngine.queryHqThrow(state, me, h, fr).value,
        railArrivalReach: (h) => (m.ruleEngine.queryRailArrivalReach(state, me, h).value ?? []).map(({ hexId }) => hexId),
      };
      const lines = [];
      const policy = m.createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }, { weights: m.heuristicWeights({ defenderCounter: 0.001 }), debug: (l) => { if (l.includes('THEATER')) lines.push(l); } });
      policy.decide({ seatId: 'seat:x', playerId: me, memory: { stepKey: 'x', actions: 0, notes: new Map() }, rng: m.createBotRng(7, 'x', 0),
        view: { playerId: me, projection: m.ruleEngine.projectForViewer(state, me), pendingDecision: null }, actions: access });
      const points = new Map(m.ruleEngine.projectForViewer(state, me).objectives.map((o) => [String(o.hexId), o.points]));
      const groups = [...(lines[0] ?? '').matchAll(/ (-?\d+,-?\d+):(\d+)u p([\d.]+) t(\d)/g)].map(([, hex, u, p, t]) => ({ hex, units: Number(u), chance: Number(p), turn: Number(t), points: points.get(hex) ?? 0 }));
      console.log(JSON.stringify({ dir, match, gameTurn: s.gameTurn, attackerPolicy, groups }));
    }
    state = m.ruleEngine.applyAction(state, action).state;
  }
}
