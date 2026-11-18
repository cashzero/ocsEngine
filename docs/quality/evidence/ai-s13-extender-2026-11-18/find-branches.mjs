// node docs/quality/evidence/ai-s13-extender-2026-11-18/find-branches.mjs <weights.json> <attack match directory> [...] > branches.jsonl
// (build first). For every game heuristic@88 attacked, replays the save and, at the start of each of the attacker's
// Movement segments, asks the candidate (the weights given, on this build) for its first decision there with fresh step
// memory, as a bot starting the segment would. The first segment where that decision serves the Extender plan (its
// breakdown has the `extender` term) is the game's branch: one JSON line with the save, the action index (the segment's
// first action), the attacker's side, the map style, the Game Turn and the decision. Games where no segment triggers are
// listed on stderr. The theater allocation is switched off here only to save time: the plan is made before it and from
// the position alone, and the planned trucks move first, so the first decision is the same either way.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const [weightsPath, ...dirs] = process.argv.slice(2);
const m = await import(resolve('dist/index.js'));
const engine = m.ruleEngine;
const weights = m.heuristicWeights({ ...JSON.parse(readFileSync(weightsPath, 'utf8')).weights, theaterAllocation: 0 });
const contextOf = (state) => {
  const actorId = state.sequence.actingPlayerId;
  return { seatId: 'seat:find', playerId: actorId, memory: { stepKey: 'find', actions: 0, notes: new Map() }, rng: m.createBotRng(7, 'find', 0),
    view: { projection: engine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision, stateRevision: state.revision },
    actions: {
      families: () => engine.getActionFamilies(state, actorId).filter((f) => f.enabled).map((f) => f.kind),
      candidates: (kind, pieceId = null, budget = 400) => engine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      movementRange: (id) => engine.queryMovementRange(state, actorId, id).value ?? [],
      explain: (action) => ({ current: true, explanation: engine.explain(state, action) }),
      traceCoverage: (id = null) => engine.queryTraceCoverage(state, actorId, id).value,
      feedCoverage: (id = null) => engine.queryFeedCoverage(state, actorId, id).value ?? [],
      drawReach: (hexId) => new Set((engine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
      attackStrength: (a, t) => engine.queryAttackStrength(state, actorId, a, t).value,
      projectedReach: (p, f, mode) => engine.queryProjectedReach(state, actorId, p, f, mode).value ?? [],
      hqThrow: (h, f) => engine.queryHqThrow(state, actorId, h, f).value,
      railArrivalReach: (f) => (engine.queryRailArrivalReach(state, actorId, f).value ?? []).map(({ hexId }) => hexId),
      extenderSite: (h) => engine.queryExtenderSite(state, actorId, h).value ?? { linked: false, drawHexIds: [] },
      traceCut: (p, h, mode) => engine.queryTraceCut(state, actorId, p, h, mode).value?.cutIds ?? [],
    } };
};
for (const dir of dirs) {
  for (const record of JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')).records) {
    const savePath = join(dir, `match-${record.match}.save.json`);
    const save = JSON.parse(readFileSync(savePath, 'utf8'));
    let state = m.parseGameStateJson(save.initialSnapshot).value;
    const attackerId = state.configuration.attackVictory?.attackerId;
    const side = String(attackerId).endsWith('axis') ? 'axis' : 'allied';
    if (!attackerId || record.sides[side].policy !== 'heuristic') continue;
    const policy = m.createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit }, { weights });
    let found = null;
    let segment = null;
    for (const [index, action] of save.acceptedActions.entries()) {
      const key = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}`;
      if (state.sequence.phase === 'MOVEMENT' && state.sequence.segment === 'MOVEMENT' && state.sequence.phasingPlayerId === attackerId
        && state.pendingDecision === null && segment !== key) {
        segment = key;
        const decision = policy.decide(contextOf(state));
        if (decision?.breakdown.some(({ term }) => term === 'extender')) {
          found = { save: savePath, at: index, side, match: record.match, style: record.summary.mapStyle, turn: state.sequence.gameTurn, kind: decision.action.kind, intent: decision.intent };
          break;
        }
      }
      state = engine.applyAction(state, action).state;
    }
    if (found) console.log(JSON.stringify(found));
    else console.error(`no trigger: ${record.match} ${record.summary.mapStyle}`);
  }
}
