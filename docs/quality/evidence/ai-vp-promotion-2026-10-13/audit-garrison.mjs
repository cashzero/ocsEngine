import { readFileSync, writeFileSync } from 'node:fs';
import * as m from './candidate-v29/dist/index.js';
import { analyze } from './candidate-v29/dist/ai/analysis.js';
const dir = process.argv[2], matches = process.argv.slice(3).map(Number), results = [];
for (const match of matches) {
  const save = JSON.parse(readFileSync(`${dir}/match-${match}.save.json`));
  let state = m.parseGameStateJson(save.initialSnapshot).value, last = '', cases = [];
  for (const action of save.acceptedActions) {
    const seq = state.sequence, key = `${seq.gameTurn}:${seq.playerTurnIndex}`;
    if (seq.phase === 'MOVEMENT' && seq.segment === 'MOVEMENT' && !state.pendingDecision && key !== last) {
      last = key;
      const s = analyze(m.ruleEngine.projectForViewer(state, action.actorId), action.actorId, { scenario: state.scenario, turnLimit: 8 });
      for (const objective of s.objectives.filter(o => o.controllerId === action.actorId)) {
        const units = s.friendlyAt(objective.hexId).filter(u => s.isCombatUnit(u));
        const first = units[0], weakest = [...units].sort((a, b) => (a.profile?.strength ?? 0) - (b.profile?.strength ?? 0) || String(a.piece.id).localeCompare(String(b.piece.id)))[0];
        if (first && weakest && first.piece.id !== weakest.piece.id && (first.profile?.strength ?? 0) > (weakest.profile?.strength ?? 0)) {
          cases.push({ revision: state.revision, turn: seq.gameTurn, actor: action.actorId, objective,
            first: { id: first.piece.id, strength: first.profile?.strength, movement: first.profile?.movement },
            weakest: { id: weakest.piece.id, strength: weakest.profile?.strength, movement: weakest.profile?.movement }, snapshot: JSON.stringify(state) });
        }
      }
    }
    const next = m.ruleEngine.applyAction(state, action); if (!next.ok) throw Error('Replay rejected'); state = next.state;
  }
  console.log(match, 'garrison assignment inconsistencies', cases.length); results.push({ match, cases });
}
writeFileSync(`tmp/ai-match/vp-promotion-2026-10-13/garrison-${matches.join('-')}.json`, JSON.stringify(results));
