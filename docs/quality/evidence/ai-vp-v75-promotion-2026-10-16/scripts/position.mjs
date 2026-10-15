// Position at the start of a step: node position.mjs <dist> <match dir> <match> <turn:player> <axis|allied>
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [build, dir, match, turnKey, side] = process.argv.slice(2);
const m = await import(pathToFileURL(resolve(build, 'index.js')));
const { analyze } = await import(pathToFileURL(resolve(build, 'ai/analysis.js')));
const save = JSON.parse(readFileSync(resolve(dir, `match-${match}.save.json`)));
let state = m.parseGameStateJson(save.initialSnapshot).value;
const [turn, pt] = turnKey.split(':').map(Number);
for (const action of save.acceptedActions) {
  if (state.sequence.gameTurn > turn || (state.sequence.gameTurn === turn && state.sequence.playerTurnIndex >= pt && state.sequence.phase === 'MOVEMENT')) break;
  state = m.ruleEngine.applyAction(state, action).state;
}
const player = `player:${side}`;
const s = analyze(m.ruleEngine.projectForViewer(state, player), player, { scenario: state.scenario, turnLimit: state.configuration.turnLimit });
console.log('at', state.sequence.gameTurn, state.sequence.playerTurnIndex, state.sequence.phase, 'turnsLeft', s.turnsLeft);
console.log('objectives', s.objectives.map(o => `${o.hexId}:${o.points}:${o.controllerId === player ? 'ME' : o.controllerId ? 'EN' : '--'} threat ${s.threatAt(o.hexId).toFixed(1)} enemy ${(s.enemy.get(o.hexId)?.strength ?? 0).toFixed(1)}`).join('\n  '));
const own = s.own.filter(u => s.isCombatUnit(u));
console.log('own combat', own.length, 'strength', own.reduce((t, u) => t + (u.profile?.strength ?? 0), 0));
for (const u of s.own) console.log(' ', u.piece.role.padEnd(10), String(u.piece.id).split(':').at(-2).padEnd(28), u.hexId.padEnd(6), u.piece.mode, 'str', u.profile?.strength, 'mv', u.profile?.movement, 're', u.profile?.re, 'tok', u.piece.resourceQuantity ?? u.piece.carriedTokens ?? '');
console.log('enemy stacks');
for (const e of s.enemy.values()) console.log(' ', e.hexId.padEnd(6), 'str', e.strength.toFixed(1), 'hidden', e.hidden, e.pieces.map(p => p.role[0] + ':' + String(p.id).split(':').at(-2)).join(' '));
if (process.argv.includes('--truth')) {
  const enemyId = side === 'axis' ? 'player:allied' : 'player:axis';
  const t = analyze(m.ruleEngine.projectForViewer(state, enemyId), enemyId, { scenario: state.scenario, turnLimit: state.configuration.turnLimit });
  const by = new Map();
  for (const u of t.own) { const l = by.get(u.hexId) ?? []; l.push(u); by.set(u.hexId, l); }
  console.log('TRUE enemy stacks');
  for (const [h, l] of by) console.log(' ', h.padEnd(6), 'str', l.filter(u => ['COMBAT','ARTILLERY','HQ'].includes(u.piece.role)).reduce((a, u) => a + (u.profile?.strength ?? 0), 0), l.map(u => u.piece.role[0] + ':' + String(u.piece.id).split(':').at(-2) + '/' + (u.profile?.strength ?? '')).join(' '));
}
