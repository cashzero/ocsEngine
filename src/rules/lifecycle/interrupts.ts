import type { PieceId } from '../../core/index.js';
import { upsertPieceState } from '../../domain/piece/index.js';
import { parseRuleDecisionId } from '../kernel/ids.js';
import type { RuleTransactionId } from '../kernel/ids.js';
import type { GameState, PendingDecision, RuleEvent, RuleInterrupt } from '../kernel/model.js';
import { definitionOf, pieceById } from '../pieces.js';
import { applyDisplacement, captureDisplacementHexes, extenderCollapseHexes } from '../supply/transport.js';

/**
 * Interrupts are rule events whose owner must choose before play continues: attrition losses
 * (12.8b, owner's choice of units) and the placement of displaced trucks or collapsed Extenders
 * (9.14c/d). They can arise during movement, combat resolution, or the Supply Phase.
 */

const nameOf = (state: GameState, pieceId: PieceId): string => {
  const piece = pieceById(state, pieceId);
  return piece ? definitionOf(state, piece)?.name ?? 'Unit' : 'Unit';
};

const aliveOnMap = (state: GameState, ids: readonly PieceId[]) =>
  ids.flatMap((id) => { const piece = pieceById(state, id); return piece && piece.location.kind === 'ON_MAP' ? [piece] : []; });

const optionsFor = (state: GameState, interrupt: RuleInterrupt): PendingDecision['options'] => {
  if (interrupt.kind === 'ATTRITION') {
    return aliveOnMap(state, interrupt.pieceIds).map((piece) => ({
      id: `piece:${piece.id}`,
      label: `${nameOf(state, piece.id)} loses a step (${piece.remainingSteps ?? 0} left)`,
      hexId: null,
    }));
  }
  const pieceId = interrupt.pieceIds[0]!;
  const piece = pieceById(state, pieceId)!;
  const hexes = interrupt.reason === 'CAPTURE'
    ? captureDisplacementHexes(state, piece, interrupt.fromHexId, interrupt.range)
    : extenderCollapseHexes(state, piece, interrupt.fromHexId);
  return hexes.length > 0
    ? hexes.map((hexId) => ({ id: `hex:${hexId}`, label: `Place at ${hexId}`, hexId }))
    : [{ id: 'hex:none', label: 'No legal Hex: the Transport Points are lost', hexId: null }];
};

/** Drop interrupts that no longer need anything (units gone, no steps left). */
const pruned = (state: GameState): GameState => ({
  ...state,
  interrupts: state.interrupts.flatMap((interrupt): RuleInterrupt[] => {
    if (interrupt.kind === 'ATTRITION') {
      return interrupt.steps > 0 && aliveOnMap(state, interrupt.pieceIds).length > 0 ? [interrupt] : [];
    }
    const pieceIds = interrupt.pieceIds.filter((id) => pieceById(state, id)?.location.kind === 'ON_MAP');
    return pieceIds.length > 0 ? [{ ...interrupt, pieceIds }] : [];
  }),
});

/** The decision for the first interrupt, or null. Single-option interrupts are applied at once. */
export const settleInterrupts = (
  input: GameState,
  transactionId: RuleTransactionId | null,
): { readonly state: GameState; readonly events: readonly RuleEvent[] } => {
  let state = pruned(input);
  const events: RuleEvent[] = [];
  for (let guard = 0; guard < 500; guard += 1) {
    const interrupt = state.interrupts[0];
    if (!interrupt) return { state, events };
    const options = optionsFor(state, interrupt);
    if (options.length === 1) {
      const applied = applyInterruptChoice(state, options[0]!.id);
      state = applied.state;
      events.push(...applied.events);
      continue;
    }
    const id = parseRuleDecisionId(`decision:interrupt:${state.revision}:${state.rng.draws}:${state.interrupts.length}:${interrupt.pieceIds.length}:${interrupt.kind === 'ATTRITION' ? interrupt.steps : 0}`);
    if (!id.ok) throw new Error('Interrupt decision ID is invalid.');
    const decision: PendingDecision = interrupt.kind === 'ATTRITION'
      ? {
        id: id.value, kind: 'ATTRITION_LOSS', ownerId: interrupt.ownerId, transactionId,
        prompt: `Attrition in ${interrupt.hexId}: ${interrupt.steps} step${interrupt.steps === 1 ? '' : 's'} to lose. Choose the Out of Supply unit to lose the next step.`,
        options,
      }
      : {
        id: id.value, kind: 'DISPLACEMENT_HEX', ownerId: interrupt.ownerId, transactionId,
        prompt: interrupt.reason === 'CAPTURE'
          ? `${nameOf(state, interrupt.pieceIds[0]!)} escapes capture in ${interrupt.fromHexId}: place it up to ${interrupt.range} hexes away.`
          : `${nameOf(state, interrupt.pieceIds[0]!)} collapses: place it in a Hex in trace supply within its range.`,
        options,
      };
    events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision });
    return { state: { ...state, pendingDecision: decision }, events };
  }
  throw new Error('Interrupts did not settle.');
};

/** Apply the owner's choice for the first interrupt. */
export const applyInterruptChoice = (
  input: GameState,
  choiceId: string,
): { readonly state: GameState; readonly events: readonly RuleEvent[] } => {
  const state: GameState = { ...input, pendingDecision: null };
  const [interrupt, ...rest] = state.interrupts;
  if (!interrupt) return { state, events: [] };
  if (interrupt.kind === 'ATTRITION') {
    const piece = pieceById(state, choiceId.slice('piece:'.length) as PieceId)!;
    const remaining = (piece.remainingSteps ?? 1) - 1;
    const next: GameState = {
      ...state,
      pieceState: upsertPieceState(state.pieceState, remaining > 0 ? { ...piece, remainingSteps: remaining } : { ...piece, location: { kind: 'ELIMINATED' } }),
      interrupts: [{ ...interrupt, steps: interrupt.steps - 1 }, ...rest],
    };
    return {
      state: pruned(next),
      events: [{ kind: 'STEP_LOST', sequence: 0, pieceId: piece.id, remainingSteps: remaining > 0 ? remaining : null }],
    };
  }
  const [pieceId, ...others] = interrupt.pieceIds;
  const hexId = choiceId === 'hex:none' ? null : choiceId.slice('hex:'.length) as never;
  const next = applyDisplacement(state, pieceId!, hexId);
  return {
    state: pruned({ ...next, interrupts: others.length > 0 ? [{ ...interrupt, pieceIds: others }, ...rest] : rest }),
    events: [{ kind: 'PIECE_DISPLACED', sequence: 0, pieceId: pieceId!, toHexId: hexId }],
  };
};
