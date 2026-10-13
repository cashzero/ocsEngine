import type { GameAction, GameState } from '../kernel/model.js';
import type { RuleFact } from '../query/model.js';
import { definitionOf, hexOf, pieceById, stepOf } from '../pieces.js';
import { rationPlan } from '../supply/ration-budget.js';
import { pieceHasTrace } from '../supply/supply.js';
import { applyRebuildUnits, unitRebuildOptions } from './replacement.js';

/** Own legal replacement options and deterministic supply after rebuilding. No dice or phase advance. */
export const rebuildFacts = (state: GameState, action: GameAction): readonly RuleFact[] => {
  if (action.kind !== 'REBUILD_UNITS') return [];
  const option = unitRebuildOptions(state, action.actorId).find(o => o.hexId === action.hexId && o.hq.id === action.hqId);
  if (!option) return [];
  const fixed = (id: typeof action.units[number]['pieceId']) => {
    const def = definitionOf(state, pieceById(state, id)!);
    return !!def?.faces.length && def.faces.every(face => face.steps.every(step => Number(step.movementPointTicks ?? 0) === 0));
  };
  const choices = {
    pax: option.pax, eq: option.eq, truckPoints: option.truckPoints,
    units: option.units.map(({ piece, cost, missing, modes }) => ({
      pieceId: piece.id, cost, missing, modes, eliminated: piece.location.kind === 'ELIMINATED', fixed: fixed(piece.id),
      originalHexId: hexOf(state.scenario.initialPieceState.pieces.find(p => p.id === piece.id) ?? piece),
    })),
  };
  const after = applyRebuildUnits(state, action).state;
  const funded = new Set(rationPlan(after, action.actorId).demands.map(d => d.id));
  const unsupported = action.units.filter(u => fixed(u.pieceId) && !pieceHasTrace(after, pieceById(after, u.pieceId)!) && !funded.has(u.pieceId));
  const addedStrength = action.units.reduce((sum, u) => {
    const before = pieceById(state, u.pieceId)!;
    const previous = before.location.kind === 'ELIMINATED' ? 0 : stepOf(state, before)?.combatStrength ?? 0;
    return sum + (stepOf(after, pieceById(after, u.pieceId)!)?.combatStrength ?? 0) - previous;
  }, 0);
  const fact = (key: string, value: string | number): RuleFact => ({ key, value, visibility: 'OWNER_ONLY', ownerId: action.actorId });
  return [fact('replacement.rebuildOptions', JSON.stringify(choices)),
    fact('replacement.addedCombatStrength', addedStrength),
    fact('replacement.unsupportedFixedIds', JSON.stringify(unsupported.map(u => u.pieceId)))];
};
