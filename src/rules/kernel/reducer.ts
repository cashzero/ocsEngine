import { revision, type PieceId } from '../../core/index.js';
import { setHexControl } from '../../domain/map/index.js';
import { upsertPieceState } from '../../domain/piece/index.js';
import { declareBarrage, declareCombat, nextStackOrder, resolveDecision } from '../combat/combat.js';
import { applyCombineAircraft, applyReduceAirBase, applyRefit } from '../air/base.js';
import { applyBuildAirBase } from '../air/construction.js';
import { applyBuildHedgehog, applyReduceHedgehog } from '../hedgehog/hedgehog.js';
import { applyRebuildAircraft } from '../air/replacement.js';
import { applyRebuildUnits } from '../replacement/replacement.js';
import { applyPlanAirDrop, applyUpdateDropPlan } from '../air/transport.js';
import { declareAirMission, resolveAirDecision } from '../air/mission.js';
import { applyInterruptChoice, settleInterrupts } from '../lifecycle/interrupts.js';
import {
  applySequenceLifecycle,
  eliminateForOverstack,
  overstackDecision,
  phaseEnds,
  placeReinforcement,
  resolveFirstPlayerDecision,
} from '../lifecycle/lifecycle.js';
import { applyBreakout } from '../lifecycle/supply-phase.js';
import { absorbInto, absorptionDecision, applyCreateBreakdown, parseAbsorptionChoice } from '../breakdown/breakdown.js';
import { applyModeChange, applyReserveRelease } from '../mode/mode.js';
import { queryMovementPath } from '../movement/movement.js';
import { hexOf, isCombatUnit, pieceById, reTicksOf, usageOf, withInternalStocks, withUsage } from '../pieces.js';
import { hasOptionalActions } from '../query/candidates.js';
import { nextSequence } from '../sequence/sequence.js';
import { commitFuelForMove, payFuel } from '../supply/fuel.js';
import { dumpsReaching, eatOffMapCost, recoveryPlan, spendReservations } from '../supply/supply.js';
import {
  applyBlowDump,
  applyCollapseExtender,
  applyCombine,
  applyDissolveExtender,
  applyDivide,
  applyFormExtender,
  applyLoad,
  applyUnload,
  captureAt,
} from '../supply/transport.js';
import { violation } from '../validation/violation.js';
import { validateGameState } from './state.js';
import { validateAdvance, validateGameAction } from './validate.js';
import type { GameAction, GameState, ResourceReservation, RuleEvent, TransitionResult } from './model.js';

export { validateGameAction } from './validate.js';

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };

const renumber = (events: readonly RuleEvent[]): readonly RuleEvent[] => events.map((event, index) => ({ ...event, sequence: index }));

/**
 * Advance the sequence one step, then keep advancing past steps in which the acting player has
 * no legal choice at all. Skipping an empty step is identical to its player declining to act.
 */
export const advanceSequence = (state: GameState): Transition => {
  const events: RuleEvent[] = [];
  let current = state;
  for (let guard = 0; guard < 200; guard += 1) {
    // Pending attrition losses or displacements are settled by their owner first.
    if (current.interrupts.length > 0) {
      const settled = settleInterrupts(current, null);
      current = settled.state;
      events.push(...settled.events);
      if (current.pendingDecision !== null) break;
    }
    // 4.8a: an overstacked Hex must shed units before the step can end.
    const overstack = overstackDecision(current);
    if (overstack) {
      events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: overstack });
      current = { ...current, pendingDecision: overstack };
      break;
    }
    const to = nextSequence(current);
    // 20.0d/20.0g: before the phase ends, the owner picks the absorber of a Breakdown several units could take.
    const absorption = phaseEnds(current.sequence, to) ? absorptionDecision(current) : null;
    if (absorption) {
      events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision: absorption });
      current = { ...current, pendingDecision: absorption };
      break;
    }
    const step = applySequenceLifecycle(current, to);
    current = step.state;
    events.push(...step.events);
    if (current.sequence.phase === 'COMPLETE' || current.pendingDecision !== null) break;
    if (current.interrupts.length > 0) continue;
    if (hasOptionalActions(current)) break;
    if (validateAdvance(current, current.sequence.actingPlayerId).length > 0) break;
  }
  return { state: current, events: renumber(events) };
};

/** Starting position: the pre-turn and empty phases before the first real choice are skipped. */
export const settleInitialSequence = (state: GameState): GameState =>
  state.sequence.phase === 'WEATHER' || !hasOptionalActions(state) ? advanceSequence(state).state : state;

/** A unit beginning to act ends the previous unit's move (6.1g). */
const beginMoving = (state: GameState, pieceId: PieceId): GameState => {
  const previous = state.currentMoverId !== null && state.currentMoverId !== pieceId ? pieceById(state, state.currentMoverId) : undefined;
  return previous ? { ...state, usage: withUsage(state, { ...usageOf(state, previous), moved: true }) } : state;
};

const dispatch = (state: GameState, action: GameAction): Transition => {
  switch (action.kind) {
    case 'ADVANCE_SEQUENCE':
      return advanceSequence(state);
    case 'CHANGE_MODE': {
      const piece = pieceById(state, action.pieceId)!;
      const changed = applyModeChange(piece, action.mode);
      // 5.4: changing mode is how a unit begins its move, which ends the previous unit's move (6.1g).
      const next = beginMoving(state, piece.id);
      return {
        state: { ...next, currentMoverId: piece.id, pieceState: upsertPieceState(next.pieceState, changed) },
        events: [{ kind: 'MODE_CHANGED', sequence: 0, pieceId: piece.id, from: piece.mode, to: changed.mode ?? action.mode }],
      };
    }
    case 'RELEASE_RESERVE': {
      const piece = pieceById(state, action.pieceId)!;
      const released = applyReserveRelease(piece);
      return {
        state: {
          ...state,
          pieceState: upsertPieceState(state.pieceState, released),
          usage: withUsage(state, { ...usageOf(state, piece), reserveReleased: true }),
        },
        events: [{ kind: 'MODE_CHANGED', sequence: 0, pieceId: piece.id, from: piece.mode, to: released.mode! }],
      };
    }
    case 'END_MOVE':
      // 6.1g: ending the move counts exactly like another unit beginning to act; the unit may not move again this phase.
      return {
        state: { ...state, currentMoverId: null, usage: withUsage(state, { ...usageOf(state, pieceById(state, action.pieceId)!), moved: true }) },
        events: [{ kind: 'MOVE_ENDED', sequence: 0, pieceId: action.pieceId }],
      };
    case 'CREATE_BREAKDOWN':
      return applyCreateBreakdown(state, action.pieceId);
    case 'MOVE_PIECE': {
      const query = queryMovementPath(state, action.actorId, action.pieceId, action.path).value!;
      const destination = action.path.at(-1)!;
      // 12.5e: an independent unit fueled by an HQ fixes that HQ's throw location as it starts.
      let next = commitFuelForMove(beginMoving(state, action.pieceId), pieceById(state, action.pieceId)!);
      const piece = pieceById(next, action.pieceId)!;
      const usage = usageOf(next, piece);
      next = {
        ...next,
        currentMoverId: piece.id,
        pieceState: upsertPieceState(next.pieceState, {
          ...piece,
          location: { kind: 'ON_MAP', hexId: destination },
          stackOrder: nextStackOrder(next.pieceState.pieces, destination, piece.id),
        }),
      };
      next = {
        ...next,
        usage: withUsage(next, {
          ...usage, moved: true, phaseStartHexId: usage.phaseStartHexId ?? hexOf(piece),
          movementSpentTicks: usage.movementSpentTicks + query.spentTicks,
        }),
      };
      // 4.5b: units that negated an enemy ZOC for this move may not spend MP later this phase.
      for (const negatorId of query.negatorIds) {
        const negator = pieceById(next, negatorId)!;
        next = { ...next, usage: withUsage(next, { ...usageOf(next, negator), negationLocked: true }) };
      }
      const events: RuleEvent[] = [{ kind: 'PIECE_MOVED', sequence: 0, pieceId: piece.id, path: action.path, spentTicks: query.spentTicks }];
      // 9.14: entering enemy non-combat units captures or displaces them.
      // 13.3h: only a combat unit entering a Hex changes its control; trucks never do.
      const takesControl = isCombatUnit(next, piece);
      for (const hexId of action.path.slice(1)) {
        next = captureAt(next, action.actorId, hexId, events);
        if (takesControl) next = { ...next, mapState: setHexControl(next.mapState, hexId, action.actorId) };
      }
      const settled = settleInterrupts(next, null);
      return { state: settled.state, events: renumber([...events, ...settled.events]) };
    }
    case 'CHECK_SUPPLY': {
      const cost = eatOffMapCost(action.pieceIds.reduce((total, id) => total + reTicksOf(state, pieceById(state, id)!), 0));
      const dump = pieceById(state, action.sourcePieceId!)!;
      const unitDefinitionId = state.scenario.pieceCatalog.definitions.find(({ id }) => id === dump.definitionId)!.resource!.unitDefinitionId;
      let next: GameState = { ...state, pieceState: spendReservations(state, [{ resourcePieceId: dump.id, quantity: cost, unitDefinitionId }]) };
      for (const id of action.pieceIds) next = { ...next, usage: withUsage(next, { ...usageOf(next, pieceById(next, id)!), supplyPaid: true }) };
      return { state: next, events: [{ kind: 'SUPPLY_SPENT', sequence: 0, resourcePieceId: dump.id, quantity: cost }] };
    }
    case 'RECOVER_INTERNALS': {
      const piece = pieceById(state, action.pieceId)!;
      const dumps = dumpsReaching(state, action.actorId, hexOf(piece)!, piece);
      const ordered = action.sourcePieceIds.flatMap((id) => dumps.filter(({ pieceId }) => pieceId === id));
      const plan = recoveryPlan(state, piece, ordered.reduce((total, dump) => total + dump.availableQuantity, 0));
      const payments: ResourceReservation[] = [];
      let left = plan.tokens;
      for (const dump of ordered) {
        if (left <= 0) break;
        const quantity = Math.min(left, dump.availableQuantity);
        left -= quantity;
        const dumpPiece = pieceById(state, dump.pieceId)!;
        payments.push({ resourcePieceId: dump.pieceId, quantity, unitDefinitionId: state.scenario.pieceCatalog.definitions.find(({ id }) => id === dumpPiece.definitionId)!.resource!.unitDefinitionId });
      }
      let next: GameState = { ...state, pieceState: spendReservations(state, payments) };
      next = { ...next, pieceState: upsertPieceState(next.pieceState, withInternalStocks(pieceById(next, piece.id)!, plan.level)) };
      next = { ...next, usage: withUsage(next, { ...usageOf(next, piece), recovered: true }) };
      return {
        state: next,
        events: renumber([
          ...payments.map((payment) => ({ kind: 'SUPPLY_SPENT' as const, sequence: 0, resourcePieceId: payment.resourcePieceId, quantity: payment.quantity })),
          { kind: 'INTERNAL_STOCKS_CHANGED', sequence: 0, pieceId: piece.id, level: plan.level },
        ]),
      };
    }
    case 'CHOOSE_FORMATION_TRACE':
      return {
        state: { ...state, formationTraces: [...state.formationTraces.filter(({ formationId }) => formationId !== action.formationId), { formationId: action.formationId, routeKey: action.routeKey }] },
        events: [],
      };
    case 'PAY_FUEL':
      return payFuel(state, action.method, action.pieceId, action.sourcePieceId);
    case 'ATTEMPT_BREAKOUT':
      return applyBreakout(state, action.pieceId);
    case 'BLOW_DUMP':
      return applyBlowDump(state, action.dumpId, action.tokens);
    case 'LOAD_SUPPLY':
      return applyLoad(state, action.truckId, action.dumpId, action.tokens);
    case 'UNLOAD_SUPPLY':
      return applyUnload(state, action.truckId, action.tokens);
    case 'COMBINE_TRANSPORT':
      return applyCombine(state, action.truckIds);
    case 'DIVIDE_TRANSPORT':
      return applyDivide(state, action.truckId, action.points);
    case 'FORM_EXTENDER':
      return applyFormExtender(state, action.truckId);
    case 'DISSOLVE_EXTENDER':
      return applyDissolveExtender(state, action.extenderId);
    case 'COLLAPSE_EXTENDER':
      return applyCollapseExtender(state, action.extenderId, action.hexId);
    case 'DECLARE_COMBAT':
      return declareCombat(state, action);
    case 'DECLARE_BARRAGE':
      return declareBarrage(state, action);
    case 'DECLARE_AIR_MISSION':
      return declareAirMission(state, action);
    case 'REFIT_AIRCRAFT':
      return applyRefit(state, action);
    case 'REDUCE_AIR_BASE':
      return applyReduceAirBase(state, action);
    case 'BUILD_AIR_BASE':
      return applyBuildAirBase(state, action);
    case 'BUILD_HEDGEHOG':
      return applyBuildHedgehog(state, action);
    case 'REDUCE_HEDGEHOG':
      return applyReduceHedgehog(state, action);
    case 'REBUILD_AIRCRAFT':
      return applyRebuildAircraft(state, action);
    case 'REBUILD_UNITS':
      return applyRebuildUnits(state, action);
    case 'PLAN_AIR_DROP':
      return applyPlanAirDrop(state, action);
    case 'UPDATE_AIR_DROP_PLAN':
      return applyUpdateDropPlan(state, action);
    case 'COMBINE_AIRCRAFT':
      return applyCombineAircraft(state, action);
    case 'RESPOND_DECISION': {
      const pending = state.pendingDecision!;
      if (pending.kind === 'FIRST_PLAYER') {
        const chosen = resolveFirstPlayerDecision(state, action.choiceId);
        return hasOptionalActions(chosen) ? { state: chosen, events: [] } : advanceSequence(chosen);
      }
      if (pending.kind === 'OVERSTACK_ELIMINATION') {
        const reduced = eliminateForOverstack(state, action.choiceId);
        const next = advanceSequence(reduced);
        return { state: next.state, events: renumber([{ kind: 'STEP_LOST', sequence: 0, pieceId: action.choiceId.slice('eliminate:'.length) as never, remainingSteps: null }, ...next.events]) };
      }
      if (pending.kind === 'BREAKDOWN_ABSORPTION') {
        const { breakdownId, absorberId } = parseAbsorptionChoice(action.choiceId);
        const absorbed = absorbInto({ ...state, pendingDecision: null }, breakdownId, absorberId);
        const next = advanceSequence(absorbed.state);
        return { state: next.state, events: renumber([...absorbed.events, ...next.events]) };
      }
      if (pending.transactionId === null && (pending.kind === 'ATTRITION_LOSS' || pending.kind === 'DISPLACEMENT_HEX')) {
        const applied = applyInterruptChoice(state, action.choiceId);
        const settled = settleInterrupts(applied.state, null);
        const events = [...applied.events, ...settled.events];
        // Attrition interrupts the sequence of play: once settled, empty steps are passed as usual.
        if (settled.state.pendingDecision === null && pending.kind === 'ATTRITION_LOSS' && !hasOptionalActions(settled.state)) {
          const advanced = advanceSequence(settled.state);
          return { state: advanced.state, events: renumber([...events, ...advanced.events]) };
        }
        return { state: settled.state, events: renumber(events) };
      }
      if (state.activeTransaction?.kind === 'AIR_MISSION' && pending.transactionId === state.activeTransaction.id) {
        return resolveAirDecision(state, action.choiceId);
      }
      return resolveDecision(state, action.choiceId);
    }
    case 'CANCEL_TRANSACTION': {
      const transaction = state.activeTransaction!;
      const barrage = transaction.kind === 'BARRAGE';
      return {
        state: {
          ...state, activeTransaction: null, pendingDecision: null,
          ledger: barrage
            ? { ...state.ledger, barragedHexIds: state.ledger.barragedHexIds.filter((hexId) => hexId !== transaction.targetHexId) }
            : { ...state.ledger, attackedHexIds: state.ledger.attackedHexIds.filter((hexId) => hexId !== transaction.targetHexId) },
          usage: state.usage.map((entry) => transaction.attackerIds.includes(entry.pieceId)
            ? (barrage ? { ...entry, barraged: false } : { ...entry, attacked: false }) : entry),
        },
        events: [{ kind: 'TRANSACTION_CANCELLED', sequence: 0, transactionId: transaction.id }],
      };
    }
    case 'COMMIT_TRANSACTION':
      throw new Error('COMMIT_TRANSACTION is never legal.');
    case 'PLACE_REINFORCEMENT':
      return placeReinforcement(state, action);
  }
};

const nextRevision = (state: GameState): GameState['revision'] => {
  const next = revision(state.revision + 1);
  if (!next.ok) throw new RangeError('GameState revision exhausted.');
  return next.value;
};

export const applyGameAction = (state: GameState, action: GameAction): TransitionResult => {
  const validation = validateGameAction(state, action);
  if (!validation.allowed) return { ok: false, state, events: [], violations: validation.violations };
  const transition = dispatch(state, action);
  const candidate = { ...transition.state, revision: nextRevision(state) };
  const invariantIssues = validateGameState(candidate);
  if (invariantIssues.length > 0) {
    return {
      ok: false,
      state,
      events: [],
      violations: invariantIssues.map((entry) => violation('STATE_INVARIANT_VIOLATION', entry.path, `${entry.code}: ${entry.message}`, 'engine')),
    };
  }
  return { ok: true, state: candidate, events: transition.events };
};
