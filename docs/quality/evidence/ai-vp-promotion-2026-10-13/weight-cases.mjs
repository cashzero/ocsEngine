import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import * as m from './candidate-v29/dist/index.js';
const variants = {
  'capture-plan': { capture: 70, progressTarget: 15, assaultRatio: 2, assaultMaxEfforts: 3, assaultMaxUnits: 4 },
  capture: { capture: 70 },
  mission: { huntValue: 0.5, clearValue: 1 },
  allocation: { assaultRatio: 2, assaultMaxEfforts: 3, assaultMaxUnits: 4 },
  pace: { progressTarget: 15 },
};
const name = process.argv[2];
if (!(name in variants)) throw Error('Unknown variant');
const records = [];
for (const file of ['vp-capture-1210002', 'vp-placement-1235002', 'vp-trace-gain-1221000']) {
  const fixture = JSON.parse(gunzipSync(readFileSync(`tests/ai/fixtures/${file}.state.json.gz`)));
  let state = m.parseGameStateJson(fixture.snapshot).value;
  const actor = fixture.action?.actorId ?? fixture.actor;
  const policy = m.createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }, { weights: m.heuristicWeights(variants[name]), label: name });
  const memories = new Map(), actions = [];
  let traceBreaks = 0, feedBreaks = 0, rationBreaks = 0, corrected = 0;
  for (let i = 0; i < 3000 && state.sequence.phase !== 'COMPLETE'; i++) {
    const owner = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
    const key = `${owner}:${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`;
    if (!memories.has(key)) memories.set(key, { stepKey: key, actions: 0, notes: new Map() });
    const context = { seatId: 'seat:weights', playerId: owner, memory: memories.get(key), rng: m.createBotRng(7, 'weights', 0),
      view: { projection: m.ruleEngine.projectForViewer(state, owner), pendingDecision: state.pendingDecision },
      actions: { families: () => m.ruleEngine.getActionFamilies(state, owner).filter(f => f.enabled).map(f => f.kind),
        candidates: (kind, pieceId = null, budget = 400) => m.ruleEngine.getActionCandidates(state, { actorId: owner, kind, pieceId, budget }).actions,
        movementRange: id => m.ruleEngine.queryMovementRange(state, owner, id).value,
        explain: action => ({ current: true, explanation: m.ruleEngine.explain(state, action) }),
        traceCoverage: (id = null) => m.ruleEngine.queryTraceCoverage(state, owner, id).value,
        feedCoverage: (id = null) => m.ruleEngine.queryFeedCoverage(state, owner, id).value } };
    const chosen = policy.decide(context);
    if (!chosen) throw Error('stalled');
    const ex = m.ruleEngine.explain(state, chosen.action), fact = k => ex.facts.find(f => f.key === k)?.value;
    if (!ex.allowed) throw Error('illegal');
    if (['MOVE_PIECE', 'CHANGE_MODE'].includes(chosen.action.kind)) {
      traceBreaks += Number(fact('supply.relocationTraceLost') ?? 0); feedBreaks += Number(fact('supply.relocationFeedLost') ?? 0);
    }
    if (['PAY_FUEL', 'BUILD_HEDGEHOG'].includes(chosen.action.kind) && fact('supply.rationCommitmentsPreserved') === false) rationBreaks++;
    const next = m.ruleEngine.applyAction(state, chosen.action);
    if (!next.ok) throw Error('rejected');
    if (chosen.action.kind === 'MOVE_PIECE' && !chosen.breakdown.some(t => t.term === 'out-of-supply')) {
      const p = next.state.pieceState.pieces.find(p => p.id === chosen.action.pieceId);
      const role = context.view.projection.stacks.flatMap(s => s.pieces).find(piece => piece.id === p.id)?.role;
      if (['COMBAT', 'ARTILLERY', 'HQ'].includes(role) && !m.ruleEngine.queryTraceCoverage(state, owner, p.id).value.hexIds.includes(chosen.action.path.at(-1))) {
        if (!m.pieceHasTrace(next.state, p)) throw Error('Incorrect supply score');
        corrected++;
      }
    }
    actions.push({ revision: state.revision, action: chosen.action, intent: chosen.intent, breakdown: chosen.breakdown }); state = next.state;
  }
  if (state.sequence.phase !== 'COMPLETE' || state.pendingDecision) throw Error('unfinished');
  const vp = state.victory.scores.find(s => s.playerId === actor)?.points;
  const record = { file, actor, weights: variants[name], vp, victory: state.victory, traceBreaks, feedBreaks, rationBreaks, corrected, actions };
  records.push(record); console.log(name, file, vp, 'corrections', corrected, 'guards', traceBreaks, feedBreaks, rationBreaks);
}
writeFileSync(`tmp/ai-match/vp-promotion-2026-10-13/weight-cases-${name}.json.gz`, gzipSync(JSON.stringify(records)));
