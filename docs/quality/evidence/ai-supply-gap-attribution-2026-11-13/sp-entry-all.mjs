// For each attacker SP placement in Game Turns 2-6 of a save: at the first attacker Movement decision of that turn, can rail
// carry SP forward from the chosen entry hex, and from each other legal entry hex (counterfactual placement)?
//   node sp-entry-all.mjs <root> <arm> <save...>   prints one JSON line per placement
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, arm, ...files] = process.argv.slice(2);
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
for (const file of files) {
  const save = JSON.parse(readFileSync(file, 'utf8'));
  const match = Number(file.match(/match-(\d+)/u)[1]);
  const base = m.parseGameStateJson(save.initialSnapshot).value;
  const attackerId = base.configuration.attackVictory.attackerId;
  const defs = new Map(base.scenario.pieceCatalog.definitions.map((d) => [d.id, d]));
  const actions = save.acceptedActions;
  const forwardFrom = (state, hexId) => {
    const enemy = state.pieceState.pieces.filter((p) => p.ownerId !== attackerId && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p) && !/garrison/u.test(String(p.definitionId)));
    const d = (h) => Math.min(99, ...enemy.map((e) => m.hexDistanceBetween(String(e.location.hexId), String(h))));
    return m.ruleEngine.getActionCandidates(state, { actorId: attackerId, kind: 'RAIL_MOVE', pieceId: null, budget: 4000 }).actions
      .filter((a) => String(a.fromHexId) === hexId && a.supply.some((x) => x.tokens > 0) && d(a.toHexId) >= 3 && d(a.toHexId) <= d(a.fromHexId) - 3).length;
  };
  // Play from `state` (index i) with the placement at `hexId`, to the first attacker Movement decision of the turn.
  const toMovement = (state, i, action, hexId, turn) => {
    let s = m.ruleEngine.applyAction(state, { ...action, hexId });
    if (!s.ok) return null;
    s = s.state;
    for (let j = i + 1; j < actions.length; j++) {
      const q = s.sequence;
      if (q.gameTurn === turn && q.phasingPlayerId === attackerId && q.phase === 'MOVEMENT' && q.segment === 'MOVEMENT' && !s.pendingDecision) return s;
      const next = m.ruleEngine.applyAction(s, actions[j]);
      if (!next.ok) return null;
      s = next.state;
    }
    return null;
  };
  let state = base;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const q = state.sequence;
    if (q.gameTurn >= 2 && q.gameTurn <= 6 && action.kind === 'PLACE_REINFORCEMENT') {
      const piece = state.pieceState.pieces.find((p) => p.id === action.pieceId);
      if (piece?.ownerId === attackerId && defs.get(piece.definitionId)?.family === 'RESOURCE') {
        const options = [...new Set(m.ruleEngine.getActionCandidates(state, { actorId: attackerId, kind: 'PLACE_REINFORCEMENT', pieceId: piece.id, budget: 400 }).actions.map((a) => String(a.hexId)))];
        const result = {};
        for (const hexId of options) {
          const at = toMovement(state, i, action, hexId, q.gameTurn);
          result[hexId] = at ? forwardFrom(at, hexId) : null;
        }
        console.log(JSON.stringify({ arm, match, gameTurn: q.gameTurn, tokens: piece.resourceQuantity, placed: String(action.hexId), options: result }));
      }
    }
    state = m.ruleEngine.applyAction(state, action).state;
  }
}
