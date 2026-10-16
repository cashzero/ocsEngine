#!/usr/bin/env node
// Inspect duplicate capture assignments; observations do not establish a strategy error.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [build, directory, output, ...selected] = process.argv.slice(2);
if (!output) throw Error('usage: ai-objective-allocation-study.mjs <dist> <match directory> <output.json> [match ...]');
const m = await import(pathToFileURL(resolve(build, 'index.js')));
const { analyze } = await import(pathToFileURL(resolve(build, 'ai/analysis.js')));
const summary = JSON.parse(readFileSync(resolve(directory, 'summary.json')));
const results = [];
for (const record of summary.records.filter(r => !selected.length || selected.includes(String(r.match)))) {
  const owner = 'player:' + Object.entries(record.sides).find(([, side]) => side.policy === 'heuristic')[0];
  const traces = new Map(readFileSync(resolve(directory, `match-${record.match}.trace.jsonl`), 'utf8').trim().split('\n')
    .map(JSON.parse).filter(t => t.status === 'ACCEPTED').map(t => [t.revision, t]));
  const save = JSON.parse(readFileSync(resolve(directory, `match-${record.match}.save.json`)));
  const parsed = m.parseGameStateJson(save.initialSnapshot);
  if (!parsed.ok) throw Error('Invalid initial state');
  let state = parsed.value;
  const assignments = new Map();
  let openingDefense = null;
  for (const action of save.acceptedActions) {
    if (openingDefense === null && action.actorId === owner && state.sequence.phase === 'MOVEMENT'
      && state.sequence.segment === 'MOVEMENT' && !state.pendingDecision) {
      const situation = analyze(m.ruleEngine.projectForViewer(state, owner), owner, { scenario: state.scenario, turnLimit: state.configuration.turnLimit });
      const mean = situation.objectives.reduce((sum, o) => sum + o.points, 0) / Math.max(1, situation.objectives.length);
      openingDefense = situation.objectives.filter(o => o.controllerId === owner).map(o => ({
        hex: o.hexId, points: o.points, mapMeanPoints: mean, threat: situation.threatAt(o.hexId),
        presentStrength: situation.friendlyAt(o.hexId).filter(u => situation.isCombatUnit(u)).reduce((sum, u) => sum + (u.profile?.strength ?? 0), 0),
        mobileDefenders: situation.friendlyAt(o.hexId).filter(u => situation.isCombatUnit(u) && (u.profile?.movement ?? 0) > 0).length,
      }));
    }
    const trace = traces.get(state.revision);
    const target = /\(capture ([^)]+)\)/u.exec(trace?.intent ?? '')?.[1];
    if (action.actorId === owner && action.kind === 'MOVE_PIECE' && target) {
      const situation = analyze(m.ruleEngine.projectForViewer(state, owner), owner, { scenario: state.scenario, turnLimit: state.configuration.turnLimit });
      const objective = situation.objectives.find(o => o.hexId === target);
      // CAPTURE assignments survive the first unit taking the point in this segment;
      // keep counting later assigned units even when it is now friendly-controlled.
      if (objective && !situation.enemy.get(target)?.hasCombatUnit && situation.threatAt(target) === 0) {
        const key = `${trace.stepKey}:${target}`;
        const entry = assignments.get(key) ?? { target, points: objective.points, step: trace.stepKey, firstController: objective.controllerId, units: [] };
        if (!entry.units.some(u => u.id === action.pieceId)) entry.units.push({ id: action.pieceId, revision: state.revision, destination: action.path.at(-1) });
        assignments.set(key, entry);
      }
    }
    const next = m.ruleEngine.applyAction(state, action);
    if (!next.ok) throw Error(`Rejected replay ${record.match}:${state.revision}`);
    state = next.state;
  }
  if (state.sequence.phase !== 'COMPLETE' || (await m.hashGameState(state)).value !== record.finalStateHash) throw Error('Final replay mismatch');
  results.push({ match: record.match, owner, openingDefense, duplicateEnemyFreeLocalZeroThreatTargets: [...assignments.values()].filter(a => a.units.length > 1) });
}
writeFileSync(output, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
