// Every action that changes the pieces in a hex: node hex-history.mjs <dist> <match dir> <match> <hex> [hex...]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [build, dir, match, ...hexes] = process.argv.slice(2);
const m = await import(pathToFileURL(resolve(build, 'index.js')));
const save = JSON.parse(readFileSync(resolve(dir, `match-${match}.save.json`)));
let state = m.parseGameStateJson(save.initialSnapshot).value;
const at = (s, h) => s.pieceState.pieces.filter(p => p.location.kind === 'ON_MAP' && p.location.hexId === h).map(p => String(p.id).split(':').slice(-3, -1).join(':') + (p.remainingSteps !== null ? `/${p.remainingSteps}` : '')).sort().join(' ');
const prev = Object.fromEntries(hexes.map(h => [h, at(state, h)]));
for (const h of hexes) console.log('start', h, prev[h]);
for (const action of save.acceptedActions) {
  const before = state;
  state = m.ruleEngine.applyAction(state, action).state;
  for (const h of hexes) {
    const now = at(state, h);
    if (now !== prev[h]) {
      console.log(`T${before.sequence.gameTurn}.${before.sequence.playerTurnIndex} ${before.sequence.phase} ${action.actorId.slice(7)} ${action.kind}${action.choiceId ? ' ' + action.choiceId.slice(0, 40) : ''}${action.targetHexId ? ' target ' + action.targetHexId : ''} | ${h}: ${now || '(empty)'}`);
      prev[h] = now;
    }
  }
}
