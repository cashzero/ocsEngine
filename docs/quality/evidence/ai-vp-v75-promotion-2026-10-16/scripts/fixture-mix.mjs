// Continue a vp-capture fixture to Game End with a chosen build per seat: node fixture-mix.mjs <fixture.gz> <actor dist> <opponent dist>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [fixturePath, actorBuild, opponentBuild] = process.argv.slice(2);
const A = await import(pathToFileURL(resolve(actorBuild, 'index.js')));
const B = await import(pathToFileURL(resolve(opponentBuild, 'index.js')));
const m = A;
const stored = JSON.parse(gunzipSync(readFileSync(fixturePath)).toString());
let state = m.parseGameStateJson(stored.snapshot).value;
const actorId = stored.action.actorId;
const facts = { scenario: state.scenario, turnLimit: 8 };
const policies = { actor: A.createHeuristicPolicy(facts), opponent: B.createHeuristicPolicy(facts) };
const memories = new Map();
const ctx = (state, memory) => {
  const id = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  const re = m.ruleEngine;
  return { seatId: 'seat:x', playerId: id, memory, rng: m.createBotRng(7, 'vp-regression', 0),
    view: { projection: re.projectForViewer(state, id), pendingDecision: state.pendingDecision },
    actions: { families: () => re.getActionFamilies(state, id).filter(f => f.enabled).map(f => f.kind),
      movementRange: p => re.queryMovementRange(state, id, p).value,
      candidates: (kind, pieceId = null, budget = 400) => re.getActionCandidates(state, { actorId: id, kind, pieceId, budget }).actions,
      explain: a => ({ current: true, explanation: re.explain(state, a) }),
      traceCoverage: (p = null) => re.queryTraceCoverage(state, id, p).value,
      feedCoverage: (p = null) => re.queryFeedCoverage(state, id, p).value } };
};
const t0 = Date.now();
let lastKey = '';
let decisionsMade = 0;
for (let i = 0; i < 3000 && state.sequence.phase !== 'COMPLETE'; i++) {
  const owner = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  const key = `${owner}:${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`;
  if (!memories.has(key)) memories.set(key, { stepKey: key, actions: 0, notes: new Map() });
  const turnKey = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}`;
  if (process.argv.includes('--timeline') && turnKey !== lastKey) { lastKey = turnKey; const pr = m.ruleEngine.projectForViewer(state, actorId); console.log('T' + turnKey, pr.objectives.map(o => `${o.hexId}:${o.controllerId === actorId ? 'A' : o.controllerId ? 'O' : '-'}`).join(' '), '| 2,14 stack', JSON.stringify(state.pieceState.pieces.filter(p => p.location.kind === 'ON_MAP' && p.location.hexId === '2,14').map(p => String(p.id).split(':').slice(-3,-1).join(':')))); }
  const chosen = policies[owner === actorId ? 'actor' : 'opponent'].decide(ctx(state, memories.get(key))); decisionsMade++;
  if (process.argv.includes('--log') && owner === actorId && !['ADVANCE_SEQUENCE'].includes(chosen.action.kind)) console.log(key.split(':').slice(2).join(':'), chosen.action.kind, chosen.action.pieceId ? String(chosen.action.pieceId).split(':').at(-2) : '', chosen.action.path ? chosen.action.path[0] + '->' + chosen.action.path.at(-1) : (chosen.action.targetHexId ?? ''), '|', chosen.intent.slice(0, 90));
  state = m.ruleEngine.applyAction(state, chosen.action).state;
}
console.log(fixturePath.split('/').at(-1), 'decisions', decisionsMade, 'actor', state.victory?.scores.find(s => s.playerId === actorId)?.points, 'opponent', state.victory?.scores.find(s => s.playerId !== actorId)?.points, `${Date.now() - t0}ms`);
console.log('objectives', m.ruleEngine.projectForViewer(state, actorId).objectives.map(o => `${o.hexId}:${o.points}:${o.controllerId === actorId ? 'A' : o.controllerId ? 'O' : '-'}`).join(' '));
