#!/usr/bin/env node
// Replay ai-match saves and find higher immediate-VP movement options that preserve friendly supply.
// Usage: node scripts/ai-vp-study.mjs <match directory> [match index ...]
// These are alternatives to investigate, NOT proven mistakes: staying, exposure, later capture and
// the opponent's response still matter. Full-game VP and paired comparisons remain the acceptance boundary.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as m from '../dist/index.js';
import { analyze } from '../dist/ai/analysis.js';

const dir = process.argv[2];
if (!dir) throw new Error('usage: ai-vp-study.mjs <match directory> [match index ...]');
const selected = process.argv.slice(3).map(Number);
if (selected.some(i => !Number.isSafeInteger(i) || i < 0)) throw new Error('Invalid match index');
const summary = JSON.parse(readFileSync(resolve(dir, 'summary.json'), 'utf8'));
const results = [];
for (const record of summary.records.filter(r => r.stopReason === 'FINISHED' && (!selected.length || selected.includes(r.match)))) {
  const save = JSON.parse(readFileSync(resolve(dir, `match-${record.match}.save.json`), 'utf8'));
  const traces = new Map(readFileSync(resolve(dir, `match-${record.match}.trace.jsonl`), 'utf8').trim().split('\n').map(JSON.parse).map(t => [t.revision, t]));
  const parsed = m.parseGameStateJson(save.initialSnapshot);
  if (!parsed.ok) throw new Error('Invalid initial state');
  let state = parsed.value, checked = 0, truncated = 0;
  const higherImmediateVpOptions = [];
  for (const action of save.acceptedActions) {
    if (action.kind === 'MOVE_PIECE') {
      const view = m.ruleEngine.projectForViewer(state, action.actorId);
      const situation = analyze(view, action.actorId, { scenario: state.scenario, turnLimit: state.configuration.turnLimit });
      const unit = situation.own.find(u => u.piece.id === action.pieceId);
      if (unit?.piece.role === 'COMBAT') {
        const gain = a => situation.objectives.filter(o => o.controllerId !== action.actorId && a.path.slice(1).includes(o.hexId)).reduce((v, o) => v + o.points, 0);
        const actual = gain(action);
        checked++;
        const candidates = m.ruleEngine.getActionCandidates(state, { actorId: action.actorId, kind: 'MOVE_PIECE', pieceId: action.pieceId, budget: 2000 });
        truncated += Number(candidates.truncated);
        const alternative = candidates.actions.filter(a => gain(a) > actual
          && situation.objectives.some(o => o.controllerId !== action.actorId && o.hexId === a.path.at(-1)))
          .sort((a, b) => gain(b) - gain(a)).find(a => {
            const ex = m.ruleEngine.explain(state, a);
            return ex.allowed && ['supply.relocationTraceLost', 'supply.relocationFeedLost'].every(k => ex.facts.find(f => f.key === k)?.value === 0);
          });
        if (alternative) higherImmediateVpOptions.push({ revision: state.revision, turn: state.sequence.gameTurn, phase: state.sequence.phase,
          actor: action.actorId, actualGain: actual, alternativeGain: gain(alternative), action, alternative,
          intent: traces.get(state.revision)?.intent, breakdown: traces.get(state.revision)?.breakdown });
      }
    }
    const next = m.ruleEngine.applyAction(state, action);
    if (!next.ok) throw new Error(`Replay rejected in ${record.match}`);
    state = next.state;
  }
  const hash = await m.hashGameState(state);
  if (!hash.ok || hash.value !== record.finalStateHash) throw new Error(`Final hash mismatch in ${record.match}`);
  results.push({ match: record.match, checked, truncated, higherImmediateVpOptions, finalStateHash: hash.value });
  console.log(record.match, checked, higherImmediateVpOptions.length, 'higher immediate-VP options');
}
writeFileSync(resolve(dir, selected.length ? `vp-study-${selected.join('-')}.json` : 'vp-study.json'), `${JSON.stringify(results, null, 2)}\n`);
