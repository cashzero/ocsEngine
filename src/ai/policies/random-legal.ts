import { hexDistance, parseHexCoordinateId, type HexId, type PieceId } from '../../core/index.js';
import type { GameAction } from '../../rules/index.js';
import type { BotDecision, BotDecisionContext, BotPolicy } from '../model.js';

/**
 * Smoke-test policy (M9.1): picks among legal actions at random, weighted so that games move forward and
 * reach contact. It finds missing action coverage, deadlocks and replay faults; it is not a play-strength baseline.
 */

/**
 * How often each kind is tried when it is legal. Every kind is listed (the compiler checks), so new actions are
 * exercised as soon as the Rule Engine offers them; decisions and step ends are handled separately (0).
 */
const KIND_WEIGHTS: Readonly<Record<GameAction['kind'], number>> = {
  ADVANCE_SEQUENCE: 0, RESPOND_DECISION: 0, COMMIT_TRANSACTION: 0,
  PLACE_REINFORCEMENT: 20, CHECK_SUPPLY: 10, MOVE_PIECE: 8, DECLARE_COMBAT: 6, PAY_FUEL: 4, DECLARE_BARRAGE: 3,
  CHANGE_MODE: 2, RELEASE_RESERVE: 2, END_MOVE: 1, CANCEL_TRANSACTION: 0.2,
  CREATE_BREAKDOWN: 1, RECOVER_INTERNALS: 1, CHOOSE_FORMATION_TRACE: 1, ATTEMPT_BREAKOUT: 1, BLOW_DUMP: 1,
  LOAD_SUPPLY: 1, UNLOAD_SUPPLY: 1, COMBINE_TRANSPORT: 1, DIVIDE_TRANSPORT: 1, FORM_EXTENDER: 1, DISSOLVE_EXTENDER: 1,
  COLLAPSE_EXTENDER: 1, REFIT_AIRCRAFT: 1, DECLARE_AIR_MISSION: 1, REDUCE_AIR_BASE: 1, BUILD_AIR_BASE: 1, BUILD_HEDGEHOG: 1, REDUCE_HEDGEHOG: 0.3,
  REBUILD_AIRCRAFT: 1, REBUILD_UNITS: 1, PLAN_AIR_DROP: 1, UPDATE_AIR_DROP_PLAN: 1, COMBINE_AIRCRAFT: 1, CONSOLIDATE_UNITS: 0.5,
  RAIL_MOVE: 1, SEA_MOVE: 4, REDUCE_PORT: 0.1, REPAIR_PORT: 1,
};

const TRIED_KINDS = Object.keys(KIND_WEIGHTS).filter((kind) => KIND_WEIGHTS[kind as GameAction['kind']] > 0) as GameAction['kind'][];

/** Pieces asked for moves this step; a piece with no move is not asked again. */
const TRIED_PIECES = 'random-legal.tried';
const MAX_PIECES_PER_DRAW = 8;
const ALTERNATIVES = 3;

const distanceBetween = (left: HexId, right: HexId): number => {
  const from = parseHexCoordinateId(left);
  const to = parseHexCoordinateId(right);
  return from.ok && to.ok ? hexDistance(from.value, to.value) : Number.POSITIVE_INFINITY;
};

const decision = (action: GameAction, intent: string, alternatives: readonly GameAction[]): BotDecision => ({
  action, intent, score: 0, breakdown: [], alternatives: alternatives.filter((other) => other !== action).slice(0, ALTERNATIVES),
});

const pickMove = (context: BotDecisionContext): BotDecision | null => {
  const { view, actions, rng, memory } = context;
  const projection = view.projection!;
  const tried = (memory.notes.get(TRIED_PIECES) as Set<PieceId> | undefined) ?? new Set<PieceId>();
  memory.notes.set(TRIED_PIECES, tried);
  const enemyHexes: HexId[] = [];
  const own: PieceId[] = [];
  for (const stack of projection.stacks) {
    if (stack.location.kind !== 'ON_MAP') continue;
    for (const piece of stack.pieces) {
      if (piece.ownerId !== context.playerId) enemyHexes.push(stack.location.hexId);
      else if (piece.role !== 'DUMP' && piece.role !== 'CARGO') own.push(piece.id);
    }
  }
  // 6.1g: the unit already moving may keep going before another starts.
  const mover = projection.currentMoverId;
  const pool = own.filter((id) => !tried.has(id) && id !== mover);
  const order = mover === null ? [] : [mover];
  for (let draws = 0; draws < MAX_PIECES_PER_DRAW && pool.length > 0; draws += 1) {
    order.push(pool.splice(rng.index(pool.length), 1)[0]!);
  }
  for (const pieceId of order) {
    const moves = actions.candidates('MOVE_PIECE', pieceId);
    if (moves.length === 0) {
      tried.add(pieceId);
      continue;
    }
    if (pieceId !== mover) tried.add(pieceId);
    // Half the time head for the nearest enemy, so random games still reach contact and combat.
    const destination = (move: GameAction) => (move.kind === 'MOVE_PIECE' ? move.path.at(-1)! : '' as HexId);
    const chosen = enemyHexes.length > 0 && rng.next() < 0.5
      ? [...moves].sort((left, right) =>
        Math.min(...enemyHexes.map((hexId) => distanceBetween(destination(left), hexId)))
        - Math.min(...enemyHexes.map((hexId) => distanceBetween(destination(right), hexId))))[0]!
      : moves[rng.index(moves.length)]!;
    return decision(chosen, `move ${pieceId}`, moves);
  }
  return null;
};

const ownPieceCount = ({ view, playerId }: BotDecisionContext): number => view.projection?.stacks
  .reduce((total, { pieces }) => total + pieces.filter(({ ownerId, role }) => ownerId === playerId && role !== 'DUMP').length, 0) ?? 0;

const decide = (context: BotDecisionContext): BotDecision | null => {
  const { view, actions, rng, memory } = context;
  if (view.pendingDecision !== null) {
    const options = actions.candidates('RESPOND_DECISION');
    return options.length === 0 ? null : decision(options[rng.index(options.length)]!, `answer ${view.pendingDecision.kind}`, options);
  }
  const advance = actions.candidates('ADVANCE_SEQUENCE');
  // Kinds are asked for lazily: a kind that is not legal in this step costs almost nothing to ask about.
  const remaining: GameAction['kind'][] = [...TRIED_KINDS];
  while (remaining.length > 0) {
    const kind = rng.weighted([
      ...remaining.map((value) => ({ value: value as GameAction['kind'] | 'ADVANCE', weight: KIND_WEIGHTS[value] })),
      // A step rarely ends before the seat has acted about once per own piece, then ends quickly.
      ...(advance.length > 0 ? [{ value: 'ADVANCE' as const, weight: 0.1 + Math.max(0, memory.actions - ownPieceCount(context)) * 2 }] : []),
    ]);
    if (kind === null || kind === 'ADVANCE') break;
    remaining.splice(remaining.indexOf(kind), 1);
    if (kind === 'MOVE_PIECE') {
      const move = pickMove(context);
      if (move !== null) return { ...move, alternatives: [...move.alternatives, ...advance] };
      continue;
    }
    const options = actions.candidates(kind, null, 60);
    if (options.length > 0) {
      return decision(options[rng.index(options.length)]!, `random ${kind}`, [...options, ...advance]);
    }
  }
  return advance.length > 0 ? decision(advance[0]!, 'end step', []) : null;
};

export const createRandomLegalPolicy = (): BotPolicy => ({ id: 'random-legal', version: '2', decide });
