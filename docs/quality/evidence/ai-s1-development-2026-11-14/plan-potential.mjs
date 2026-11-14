// Expected VP of the theater plan with two weight sets, at the attacker's first Movement decision of each Game Turn in
// recorded saves.  node plan-potential.mjs <root> <dir> <weightsA.json> <weightsB.json> <turns> [shard i/n]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, dir, fileA, fileB, turnsArg, shardArg] = process.argv.slice(2);
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const [shard, shards] = (shardArg ?? '0/1').split('/').map(Number);
const lastTurn = Number(turnsArg);
const weightSets = [fileA, fileB].map((file) => { const w = JSON.parse(readFileSync(file, 'utf8')); return { label: w.label, weights: m.heuristicWeights(w.weights) }; });
const access = (st, actor) => ({
  families: () => m.ruleEngine.getActionFamilies(st, actor).filter((f) => f.enabled).map((f) => f.kind),
  movementRange: (p) => m.ruleEngine.queryMovementRange(st, actor, p).value ?? [],
  candidates: (kind, pieceId = null, budget = 400) => m.ruleEngine.getActionCandidates(st, { actorId: actor, kind, pieceId, budget }).actions,
  explain: (action) => ({ current: true, explanation: m.ruleEngine.explain(st, action) }),
  traceCoverage: (p = null) => m.ruleEngine.queryTraceCoverage(st, actor, p).value ?? { hexIds: [], directHexIds: [] },
  feedCoverage: (p = null) => m.ruleEngine.queryFeedCoverage(st, actor, p).value ?? [],
  drawReach: (h) => new Set((m.ruleEngine.queryDrawReach(st, actor, h).value ?? []).map(String)),
  attackStrength: (a, t) => m.ruleEngine.queryAttackStrength(st, actor, a, t).value,
  projectedReach: (p, f, mode) => m.ruleEngine.queryProjectedReach(st, actor, p, f, mode).value ?? [],
  hqThrow: (h, f) => m.ruleEngine.queryHqThrow(st, actor, h, f).value,
  railArrivalReach: (h) => (m.ruleEngine.queryRailArrivalReach(st, actor, h).value ?? []).map(({ hexId }) => hexId),
});
const files = readdirSync(dir).filter((f) => /^match-\d+\.save\.json$/u.test(f)).sort().filter((_, i) => i % shards === shard);
for (const file of files) {
  const save = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const attackerId = state.configuration.attackVictory.attackerId;
  const facts = { scenario: state.scenario, turnLimit: 8 };
  const done = new Set();
  for (const action of save.acceptedActions) {
    const s = state.sequence;
    if (s.gameTurn > lastTurn) break;
    if (s.phasingPlayerId === attackerId && s.actingPlayerId === attackerId && s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT' && !state.pendingDecision && !done.has(s.gameTurn)) {
      done.add(s.gameTurn);
      const points = new Map(m.ruleEngine.projectForViewer(state, attackerId).objectives.map((o) => [String(o.hexId), o.points ?? o.vp ?? 0]));
      const row = { file, gameTurn: s.gameTurn };
      for (const { label, weights } of weightSets) {
        const lines = [];
        const policy = m.createHeuristicPolicy(facts, { weights, debug: (line) => { if (line.includes('THEATER')) lines.push(line); } });
        const context = { seatId: 'seat:x', playerId: attackerId, memory: { stepKey: 'x', actions: 0, notes: new Map() }, rng: m.createBotRng(7, 'x', 0),
          view: { playerId: attackerId, projection: m.ruleEngine.projectForViewer(state, attackerId), pendingDecision: null }, actions: access(state, attackerId) };
        policy.decide(context);
        const line = lines[0] ?? '';
        const groups = [...line.matchAll(/ (-?\d+,-?\d+):(\d+)u p([\d.]+) t(\d)/g)].map(([, hex, u, p, t]) => ({ hex, units: Number(u), chance: Number(p), turn: Number(t) }));
        row[label] = { expectedVp: groups.reduce((sum, g) => sum + (points.get(g.hex) ?? 0) * g.chance, 0), groups: groups.length,
          rails: [...line.matchAll(/ RAIL (\S+)>(\S+)@(\S+)#(\d+)T/g)].map(([, from, to, objective, tokens]) => ({ from, to, objective, tokens: Number(tokens) })),
          trucks: (line.match(/ TRUCK /g) ?? []).length, hqs: (line.match(/ HQ /g) ?? []).length };
      }
      console.log(JSON.stringify(row));
    }
    state = m.ruleEngine.applyAction(state, action).state;
  }
}
