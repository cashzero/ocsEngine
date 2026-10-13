import type { PieceId, PlayerId } from '../../core/index.js';
import type { GameAction, GameState } from '../kernel/model.js';
import type { RuleFact } from '../query/model.js';
import { definitionOf, hexOf, isArtillery, isCombatUnit, isHq, pieceById, reTicksOf, stepOf, usageOf, withUsage } from '../pieces.js';
import { fuelOptions } from './fuel.js';
import { dumpsReaching, eatOffMapCost, internalRecoveryPayments, pieceHasTrace, spendReservations, unitsNeedingRecovery } from './supply.js';

export interface RationDemand { readonly id: PieceId; readonly ticks: number; readonly sources: readonly PieceId[] }
export interface RationSource { readonly id: PieceId; readonly tokens: number }
export interface RationGroup { readonly sourcePieceId: PieceId; readonly pieceIds: readonly PieceId[]; readonly tokens: number }

/** Unsplittable consumers; one CHECK_SUPPLY group per source. ceil(sum(RE ticks)/8) <= stock.
 * A bounded search returns UNKNOWN, never a false impossibility or an unverified allocation. */
export const assignRations = (demands: readonly RationDemand[], sources: readonly RationSource[], limit = 50_000): {
  readonly groups: readonly RationGroup[] | null; readonly exhausted: boolean;
} => {
  const stock = sources.filter(s => s.tokens > 0);
  const capacity = stock.map(s => s.tokens * 8);
  const units = demands.map(d => ({ ...d, choices: stock.flatMap((s, i) => d.sources.includes(s.id) && capacity[i]! >= d.ticks ? [i] : []) }))
    .sort((a, b) => a.choices.length - b.choices.length || b.ticks - a.ticks || a.id.localeCompare(b.id));
  const assignment: number[] = [];
  const failed = new Set<string>();
  let visits = 0, exhausted = false;
  const search = (index: number): boolean => {
    if (index === units.length) return true;
    if (++visits > limit) { exhausted = true; return false; }
    const key = `${index}:${capacity.join(',')}`;
    if (failed.has(key)) return false;
    const remaining = units.slice(index);
    if (remaining.reduce((sum, unit) => sum + unit.ticks, 0) > capacity.reduce((sum, n) => sum + n, 0)
      || remaining.some(unit => !unit.choices.some(i => capacity[i]! >= unit.ticks))) return false;
    const unit = units[index]!;
    for (const i of [...unit.choices].sort((a, b) => capacity[b]! - capacity[a]! || a - b)) {
      if (capacity[i]! < unit.ticks) continue;
      capacity[i]! -= unit.ticks;
      assignment[index] = i;
      if (search(index + 1)) return true;
      capacity[i]! += unit.ticks;
      if (exhausted) return false;
    }
    failed.add(key);
    return false;
  };
  if (!search(0)) return { groups: null, exhausted };
  const groups = stock.flatMap((source, i) => {
    const members = units.filter((_, j) => assignment[j] === i);
    return members.length ? [{ sourcePieceId: source.id, pieceIds: members.map(d => d.id), tokens: eatOffMapCost(members.reduce((sum, d) => sum + d.ticks, 0)) }] : [];
  });
  return { groups, exhausted: false };
};

/** Mirrors the bot's mandatory recovery order. No sequence advance, dice or enemy response. */
export const afterRequiredRecovery = (state: GameState, actorId: PlayerId): GameState => {
  let next = state;
  for (;;) {
    const piece = [...unitsNeedingRecovery(next, actorId)].sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!piece) return next;
    const ids = dumpsReaching(next, actorId, hexOf(piece)!, piece).map(d => d.pieceId);
    const { payments } = internalRecoveryPayments(next, piece, ids);
    next = { ...next, pieceState: spendReservations(next, payments), usage: withUsage(next, { ...usageOf(next, piece), recovered: true }) };
  }
};

const problem = (state: GameState, actorId: PlayerId) => {
  const sources = new Map<PieceId, number>();
  // Keep the existing HQ/combat/artillery feeding priority under unavoidable shortages.
  const priority = (id: PieceId) => {
    const piece = pieceById(state, id)!;
    return (isHq(state, piece) ? 1000 : isArtillery(state, piece) ? 0 : 100)
      + Number(stepOf(state, piece)?.combatStrength ?? 0) * Math.max(1, piece.remainingSteps ?? 1);
  };
  const demands = state.pieceState.pieces.filter(p => p.ownerId === actorId && p.location.kind === 'ON_MAP'
    && isCombatUnit(state, p) && p.mode !== 'STRAT' && !usageOf(state, p).supplyPaid && !pieceHasTrace(state, p)
    && !state.air.droppedIds.includes(p.id)).map(piece => {
      const dumps = dumpsReaching(state, actorId, hexOf(piece)!, piece);
      for (const dump of dumps) sources.set(dump.pieceId, dump.availableQuantity);
      return { id: piece.id, ticks: reTicksOf(state, piece), sources: dumps.map(d => d.pieceId) };
    }).sort((a, b) => priority(b.id) - priority(a.id) || a.id.localeCompare(b.id));
  return { demands, sources: [...sources].map(([id, tokens]) => ({ id, tokens })) };
};

const plans = new WeakMap<GameState, Map<PlayerId, ReturnType<typeof makePlan>>>();
const makePlan = (state: GameState, actorId: PlayerId) => {
  const recovered = afterRequiredRecovery(state, actorId);
  const { demands, sources } = problem(recovered, actorId);
  const all = assignRations(demands, sources);
  if (all.groups) return { groups: all.groups, demands, exhausted: false };
  // Admit consumers in the existing feeding priority, retaining a feasible witness at every step.
  // TODO bot-ration-search: bounded search can miss feasible lower-priority consumers; close with
  // component decomposition/exact fallback and adversarial allocation + full-match latency evidence.
  let selected: RationDemand[] = [], groups: readonly RationGroup[] = [], exhausted = all.exhausted;
  for (const demand of demands) {
    const trial = assignRations([...selected, demand], sources);
    exhausted ||= trial.exhausted;
    if (trial.groups) { selected = [...selected, demand]; groups = trial.groups; }
  }
  return { groups, demands: selected, exhausted };
};

export const rationPlan = (state: GameState, actorId: PlayerId): ReturnType<typeof makePlan> => {
  let cache = plans.get(state);
  if (!cache) { cache = new Map(); plans.set(state, cache); }
  let plan = cache.get(actorId);
  if (!plan) { plan = makePlan(state, actorId); cache.set(actorId, plan); }
  return plan;
};

/** Current-position commitments for the approaching friendly Supply phase. */
export const rationBudgetFacts = (state: GameState, action: GameAction): readonly RuleFact[] => {
  if (!['PAY_FUEL', 'BUILD_HEDGEHOG', 'CHECK_SUPPLY'].includes(action.kind)) return [];
  const fact = (key: string, value: string | number | boolean): RuleFact => ({ key, value, visibility: 'OWNER_ONLY', ownerId: action.actorId });
  if (action.kind === 'CHECK_SUPPLY') {
    const plan = rationPlan(state, action.actorId);
    return [fact('supply.rationGroups', JSON.stringify(plan.groups)), fact('supply.rationSearchExhausted', plan.exhausted)];
  }
  // Exploitation is after this turn's Supply. Future-turn reservations need a logistics plan;
  // do not charge a second ration for a Supply phase that has already happened.
  if (state.sequence.phase !== 'MOVEMENT' || state.sequence.phasingPlayerId !== action.actorId) {
    return [fact('supply.rationCommitmentsPreserved', true), fact('supply.rationBudgetApplicable', false)];
  }
  const plan = rationPlan(state, action.actorId);
  let payments: readonly { readonly sourcePieceId: PieceId; readonly tokens: number }[] = [];
  if (action.kind === 'PAY_FUEL') {
    const option = fuelOptions(state, pieceById(state, action.pieceId)!).find(o => o.method === action.method)!;
    payments = [{ sourcePieceId: action.sourcePieceId, tokens: option.tokens }];
  } else if (action.kind === 'BUILD_HEDGEHOG') payments = action.payments;
  const after = afterRequiredRecovery({ ...state, pieceState: spendReservations(state, payments.map(p => ({
    resourcePieceId: p.sourcePieceId, quantity: p.tokens,
    unitDefinitionId: definitionOf(state, pieceById(state, p.sourcePieceId)!)!.resource!.unitDefinitionId,
  }))) }, action.actorId);
  const future = problem(after, action.actorId);
  const wanted = new Set(plan.demands.map(d => d.id));
  const trial = assignRations(future.demands.filter(d => wanted.has(d.id)), future.sources);
  return [fact('supply.rationBudgetApplicable', true), fact('supply.rationCommittedUnits', wanted.size),
    fact('supply.rationCommitmentsPreserved', trial.groups !== null),
    fact('supply.rationSearchExhausted', plan.exhausted || trial.exhausted)];
};
