// Play the attacker's Movement segment from a save's first Movement decision of a turn with hqBridge; report each planned
// bridge and where its HQ ends the segment.  node bridge-exec.mjs <root> <save> <turn>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, saveFile, turnArg] = process.argv.slice(2);
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const save = JSON.parse(readFileSync(saveFile, 'utf8'));
let state = m.parseGameStateJson(save.initialSnapshot).value;
const me = state.configuration.attackVictory.attackerId;
for (const a of save.acceptedActions) {
  const s = state.sequence;
  if (s.gameTurn === Number(turnArg) && s.phasingPlayerId === me && s.actingPlayerId === me && s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT' && !state.pendingDecision) break;
  state = m.ruleEngine.applyAction(state, a).state;
}
const access = (st) => ({
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
const lines = [];
const policy = m.createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }, { weights: m.heuristicWeights({ hqBridge: 1 }), debug: (l) => lines.push(l) });
const memory = { stepKey: 'x', actions: 0, notes: new Map() };
for (let i = 0; i < 400; i++) {
  const d = policy.decide({ seatId: 'seat:x', playerId: me, memory, rng: m.createBotRng(7, 'x', i), view: { playerId: me, projection: m.ruleEngine.projectForViewer(state, me), pendingDecision: state.pendingDecision }, actions: access(state) });
  if (!d) break;
  const next = m.ruleEngine.applyAction(state, d.action);
  if (!next.ok) { console.log('rejected', d.action.kind); break; }
  state = next.state; memory.actions++;
  if (!(state.sequence.phase === 'MOVEMENT' && state.sequence.segment === 'MOVEMENT')) break;
}
const line = lines.find((l) => l.includes('THEATER')) ?? '';
for (const [, hqId, hexId, tokens] of line.matchAll(/ BRIDGE (\S+)>(\S+)#(\d+)T/g)) {
  const hq = state.pieceState.pieces.find((p) => p.id === hqId);
  console.log(JSON.stringify({ save: saveFile.split('/').pop(), turn: Number(turnArg), hq: hqId.split(':').slice(-2).join(':'), planned: hexId, tokens: Number(tokens), at: hq?.location.kind === 'ON_MAP' ? String(hq.location.hexId) : null }));
}
