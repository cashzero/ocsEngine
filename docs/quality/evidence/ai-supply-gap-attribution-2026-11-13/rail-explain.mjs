// Why can rail not carry SP from a hex to another? Replays to the attacker's first Movement decision of a turn and explains
// a RAIL_MOVE built from a legal candidate with another destination.  node rail-explain.mjs <root> <save> <turn> <from> <to...>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, saveFile, turnArg, from, ...targets] = process.argv.slice(2);
const m = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const save = JSON.parse(readFileSync(saveFile, 'utf8'));
let state = m.parseGameStateJson(save.initialSnapshot).value;
const attackerId = state.configuration.attackVictory.attackerId;
for (const action of save.acceptedActions) {
  const s = state.sequence;
  if (s.gameTurn === Number(turnArg) && s.phasingPlayerId === attackerId && s.phase === 'MOVEMENT' && s.segment === 'MOVEMENT' && !state.pendingDecision) break;
  state = m.ruleEngine.applyAction(state, action).state;
}
const candidates = m.ruleEngine.getActionCandidates(state, { actorId: attackerId, kind: 'RAIL_MOVE', pieceId: null, budget: 4000 }).actions;
const fromHere = candidates.filter((a) => String(a.fromHexId) === from && a.supply.length > 0);
console.log('candidates from', from, fromHere.map((a) => `${a.toHexId}:${a.supply.map((x) => x.tokens).join('+')}`).join(' '));
const template = fromHere[0];
for (const to of targets) {
  const action = { ...template, toHexId: to };
  const explanation = m.ruleEngine.explain(state, action);
  console.log('->', to, JSON.stringify(explanation).slice(0, 900));
}
// Enemy combat units within 2 hexes of each target and of the hexes between.
const enemy = state.pieceState.pieces.filter((p) => p.ownerId !== attackerId && p.location.kind === 'ON_MAP' && m.isOnMapCombatUnit(state, p));
for (const to of targets) console.log('enemy within 2 of', to, enemy.filter((e) => m.hexDistanceBetween(String(e.location.hexId), to) <= 2).map((e) => `${e.location.hexId}`).join(' '));
