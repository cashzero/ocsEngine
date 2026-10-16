#!/usr/bin/env node
// Legal final-player captures omitted by a move or end-step. These are local
// opportunities, not independent evidence of improved full-game strength.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [manifest, directory, output] = process.argv.slice(2);
if (!output) throw Error('usage: ai-final-capture-study.mjs <freeze.json> <match directory> <output.json>');
const frozen = JSON.parse(readFileSync(manifest));
const m = await import(pathToFileURL(resolve(frozen.buildDirectory, 'dist/index.js')));
const { analyze } = await import(pathToFileURL(resolve(frozen.buildDirectory, 'dist/ai/analysis.js')));
const summary = JSON.parse(readFileSync(resolve(directory, 'summary.json')));
const results = [];
for (const row of summary.records) {
  const save = JSON.parse(readFileSync(resolve(directory, `match-${row.match}.save.json`)));
  let state = m.parseGameStateJson(save.initialSnapshot).value;
  const opportunities = [];
  for (const action of save.acceptedActions) {
    if (state.sequence.gameTurn === 8 && state.sequence.playerTurnIndex === 1
      && ['MOVE_PIECE', 'ADVANCE_SEQUENCE'].includes(action.kind)) {
      const situation = analyze(m.ruleEngine.projectForViewer(state, action.actorId), action.actorId,
        { scenario: state.scenario, turnLimit: 8 });
      const gain = move => move.kind === 'MOVE_PIECE' ? situation.objectives
        .filter(o => o.controllerId !== action.actorId && move.path.slice(1).includes(o.hexId))
        .reduce((sum, o) => sum + o.points * (o.controllerId === null ? 1 : 2), 0) : 0;
      const actualGain = gain(action);
      const units = situation.own.filter(u => u.piece.role === 'COMBAT'
        && (action.kind !== 'MOVE_PIECE' || u.piece.id === action.pieceId));
      let best = null;
      for (const unit of units) {
        const candidates = m.ruleEngine.getActionCandidates(state,
          { actorId: action.actorId, kind: 'MOVE_PIECE', pieceId: unit.piece.id, budget: 2000 });
        for (const candidate of candidates.actions) {
          const candidateGain = gain(candidate);
          if (candidateGain <= (best?.gain ?? actualGain)) continue;
          const explanation = m.ruleEngine.explain(state, candidate);
          if (!explanation.allowed || !['supply.relocationTraceLost', 'supply.relocationFeedLost']
            .every(key => explanation.facts.find(f => f.key === key)?.value === 0)) continue;
          best = { gain: candidateGain, action: candidate, truncated: candidates.truncated };
        }
      }
      if (best) opportunities.push({ revision: state.revision, phase: state.sequence.phase,
        actualGain, action, alternative: best });
    }
    const next = m.ruleEngine.applyAction(state, action);
    if (!next.ok) throw Error(`Rejected replay: ${row.match}/${state.revision}`);
    state = next.state;
  }
  if (state.sequence.phase !== 'COMPLETE' || (await m.hashGameState(state)).value !== row.finalStateHash)
    throw Error('Final replay mismatch');
  results.push({ match: row.match, opportunities });
  console.log(row.match, opportunities.length, 'final capture opportunities');
}
writeFileSync(output, JSON.stringify(results, null, 2) + '\n');
