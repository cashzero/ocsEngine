import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as game from '../../../../dist/index.js';
import { hexDistanceBetween, hexOf, isArtillery, stepOf } from '../../../../dist/rules/pieces.js';

const positions = [
  ['artifacts/ai-s8/v91-check/attack-western/match-1300205.save.json', 137],
  ['artifacts/ai-s8/v91-check/attack-western/match-1300205.save.json', 427],
  ['artifacts/ai-promotion/frozen-v88-independent/attack-eastern/match-2800303.save.json', 151],
];
for (const [path, at] of positions) {
  const stored = JSON.parse(readFileSync(path, 'utf8'));
  const match = Number(/match-(\d+)\.save\.json$/u.exec(path)[1]);
  const record = JSON.parse(readFileSync(join(dirname(path), 'summary.json'), 'utf8'))
    .records.find((entry) => entry.match === match);
  let state = game.parseGameStateJson(stored.initialSnapshot).value;
  for (const action of stored.acceptedActions.slice(0, at)) {
    const result = game.ruleEngine.applyAction(state, action);
    if (!result.ok) throw Error(`Replay failed at revision ${state.revision}`);
    state = result.state;
  }
  const actor = state.sequence.actingPlayerId;
  const guns = new Set(state.pieceState.pieces.filter((piece) => piece.ownerId === actor && isArtillery(state, piece)).map(({ id }) => id));
  const activeSeatId = stored.bindings.find((binding) => binding.playerId === actor).seatId;
  const snapshot = game.serializeGameState(state).value;
  const hash = (await game.hashGameState(state)).value;
  const engine = game.createGameplayEngine(game.createMemoryGameplayPorts());
  for (const mainEffortArtillery of [0, 1]) {
    const session = await engine.loadSession(JSON.stringify({
      ...stored, lifecycle: 'ACTIVE', activeSeatId, initialSnapshot: snapshot, currentSnapshot: snapshot,
      initialStateHash: hash, finalStateHash: hash, checkpoints: [], acceptedActions: [], acceptedActionMetadata: [],
    }));
    let assignment = null;
    const seats = stored.bindings.map(({ playerId, seatId }) => ({
      playerId, seatId, seed: record.seeds[String(playerId).split(':').at(-1)],
      policy: game.createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit }, {
        weights: game.heuristicWeights({ barrageGroupsByCost: 1, mainEffortArtillery }),
        debug: (line) => { if (line.includes(' MAIN EFFORT ARTILLERY ')) assignment = line.split(' MAIN EFFORT ARTILLERY ')[1]; },
      }),
    }));
    const runner = game.createBotSeatRunner({ session, seats });
    const modeChanges = [];
    for (;;) {
      const step = await runner.step();
      if (step.kind !== 'ACTED') throw Error(JSON.stringify(step));
      const action = step.trace.action;
      if (action.kind === 'CHANGE_MODE' && guns.has(action.pieceId)) modeChanges.push(action.mode);
      if (action.kind === 'ADVANCE_SEQUENCE') break;
    }
    const end = game.parseGameStateJson(session.save().currentSnapshot).value;
    const target = match === 1300205 ? '12,12' : null;
    const onMap = end.pieceState.pieces.filter((piece) => guns.has(piece.id) && hexOf(piece));
    console.log(JSON.stringify({ match, at, mainEffortArtillery, assignment, modeChanges, combatGuns: onMap.filter(({ mode }) => mode === 'COMBAT').length,
      inRangeAt12_12: target === null ? null : onMap.filter((piece) => hexDistanceBetween(hexOf(piece), target) <= stepOf(end, piece).range).length }));
  }
}
